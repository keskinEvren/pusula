import { describe, it, expect } from 'vitest'
import { detectBankAndMetadata, parseStatementLines } from '../src/lib/parser'

describe('Pusula Ekstre Ayrıştırıcı & OCR Motoru (Gateway 3 Parser Testleri)', () => {
  describe('1. Otomatik Banka Tespiti & Metadata Çıkarımı', () => {
    it('1.1. Enpara Tespiti: QNB Finansbank / Enpara metninden banka, kart ve tarihleri doğru çıkarır', () => {
      const sampleText = `
        QNB FINANSBANK A.S.
        Enpara.com Kredi Kartı Hesap Özeti
        Hesap Özeti Tarihi: 19.08.2026
        Son Ödeme Tarihi: 31.08.2026
        Dönem Borcu: 26.969,24 TL
      `
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Enpara')
      expect(meta.card_name).toBe('Kredi Kartı • 2039')
      expect(meta.statement_date).toBe('2026-08-19')
      expect(meta.due_date).toBe('2026-08-31')
    })

    it('1.2. Akbank Axess Tespiti: Akbank metnini tanır', () => {
      const sampleText = 'AKBANK T.A.S. AXESS PLATINUM HESAP BILDIRIM CETVELI 04.07.2026 14.07.2026'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Akbank')
      expect(meta.card_name).toBe('Axess Platinum • 1697')
    })

    it('1.3. Ziraat Bankkart Tespiti: Ziraat metnini tanır', () => {
      const sampleText = 'T.C. ZIRAAT BANKASI A.S. BANKKART HESAP OZETI'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Ziraat Bankası')
      expect(meta.card_name).toBe('Bankkart • 0887')
    })

    it('1.4. Garanti Bonus Tespiti: Garanti BBVA metnini tanır', () => {
      const sampleText = 'GARANTI BBVA BONUS KREDI KARTI HESAP OZETI'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Garanti BBVA')
      expect(meta.card_name).toBe('Bonus Trink • 9388')
    })
  })

  describe('2. Gerçek Dünya Enpara Ekstresi OCR & Glif Onarımı Testleri', () => {
    const realEnparaOcrText = `
      Ekstre tarihi 19/04/2026
      Ekstre borcu 23.724,42 TL
      Minimum deme tutarı 4.745,00 TL
      Son deme tarihi 29/04/2026
      Kullanılabilir kart limiti 220,75 TL
      Bir nceki ekstre borcu 4.542,49 TL
      13/03/2026  deme - Enpara.com Cep 	ubesi - 1.000,00 TL
      27/03/2026  deme - Enpara.com Cep 	ubesi - 1.000,00 TL
      21/12/2025 RIHTIM VE VERASET V. ISTANBUL TR ( lem tutarı: 11.274,00 TL) (Faiz oranı: %0,00) 4/6 1.879,00 TL
      11/03/2026 ALWAYS CAFE 775,00 TL
      12/03/2026 5071102287 - TURK TELEKOM (MOBIL) - ODE 370,00 TL
      14/03/2026 	OK 12037 	L AL BEY 28,90 TL
      14/03/2026 9916 G487 A101 AYLA USKUD 113,50 TL
      17/03/2026  DEAL//ALMIRA PASTA 375,00 TL
      17/03/2026 AZ MOLU K FTE DONDURM 80,00 TL
      21/03/2026 B M V387-BEYAZIT - SK DA 4,75 TL
      27/03/2026 Google YouTubePremium 79,99 TL
      27/03/2026 Google WhatsApp Busin 549,00 TL
      28/03/2026 CANVA* I04831-55137578 100,00 TL
      06/02/2026 Hepsiburada ISTANBUL (iade) 3/3 - 253,01 TL
      02/04/2026 Google Workspace_yetis 14.359,68 TL
      04/04/2026 GAMMA.APP (25,00 USD) 1.136,06 TL
      04/04/2026 OPENAI *CHATGPT SUBSCR (24,00 USD) 1.090,62 TL
      17/03/2026 FACEBK *ZX4BMHZRR2 4.913,26 TL
      19/04/2026 Alı veri faizi 77,93 TL
      19/04/2026 Faiz ve cretlerin BSMV'si* 11,69 TL
      19/04/2026 Faizlerin KKDF’si* 11,69 TL
    `

    it('2.1. Başlık ve Özet Satırı İzolasyonu: "Kullanılabilir kart limiti" satırı elenmeli', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const hasLimit = txs.some((t) => t.raw_description.includes('Kullanılabilir kart limiti'))
      expect(hasLimit).toBe(false)
    })

    it('2.2. Borç Ödemesi İzolasyonu: "deme - Enpara" satırı type: "Kart Ödemesi", group: "Hariç", selected: false olmalı', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const payment = txs.find((t) => t.date === '2026-03-13' && t.amount === 1000.0)
      expect(payment).toBeDefined()
      expect(payment?.type).toBe('Kart Ödemesi')
      expect(payment?.analysis_group).toBe('Hariç')
      expect(payment?.selected).toBe(false)
    })

    it('2.3. Taksit Sütun Yakalama: RIHTIM VE VERASET taksit tutarı 1.879,00 TL ve 4/6 taksit olarak yakalanmalı', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const rihtim = txs.find((t) => t.raw_description.includes('RIHTIM VE VERASET'))
      expect(rihtim).toBeDefined()
      expect(rihtim?.amount).toBe(1879.0)
      expect(rihtim?.recurrence).toBe('Taksit (4/6)')
    })

    it('2.4. Türkçe Glif Onarımı (ŞOK, BİM, Azimoğlu): Bozuk metinler temiz adlarına restore edilmeli', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const sok = txs.find((t) => t.merchant === 'ŞOK')
      const bim = txs.find((t) => t.merchant === 'BİM')
      const azim = txs.find((t) => t.merchant === 'Azimoğlu Çiğköfte')

      expect(sok).toBeDefined()
      expect(sok?.amount).toBe(28.9)

      expect(bim).toBeDefined()
      expect(bim?.amount).toBe(4.75)

      expect(azim).toBeDefined()
      expect(azim?.amount).toBe(80.0)
    })

    it('2.5. Kurucu SaaS Araçları: OpenAI, Gamma, Google Workspace, Meta Ads İş grubuna atanmalı', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const openai = txs.find((t) => t.merchant.includes('ChatGPT'))
      const gamma = txs.find((t) => t.merchant.includes('Gamma'))
      const gsuite = txs.find((t) => t.merchant.includes('Google Workspace'))
      const meta = txs.find((t) => t.merchant.includes('Meta'))

      expect(openai?.analysis_group).toBe('İş')
      expect(gamma?.analysis_group).toBe('İş')
      expect(gsuite?.analysis_group).toBe('İş')
      expect(meta?.analysis_group).toBe('İş')
    })

    it('2.6. Faiz ve Masraflar: Alışveriş faizi, BSMV, KKDF Finansman grubuna atanmalı', () => {
      const txs = parseStatementLines(realEnparaOcrText)
      const faiz = txs.find((t) => t.raw_description.includes('Alışveriş faizi'))
      expect(faiz?.analysis_group).toBe('Finansman')
      expect(faiz?.type).toBe('Finansman/Masraf')
    })
  })
})
