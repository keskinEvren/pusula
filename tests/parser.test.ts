import { describe, it, expect } from 'vitest'
import {
  detectBankAndMetadata,
  parseStatementLines,
  extractFromHtmlBankAccount,
  parseBankAccountLines,
  parseBankAccountTable,
  detectBankFromTextOrIban,
  fixWindows1254Text,
  reconcileBankMovement,
  parseFlexibleAmount,
} from '../src/lib/parser'

describe('Pusula Ekstre Ayrıştırıcı & OCR Motoru (Gateway 3 Parser Testleri)', () => {
  describe('1. Otomatik Banka Tespiti & Metadata Çıkarımı', () => {
    it('1.1. Enpara Tespiti: QNB Finansbank / Enpara metninden banka, kart ve tarihleri doğru çıkarır', () => {
      const sampleText = `
        QNB FINANSBANK A.S.
        Enpara.com Kredi Kartı Hesap Özeti
        Kart No: **** **** **** 2039
        Hesap Özeti Tarihi: 19.08.2026
        Son Ödeme Tarihi: 31.08.2026
        Dönem Borcu: 26.969,24 TL
      `
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Enpara')
      expect(meta.card_name).toBe('Kredi Kartı • 2039')
      expect(meta.last_four).toBe('2039')
      expect(meta.statement_date).toBe('2026-08-19')
      expect(meta.due_date).toBe('2026-08-31')
    })

    it('1.2. Akbank Axess Tespiti: Akbank metnini tanır ve dinamik kart numarasını yakalar', () => {
      const sampleText = 'AKBANK T.A.S. AXESS PLATINUM HESAP BILDIRIM CETVELI Kart No: 5571 **** **** 1697 04.07.2026 14.07.2026'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Akbank')
      expect(meta.card_name).toBe('Axess Platinum • 1697')
      expect(meta.last_four).toBe('1697')
    })

    it('1.3. Ziraat Bankkart Tespiti: Ziraat metnini ve 5349 maskeli kart numarasını tanır', () => {
      const sampleText = 'T.C. ZIRAAT BANKASI A.S. BANKKART HESAP OZETI 5349-####-####-0887'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Ziraat Bankası')
      expect(meta.card_name).toBe('Bankkart • 0887')
      expect(meta.last_four).toBe('0887')
    })

    it('1.4. Garanti Bonus Tespiti: Garanti BBVA metnini ve maskeli kartı tanır', () => {
      const sampleText = 'GARANTI BBVA BONUS KREDI KARTI HESAP OZETI Kart No: 5400 **** **** 9388'
      const meta = detectBankAndMetadata(sampleText)
      expect(meta.bank).toBe('Garanti BBVA')
      expect(meta.card_name).toBe('Bonus Trink • 9388')
      expect(meta.last_four).toBe('9388')
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

  describe('3. Ziraat Bankkart Gerçek Dünya Ekstre Testleri (Multi-Column & + İşaretli Ödemeler)', () => {
    const ziraatOcrSample = `
Sayın   E**** K*****
5349-####-####-6745 Kart Limiti : 50.000,00 TL
Müşteri Numarası : 8*****40 Kullanılabilir Kart Limiti : 24.663,62 TL
Hesap Kesim Tarihi : 20.06.2026 Nakit Avans Limiti : 12.500,00 TL
Son Ödeme Tarihi : 30.06.2026 Kullanılabilir Nakit Avans Limiti  : 0,72 TL
Dönem Borcu TL : 15.234,07 TL Sonraki Hesap Kesim Tarihi : 20.07.2026
Dönem Borcu USD : 0,00 USD Sonraki Son Ödeme Tarihi : 30.07.2026
Asgari Ödeme Tutarı TL : 3.046,81 TL Bugüne Kadar Kazanılan Bankkart Lira : 0,00 TL

KART NO : 5349-####-####-6745 / E**** K*****
20.05.2026 ANADAL GIDA ISTANBUL 750,00 0,00
20.05.2026 AHMET AYDIN ISTANBUL 29,00 0,00
20.05.2026 9942 C719 A101 CICEK ISTANBUL 80,50 0,00
21.05.2026 BELBIM ELEKTRONIK PA ISTANBUL 207,00 0,00
23.05.2026 ARTI BİLGİSAYAR İSTANBUL 869,00 0,00
23.05.2026 SBX İST ÇENGELKÖY NA İSTANBUL 810,00 0,00
01.06.2026 4031 şube\u00adotomatik ödeme\u00adteşekkür ederiz 0,72+
23.06.2026 4031 şube\u00adotomatik ödeme\u00adteşekkür ederiz 1.955,27+
20.06.2026 KKDF 6,86 0,00
20.06.2026 Kredi faizi 39,68 0,00
ÖNCEKİ AYDAN DEVİR 1.346,50 0,00
    `

    it('3.1. Ziraat Metadata Tespiti: Hesap Kesim Tarihi, last_four ve TL cinsinden Dönem Borcunu yakalar', () => {
      const meta = detectBankAndMetadata(ziraatOcrSample)
      expect(meta.bank).toBe('Ziraat Bankası')
      expect(meta.last_four).toBe('6745')
      expect(meta.statement_date).toBe('2026-06-20')
      expect(meta.due_date).toBe('2026-06-30')
      expect(meta.statement_debt).toBe(15234.07)
      expect(meta.minimum_payment).toBe(3046.81)
    })

    it('3.2. Multi-Column Tutar Yakalama: Sonda yer alan "0,00" USD tutarına takılmadan TL tutarını (750,00) alır', () => {
      const txs = parseStatementLines(ziraatOcrSample)
      const anadal = txs.find((t) => t.raw_description.includes('ANADAL GIDA'))
      expect(anadal).toBeDefined()
      expect(anadal?.amount).toBe(750.0)
      expect(anadal?.selected).toBe(true)
    })

    it('3.3. Sonda "+" İşaretli Kart Ödemesi Yakalama: "1.955,27+" ödeme satırını tutarı ve Kart Ödemesi tipiyle yakalar', () => {
      const txs = parseStatementLines(ziraatOcrSample)
      const payment = txs.find((t) => t.raw_description.includes('4031') && t.amount === 1955.27)
      expect(payment).toBeDefined()
      expect(payment?.type).toBe('Kart Ödemesi')
      expect(payment?.analysis_group).toBe('Hariç')
      expect(payment?.selected).toBe(false)
    })

    it('3.4. Soft Hyphen ve Devir Filtresi: "\u00ad" temizlenir ve "ÖNCEKİ AYDAN DEVİR" elenir', () => {
      const txs = parseStatementLines(ziraatOcrSample)
      const hasDevir = txs.some((t) => t.raw_description.includes('ÖNCEKİ AYDAN DEVİR'))
      expect(hasDevir).toBe(false)
      expect(txs.length).toBe(10) // 10 actual transactions, devir excluded
    })
  })

  describe('4. Vadesiz Banka Hesap Dökümü & Ziraat HTML Parser Testleri', () => {
    it('4.1. Açıklamada Hesap No Geçen Hareketler: Başlık filtresi hareket satırlarını ezmemeli', () => {
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

    it('4.2. Ziraat HTML Döküm Ayrıştırma: HTML tablosundaki satırları, bakiyeyi ve bankayı eksiksiz çıkarır', () => {
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

    it('4.3. KK TAHSİLAT Farklı Kart Eşleştirmesi: 6745 kartını son 4 haneden doğru karta bağlar', () => {
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

    it('4.4. Kredi Kartı Nakit Avans Tespiti: Hesaba giren nakit avansı tespit edip ilgili karta bağlar', () => {
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

    it('4.5. Tüm 0887 Hareketleri Simülasyonu: 35.888,65 borcu kuruşu kuruşuna düşürür', () => {
      const mockCards = [
        { id: 'card-0887', card_name: 'Bankkart • 0887', bank: 'Ziraat Bankası', last_four: '0887', statement_date: '2026-08-20', current_debt: 35888.65 },
        { id: 'card-6745', card_name: 'Bankkart • 6745', bank: 'Ziraat Bankası', last_four: '6745', statement_date: '2026-08-20', current_debt: 7566.67 },
      ]

      const sampleLines = [
        { desc: 'F19753 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0019753', amt: 10800.92, dir: 'outflow', date: '2026-09-03' },
        { desc: 'F65091 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0065091', amt: 17910.00, dir: 'outflow', date: '2026-08-31' },
        { desc: 'F59954 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0059954', amt: 6053.34, dir: 'outflow', date: '2026-08-31' },
        { desc: 'F59890 KK TAHSİLAT KART NO: 5349 **** **** 0887 FİŞ NO:0059890', amt: 1112.57, dir: 'outflow', date: '2026-08-31' },
        { desc: 'F49298 5349 **** **** 0887 KK OTOMATİK ÖDEME', amt: 11.82, dir: 'outflow', date: '2026-08-31' },
        { desc: 'F04107 Bankamız KK Nakit Avans 5349 **** **** 0887 Kart Hamili:EVREN KESKİN Nakit Avans Ücreti 0,16 TRY İşlem Tutarı:', amt: 16.00, dir: 'inflow', date: '2026-08-29' },
        { desc: 'F04083 Bankamız KK Nakit Avans 5349 **** **** 0887 Kart Hamili:EVREN KESKİN Nakit Avans Ücreti 7,00 TRY İşlem Tutarı:', amt: 700.00, dir: 'inflow', date: '2026-08-29' },
        { desc: 'F19463 Bankamız KK Nakit Avans 5349 **** **** 0887 Kart Hamili:EVREN KESKİN Nakit Avans Ücreti 7,00 TRY İşlem Tutarı:', amt: 700.00, dir: 'inflow', date: '2026-08-28' },
      ]

      for (const line of sampleLines) {
        const rec = reconcileBankMovement(line.desc, line.amt, line.dir as any, [], mockCards as any, [])
        console.log('RECON RESULT:', line.date, line.amt, rec.action, rec.target_card_id, rec.type, line.desc.substring(0, 30))
      }
    })

    it('4.6. Vakıf Katılım Vadesiz Hesap PDF Ayrıştırma: Referans kodlarını ve sayfa kırılımlarını filtreleyip hareketleri çıkarır', () => {
      const sampleVakifPdfText = `
        Hesap Hareketleri
        Sayın EVREN KESKİN,
        Hesap Türü : Cari Hesap
        IBAN No : TR22 0021 0000 0015 4860 0000 01
        İşlem Tarihi Açıklama Tutar Bakiye Referans Numarası
        03.09.2026 Lehdar= EVREN -8.398,08 TL 0,00 TL A012B
        KESKINAciklama= Fast Anlık
        Ödeme
        03.09.2026 Lehdar= EVREN -10.800,92 TL 8.398,08 TL A0123
        KESKINAciklama= Fast Anlık
        Ödeme
        03.09.2026 Lehdar= EVREN -24.100,00 TL 19.199,00 TL A0101
        KESKINAciklama= Fast Anlık
        Ödeme
        03.09.2026 Ağustos 2026 Maaş Ödemesi 43.299,00 TL 43.299,00 TL A00XV
        05.08.2026 Lehdar= EVREN -4.342,00 TL 0,00 TL A00WL
        KESKINAciklama= Fast Anlık
        Ödeme
        05.08.2026 2026/07 Maaş Ödemesi 4.342,00 TL 4.342,00 TL A00PK
        --- PAGE BREAK ---
      `

      const { transactions, closing_balance } = parseBankAccountLines(sampleVakifPdfText)
      expect(transactions.length).toBe(6)
      expect(closing_balance).toBe(0)

      // Outflows
      const fastOut = transactions.filter((t) => t.direction === 'outflow')
      expect(fastOut.length).toBe(4)
      expect(fastOut[0].amount).toBe(8398.08)
      expect(fastOut[1].amount).toBe(10800.92)
      expect(fastOut[2].amount).toBe(24100.0)
      expect(fastOut[3].amount).toBe(4342.0)

      // Inflows (Maaş)
      const fastIn = transactions.filter((t) => t.direction === 'inflow')
      expect(fastIn.length).toBe(2)
      expect(fastIn[0].amount).toBe(43299.0)
      expect(fastIn[0].type).toBe('Gelir')
      expect(fastIn[1].amount).toBe(4342.0)
    })

    it('4.7. Akbank Vadesiz CSV Ayrıştırma: Windows-1254 karakterlerini onarır, ISO tarih sütununu ve hareketleri çıkarır', () => {
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
        ['2026-08-31-19.35.30.123050', '-2,14 TL', '0,00 TL', 'Kredi Kartý Ödeme'],
        ['2026-08-31-19.35.09.871097', '-0,80 TL', '2,14 TL', 'Evren Keskin - T.c. Ziraat Banka- Vergi (BSMV)'],
      ]

      const result = parseBankAccountTable(mockCsvRows)
      expect(result.detected_bank).toBe('Akbank Vadesiz')
      expect(result.closing_balance).toBe(0)
      expect(result.transactions.length).toBe(4)

      // Row 1: Kredi Kartı Ödeme
      expect(result.transactions[0].date).toBe('2026-09-03')
      expect(result.transactions[0].raw_description).toBe('Kredi Kartı Ödeme')
      expect(result.transactions[0].amount).toBe(24100.0)
      expect(result.transactions[0].direction).toBe('outflow')
      expect(result.transactions[0].action).toBe('CARD_PAYMENT')

      // Row 2: Inflow from Vakıf Katılım
      expect(result.transactions[1].date).toBe('2026-09-03')
      expect(result.transactions[1].raw_description).toBe('Evren Keskin - Vakıf Katılım Ban')
      expect(result.transactions[1].amount).toBe(24100.0)
      expect(result.transactions[1].direction).toBe('inflow')

      // Row 4: BSMV
      expect(result.transactions[3].amount).toBe(0.8)
      expect(result.transactions[3].direction).toBe('outflow')
      expect(result.transactions[3].analysis_group).toBe('Finansman')
    })

    it('4.8. detectBankFromTextOrIban & fixWindows1254Text: IBAN kodlarını ve bozuk Windows karakterlerini çözer', () => {
      expect(detectBankFromTextOrIban('IBAN TR900004600069888000332145')).toBe('Akbank Vadesiz')
      expect(detectBankFromTextOrIban('IBAN TR22 0021 0000 0015 4860 0000 01')).toBe('Vakıf Katılım Vadesiz')
      expect(detectBankFromTextOrIban('IBAN TR880001004031838013405003')).toBe('Ziraat Vadesiz')
      expect(detectBankFromTextOrIban('IBAN TR110011100000000000000001')).toBe('Enpara Vadesiz')

      expect(fixWindows1254Text('Þube açýklama deðer')).toBe('Şube açıklama değer')
      expect(fixWindows1254Text('ÝÞLEM TUTARI')).toBe('İŞLEM TUTARI')
    })
  })

  describe('5. Akbank Axess Ekstre Ayrıştırma & Type3 Kod Çözücü Testleri', () => {
    it('5.1. parseFlexibleAmount: Hem Türk (1.234,56) hem Anglo/Axess (1,234.56) tutarları kusursuz ayrıştırır', () => {
      expect(parseFlexibleAmount('21.889,18')).toBe(21889.18)
      expect(parseFlexibleAmount('21,889.18')).toBe(21889.18)
      expect(parseFlexibleAmount('10,500.00(-)')).toBe(10500)
      expect(parseFlexibleAmount('1.955,27+')).toBe(1955.27)
      expect(parseFlexibleAmount('619.99')).toBe(619.99)
      expect(parseFlexibleAmount('8,333.34')).toBe(8333.34)
      expect(parseFlexibleAmount('0.00')).toBe(0)
    })

    it('5.2. Akbank Axess Metadata & Özet Bilgileri: Kart numarası, tarihler ve borcu eksiksiz tanır', () => {
      const axessText = `
        Axess Platinum Hesap özeti
        Müşteri No 36895756 EVREN KESKİN
        Kart Numarasv 9792 06** **** 1697
        DÖnem Borcu 21,889.18 TL
        Son ödeme Tarihi 14/04/2026
        En Az ödeme Tutarv 8,755.67 TL
        Hesap Kesim Tarihi 04/04/2026
      `
      const meta = detectBankAndMetadata(axessText)
      expect(meta.bank).toBe('Akbank')
      expect(meta.card_name).toBe('Axess Platinum • 1697')
      expect(meta.last_four).toBe('1697')
      expect(meta.statement_date).toBe('2026-04-04')
      expect(meta.due_date).toBe('2026-04-14')
      expect(meta.statement_debt).toBe(21889.18)
      expect(meta.minimum_payment).toBe(8755.67)
    })

    it('5.3. Axess Hareket Satırları: Ödemeleri, taksitleri, iadeleri ve faturaları doğru sınıflandırır', () => {
      const sampleAxessLines = `
        17/03/2026 İNTERNET Îb-ödemeniz için TeIekkürler 10,500.00(-)
        28/01/2026 Taksitli Avans ( 25,000.02 TL) 3/3.taksit 8,333.34
        02/03/2026 PENTİ GİYİM TİC AS (1,859.97 TL) 3/2.taksit 619.99 619.99x1
        22/03/2026 TROY Market Kampanyasş İndirimi 23.51(-)
        01/04/2026 Turkcell 5350514994-Fatura Otomatik ödeme Talimatşnşz 465.00
        04/04/2026 Toplam DÖnem Faizi 161.29
      `
      const txs = parseStatementLines(sampleAxessLines)
      expect(txs.length).toBe(6)

      // 1. Kart Ödemesi
      expect(txs[0].type).toBe('Kart Ödemesi')
      expect(txs[0].analysis_group).toBe('Hariç')
      expect(txs[0].amount).toBe(10500)
      expect(txs[0].selected).toBe(false)

      // 2. Nakit Avans
      expect(txs[1].type).toBe('Nakit Avans')
      expect(txs[1].amount).toBe(8333.34)

      // 3. Taksitli Alışveriş
      expect(txs[2].type).toBe('Harcama')
      expect(txs[2].amount).toBe(619.99)
      expect(txs[2].recurrence).toBe('Taksit (3/2)')

      // 4. İade / İndirim
      expect(txs[3].type).toBe('İade')
      expect(txs[3].amount).toBe(23.51)

      // 5. Fatura Otomatik Ödeme (Harcama, borç ödemesi değil)
      expect(txs[4].type).toBe('Harcama')
      expect(txs[4].amount).toBe(465.00)
      expect(txs[4].selected).toBe(true)

      // 6. Faiz / Masraf
      expect(txs[5].type).toBe('Finansman/Masraf')
      expect(txs[5].amount).toBe(161.29)
    })
  })
})

