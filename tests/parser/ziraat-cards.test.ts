import { describe, it, expect } from 'vitest'
import { detectBankAndMetadata, parseStatementLines } from '@/lib/parser'

const ziraatText0887 = `
ZİRAAT BANKASI
Kredi Kartı Hesap Özeti
5349 **** **** 0887
Hesap Kesim Tarihi : 15.09.2023
Son Ödeme Tarihi : 25.09.2023
Toplam dönem borcu : 35.888,65 TL
Asgari ödeme tutarı : 7.177,73 TL

16/09/2023 MARKET HARCAMASI 150,50
17/09/2023 RESTORAN 250,00
18/09/2023 ZİRAAT BANKASI ÖDEMENİZ 35.888,65 (+)
`

const ziraatText6745 = `
ZİRAAT BANKKART
Kredi Kartı
5349-XXXX-XXXX-6745
Hesap Kesim Tarihi : 15.09.2023
Son Ödeme Tarihi : 25.09.2023
Ekstre borcu : 7.566,67
Minimum ödeme : 1.513,33

19/09/2023 GİYİM MAĞAZASI 500,00
20/09/2023 KAFE 150,00
21/09/2023 SİNEMA 200,00
22/09/2023 KREDİ KARTI TAHSİLAT 7.566,67 (+)
`

describe('Ziraat Cards Parser Tests', () => {
  describe('detectBankAndMetadata and parseStatementLines', () => {
    it('iki kart birbirinden ayrıştırılabilmeli (0887 vs 6745 last_four)', () => {
      const meta0887 = detectBankAndMetadata(ziraatText0887)
      const meta6745 = detectBankAndMetadata(ziraatText6745)

      expect(meta0887.bank).toBe('Ziraat Bankası')
      expect(meta0887.last_four).toBe('0887')
      expect(meta6745.bank).toBe('Ziraat Bankası')
      expect(meta6745.last_four).toBe('6745')
    })

    it('Kart 0887: ekstre borcu = 35888.65, asgari ödeme = 7177.73 olmalı', () => {
      const meta0887 = detectBankAndMetadata(ziraatText0887)

      expect(meta0887.statement_debt).toBe(35888.65)
      expect(meta0887.minimum_payment).toBe(7177.73)
    })

    it('Kart 6745: ekstre borcu = 7566.67, asgari ödeme = 1513.33 olmalı', () => {
      const meta6745 = detectBankAndMetadata(ziraatText6745)

      expect(meta6745.statement_debt).toBe(7566.67)
      expect(meta6745.minimum_payment).toBe(1513.33)
    })

    it('Kart 0887 için işlem sayısı doğru hesaplanmalı', () => {
      const transactions = parseStatementLines(ziraatText0887)
      expect(transactions.length).toBe(3)
    })

    it('Kart 6745 için işlem sayısı doğru hesaplanmalı', () => {
      const transactions = parseStatementLines(ziraatText6745)
      expect(transactions.length).toBe(4)
    })

    it('Ödeme satırları her iki kart için de doğru ayrıştırılmalı', () => {
      const trans0887 = parseStatementLines(ziraatText0887)
      const payment0887 = trans0887.find(t => t.type === 'Kart Ödemesi')
      expect(payment0887).toBeDefined()
      expect(payment0887?.amount).toBe(35888.65)

      const trans6745 = parseStatementLines(ziraatText6745)
      const payment6745 = trans6745.find(t => t.type === 'Kart Ödemesi')
      expect(payment6745).toBeDefined()
      expect(payment6745?.amount).toBe(7566.67)
    })
  })
})
