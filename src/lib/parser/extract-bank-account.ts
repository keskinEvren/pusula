import { extractTextFromPDF } from './extract-pdf'
import { repairTurkishPdfText } from './turkish-cleaner'
import { reconcileBankMovement } from './reconciler'
import type { ParseResult, ExtractedTransaction } from './types'
import type { Debt, CreditCard, MerchantMapping } from '@/types/database'
import * as XLSX from 'xlsx'

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
  }

  const movements: IntermediateMovement[] = []
  let currentMovement: IntermediateMovement | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detect official closing balance
    const closingMatch = trimmed.match(/(?:Dönem sonu bakiyesi|Kapanış bakiyesi|Toplam Bakiye)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i)
    if (closingMatch && closing_balance === undefined) {
      const cleanClosing = closingMatch[1].replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
      closing_balance = parseFloat(cleanClosing)
    }

    // Filter headers
    if (
      /Hesap No|IBAN|Kullanılabilir Bakiye|Açılış Bakiyesi|Dönem Başı|Sayfa\s+\d+|Enpara Bank A\.Ş\.|Mersis no/i.test(
        trimmed
      )
    ) {
      continue
    }

    // Line starts with date (DD.MM.YYYY or DD/MM/YYYY or DD/MM/YY)
    const dateMatch = trimmed.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+(.+)$/)

    if (dateMatch) {
      if (currentMovement) {
        movements.push(currentMovement)
      }

      const rawDate = dateMatch[1]
      const rest = dateMatch[2].trim()

      // Normalize date (handling 2-digit year e.g. 06/08/26 -> 2026-08-06)
      let parsedDate = new Date().toISOString().split('T')[0]
      const dmy = rawDate.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
      if (dmy) {
        const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
        parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
      }

      // Check for dual amount format at end of line: [Tutar TL] [Bakiye TL]
      // e.g. "Gelen Transfer 7.000,00 TL 6.849,61 TL" or "Ödeme - 6.130,00 TL 719,61 TL"
      const dualMatch = rest.match(/^(.*?)\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?(?:\s*\(?(A|B)\)?)?$/i)

      if (dualMatch) {
        currentMovement = {
          date: parsedDate,
          descriptionParts: [dualMatch[1].trim()],
          rawAmountStr: dualMatch[2].trim(), // Exact transaction amount!
          balanceStr: dualMatch[3].trim(),   // Account balance!
          borcAlacakFlag: dualMatch[4]?.toUpperCase(),
        }
      } else {
        // Single amount fallback: [Açıklama] [Tutar TL]
        const singleMatch = rest.match(/^(.*?)\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?(?:\s*\(?(A|B)\)?)?$/i)
        if (singleMatch) {
          currentMovement = {
            date: parsedDate,
            descriptionParts: [singleMatch[1].trim()],
            rawAmountStr: singleMatch[2].trim(),
            borcAlacakFlag: singleMatch[3]?.toUpperCase(),
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
      selected: true,
    })
  }

  return { transactions, closing_balance }
}

/**
 * Parses Bank Account statement file (PDF, CSV, Excel)
 */
export async function parseBankAccountFile(
  file: File,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    try {
      const rawText = await extractTextFromPDF(file)
      const { transactions, closing_balance } = parseBankAccountLines(rawText, openDebts, creditCards, userMappings)

      let detected_bank = 'Enpara Vadesiz'
      const upper = rawText.toUpperCase()
      if (upper.includes('ENPARA') || upper.includes('QNB FINANSBANK')) detected_bank = 'Enpara Vadesiz'
      else if (upper.includes('GARANTI') || upper.includes('BBVA')) detected_bank = 'Garanti Vadesiz'
      else if (upper.includes('AKBANK')) detected_bank = 'Akbank Vadesiz'
      else if (upper.includes('ZIRAAT')) detected_bank = 'Ziraat Vadesiz'

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank,
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
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData: Array<Array<any>> = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

      const textRows = jsonData.map((r) => (r || []).join(' ')).join('\n')
      const { transactions, closing_balance } = parseBankAccountLines(textRows, openDebts, creditCards, userMappings)

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank: 'Vadesiz Hesap (CSV)',
        closing_balance,
        transactions,
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
