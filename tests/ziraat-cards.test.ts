import { describe, it, expect } from 'vitest'
import { detectBankAndMetadata, parseStatementLines } from '../src/lib/parser'

describe('Ziraat Çoklu Kart Doğrulaması', () => {
  it('İki farklı Ziraat kartını doğru last_four ve borçlarla ayrıştırır', () => {
    const ziraatText0887 = `
Sayın E**** K*****
5349-####-####-0887 Kart Limiti : 50.000,00 TL
Müşteri Numarası : 8*****40 Kullanılabilir Kart Limiti : 4.982,39 TL
Hesap Kesim Tarihi : 20/08/2026 Nakit Avans Limiti : 12.500,00 TL
Son Ödeme Tarihi : 31/08/2026 Kullanılabilir Nakit Avans Limiti : 4.982,39 TL
Dönem Borcu TL : 35.888,65 TL Sonraki Hesap Kesim Tarihi : 20/09/2026
Dönem Borcu USD : 0,00 USD Sonraki Son Ödeme Tarihi : 30/09/2026
Asgari Ödeme Tutarı TL : 7.177,73 TL Bugüne Kadar Kazanılan Bankkart Lira : 0,00
Asgari Ödeme Tutarı USD : 0,00 USD Toplam Bankkart Lira : 0,00
İşlem Tarihi İşlem Açıklaması TL Tutar USD Tutar Bankkart Lira
ÖNCEKİ AYDAN DEVİR 19.707,22 0,00
KART NO : 5349-####-####-0887 / E**** K*****
20/07/2026 MISO RAMEN ISTANBUL 379,00
21/07/2026 ANOMALY SAN FRANCISCO 245,38
23/07/2026 Sonradan Taksit E/ÖLÇME SEÇME 1. Taksit 1.200,00 TL İşlemin 1/4 Taksidi 300,00
24/07/2026 CURSOR, AI POWERED I SAN FRANCISCO 984,76
26/07/2026 Spotify P44FF2971F Stockholm 49,00
30/07/2026 4031 şube-otomatik ödeme-teşekkür ederiz 15,82+
05/08/2026 4031 şube-hesaptan ödeme-teşekkür ederiz 2.538,17+
05/08/2026 4031 şube-hesaptan ödeme-teşekkür ederiz 1.850,00+
06/08/2026 06/07 IYZICO/amazon.com. 02.Tak İSTANBUL 340,89 TL İşlemin 2/6 Taksidi 56,81
20/08/2026 BSMV (Faiz) 109,89
20/08/2026 KKDF 109,89
20/08/2026 Kredi faizi 256,99
`

const ziraatText6745 = `
Sayın E**** K*****
5349-####-####-6745 Kart Limiti : 50.000,00 TL
Müşteri Numarası : 8*****40 Kullanılabilir Kart Limiti : 4.982,39 TL
Hesap Kesim Tarihi : 20/08/2026 Nakit Avans Limiti : 12.500,00 TL
Son Ödeme Tarihi : 31/08/2026 Kullanılabilir Nakit Avans Limiti : 4.982,39 TL
Dönem Borcu TL : 7.566,67 TL Sonraki Hesap Kesim Tarihi : 20/09/2026
Dönem Borcu USD : 0,00 USD Sonraki Son Ödeme Tarihi : 30/09/2026
Asgari Ödeme Tutarı TL : 1.513,33 TL Bugüne Kadar Kazanılan Bankkart Lira : 0,00
Asgari Ödeme Tutarı USD : 0,00 USD Toplam Bankkart Lira : 0,00
İşlem Tarihi İşlem Açıklaması TL Tutar USD Tutar Bankkart Lira
ÖNCEKİ AYDAN DEVİR 9.019,15 0,00
KART NO : 5349-####-####-6745 / E**** K*****
05/08/2026 4031 şube-hesaptan ödeme-teşekkür ederiz 1.803,83+
20/08/2026 KKDF 40,54
20/08/2026 Kredi faizi 257,46
20/08/2026 Gecikme faizi 12,81
20/08/2026 BSMV (Faiz) 40,54
`

console.log('=== KART 1: 0887 ===')
const m1 = detectBankAndMetadata(ziraatText0887)
    console.log('Meta 1:', m1)
    const tx1 = parseStatementLines(ziraatText0887)
    console.log('Tx count 1:', tx1.length)
    console.log('Payments 1:', tx1.filter(t => t.type === 'Kart Ödemesi').map(t => ({ desc: t.raw_description, amt: t.amount })))

    console.log('\n=== KART 2: 6745 ===')
    const m2 = detectBankAndMetadata(ziraatText6745)
    console.log('Meta 2:', m2)
    const tx2 = parseStatementLines(ziraatText6745)
    console.log('Tx count 2:', tx2.length)
    console.log('Payments 2:', tx2.filter(t => t.type === 'Kart Ödemesi').map(t => ({ desc: t.raw_description, amt: t.amount })))

    expect(m1.last_four).toBe('0887')
    expect(m2.last_four).toBe('6745')
  })
})
