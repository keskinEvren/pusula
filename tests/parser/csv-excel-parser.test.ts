import { describe, it, expect, vi } from 'vitest'
import { extractFromCSVOrExcel } from '@/lib/parser/extract-csv'
import * as XLSX from 'xlsx'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

function createMockXlsxFile(rows: any[][], fileName = 'test.xlsx'): File {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new File([wbout], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('CSV/Excel Parser Tests (F06)', () => {
  it('1. XLSX dosyasından hareketleri ve başlıkları doğru çıkarır', async () => {
    const rows = [
      ['Rapor Başlığı: Kart Ekstresi'],
      ['İşlem Tarihi', 'Açıklama', 'Tutar'],
      ['2026-03-15', 'MİGROS TİCARET A.Ş.', '450,50 TL'],
      ['2026-03-16', 'NETFLIX.COM', '199,99 TL'],
    ]
    const file = createMockXlsxFile(rows)
    const result = await extractFromCSVOrExcel(file)

    expect(result.error).toBeUndefined()
    expect(result.transactions.length).toBe(2)
    expect(result.transactions[0].date).toBe('2026-03-15')
    expect(result.transactions[0].amount).toBe(450.50)
    expect(result.transactions[0].merchant).toBe('Migros')
    expect(result.transactions[0].analysis_group).toBe('Kişisel')

    expect(result.transactions[1].date).toBe('2026-03-16')
    expect(result.transactions[1].amount).toBe(199.99)
    expect(result.transactions[1].merchant).toBe('Netflix')
  })

  it('2. ISO formatındaki tarihleri (YYYY-MM-DD) bozmadan okur', async () => {
    const rows = [
      ['Tarih', 'İşyeri', 'Borç'],
      ['2026-11-25', 'SPOTIFY ABONELİK', '59.99'],
    ]
    const file = createMockXlsxFile(rows)
    const result = await extractFromCSVOrExcel(file)

    expect(result.transactions.length).toBe(1)
    expect(result.transactions[0].date).toBe('2026-11-25')
    expect(result.transactions[0].amount).toBe(59.99)
  })

  it('3. Başlık bulunamadığında varsayılan sütun sırasını (Col 0: Tarih, Col 1: Açıklama, Col 2: Tutar) kullanır', async () => {
    const rows = [
      ['T', 'D', 'M'],
      ['10.04.2026', 'ŞOK MARKETLER T.A.Ş.', '125,00'],
      ['11.04.2026', 'BİM BİRLEŞİK MAĞAZALAR', '85,50'],
    ]
    const file = createMockXlsxFile(rows)
    const result = await extractFromCSVOrExcel(file)

    expect(result.transactions.length).toBe(2)
    expect(result.transactions[0].amount).toBe(125.0)
    expect(result.transactions[1].amount).toBe(85.5)
  })

  it('4. Boş dosya veya içeriksiz tabloda hata ve boş dizi döner', async () => {
    const rows: any[][] = []
    const file = createMockXlsxFile(rows)
    const result = await extractFromCSVOrExcel(file)

    expect(result.transactions).toEqual([])
  })
})
