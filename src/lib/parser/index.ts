import { extractTextFromPDF } from './extract-pdf'
import { extractFromCSVOrExcel } from './extract-csv'
import { matchMerchant } from './merchant-matcher'
import { repairTurkishPdfText } from './turkish-cleaner'
import type { ParseResult, ExtractedTransaction, BankDetectionResult } from './types'
import type { MerchantMapping } from '@/types/database'

function parseAmountRegex(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern)
  if (!m) return undefined
  const clean = m[1].replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const num = parseFloat(clean)
  return isNaN(num) ? undefined : num
}

/**
 * Detects bank, card name, statement dates and summary amounts from raw PDF text
 */
export function detectBankAndMetadata(text: string): BankDetectionResult {
  const upper = text.toUpperCase()
  let bank = 'Diğer Banka'
  let card_name = 'Kredi Kartı'
  let last_four: string | undefined = undefined

  if (upper.includes('ENPARA') || upper.includes('QNB FINANSBANK')) {
    bank = 'Enpara'
    card_name = 'Kredi Kartı'
    last_four = '2039'
  } else if (upper.includes('AKBANK') || upper.includes('AXESS') || upper.includes('WINGS')) {
    bank = 'Akbank'
    card_name = 'Axess Platinum'
    last_four = '1697'
  } else if (upper.includes('ZIRAAT') || upper.includes('BANKKART')) {
    bank = 'Ziraat Bankası'
    card_name = 'Bankkart'
    last_four = '0887'
  } else if (upper.includes('GARANTI') || upper.includes('BONUS') || upper.includes('BBVA')) {
    bank = 'Garanti BBVA'
    card_name = 'Bonus Trink'
    last_four = '9388'
  }

  // Detect dates (DD.MM.YYYY or DD/MM/YYYY)
  let statement_date: string | undefined
  let due_date: string | undefined

  const stmtDateMatch = text.match(/(?:Ekstre tarihi|Hesap Özeti Tarihi|Dönem Başlangıç)\s*[:]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i)
  const dueDateMatch = text.match(/(?:Son ödeme tarihi|Son Ödeme)\s*[:]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i)

  const parseDMY = (dStr: string) => {
    const parts = dStr.split(/[./]/)
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }

  if (stmtDateMatch) {
    statement_date = parseDMY(stmtDateMatch[1])
  }
  if (dueDateMatch) {
    due_date = parseDMY(dueDateMatch[1])
  }

  if (!statement_date) {
    const dateMatches = text.match(/(\d{2})[./](\d{2})[./](\d{4})/g)
    if (dateMatches && dateMatches.length > 0) {
      statement_date = parseDMY(dateMatches[0])
      if (dateMatches.length > 1 && !due_date) {
        due_date = parseDMY(dateMatches[1])
      }
    }
  }

  // Detect summary amounts
  const statement_debt = parseAmountRegex(
    text,
    /(?:Ekstre borcu|Dönem borcu|Toplam dönem borcu)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const minimum_payment = parseAmountRegex(
    text,
    /(?:Minimum ödeme tutarı|Asgari ödeme tutarı|Asgari tutar)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const prev_debt = parseAmountRegex(
    text,
    /(?:Bir önceki ekstre borcu|Önceki ekstre borcu|Geçen dönem borcu)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const interest_fees = parseAmountRegex(
    text,
    /(?:Faiz, vergiler, ücretler toplamı|Toplam faiz ve ücretler|Gecikme faizi)\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )

  return {
    bank,
    card_name: last_four ? `${card_name} • ${last_four}` : card_name,
    last_four,
    statement_date,
    due_date,
    statement_debt,
    minimum_payment,
    prev_debt,
    interest_fees,
  }
}

/**
 * Filter list of non-transaction header/summary phrases to ignore
 */
const IGNORED_PATTERNS = [
  /Kullanılabilir kart limiti/i,
  /Kart limiti/i,
  /Kart numarası/i,
  /Ekstre borcu/i,
  /Minimum ödeme tutarı/i,
  /Son ödeme tarihi/i,
  /Ekstre tarihi/i,
  /Ad soyad/i,
  /Bir önceki ekstre/i,
  /Harcamalar ve yansıyan/i,
  /Nakit avans \/ Artı/i,
  /Faiz, vergiler, ücretler/i,
  /İşlem tarihi\s+Açıklama/i,
  /lem tarihi\s+A\s*ıklama/i,
  /Sayfa\s+\d+\s*\/\s*\d+/i,
  /Kart sahibinin T\.C\./i,
  /Enpara Bank A\.Ş\./i,
  /numaralı.*kredi kartınızla/i,
  /BSMV ve KKDF tutarlarına/i,
  /Bir sonraki ekstreniz/i,
  /Güncel akdi faiz/i,
  /Alışveriş faiz oranı/i,
  /Taksitli nakit avans/i,
  /Aylık\s*%/i,
  /Yıllık\s*%/i,
  /--- PAGE BREAK ---/i,
]

function shouldIgnoreLine(line: string): boolean {
  for (const pattern of IGNORED_PATTERNS) {
    if (pattern.test(line)) return true
  }
  return false
}

/**
 * Parses raw text lines using robust regex matching for Turkish credit card statement lines
 */
export function parseStatementLines(
  rawText: string,
  userMappings: MerchantMapping[] = []
): ExtractedTransaction[] {
  const repairedText = repairTurkishPdfText(rawText)
  const lines = repairedText.split('\n')
  const transactions: ExtractedTransaction[] = []

  let idx = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 8 || shouldIgnoreLine(trimmed)) {
      continue
    }

    // Line starts with date (DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY)
    const dateMatch = trimmed.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+(.+)$/)
    if (!dateMatch) continue

    const rawDate = dateMatch[1]
    const rest = dateMatch[2].trim()

    // Match amount at the very end of the line: e.g. " - 1.000,00 TL", " 1.879,00 TL", " - 253,01 TL"
    const amountMatch = rest.match(/^(.*?)(?:\s+(\d{1,2}\/\d{1,2}))?\s+(-?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:TL|TRY)?$/i)
    if (!amountMatch) continue

    const rawDesc = amountMatch[1].trim()
    const taksitStr = amountMatch[2] || undefined
    const rawAmountStr = amountMatch[3].trim()

    // Normalize amount
    const isNegative = rawAmountStr.startsWith('-') || rawDesc.toLowerCase().includes('(iade)')
    const cleanAmountStr = rawAmountStr
      .replace(/[^\d.,]/g, '')
      .replace(/\.(?=\d{3})/g, '') // remove thousands dot
      .replace(',', '.') // decimal comma -> dot

    const absAmount = parseFloat(cleanAmountStr)
    if (isNaN(absAmount) || absAmount === 0) continue

    // Normalize date
    let parsedDate = new Date().toISOString().split('T')[0]
    const dmy = rawDate.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
    if (dmy) {
      const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
      parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    }

    // Determine type
    const upperDesc = rawDesc.toUpperCase()
    let detectedType = 'Harcama'
    if (upperDesc.includes('ÖDEME') || upperDesc.includes('ODEME') || upperDesc.includes('TAHSİLAT')) {
      detectedType = 'Kart Ödemesi'
    } else if (upperDesc.includes('FAİZ') || upperDesc.includes('FAIZ') || upperDesc.includes('BSMV') || upperDesc.includes('KKDF')) {
      detectedType = 'Finansman/Masraf'
    } else if (upperDesc.includes('İADE') || upperDesc.includes('IADE') || isNegative) {
      detectedType = 'İade'
    } else if (upperDesc.includes('NAKİT AVANS') || upperDesc.includes('NAKIT AVANS')) {
      detectedType = 'Nakit Avans'
    }

    const { merchant, analysis_group, type: mappedType, recurrence, project_id } = matchMerchant(rawDesc, userMappings)

    const finalType = mappedType || detectedType
    const finalGroup = finalType === 'Kart Ödemesi' ? 'Hariç' : analysis_group
    const finalRecurrence = taksitStr ? `Taksit (${taksitStr})` : recurrence

    idx++
    transactions.push({
      id: `pdf-${idx}-${Date.now()}`,
      date: parsedDate,
      raw_description: rawDesc,
      merchant,
      amount: absAmount,
      type: finalType,
      analysis_group: finalGroup,
      recurrence: finalRecurrence,
      project_id,
      confidence: 'high',
      selected: finalGroup !== 'Hariç',
    })
  }

  return transactions
}

/**
 * Main parse entry point handling PDF, CSV, and Excel statement files
 */
export async function parseStatementFile(
  file: File,
  userMappings: MerchantMapping[] = []
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    const csvResult = await extractFromCSVOrExcel(file, userMappings)
    return {
      success: !csvResult.error && csvResult.transactions.length > 0,
      file_name: file.name,
      import_type: 'credit_card',
      transactions: csvResult.transactions,
      error: csvResult.error,
    }
  }

  if (ext === 'pdf') {
    try {
      const rawText = await extractTextFromPDF(file)
      const meta = detectBankAndMetadata(rawText)
      const transactions = parseStatementLines(rawText, userMappings)

      return {
        success: transactions.length > 0,
        file_name: file.name,
        import_type: 'credit_card',
        detected_bank: meta.bank,
        detected_card: meta.card_name,
        last_four: meta.last_four,
        statement_date: meta.statement_date,
        due_date: meta.due_date,
        statement_debt: meta.statement_debt,
        minimum_payment: meta.minimum_payment,
        prev_debt: meta.prev_debt,
        interest_fees: meta.interest_fees,
        transactions,
        error: transactions.length === 0 ? 'PDF metni okundu fakat hareket satırları tespit edilemedi. Lütfen manuel kontrol edin veya CSV deneyin.' : undefined,
      }
    } catch (err: any) {
      return {
        success: false,
        file_name: file.name,
        import_type: 'credit_card',
        transactions: [],
        error: err.message || 'PDF dosyası işlenirken hata oluştu',
      }
    }
  }

  return {
    success: false,
    file_name: file.name,
    import_type: 'credit_card',
    transactions: [],
    error: 'Desteklenmeyen dosya türü. Lütfen PDF, CSV veya XLSX yükleyin.',
  }
}

export * from './reconciler'
export * from './extract-bank-account'

