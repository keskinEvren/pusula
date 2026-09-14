import { extractTextFromPDF } from './extract-pdf'
import { extractFromCSVOrExcel } from './extract-csv'
import { matchMerchant } from './merchant-matcher'
import { repairTurkishPdfText } from './turkish-cleaner'
import type { ParseResult, ExtractedTransaction, BankDetectionResult } from './types'
import type { MerchantMapping } from '@/types/database'
import { formatLocalDateInput } from '../utils'

import { parseFlexibleAmount } from './utils'
export * from './utils'

function parseAmountRegex(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern)
  if (!m) return undefined
  return parseFlexibleAmount(m[1])
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
  } else if (upper.includes('AKBANK') || upper.includes('AXESS') || upper.includes('WINGS')) {
    bank = 'Akbank'
    card_name = 'Axess Platinum'
  } else if (
    upper.includes('ZIRAAT') ||
    upper.includes('BANKKART') ||
    upper.includes('5349-') ||
    /5349[\s-]*[#*xX\d]{4}/i.test(text) ||
    text.includes('9980069675')
  ) {
    bank = 'Ziraat Bankası'
    card_name = 'Bankkart'
  } else if (upper.includes('GARANTI') || upper.includes('BONUS') || upper.includes('BBVA')) {
    bank = 'Garanti BBVA'
    card_name = 'Bonus Trink'
  }

  // Dynamic last_four extraction from statement text (16-char masked card number: 4x4)
  const full16Match = text.match(/(?:[0-9*#xX]{4}[\s-]*[0-9*#xX]{4}[\s-]*[0-9*#xX]{4}[\s-]*(\d{4}))/i)
  if (full16Match) {
    last_four = full16Match[1]
  } else {
    const labeledMatch = text.match(/(?:kart\s*no|kartı\s*no|kredi\s*kartı|kart\s*numaras[ıivx]?)\s*[:.\-]?\s*[0-9*#xX\-\s]*?(\d{4})(?!\d)/i)
    if (labeledMatch) {
      last_four = labeledMatch[1]
    } else {
      const starMatch = text.match(/[#*xX]{4,}\s*(\d{4})(?!\d)/i)
      if (starMatch) {
        last_four = starMatch[1]
      }
    }
  }

  // Detect dates (DD.MM.YYYY or DD/MM/YYYY)
  let statement_date: string | undefined
  let due_date: string | undefined

  const stmtDateMatch = text.match(
    /(?:(?:^|\n)\s*|(?<!Sonraki\s+))(?:Hesap\s+Kesim\s+Tarihi|Ekstre\s+tarihi|Hesap\s+Özeti\s+Tarihi|Dönem\s+Başlangıç)\s*[:]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i
  )
  const dueDateMatch = text.match(
    /(?:(?:^|\n)\s*|(?<!Sonraki\s+))(?:Son\s+[öÖoO]deme\s+[Tt]arihi|Son\s+[Öö]deme)\s*[:]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i
  )

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
    /(?:Ekstre\s+borcu|D[öÖoO]nem\s+[bB]orcu|Toplam\s+d[öÖoO]nem\s+borcu|Toplam\s+bor[çc])(?:\s*(?:TL|TRY))?\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const minimum_payment = parseAmountRegex(
    text,
    /(?:Minimum\s+[öÖoO]deme|Asgari\s+[öÖoO]deme|En\s+[Aa]z\s+[öÖoO]deme\s+tutar[ıivx]?|Asgari\s+tutar)[^\d]*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const prev_debt = parseAmountRegex(
    text,
    /(?:Bir\s+önceki\s+ekstre\s+borcu|Önceki\s+ekstre\s+borcu|Geçen\s+dönem\s+borcu|Devreden\s+Bakiye|Önceki\s+Aydan\s+Devir|Önceki\s+DÖnem\s+Hesap\s+özeti\s+Bakiyesi)(?:\s*(?:TL|TRY))?\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
  )
  const interest_fees = parseAmountRegex(
    text,
    /(?:Faiz,\s+vergiler,\s+ücretler\s+toplamı|Toplam\s+faiz\s+ve\s+ücretler|Gecikme\s+faizi|Faiz\s+Ücretler\s+ve\s+Kesintiler|Toplam\s+DÖnem\s+Faizi)(?:\s*(?:TL|TRY))?\s*[:]?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/i
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
  /Önceki aydan devir/i,
  /Devreden bakiye/i,
  /Büyük Mükellefler/i,
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

    // Multi-amount column support:
    // A statement line may end with 1, 2, or 3 amount columns (e.g. TL Tutar, USD Tutar, Bankkart Lira)
    // Supports trailing '+' or '(-)' for payments, installment indicators like '619.99x1', and chip-para columns
    const multiAmountRegex =
      /^(.*?)(?:\s+(\d{1,2}\/\d{1,2}))?\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}\s*(?:[+-]|\([+-]?\)|\))?)(?:\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}\s*(?:[+-]|\([+-]?\)|\))?))?(?:\s+([+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}\s*(?:[+-]|\([+-]?\)|\))?))?(?:\s+[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}x\d+)?(?:\s+[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})?\s*(?:TL|TRY)?$/i

    const amountMatch = rest.match(multiAmountRegex)
    if (!amountMatch) continue

    const rawDesc = amountMatch[1].trim()
    const taksitCol = amountMatch[2] || undefined
    const descTaksitMatch = rawDesc.match(/(\d{1,2}\/\d{1,2})(?:\.taksit|\s*taksit)?/i)
    const taksitStr = taksitCol || (descTaksitMatch ? descTaksitMatch[1] : undefined)
    const col1 = amountMatch[3]
    const col2 = amountMatch[4]
    const col3 = amountMatch[5]

    const upperDesc = rawDesc.toUpperCase()

    const parseCol = (str?: string) => {
      if (!str) return null
      const isCredit =
        str.includes('+') ||
        (str.includes('(-)') &&
          (upperDesc.includes('ÖDEME') ||
            upperDesc.includes('ODEME') ||
            upperDesc.includes('TEŞEKKÜR') ||
            upperDesc.includes('TEIEKKÜR') ||
            upperDesc.includes('TAHSİLAT') ||
            upperDesc.includes('KAPATILAN BORÇ')))
      const isNegative = str.includes('-') || str.includes('(-)')
      const val = parseFlexibleAmount(str)
      return val === undefined ? null : { val, isCredit, isNegative, raw: str }
    }

    const p1 = parseCol(col1)
    const p2 = parseCol(col2)
    const p3 = parseCol(col3)

    // Select primary amount:
    // If col 1 is non-zero, it is the primary TL amount.
    // If col 1 is zero and col 2 is non-zero (foreign transaction), use col 2.
    let selectedAmount = p1
    if (p1 && p2) {
      if (p1.val !== 0) {
        selectedAmount = p1
      } else if (p2.val !== 0) {
        selectedAmount = p2
      }
    }

    if (!selectedAmount || selectedAmount.val === 0) continue

    const absAmount = selectedAmount.val
    const isCredit = selectedAmount.isCredit
    const isNegative = selectedAmount.isNegative || rawDesc.toLowerCase().includes('(iade)')

    // Normalize date
    let parsedDate = formatLocalDateInput()
    const dmy = rawDate.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
    if (dmy) {
      const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
      parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    }

    // Determine type
    let detectedType = 'Harcama'
    if (
      isCredit ||
      (!/FATURA/i.test(rawDesc) &&
        /ÖDEMENİZ|ODEMENIZ|TEŞEKKÜR|TEIEKKÜR|TAHSİLAT|KAPATILAN BORÇ/i.test(rawDesc))
    ) {
      detectedType = 'Kart Ödemesi'
    } else if (/FAİZ|FAIZ|BSMV|KKDF/i.test(rawDesc)) {
      detectedType = 'Finansman/Masraf'
    } else if (isNegative || /İADE|IADE|İNDİRİM|INDIRIM/i.test(rawDesc)) {
      detectedType = 'İade'
    } else if (/NAK[İI]T\s+AVANS|TAKS[İI]TL[İI]\s+AVANS|\bAVANS\b/i.test(rawDesc)) {
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

