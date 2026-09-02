import { extractTextFromPDF } from './extract-pdf'
import { repairTurkishPdfText } from './turkish-cleaner'
import { reconcileBankMovement } from './reconciler'
import type { ParseResult, ExtractedTransaction } from './types'
import type { Debt, CreditCard, MerchantMapping } from '@/types/database'
import * as XLSX from 'xlsx'

/**
 * Parses raw text lines from Turkish bank account statements (Vadesiz Hesap Özeti)
 */
export function parseBankAccountLines(
  rawText: string,
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): ExtractedTransaction[] {
  const repairedText = repairTurkishPdfText(rawText)
  const lines = repairedText.split('\n')
  const transactions: ExtractedTransaction[] = []

  let idx = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 10) continue

    // Filter non-transaction header lines
    if (
      /Hesap No|IBAN|Toplam Bakiye|Kullanılabilir Bakiye|Açılış Bakiyesi|Kapanış Bakiyesi|Dönem Başı|Sayfa\s+\d+/i.test(
        trimmed
      )
    ) {
      continue
    }

    // Line starts with date (DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY)
    const dateMatch = trimmed.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+(.+)$/)
    if (!dateMatch) continue

    const rawDate = dateMatch[1]
    const rest = dateMatch[2].trim()

    // Match amount at the end: e.g. " + 50.000,00 TL", " - 1.250,00 TL", " 20.000,00 TL (B)", " 50.000,00 TL (A)"
    const amountMatch = rest.match(/^(.*?)\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?(?:\s*\((A|B)\))?$/i)
    if (!amountMatch) continue

    const rawDesc = amountMatch[1].trim()
    const rawAmountStr = amountMatch[2].trim()
    const borcAlacakFlag = amountMatch[3]?.toUpperCase()

    // Determine direction
    let isOutflow = rawAmountStr.startsWith('-') || borcAlacakFlag === 'B'
    if (
      !isOutflow &&
      (rawDesc.toUpperCase().includes('GİDEN') ||
        rawDesc.toUpperCase().includes('GIDEN') ||
        rawDesc.toUpperCase().includes('ÖDEME') ||
        rawDesc.toUpperCase().includes('ODEME') ||
        rawDesc.toUpperCase().includes('EFT ÇIKIŞ') ||
        rawDesc.toUpperCase().includes('FAST ÇIKIŞ'))
    ) {
      isOutflow = true
    }

    const direction: 'inflow' | 'outflow' = isOutflow ? 'outflow' : 'inflow'

    // Parse amount
    const cleanAmountStr = rawAmountStr
      .replace(/[^\d.,]/g, '')
      .replace(/\.(?=\d{3})/g, '')
      .replace(',', '.')

    const absAmount = parseFloat(cleanAmountStr)
    if (isNaN(absAmount) || absAmount === 0) continue

    // Normalize date
    let parsedDate = new Date().toISOString().split('T')[0]
    const dmy = rawDate.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
    if (dmy) {
      const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
      parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    }

    // Run Smart Reconciliation Engine
    const suggestion = reconcileBankMovement(
      rawDesc,
      absAmount,
      direction,
      openDebts,
      creditCards,
      userMappings
    )

    idx++
    transactions.push({
      id: `bank-${idx}-${Date.now()}`,
      date: parsedDate,
      raw_description: rawDesc,
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

  return transactions
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
      const transactions = parseBankAccountLines(rawText, openDebts, creditCards, userMappings)

      let detected_bank = 'Vadesiz Hesap'
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
      const transactions = parseBankAccountLines(textRows, openDebts, creditCards, userMappings)

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'bank_account',
        detected_bank: 'Vadesiz Hesap (CSV)',
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
