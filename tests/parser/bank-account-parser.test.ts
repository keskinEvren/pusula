import { describe, it, expect, vi } from 'vitest'
import {
  parseBankAccountLines,
  extractFromHtmlBankAccount,
  parseBankAccountTable,
} from '@/lib/parser/extract-bank-account'
import { reconcileBankMovement } from '@/lib/parser/reconciler'
import { detectBankFromTextOrIban, fixWindows1254Text } from '@/lib/parser/utils'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Vadesiz Banka Hesap Dökümü Parser Testleri', () => {
  it('1. Açıklamada Hesap No Geçen Hareketler: Başlık filtresi hareket satırlarını ezmemeli', () => {
    const bankText = `
Müşteri/Hesap No: 83801340-5003
IBAN: TR880001004031838013405003
05.08.2026 ATM QR İLE PARA ÇEKME HESAP NO:4031-83801340-5003 500,00 TL 1.200,00 TL
06.08.2026 Gelen FAST EVREN KESKİN 2.000,00 TL 3.200,00 TL
    `
    const { transactions } = parseBankAccountLines(bankText)
    expect(transactions.length).toBe(2)
    expect(transactions[0].raw_description).toContain('ATM QR İLE PARA ÇEKME')
    expect(transactions[0].amount).toBe(500.0)
    expect(transactions[0].direction).toBe('outflow')
    expect(transactions[1].amount).toBe(2000.0)
    expect(transactions[1].direction).toBe('inflow')
  })

  it('2. Ziraat HTML Döküm Ayrıştırma: HTML tablosundaki satırları, bakiyeyi ve bankayı eksiksiz çıkarır', () => {
    const sampleHtml = `
<html>
<body>
<table>
  <tr><td>Sayın</td><td>:</td><td>EVREN KESKİN</td><td>Şube Kodu</td><td>:</td><td>ZİRAAT SÜPER ŞUBE</td></tr>
  <tr><td>Müşteri/Hesap No</td><td>:</td><td>83801340-5003</td></tr>
  <tr><td>IBAN</td><td>:</td><td>TR880001004031838013405003</td></tr>
  <tr>
    <td>03.09.2026</td>
    <td>F19753</td>
    <td>KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0019753</td>
    <td>-10.800,92</td>
    <td>0,00</td>
  </tr>
  <tr>
    <td>03.09.2026</td>
    <td>F19735</td>
    <td>Gönd: EVREN KESKİN Fast Anlık Ödeme 0210-Vakıf Katılım Bankası A.Ş. FAST işlemi</td>
    <td>10.800,92</td>
    <td>10.800,92</td>
  </tr>
  <tr>
    <td>07.10.2025</td>
    <td>L00116</td>
    <td>1262-MİTHATPAŞA Şubesi'nden Devir</td>
    <td>14,85</td>
    <td>14,85</td>
  </tr>
</table>
</body>
</html>
    `
    const mockCards = [
      { id: 'card-0887', card_name: 'Bankkart • 0887', bank: 'Ziraat Bankası', last_four: '0887' } as any,
      { id: 'card-6745', card_name: 'Bankkart • 6745', bank: 'Ziraat Bankası', last_four: '6745' } as any,
    ]

    const result = extractFromHtmlBankAccount(sampleHtml, [], mockCards, [])
    expect(result.detected_bank).toBe('Ziraat Vadesiz')
    expect(result.closing_balance).toBe(0.0)
    expect(result.transactions.length).toBe(3)

    // First tx: card payment for 0887
    const tx1 = result.transactions[0]
    expect(tx1.date).toBe('2026-09-03')
    expect(tx1.amount).toBe(10800.92)
    expect(tx1.direction).toBe('outflow')
    expect(tx1.action).toBe('CARD_PAYMENT')
    expect(tx1.analysis_group).toBe('Hariç')
    expect(tx1.target_card_id).toBe('card-0887')

    // Second tx: inflow fast
    const tx2 = result.transactions[1]
    expect(tx2.date).toBe('2026-09-03')
    expect(tx2.amount).toBe(10800.92)
    expect(tx2.direction).toBe('inflow')
    expect(tx2.analysis_group).toBe('Hariç')
  })

  it('3. KK TAHSİLAT Farklı Kart Eşleştirmesi: 6745 kartını son 4 haneden doğru karta bağlar', () => {
    const mockCards = [
      { id: 'card-0887', card_name: 'Bankkart • 0887', bank: 'Ziraat Bankası', last_four: '0887' } as any,
      { id: 'card-6745', card_name: 'Bankkart • 6745', bank: 'Ziraat Bankası', last_four: '6745' } as any,
    ]

    const rec = reconcileBankMovement(
      'KK TAHSİLAT KART NO: 5349 **** **** 6745 FİŞ NO:0059848',
      500.0,
      'outflow',
      [],
      mockCards,
      []
    )

    expect(rec.action).toBe('CARD_PAYMENT')
    expect(rec.analysis_group).toBe('Hariç')
    expect(rec.target_card_id).toBe('card-6745')
    expect(rec.confidence).toBe('high')
  })

  it('4. Kredi Kartı Nakit Avans Tespiti: Hesaba giren nakit avansı tespit edip ilgili karta bağlar', () => {
    const mockCards = [
      { id: 'card-0887', card_name: 'Bankkart • 0887', bank: 'Ziraat Bankası', last_four: '0887' } as any,
      { id: 'card-6745', card_name: 'Bankkart • 6745', bank: 'Ziraat Bankası', last_four: '6745' } as any,
    ]

    const rec = reconcileBankMovement(
      'Bankamız KK Nakit Avans 5349 **** **** 0887 Kart Hamili:EVREN KESKİN Nakit Avans Ücreti 7,00 TRY İşlem Tutarı:',
      700.0,
      'inflow',
      [],
      mockCards,
      []
    )

    expect(rec.action).toBe('CASH_ADVANCE')
    expect(rec.type).toBe('Nakit Avans')
    expect(rec.analysis_group).toBe('Hariç')
    expect(rec.target_card_id).toBe('card-0887')
    expect(rec.confidence).toBe('high')
  })

  it('5. Tüm 0887 Hareketleri Simülasyonu: Nakit avans ve kart ödemelerini doğru sınıflandırır', () => {
    const mockCards = [
      { id: 'card-0887', card_name: 'Bankkart • 0887', bank: 'Ziraat Bankası', last_four: '0887', statement_date: '2026-08-20', current_debt: 35888.65 },
      { id: 'card-6745', card_name: 'Bankkart • 6745', bank: 'Ziraat Bankası', last_four: '6745', statement_date: '2026-08-20', current_debt: 7566.67 },
    ]

    const sampleLines = [
      { desc: 'F19753 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0019753', amt: 10800.92, dir: 'outflow', expectedAction: 'CARD_PAYMENT' },
      { desc: 'F65091 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0065091', amt: 17910.00, dir: 'outflow', expectedAction: 'CARD_PAYMENT' },
      { desc: 'F59954 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0059954', amt: 6053.34, dir: 'outflow', expectedAction: 'CARD_PAYMENT' },
      { desc: 'F04083 Bankamız KK Nakit Avans 5349 **** **** 0887 Kart Hamili:EVREN KESKİN', amt: 700.00, dir: 'inflow', expectedAction: 'CASH_ADVANCE' },
    ]

    for (const line of sampleLines) {
      const rec = reconcileBankMovement(line.desc, line.amt, line.dir as any, [], mockCards as any, [])
      expect(rec.action).toBe(line.expectedAction)
      expect(rec.target_card_id).toBe('card-0887')
    }
  })

  it('6. Vakıf Katılım Vadesiz Hesap PDF Ayrıştırma: Hareketleri doğru çıkarır', () => {
    const sampleVakifPdfText = `
      Hesap Hareketleri
      Sayın EVREN KESKİN,
      Hesap Türü : Cari Hesap
      IBAN No : TR22 0021 0000 0015 4860 0000 01
      İşlem Tarihi Açıklama Tutar Bakiye Referans Numarası
      03.09.2026 Lehdar= EVREN -8.398,08 TL 0,00 TL A012B
      KESKINAciklama= Fast Anlık
      Ödeme
      03.09.2026 Ağustos 2026 Maaş Ödemesi 43.299,00 TL 43.299,00 TL A00XV
      --- PAGE BREAK ---
    `

    const { transactions, closing_balance } = parseBankAccountLines(sampleVakifPdfText)
    expect(transactions.length).toBe(2)
    expect(closing_balance).toBe(0)

    const outflow = transactions.find((t) => t.direction === 'outflow')
    expect(outflow).toBeDefined()
    expect(outflow?.amount).toBe(8398.08)

    const inflow = transactions.find((t) => t.direction === 'inflow')
    expect(inflow).toBeDefined()
    expect(inflow?.amount).toBe(43299.0)
    expect(inflow?.type).toBe('Gelir')
  })

  it('7. Akbank Vadesiz CSV Ayrıştırma: Windows-1254 karakterlerini onarır ve hareketleri çıkarır', () => {
    const mockCsvRows = [
      ['Þube', '0069'],
      ['HesapNo', '0332145'],
      ['IBAN', 'TR900004600069888000332145'],
      ['Kullanýlabilir Bakiye', '10.000,00'],
      ['Tarih Aralýðý', '15.03.2026-07.09.2026'],
      [],
      ['Tarih', 'Tutar', 'Bakiye', 'Açýklama'],
      ['2026-09-03-17.47.03.981045', '-24.100,00 TL', '0,00 TL', 'Kredi Kartý Ödeme'],
      ['2026-09-03-17.46.10.916875', '24.100,00 TL', '24.100,00 TL', 'Evren Keskin - Vakýf Katýlým Ban'],
    ]

    const result = parseBankAccountTable(mockCsvRows)
    expect(result.detected_bank).toBe('Akbank Vadesiz')
    expect(result.closing_balance).toBe(0)
    expect(result.transactions.length).toBe(2)

    expect(result.transactions[0].date).toBe('2026-09-03')
    expect(result.transactions[0].amount).toBe(24100.0)
    expect(result.transactions[0].direction).toBe('outflow')
    expect(result.transactions[0].action).toBe('CARD_PAYMENT')

    expect(result.transactions[1].date).toBe('2026-09-03')
    expect(result.transactions[1].amount).toBe(24100.0)
    expect(result.transactions[1].direction).toBe('inflow')
  })

  it('8. detectBankFromTextOrIban & fixWindows1254Text: IBAN ve bozuk karakterleri çözer', () => {
    expect(detectBankFromTextOrIban('IBAN TR900004600069888000332145')).toBe('Akbank Vadesiz')
    expect(detectBankFromTextOrIban('IBAN TR22 0021 0000 0015 4860 0000 01')).toBe('Vakıf Katılım Vadesiz')
    expect(detectBankFromTextOrIban('IBAN TR880001004031838013405003')).toBe('Ziraat Vadesiz')
    expect(detectBankFromTextOrIban('IBAN TR110011100000000000000001')).toBe('Enpara Vadesiz')

    expect(fixWindows1254Text('Þube açýklama deðer')).toBe('Şube açıklama değer')
    expect(fixWindows1254Text('ÝÞLEM TUTARI')).toBe('İŞLEM TUTARI')
  })
})
