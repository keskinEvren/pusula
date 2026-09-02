/**
 * 🧭 PUSULA — Türkçe PDF Font Glif Onarım Motoru
 * PDF metin çıkartımında kaybolan Türkçe karakterleri (Ö, Ş, İ, Ğ, Ü, Ç) akıllı sözlük ve regex ile onarır.
 */

export function repairTurkishPdfText(text: string): string {
  let cleaned = text

  const replacements: Array<[RegExp, string]> = [
    // Ödeme / Ödemeler
    [/(?:^|\s)(?:_|\s)?deme\s*-\s*/gi, ' Ödeme - '],
    [/(?:^|\s)(?:_|\s)?demeler\b/gi, ' Ödemeler '],
    [/(?:^|\s)(?:_|\s)?deme\b/gi, ' Ödeme '],

    // Şube / Şubesi
    [/\b(?:_|\s)?ube(?:si)?\b/gi, 'Şubesi'],

    // İşlem / İşlemler
    [/(?:^|\s)(?:_|\s)?lem(?:ler)?\b/gi, ' İşlem '],

    // Açıklama
    [/\bA\s*ıklama\b/gi, 'Açıklama'],

    // ŞOK Market
    [/\b(?:OK|ŞOK)\s*(?:-|–)?\s*12037\s*(?:L\s+AL\s+BEY|ŞİŞLİ\s+ALİBEY)?\b/gi, 'ŞOK 12037 ŞİŞLİ ALİBEY'],
    [/\b12037\s+L\s+AL\s+BEY\b/gi, 'ŞOK 12037 ŞİŞLİ ALİBEY'],
    [/\bOK-12037-\s*L\s+AL\s+B\b/gi, 'ŞOK 12037 ŞİŞLİ ALİBEY'],
    [/\bOK\s+(\d{4,6})\b/gi, 'ŞOK $1'],

    // BİM Market
    [/\bB\s+M\s+(V\d+|T\d+|AS-\d+)/gi, 'BİM $1'],
    [/\bB\s+M\b/gi, 'BİM'],

    // Mağazacılık / Hakmar
    [/\bMA\s+AZACILIK\b/gi, 'MAĞAZACILIK'],
    [/\bLTD\.\s+T\b/gi, 'LTD. ŞTİ.'],

    // Ödeal
    [/\bDEAL\/\/(.+)/gi, 'Ödeal // $1'],

    // Azimoğlu Çiğköfte
    [/\bAZ\s+MO\s+LU\s+K\s+FTE\b/gi, 'AZİMOĞLU ÇİĞKÖFTE'],
    [/\bAZ\s*MOLU\s+K\s*FTE/gi, 'AZİMOĞLU ÇİĞKÖFTE'],

    // Alkollü İçecekler
    [/\bALKOLL\s+ECEKLER\b/gi, 'ALKOLLÜ İÇECEKLER'],

    // Meşhur Sarıyer Börekçisi
    [/\bME\s+HUR\s+SARIYER\s+B\s*REKC\s*S\b/gi, 'MEŞHUR SARIYER BÖREKÇİSİ'],
    [/\bME\s*HUR\s+SARIYER\s+B\s*REKC\b/gi, 'MEŞHUR SARIYER BÖREKÇİSİ'],

    // Askeroğlu Turizm
    [/\bASKERO\s*LU\s+TUR\s*ZM\b/gi, 'ASKEROĞLU TURİZM'],

    // Faiz / Ücretler
    [/\bAlı\s+veri\s+faizi\b/gi, 'Alışveriş faizi'],
    [/\bFaiz\s+ve\s+cretlerin\b/gi, 'Faiz ve ücretlerin'],
    [/\bFaizlerin\s+KKDF/gi, 'Faizlerin KKDF'],

    // Mask Fitness
    [/\bMASK\s+F\s*TNESS\s+G\s*VEN\s+EL\s*K\b/gi, 'MASK FİTNESS GÜVENÇELİK'],

    // Lokasyon temizlikleri
    [/\bSK\s+DA\b/gi, 'ÜSKÜDAR'],
    [/\bSTANBUL\b/gi, 'İSTANBUL'],
    [/\bST\b/gi, 'İST'],
  ]

  for (const [pattern, replacement] of replacements) {
    cleaned = cleaned.replace(pattern, replacement)
  }

  return cleaned.replace(/[ \t]+/g, ' ')
}
