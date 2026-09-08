/**
 * 🧭 PUSULA — Parser & String Utilities
 */

/**
 * Normalizes and parses flexible numeric amounts.
 * Handles Turkish format (1.234,56), Anglo/Axess format (1,234.56), and signed amounts (+ / -).
 */
export function parseFlexibleAmount(str?: string): number | undefined {
  if (!str) return undefined
  const clean = str.replace(/[^\d.,]/g, '')
  if (!clean) return undefined

  const lastDot = clean.lastIndexOf('.')
  const lastComma = clean.lastIndexOf(',')

  let normalized = clean
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 (Turkish format)
      normalized = clean.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 (Anglo format)
      normalized = clean.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    if (clean.length - lastComma - 1 === 2) {
      normalized = clean.replace(',', '.')
    } else {
      normalized = clean.replace(/,/g, '')
    }
  }

  const val = parseFloat(normalized)
  return isNaN(val) ? undefined : val
}

/**
 * Decodes Windows-1254 (CP1254) Turkish character artifacts from CSV / Text.
 * Commonly seen when banking statements are exported with Turkish Windows encoding.
 */
export function fixWindows1254Text(str?: string): string {
  if (!str) return ''
  return str
    .replace(/Þ/g, 'Ş')
    .replace(/þ/g, 'ş')
    .replace(/Ý/g, 'İ')
    .replace(/ý/g, 'ı')
    .replace(/Ð/g, 'Ğ')
    .replace(/ð/g, 'ğ')
}

/**
 * Identifies the bank name from text contents or Turkish IBAN format (TR + 2 check + 5 bank code).
 */
export function detectBankFromTextOrIban(text: string): string | undefined {
  if (!text) return undefined
  const upper = text.toUpperCase()
  const clean = text.replace(/[\s.-]+/g, '').toUpperCase()
  const ibanMatch = clean.match(/TR(\d{2})(\d{5})/)
  if (ibanMatch) {
    const code = ibanMatch[2]
    if (code === '00046') return 'Akbank Vadesiz'
    if (code === '00010') return 'Ziraat Vadesiz'
    if (code === '00210' || code.startsWith('0021')) return 'Vakıf Katılım Vadesiz'
    if (code === '00015') return 'VakıfBank Vadesiz'
    if (code === '00062') return 'Garanti Vadesiz'
    if (code === '00064') return 'İş Bankası Vadesiz'
    if (code === '00067') return 'Yapı Kredi Vadesiz'
    if (code === '00111') return 'Enpara Vadesiz'
    if (code === '00012') return 'Halkbank Vadesiz'
    if (code === '00205') return 'Kuveyt Türk Vadesiz'
    if (code === '00203') return 'Albaraka Vadesiz'
    if (code === '00206') return 'Türkiye Finans Vadesiz'
  }

  if (upper.includes('AKBANK') || upper.includes('AXESS')) return 'Akbank Vadesiz'
  if (upper.includes('ZİRAAT') || upper.includes('ZIRAAT') || upper.includes('BANKKART')) return 'Ziraat Vadesiz'
  if (upper.includes('GARANTİ') || upper.includes('GARANTI') || upper.includes('BBVA')) return 'Garanti Vadesiz'
  if (upper.includes('ENPARA') || upper.includes('QNB FINANSBANK')) return 'Enpara Vadesiz'
  if (upper.includes('VAKIF KATILIM')) return 'Vakıf Katılım Vadesiz'
  if (upper.includes('VAKIFBANK') || upper.includes('VAKIF BANK')) return 'VakıfBank Vadesiz'
  if (upper.includes('İŞ BANKASI') || upper.includes('IS BANKASI') || upper.includes('MAXIMUM')) return 'İş Bankası Vadesiz'
  if (upper.includes('YAPI KREDİ') || upper.includes('YAPI KREDI') || upper.includes('WORLD')) return 'Yapı Kredi Vadesiz'
  if (upper.includes('HALKBANK') || upper.includes('PARAF')) return 'Halkbank Vadesiz'

  return undefined
}
