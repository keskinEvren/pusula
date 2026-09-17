import type { MerchantMapping } from '@/types/database'

// Built-in common Turkish merchant normalization dictionary
const DEFAULT_PATTERNS: Array<{
  pattern: RegExp
  name: string
  group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
  type?: string
  recurrence?: string
}> = [
  // Payments / Transfers (Hariç - Excluded from spending)
  { pattern: /ÖDEME\s*-\s*ENPARA|ODEME\s*-\s*ENPARA/i, name: 'Kart Ödemesi (Enpara)', group: 'Hariç', type: 'Kart Ödemesi' },

  // Investments / Brokerages / Precious Metals / Crypto (Hariç - Capital / Asset Transfer)
  { pattern: /MİDAS\s*MENKUL|MIDAS\s*MENKUL|\bMİDAS\b|\bMIDAS\b/i, name: 'Midas Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /ZİRAAT\s*YATIRIM|ZIRAAT\s*YATIRIM/i, name: 'Ziraat Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /GARANTİ\s*YATIRIM|GARANTI\s*YATIRIM/i, name: 'Garanti Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /İŞ\s*YATIRIM|IS\s*YATIRIM/i, name: 'İş Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /YAPI\s*KREDİ\s*YATIRIM|YAPI\s*KREDI\s*YATIRIM/i, name: 'Yapı Kredi Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /VAKIF\s*YATIRIM/i, name: 'Vakıf Yatırım', group: 'Hariç', type: 'Transfer' },
  { pattern: /QNB\s*FİNANSINVEST|QNB\s*FINANSINVEST|FİNANS\s*YATIRIM|FINANS\s*YATIRIM/i, name: 'QNB Finansinvest', group: 'Hariç', type: 'Transfer' },
  { pattern: /BİNANCE|BINANCE/i, name: 'Binance', group: 'Hariç', type: 'Transfer' },
  { pattern: /BTCTURK|BTC\s*TÜRK|BTC\s*TURK/i, name: 'BtcTurk', group: 'Hariç', type: 'Transfer' },
  { pattern: /PARİBU|PARIBU/i, name: 'Paribu', group: 'Hariç', type: 'Transfer' },
  { pattern: /ALTIN\s*ALIŞ|ALTIN\s*ALIS|KIYMETLİ\s*MADEN|KIYMETLI\s*MADEN/i, name: 'Altın / Kıymetli Maden Alımı', group: 'Hariç', type: 'Transfer' },
  { pattern: /FON\s*ALIŞ|FON\s*ALIS|TEFAS|YATIRIM\s*FONU/i, name: 'Yatırım Fonu Alımı', group: 'Hariç', type: 'Transfer' },
  { pattern: /DÖVİZ\s*ALIŞ|DOVIZ\s*ALIS/i, name: 'Döviz Alımı', group: 'Hariç', type: 'Transfer' },

  // Supermarkets / Groceries
  { pattern: /BİM\b|BIM\b|\bB\s+M\b/i, name: 'BİM', group: 'Kişisel' },
  { pattern: /A101\b/i, name: 'A101', group: 'Kişisel' },
  { pattern: /ŞOK\b|SOK\b|\b12037\b/i, name: 'ŞOK', group: 'Kişisel' },
  { pattern: /HAKMAR/i, name: 'Hakmar Market', group: 'Kişisel' },
  { pattern: /MIGROS|MİGROS/i, name: 'Migros', group: 'Kişisel' },
  { pattern: /FILE|FİLE/i, name: 'File Market', group: 'Kişisel' },
  { pattern: /CARREFOUR/i, name: 'CarrefourSA', group: 'Kişisel' },

  // Tech / Software / Founder Tools (Default to 'İş' / Business)
  { pattern: /CURSOR/i, name: 'Cursor Pro', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /OPENAI|CHATGPT/i, name: 'ChatGPT Plus (OpenAI)', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /GAMMA\.APP/i, name: 'Gamma App', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /FACEBK|FACEBOOK/i, name: 'Meta / Facebook Ads', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /GOOGLE.*WORKSPACE/i, name: 'Google Workspace', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /GOOGLE.*WHATSAPP/i, name: 'WhatsApp Business', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /CANVA/i, name: 'Canva', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /YENGEC\.CO|YENGEÇ\.CO/i, name: 'Yengeç.co Entegrasyon', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /HOSTINGER/i, name: 'Hostinger', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /AWS|AMAZON WEB/i, name: 'AWS Cloud', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /VERCEL/i, name: 'Vercel', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /SUPABASE/i, name: 'Supabase', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /GITHUB/i, name: 'GitHub', group: 'İş', recurrence: 'Düzenli' },
  { pattern: /CLAUDE|ANTHROPIC/i, name: 'Anthropic Claude', group: 'İş', recurrence: 'Düzenli' },

  // Subscriptions & Entertainment
  { pattern: /FRINK/i, name: 'Frink Kahve', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /SPOTIFY/i, name: 'Spotify', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /NETFLIX/i, name: 'Netflix', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /YOUTUBE/i, name: 'YouTube Premium', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /APPLE\.COM/i, name: 'Apple', group: 'Kişisel' },
  { pattern: /AMAZON.*PRIME/i, name: 'Amazon Prime', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /AMAZON/i, name: 'Amazon', group: 'Kişisel' },

  // Food & Cafe
  { pattern: /GETIR|GETİR/i, name: 'Getir', group: 'Kişisel' },
  { pattern: /YEMEKSEPETI|YEMEKSEPETİ/i, name: 'Yemeksepeti', group: 'Kişisel' },
  { pattern: /TRENDYOL/i, name: 'Trendyol', group: 'Kişisel' },
  { pattern: /HEPSIBURADA|HEPSIPAY/i, name: 'Hepsiburada', group: 'Kişisel' },
  { pattern: /CAFE CELON/i, name: 'Cafe Celon', group: 'Kişisel' },
  { pattern: /ALWAYS CAFE/i, name: 'Always Cafe', group: 'Kişisel' },
  { pattern: /WAFFLE YIYELIM|WAFFLE YİYELİM/i, name: 'Waffle Yiyelim', group: 'Kişisel' },
  { pattern: /ALMIRA PASTA/i, name: 'Almira Pasta', group: 'Kişisel' },
  { pattern: /OZ KOSEBASI|ÖZ KÖŞEBAŞI/i, name: 'Öz Köşebaşı', group: 'Kişisel' },
  { pattern: /AZİMOĞLU|AZIMOĞLU|AZ\s*MOLU/i, name: 'Azimoğlu Çiğköfte', group: 'Kişisel' },
  { pattern: /FARKETMEZ RESTORAN/i, name: 'Farketmez Restoran', group: 'Kişisel' },
  { pattern: /HBS RESTORAN/i, name: 'HBS Restoran', group: 'Kişisel' },
  { pattern: /SARIYER BÖREK|SARIYER BOREK/i, name: 'Meşhur Sarıyer Börekçisi', group: 'Kişisel' },

  // Shopping & Retail
  { pattern: /GRATIS/i, name: 'Gratis', group: 'Kişisel' },
  { pattern: /MRDIY|MR\.DIY/i, name: 'MR.DIY', group: 'Kişisel' },
  { pattern: /AVRUPA ALKOLLÜ|AVRUPA ALKOLL/i, name: 'Avrupa Alkollü İçecekler', group: 'Kişisel' },
  { pattern: /AKARSU GIDA/i, name: 'Akarsu Gıda', group: 'Kişisel' },
  { pattern: /KNC GIDA/i, name: 'KNC Gıda', group: 'Kişisel' },
  { pattern: /MASK FİTNESS|MASK FITNESS/i, name: 'Mask Fitness', group: 'Kişisel' },
  { pattern: /ASKEROĞLU|ASKEROLU/i, name: 'Askeroğlu Turizm', group: 'Kişisel' },
  { pattern: /RIHTIM VE VERASET/i, name: 'Rıhtım ve Veraset V.D.', group: 'Kişisel' },

  // Transport & Telecom
  { pattern: /ISTANBULKART|İSTANBULKART/i, name: 'İstanbulkart', group: 'Kişisel' },
  { pattern: /UBER/i, name: 'Uber', group: 'Kişisel' },
  { pattern: /TURK TELEKOM|TÜRK TELEKOM/i, name: 'Türk Telekom', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /TURKCELL/i, name: 'Turkcell', group: 'Kişisel', recurrence: 'Düzenli' },
  { pattern: /VODAFONE/i, name: 'Vodafone', group: 'Kişisel', recurrence: 'Düzenli' },

  // Financing / Interest / Banking Fees
  { pattern: /FAİZ|FAIZ|BSMV|KKDF|GECİKME|GECIKME|AKDİ|AKDI/i, name: 'Banka Faiz / Masraf', group: 'Finansman', type: 'Finansman/Masraf' },
]

export function matchMerchant(
  rawDescription: string,
  userMappings: MerchantMapping[] = []
): { merchant: string; analysis_group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'; type?: string; recurrence?: string; project_id?: string } {
  const upperRaw = rawDescription.toUpperCase().trim()

  // 1. Check user custom mappings first (highest priority)
  for (const m of userMappings) {
    if (upperRaw.includes(m.raw_pattern.toUpperCase())) {
      return {
        merchant: m.merchant_name,
        analysis_group: m.default_group,
        type: m.default_group === 'Hariç' ? 'Transfer' : 'Harcama',
        project_id: m.default_project_id || undefined,
      }
    }
  }

  // 2. Check built-in patterns
  for (const p of DEFAULT_PATTERNS) {
    if (p.pattern.test(rawDescription)) {
      return {
        merchant: p.name,
        analysis_group: p.group,
        type: p.type || (p.group === 'Hariç' ? 'Transfer' : 'Harcama'),
        recurrence: p.recurrence,
      }
    }
  }

  // 3. Fallback: clean raw description into a readable merchant name
  const cleaned = rawDescription
    .replace(/^IYZICO\/(?:DL\s+)?/i, '')
    .replace(/^PARAM\//i, '')
    .replace(/^PAYTR\//i, '')
    .replace(/^ÖDEAL\/\/|Ödeal\/\/|DEAL\/\//i, '')
    .replace(/\s+TR\b/i, '')
    .replace(/\s+ISTANBUL\b|\s+İSTANBUL\b/i, '')
    .replace(/\(\d+\/\d+\)/g, '')
    .replace(/\(.*?\)/g, '')
    .trim()

  return {
    merchant: cleaned || rawDescription,
    analysis_group: 'Kişisel',
  }
}
