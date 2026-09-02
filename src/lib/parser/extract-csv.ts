import * as XLSX from 'xlsx'
import { matchMerchant } from './merchant-matcher'
import { repairTurkishPdfText } from './turkish-cleaner'
import type { ExtractedTransaction } from './types'
import type { MerchantMapping } from '@/types/database'

export async function extractFromCSVOrExcel(
  file: File,
  userMappings: MerchantMapping[] = []
): Promise<{ transactions: ExtractedTransaction[]; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]

    const jsonData: Array<Array<any>> = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd',
    })

    if (!jsonData || jsonData.length === 0) {
      return { transactions: [], error: 'Dosya boş veya okunamadı' }
    }

    // Find header row and column indexes
    let dateIdx = -1
    let descIdx = -1
    let amountIdx = -1
    let startRow = 0

    for (let r = 0; r < Math.min(10, jsonData.length); r++) {
      const row = jsonData[r]
      if (!row) continue

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').toUpperCase()
        if (val.includes('TARİH') || val.includes('TARIH') || val.includes('İŞLEM TARİHİ') || val.includes('ISLEM TARIHI')) {
          dateIdx = c
        } else if (val.includes('AÇIKLAMA') || val.includes('ACIKLAMA') || val.includes('İŞYERİ') || val.includes('DETAY')) {
          descIdx = c
        } else if (val.includes('TUTAR') || val.includes('BORÇ') || val.includes('BORC') || val.includes('AMOUNT')) {
          amountIdx = c
        }
      }

      if (dateIdx !== -1 && descIdx !== -1 && amountIdx !== -1) {
        startRow = r + 1
        break
      }
    }

    // Fallback if no header found: assumption Col 0 = Date, Col 1 = Desc, Col 2 = Amount
    if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
      dateIdx = 0
      descIdx = 1
      amountIdx = 2
      startRow = 1
    }

    const transactions: ExtractedTransaction[] = []
    let idx = 0

    for (let r = startRow; r < jsonData.length; r++) {
      const row = jsonData[r]
      if (!row || row.length <= Math.max(dateIdx, descIdx, amountIdx)) continue

      const rawDateStr = String(row[dateIdx] || '').trim()
      const rawDescStr = String(row[descIdx] || '').trim()
      const rawAmountStr = String(row[amountIdx] || '').trim()

      if (!rawDateStr || !rawDescStr || !rawAmountStr) continue

      // Clean amount
      const cleanAmountStr = rawAmountStr
        .replace(/[^\d.,-]/g, '')
        .replace(/\.(?=\d{3})/g, '') // remove thousands dot
        .replace(',', '.') // comma to dot

      const amountNum = Math.abs(parseFloat(cleanAmountStr))
      if (isNaN(amountNum) || amountNum === 0) continue

      const isNegative = rawAmountStr.startsWith('-') || rawDescStr.toLowerCase().includes('iade')

      // Date parsing
      let parsedDate = rawDateStr
      const dmy = rawDateStr.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/)
      if (dmy) {
        const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : new Date().getFullYear().toString()
        parsedDate = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
      }

      const repairedDesc = repairTurkishPdfText(rawDescStr)
      const upperDesc = repairedDesc.toUpperCase()
      let type = 'Harcama'
      if (upperDesc.includes('ÖDEME') || upperDesc.includes('ODEME') || upperDesc.includes('TAHSİLAT')) {
        type = 'Kart Ödemesi'
      } else if (upperDesc.includes('FAİZ') || upperDesc.includes('FAIZ') || upperDesc.includes('BSMV') || upperDesc.includes('KKDF')) {
        type = 'Finansman/Masraf'
      } else if (upperDesc.includes('İADE') || upperDesc.includes('IADE') || isNegative) {
        type = 'İade'
      }

      const { merchant, analysis_group, type: mappedType, recurrence, project_id } = matchMerchant(repairedDesc, userMappings)

      const finalType = mappedType || type
      const finalGroup = finalType === 'Kart Ödemesi' ? 'Hariç' : analysis_group

      idx++
      transactions.push({
        id: `csv-${idx}-${Date.now()}`,
        date: parsedDate,
        raw_description: repairedDesc,
        merchant,
        amount: amountNum,
        type: finalType,
        analysis_group: finalGroup,
        recurrence,
        project_id,
        confidence: 'high',
        selected: finalGroup !== 'Hariç',
      })
    }

    return { transactions }
  } catch (err: any) {
    return { transactions: [], error: err.message || 'CSV/XLSX işleme hatası' }
  }
}
