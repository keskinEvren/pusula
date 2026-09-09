export interface CatalogAsset {
  name: string
  symbol: string
  category: 'Hisse Senedi (BIST)' | 'Emtia & Altın' | 'Yatırım Fonu (TEFAS)' | 'Döviz' | 'Kripto Para' | 'BES / Emeklilik' | 'Diğer'
  defaultInstitution?: string
}

export const ASSET_CATALOG: CatalogAsset[] = [
  // --- Emtia & Altın ---
  { name: 'Gram Altın', symbol: 'GRAM_ALTIN', category: 'Emtia & Altın', defaultInstitution: 'Fiziki / Banka' },
  { name: 'Çeyrek Altın', symbol: 'CEYREK_ALTIN', category: 'Emtia & Altın', defaultInstitution: 'Fiziki Kasa' },
  { name: 'Yarım Altın', symbol: 'YARIM_ALTIN', category: 'Emtia & Altın', defaultInstitution: 'Fiziki Kasa' },
  { name: 'Tam Altın', symbol: 'TAM_ALTIN', category: 'Emtia & Altın', defaultInstitution: 'Fiziki Kasa' },
  { name: 'Cumhuriyet Altını (Ata)', symbol: 'CUMHURIYET_ALTIN', category: 'Emtia & Altın', defaultInstitution: 'Fiziki Kasa' },
  { name: 'Ons Altın (USD)', symbol: 'ONS_GOLD_USD', category: 'Emtia & Altın', defaultInstitution: 'Yatırım Hesabı' },
  { name: 'Gram Gümüş', symbol: 'GRAM_GUMUS', category: 'Emtia & Altın', defaultInstitution: 'Banka / Kasa' },

  // --- Döviz ---
  { name: 'Amerikan Doları', symbol: 'USD', category: 'Döviz', defaultInstitution: 'Döviz Hesabı' },
  { name: 'Euro', symbol: 'EUR', category: 'Döviz', defaultInstitution: 'Döviz Hesabı' },
  { name: 'İngiliz Sterlini', symbol: 'GBP', category: 'Döviz', defaultInstitution: 'Döviz Hesabı' },
  { name: 'İsviçre Frangı', symbol: 'CHF', category: 'Döviz', defaultInstitution: 'Döviz Hesabı' },

  // --- Hisse Senedi (BIST - Popüler & BIST 30) ---
  { name: 'Türk Hava Yolları', symbol: 'THYAO', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Aselsan', symbol: 'ASELS', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Ereğli Demir Çelik', symbol: 'EREGL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Tüpraş', symbol: 'TUPRS', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Koç Holding', symbol: 'KCHOL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Sabancı Holding', symbol: 'SAHOL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'BİM Birleşik Mağazalar', symbol: 'BIMAS', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Şişecam', symbol: 'SISE', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Ford Otosan', symbol: 'FROTO', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Tofaş Türk Otomobil Fabrikası', symbol: 'TOASO', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Garanti BBVA', symbol: 'GARAN', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Garanti Yatırım' },
  { name: 'Akbank', symbol: 'AKBNK', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Ak Yatırım' },
  { name: 'İş Bankası (C)', symbol: 'ISCTR', category: 'Hisse Senedi (BIST)', defaultInstitution: 'İş Yatırım' },
  { name: 'Yapı ve Kredi Bankası', symbol: 'YKBNK', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Yapı Kredi Yatırım' },
  { name: 'Enka İnşaat', symbol: 'ENKAI', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Petkim', symbol: 'PETKM', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Turkcell', symbol: 'TCELL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Türk Telekom', symbol: 'TTKOM', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Pegasus Hava Taşımacılığı', symbol: 'PGSUS', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Migros Ticaret', symbol: 'MGROS', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Coca-Cola İçecek', symbol: 'CCOLA', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Şok Marketler', symbol: 'SOKM', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Arçelik', symbol: 'ARCLK', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Vestel Elektronik', symbol: 'VESTL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Astor Enerji', symbol: 'ASTOR', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Kontrolmatik Teknoloji', symbol: 'KONTR', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Alarko Holding', symbol: 'ALARK', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Emlak Konut GYO', symbol: 'EKGYO', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Oyak Çimento', symbol: 'OYAKC', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Koza Altın İşletmeleri', symbol: 'KOZAL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Tav Havalimanları Holding', symbol: 'TAVHL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Mavi Giyim', symbol: 'MAVI', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Enerjisa Enerji', symbol: 'ENJSA', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Doğan Holding', symbol: 'DOHOL', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },
  { name: 'Girişim Elektrik', symbol: 'GESAN', category: 'Hisse Senedi (BIST)', defaultInstitution: 'Midas' },

  // --- Yatırım Fonu (TEFAS Popüler) ---
  { name: 'İş Portföy Para Piyasası Fonu', symbol: 'TI2', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'İş Bankası' },
  { name: 'Marmara Capital Hisse Senedi Fonu', symbol: 'MAC', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'TEFAS' },
  { name: 'Ak Portföy Yeni Teknolojiler Yabancı Hisse Fonu', symbol: 'AFT', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'Akbank' },
  { name: 'Yapı Kredi Portföy Yabancı Teknoloji Fonu', symbol: 'YAY', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'Yapı Kredi' },
  { name: 'İş Portföy BIST Teknoloji Ağırlıklı Fon', symbol: 'TTE', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'İş Bankası' },
  { name: 'Bosphorus Para Piyasası Fonu', symbol: 'BUY', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'TEFAS' },
  { name: 'İstanbul Portföy Üçüncü Hisse Senedi Fonu', symbol: 'IIH', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'TEFAS' },
  { name: 'Tacirler Portföy Değişken Fon', symbol: 'TCD', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'TEFAS' },
  { name: 'Garanti Portföy Altın Fonu', symbol: 'GTA', category: 'Yatırım Fonu (TEFAS)', defaultInstitution: 'Garanti BBVA' },

  // --- Kripto Para ---
  { name: 'Bitcoin', symbol: 'BTC', category: 'Kripto Para', defaultInstitution: 'Binance' },
  { name: 'Ethereum', symbol: 'ETH', category: 'Kripto Para', defaultInstitution: 'Binance' },
  { name: 'Tether (USDT)', symbol: 'USDT', category: 'Kripto Para', defaultInstitution: 'Binance' },
  { name: 'Solana', symbol: 'SOL', category: 'Kripto Para', defaultInstitution: 'Binance' },
  { name: 'Ripple', symbol: 'XRP', category: 'Kripto Para', defaultInstitution: 'Binance' },
  { name: 'Avalanche', symbol: 'AVAX', category: 'Kripto Para', defaultInstitution: 'Binance' },
]

/**
 * Searches the asset catalog with Turkish character normalization
 */
export function searchAssetCatalog(
  query: string,
  categoryFilter?: string,
  maxResults = 7
): CatalogAsset[] {
  const q = query.trim().toLocaleLowerCase('tr-TR')
  if (!q) return []

  return ASSET_CATALOG.filter((item) => {
    if (categoryFilter && categoryFilter !== 'Tümü' && item.category !== categoryFilter) {
      return false
    }

    const nameMatch = item.name.toLocaleLowerCase('tr-TR').includes(q)
    const symbolMatch = item.symbol.toLocaleLowerCase('tr-TR').includes(q)
    return nameMatch || symbolMatch
  }).slice(0, maxResults)
}
