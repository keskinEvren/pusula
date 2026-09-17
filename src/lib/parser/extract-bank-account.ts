import { extractTextFromPDF } from './extract-pdf'
import { repairTurkishPdfText } from './turkish-cleaner'
import { reconcileBankMovement } from './reconciler'
import { parseFlexibleAmount, fixWindows1254Text, detectBankFromTextOrIban } from './utils'
import type { ParseResult, ExtractedTransaction } from './types'
import type { Debt, CreditCard, MerchantMapping } from '@/types/database'
import { formatLocalDateInput } from '../utils'

function extractSourceAccountRef(text: string): string | undefined {
  const compact = text.replace(/\s+/g, ' ')
  const iban = compact.match(/\bTR\s*\d{2}(?:\s*\d){22}\b/i)?.[0]
    || compact.match(/\bTR\d{24}\b/i)?.[0]
  if (iban) return iban.replace(/\s+/g, '').toUpperCase()

  const account = compact.match(/(?:Müşteri\/Hesap No|Hesap No)\s*:?\s*([A-Z0-9-]{5,})/i)?.[1]
  return account?.toUpperCase()
}

/**
 * Parses raw text lines from Turkish bank account statements (Vadesiz Hesap Özeti)
 * Handles dual columns (Tutar + Bakiye), multi-line FAST explanations, and 2-digit years.
 */
export function parseBankAccountLines(
  rawText: string,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): { transactions: ExtractedTransaction[]; closing_balance?: number } {
  const repairedText = repairTurkishPdfText(rawText)
  const lines = repairedText.split('\n')
  const transactions: ExtractedTransaction[] = []

  let idx = 0
  let closing_balance: number | undefined = undefined

  // Multi-line accumulator
  interface IntermediateMovement {
    date: string
    descriptionParts: string[]
    rawAmountStr: string
    balanceStr?: string
    borcAlacakFlag?: string
    externalReference?: string
  }

  const movements: IntermediateMovement[] = []
  let currentMovement: IntermediateMovement | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '--- PAGE BREAK ---') continue

    // Detect official closing balance
    const closingMatch = trimmed.match(/(?:Dönem sonu bakiyesi|Kapanış bakiyesi|Toplam Bakiye)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i)
    if (closingMatch && closing_balance === undefined) {
      const cleanClosing = closingMatch[1].replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
      closing_balance = parseFloat(cleanClosing)
    }

    // Line starts with date (DD.MM.YYYY or DD/MM/YYYY or DD/MM/YY)
    const dateMatch = trimmed.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+(.+)$/)

    // Filter headers (only when line does not start with date)
    if (
      !dateMatch &&
      /^(?:Müşteri\/Hesap No|Hesap No\s*:|IBAN|Kullanılabilir Bakiye|Açılış Bakiyesi|Dönem Başı|Sayfa\s+\d+|Enpara Bank A\.Ş\.|Mersis no|İşlem Tarihi|Oluşturulma|Hesap Türü|ŞŞubesi|Şubesi|Tarih Aralığı|Tarih Aralýðý|Bakiye Referans)/i.test(
        trimmed
      )
    ) {
      continue
    }

    if (dateMatch) {
      if (currentMovement) {
        movements.push(currentMovement)
      }

      const rawDate = dateMatch[1]
      const rest = dateMatch[2].trim()

      // Normalize date (handling 2-digit year e.g. 06/08/26 -> 2026-08-06)
      let parsedDate = formatLocalDateInput()
      const dmy = rawDate.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
      if (dmy) {
        const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
        parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
      }

      // Check for dual amount format at end of line: [Tutar TL] [Bakiye TL] (with optional A/B and optional trailing reference number like A012B)
      // e.g. "Gelen Transfer 7.000,00 TL 6.849,61 TL" or "Lehdar= EVREN -8.398,08 TL 0,00 TL A012B"
      const dualMatch = rest.match(/^(.*?)\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?(?:\s*\((A|B)\))?(?:\s+([A-Za-z0-9]{3,20}))?$/i)

      if (dualMatch) {
        currentMovement = {
          date: parsedDate,
          descriptionParts: [dualMatch[1].trim()],
          rawAmountStr: dualMatch[2].trim(), // Exact transaction amount!
          balanceStr: dualMatch[3].trim(),   // Account balance!
          borcAlacakFlag: dualMatch[4]?.toUpperCase(),
          externalReference: dualMatch[5],
        }
      } else {
        // Single amount fallback: [Açıklama] [Tutar TL] (with optional A/B and optional trailing reference)
        const singleMatch = rest.match(/^(.*?)\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?(?:\s*\((A|B)\))?(?:\s+([A-Za-z0-9]{3,20}))?$/i)
        if (singleMatch) {
          currentMovement = {
            date: parsedDate,
            descriptionParts: [singleMatch[1].trim()],
            rawAmountStr: singleMatch[2].trim(),
            borcAlacakFlag: singleMatch[3]?.toUpperCase(),
            externalReference: singleMatch[4],
          }
        }
      }
    } else if (currentMovement) {
      // Continuation line of multi-line explanation (e.g. FAST sorgu no, alıcı vb.)
      const cleanLine = trimmed.replace(/(?:Sayfa\s+\d+|PAGE\s*BREAK)/gi, '').trim()
      if (cleanLine) {
        currentMovement.descriptionParts.push(cleanLine)
      }
    }
  }

  if (currentMovement) {
    movements.push(currentMovement)
  }

  // Fallback closing balance from newest movement if not explicitly matched from header
  if (closing_balance === undefined && movements.length > 0) {
    const isFirstNewer = movements[0].date >= movements[movements.length - 1].date
    const targetMovement = isFirstNewer ? movements[0] : movements[movements.length - 1]
    if (targetMovement.balanceStr) {
      closing_balance = parseFlexibleAmount(targetMovement.balanceStr)
    }
  }

  // Convert movements to ExtractedTransactions
  for (const mov of movements) {
    const fullDesc = mov.descriptionParts.join(' ').trim()
    const rawAmountStr = mov.rawAmountStr

    // Determine direction
    let isOutflow =
      rawAmountStr.startsWith('-') ||
      mov.borcAlacakFlag === 'B' ||
      /Ödeme|Giden Transfer|EFT Çıkış|FAST Çıkış|Para Çekme/i.test(fullDesc)

    // Positive check
    if (/Gelen Transfer|Gelen EFT|Gelen FAST|Maaş|Hakediş|Para Yatırma/i.test(fullDesc)) {
      isOutflow = false
    }

    const direction: 'inflow' | 'outflow' = isOutflow ? 'outflow' : 'inflow'

    // Clean amount
    const cleanAmountStr = rawAmountStr
      .replace(/[^\d.,]/g, '')
      .replace(/\.(?=\d{3})/g, '')
      .replace(',', '.')

    const absAmount = parseFloat(cleanAmountStr)
    if (isNaN(absAmount) || absAmount === 0) continue

    const balanceAfter = mov.balanceStr ? parseFlexibleAmount(mov.balanceStr) : undefined

    // Run Smart Reconciliation Engine
    const suggestion = reconcileBankMovement(
      fullDesc,
      absAmount,
      direction,
      openDebts,
      creditCards,
      userMappings
    )

    idx++
    transactions.push({
      id: `bank-${idx}-${Date.now()}`,
      date: mov.date,
      raw_description: fullDesc,
      merchant: suggestion.merchant,
      amount: absAmount,
      type: suggestion.type,
      analysis_group: suggestion.analysis_group,
      direction,
      action: suggestion.action,
      target_card_id: suggestion.target_card_id,
      target_debt_id: suggestion.target_debt_id,
      project_id: suggestion.project_id,
      confidence: suggestion.confidence,
      classification_status: suggestion.classification_status,
      classification_reasons: suggestion.reasons,
      external_reference: mov.externalReference,
      balance_after: balanceAfter,
      selected: suggestion.classification_status !== 'NEEDS_REVIEW' && suggestion.classification_status !== 'CONFLICTING_RULES',
    })
  }

  return { transactions, closing_balance }
}

/**
 * Extracts transactions and metadata from HTML bank account statements (e.g. Ziraat Bankası)
 */
export function extractFromHtmlBankAccount(
  htmlContent: string,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): { transactions: ExtractedTransaction[]; closing_balance?: number; detected_bank: string } {
  let detected_bank = 'Vadesiz Hesap (HTML)'
  const upper = htmlContent.toUpperCase()
  if (upper.includes('ZİRAAT') || upper.includes('ZIRAAT')) detected_bank = 'Ziraat Vadesiz'
  else if (upper.includes('GARANTİ') || upper.includes('GARANTI') || upper.includes('BBVA')) detected_bank = 'Garanti Vadesiz'
  else if (upper.includes('ENPARA') || upper.includes('QNB FINANSBANK')) detected_bank = 'Enpara Vadesiz'
  else if (upper.includes('AKBANK')) detected_bank = 'Akbank Vadesiz'
  else if (upper.includes('İŞ BANKASI') || upper.includes('IS BANKASI')) detected_bank = 'İş Bankası Vadesiz'
  else if (upper.includes('YAPI KREDİ') || upper.includes('YAPI KREDI')) detected_bank = 'Yapı Kredi Vadesiz'

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const tdRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi

  interface IntermediateRow {
    date: string
    rawDate: string
    desc: string
    amountStr: string
    balanceStr?: string
    externalReference?: string
  }

  const rawRows: IntermediateRow[] = []
  let trMatch: RegExpExecArray | null

  while ((trMatch = trRegex.exec(htmlContent)) !== null) {
    const trContent = trMatch[1]
    const cells: string[] = []
    let tdMatch: RegExpExecArray | null

    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(
        tdMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
    }

    if (cells.length < 3) continue

    // Check if cell 0 matches date pattern DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    const dateMatch = cells[0].match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
    if (!dateMatch) continue

    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]
    const isoDate = `${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`

    let desc = ''
    let amountStr = ''
    let balanceStr = ''

    if (cells.length >= 5) {
      // Ziraat 5-cell format: [Date, Ref/Fiş, Description, Amount, Balance]
      if (/[+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}/.test(cells[3])) {
        desc = (cells[1] ? `${cells[1]} ` : '') + cells[2]
        amountStr = cells[3]
        balanceStr = cells[4]
      } else {
        desc = cells[1]
        amountStr = cells[2]
        balanceStr = cells[3]
      }
    } else if (cells.length === 4) {
      // 4-cell format: [Date, Description, Amount, Balance] or [Date, Ref, Description, Amount]
      if (/[+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}/.test(cells[2])) {
        desc = cells[1]
        amountStr = cells[2]
        balanceStr = cells[3]
      } else if (/[+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}/.test(cells[3])) {
        desc = `${cells[1]} ${cells[2]}`
        amountStr = cells[3]
      }
    } else if (cells.length === 3) {
      // 3-cell format: [Date, Description, Amount]
      desc = cells[1]
      amountStr = cells[2]
    }

    if (amountStr) {
      rawRows.push({
        date: isoDate,
        rawDate: cells[0],
        desc: desc.trim(),
        amountStr: amountStr.trim(),
        balanceStr: balanceStr ? balanceStr.trim() : undefined,
        externalReference: cells.length >= 5 ? cells[1]?.trim() || undefined : undefined,
      })
    }
  }

  // Calculate closing balance:
  let closing_balance: number | undefined = undefined
  if (rawRows.length > 0) {
    const isFirstNewer = rawRows[0].date >= rawRows[rawRows.length - 1].date
    const targetRow = isFirstNewer ? rawRows[0] : rawRows[rawRows.length - 1]
    if (targetRow.balanceStr) {
      const cleanB = targetRow.balanceStr
        .replace(/[^\d.,]/g, '')
        .replace(/\.(?=\d{3})/g, '')
        .replace(',', '.')
      const numB = parseFloat(cleanB)
      if (!isNaN(numB)) closing_balance = numB
    }
  }

  const transactions: ExtractedTransaction[] = []
  let idx = 0

  for (const row of rawRows) {
    let isOutflow = false
    if (row.amountStr.startsWith('-') || /\(B\)$/i.test(row.amountStr)) {
      isOutflow = true
    } else if (row.amountStr.startsWith('+') || /\(A\)$/i.test(row.amountStr)) {
      isOutflow = false
    } else {
      // Fallback if amounts are unsigned
      if (/Gelen\s+(?:Transfer|EFT|HAVALE|FAST)|Gönd:|Maaş|Hakediş|Para Yatırma/i.test(row.desc)) {
        isOutflow = false
      } else if (/Giden\s+(?:Transfer|EFT|HAVALE|FAST)|Para Çekme|KK Tahsilat|BSMV|Faiz/i.test(row.desc)) {
        isOutflow = true
      } else if (/Ödeme/i.test(row.desc) && !/Gönd:|Gelen/i.test(row.desc)) {
        isOutflow = true
      }
    }

    const cleanAmountStr = row.amountStr
      .replace(/[^\d.,]/g, '')
      .replace(/\.(?=\d{3})/g, '')
      .replace(',', '.')

    const absAmount = parseFloat(cleanAmountStr)
    if (isNaN(absAmount) || absAmount === 0) continue

    const direction = isOutflow ? 'outflow' : 'inflow'
    const suggestion = reconcileBankMovement(
      row.desc,
      absAmount,
      direction,
      openDebts,
      creditCards,
      userMappings
    )

    idx++
    transactions.push({
      id: `bank-html-${idx}-${Date.now()}`,
      date: row.date,
      raw_description: row.desc,
      merchant: suggestion.merchant,
      amount: absAmount,
      type: suggestion.type,
      analysis_group: suggestion.analysis_group,
      direction,
      action: suggestion.action,
      target_card_id: suggestion.target_card_id,
      target_debt_id: suggestion.target_debt_id,
      project_id: suggestion.project_id,
      confidence: suggestion.confidence,
      classification_status: suggestion.classification_status,
      classification_reasons: suggestion.reasons,
      external_reference: row.externalReference,
      balance_after: row.balanceStr ? parseFlexibleAmount(row.balanceStr) : undefined,
      selected: suggestion.classification_status !== 'NEEDS_REVIEW' && suggestion.classification_status !== 'CONFLICTING_RULES',
    })
  }

  return { transactions, closing_balance, detected_bank }
}

/**
 * Parses tabular bank account data (CSV, XLSX, XLS)
 * Identifies column headers (Tarih, Tutar, Borç, Alacak, Bakiye, Açıklama),
 * repairs Turkish Windows-1254 encoding, and extracts movements.
 */
export function parseBankAccountTable(
  rows: Array<Array<any>>,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): { transactions: ExtractedTransaction[]; closing_balance?: number; detected_bank: string } {
  // Detect bank from header / text / IBAN
  const fullTextSample = rows
    .slice(0, 30)
    .map((r) => (r || []).map((c) => fixWindows1254Text(String(c || ''))).join(' '))
    .join('\n')
  const detected_bank = detectBankFromTextOrIban(fullTextSample) || 'Vadesiz Hesap (CSV)'

  // Scan for header row
  let headerIdx = -1
  let colMap = { date: -1, amount: -1, debit: -1, credit: -1, balance: -1, desc: -1, reference: -1 }

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = (rows[r] || []).map((c) => fixWindows1254Text(String(c || '')).trim())
    const d = row.findIndex((c) => /tarih|date/i.test(c))
    const a = row.findIndex(
      (c) =>
        /^(?:işlem\s+tutarı|islem\s+tutari|tutar|amount)$/i.test(c) ||
        (/tutar/i.test(c) && !/bakiye/i.test(c))
    )
    const debit = row.findIndex((c) => /^(?:borç|borc|giden|çıkış|cikis)$/i.test(c))
    const credit = row.findIndex((c) => /^(?:alacak|gelen|giriş|giris)$/i.test(c))
    const desc = row.findIndex((c) => /a[çc][ıi]klama|detay|i[şs]lem/i.test(c))
    const bal = row.findIndex((c) => /bakiye|balance/i.test(c))
    const reference = row.findIndex((c) => /referans|reference|fiş|fis|işlem no|islem no/i.test(c))

    if (d !== -1 && (a !== -1 || (debit !== -1 && credit !== -1) || desc !== -1)) {
      headerIdx = r
      colMap = {
        date: d,
        amount: a,
        debit,
        credit,
        balance: bal,
        desc: desc !== -1 ? desc : row.length > 3 ? 3 : 1,
        reference,
      }
      break
    }
  }

  // Fallback to line parser if no structured table header found
  if (headerIdx === -1 || colMap.date === -1) {
    const textRows = rows
      .map((r) => (r || []).map((c) => fixWindows1254Text(String(c || ''))).join(' '))
      .join('\n')
    const { transactions, closing_balance } = parseBankAccountLines(
      textRows,
      openDebts,
      creditCards,
      userMappings
    )
    return { transactions, closing_balance, detected_bank }
  }

  interface IntermediateRow {
    date: string
    rawDate: string
    desc: string
    amount: number
    direction: 'inflow' | 'outflow'
    balanceStr?: string
    externalReference?: string
  }

  const rawMovements: IntermediateRow[] = []

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue

    const rawDate = String(row[colMap.date] || '').trim()
    const dateMatch =
      rawDate.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/) ||
      rawDate.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
    if (!dateMatch) continue

    let isoDate = ''
    if (dateMatch[1].length === 4) {
      isoDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    } else {
      const yr = dateMatch[3]
        ? dateMatch[3].length === 2
          ? `20${dateMatch[3]}`
          : dateMatch[3]
        : new Date().getFullYear().toString()
      isoDate = `${yr}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`
    }

    const rawDesc = fixWindows1254Text(String(row[colMap.desc] || '')).trim()
    const balStr = colMap.balance !== -1 ? String(row[colMap.balance] || '').trim() : undefined

    let absAmount = 0
    let isOutflow = false

    if (colMap.debit !== -1 && colMap.credit !== -1) {
      const debitVal = parseFlexibleAmount(String(row[colMap.debit] || ''))
      const creditVal = parseFlexibleAmount(String(row[colMap.credit] || ''))
      if (debitVal && debitVal > 0) {
        absAmount = debitVal
        isOutflow = true
      } else if (creditVal && creditVal > 0) {
        absAmount = creditVal
        isOutflow = false
      }
    } else if (colMap.amount !== -1) {
      const rawAmt = String(row[colMap.amount] || '').trim()
      absAmount = parseFlexibleAmount(rawAmt) || 0
      if (rawAmt.startsWith('-') || /\(B\)$/i.test(rawAmt)) {
        isOutflow = true
      } else if (rawAmt.startsWith('+') || /\(A\)$/i.test(rawAmt)) {
        isOutflow = false
      } else {
        if (/Gelen\s+(?:Transfer|EFT|HAVALE|FAST)|Maaş|Hakediş|Para Yatırma|Nakit Ödül/i.test(rawDesc)) {
          isOutflow = false
        } else if (/Ödeme|Giden\s+(?:Transfer|EFT|HAVALE|FAST)|Para Çekme|KK Tahsilat|BSMV|Vergi|Faiz|Komisyon/i.test(rawDesc)) {
          isOutflow = true
        }
      }
    }

    if (!absAmount || absAmount === 0) continue

    rawMovements.push({
      date: isoDate,
      rawDate,
      desc: rawDesc,
      amount: absAmount,
      direction: isOutflow ? 'outflow' : 'inflow',
      balanceStr: balStr,
      externalReference: colMap.reference !== -1 ? String(row[colMap.reference] || '').trim() || undefined : undefined,
    })
  }

  // Determine closing balance from newest transaction
  let closing_balance: number | undefined = undefined
  if (rawMovements.length > 0) {
    const isFirstNewer = rawMovements[0].date >= rawMovements[rawMovements.length - 1].date
    const targetMov = isFirstNewer ? rawMovements[0] : rawMovements[rawMovements.length - 1]
    if (targetMov.balanceStr !== undefined) {
      closing_balance = parseFlexibleAmount(targetMov.balanceStr)
    }
  }

  const transactions: ExtractedTransaction[] = []
  let idx = 0

  for (const mov of rawMovements) {
    const suggestion = reconcileBankMovement(
      mov.desc,
      mov.amount,
      mov.direction,
      openDebts,
      creditCards,
      userMappings
    )

    idx++
    transactions.push({
      id: `bank-tbl-${idx}-${Date.now()}`,
      date: mov.date,
      raw_description: mov.desc,
      merchant: suggestion.merchant,
      amount: mov.amount,
      type: suggestion.type,
      analysis_group: suggestion.analysis_group,
      direction: mov.direction,
      action: suggestion.action,
      target_card_id: suggestion.target_card_id,
      target_debt_id: suggestion.target_debt_id,
      project_id: suggestion.project_id,
      confidence: suggestion.confidence,
      classification_status: suggestion.classification_status,
      classification_reasons: suggestion.reasons,
      external_reference: mov.externalReference,
      balance_after: mov.balanceStr ? parseFlexibleAmount(mov.balanceStr) : undefined,
      selected: suggestion.classification_status !== 'NEEDS_REVIEW' && suggestion.classification_status !== 'CONFLICTING_RULES',
    })
  }

  return { transactions, closing_balance, detected_bank }
}

/**
 * Parses Bank Account statement file (PDF, HTML, CSV, Excel)
 */
export async function parseBankAccountFile(
  file: File,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'html' || ext === 'htm') {
    try {
      const htmlContent = await file.text()
      const { transactions, closing_balance, detected_bank } = extractFromHtmlBankAccount(
        htmlContent,
        openDebts,
        creditCards,
        userMappings
      )

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank,
        source_account_ref: extractSourceAccountRef(htmlContent),
        closing_balance,
        transactions,
        error: transactions.length === 0 ? 'HTML dosyasında hareket satırları tespit edilemedi.' : undefined,
      }
    } catch (err: any) {
      return {
        success: false,
        file_name: file.name,
        import_type: 'bank_account',
        transactions: [],
        error: err.message || 'HTML dosyası işlenirken hata oluştu',
      }
    }
  }

  if (ext === 'pdf') {
    try {
      const rawText = await extractTextFromPDF(file)
      const { transactions, closing_balance } = parseBankAccountLines(rawText, openDebts, creditCards, userMappings)
      const detected_bank = detectBankFromTextOrIban(rawText) || 'Vadesiz Hesap'

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank,
        source_account_ref: extractSourceAccountRef(rawText),
        closing_balance,
        transactions,
        error: transactions.length === 0 ? 'Vadesiz hesap hareket satırları tespit edilemedi.' : undefined,
      }
    } catch (err: any) {
      return {
        success: false,
        file_name: file.name,
        import_type: 'bank_account',
        transactions: [],
        error: err.message || 'PDF dosyası işlenirken hata oluştu',
      }
    }
  }

  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    try {
      // Load the spreadsheet engine on demand instead of charging every visitor
      // to the import page for code they may never use.
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData: Array<Array<any>> = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

      const { transactions, closing_balance, detected_bank } = parseBankAccountTable(
        jsonData,
        openDebts,
        creditCards,
        userMappings
      )

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank,
        source_account_ref: extractSourceAccountRef(jsonData.flat().join(' ')),
        closing_balance,
        transactions,
        error: transactions.length === 0 ? 'CSV/Excel dosyasında hareket satırları tespit edilemedi.' : undefined,
      }
    } catch (err: any) {
      return {
        success: false,
        file_name: file.name,
        import_type: 'bank_account',
        transactions: [],
        error: err.message || 'CSV dosyası işlenirken hata oluştu',
      }
    }
  }

  return {
    success: false,
    file_name: file.name,
    import_type: 'bank_account',
    transactions: [],
    error: 'Desteklenmeyen dosya formatı',
  }
}
