import { NextResponse } from 'next/server'

interface PriceResult {
  symbol: string
  price: number
  currency: string
  name?: string
  lastUpdated: string
}

// In-memory cache for market rates (60 seconds TTL)
let cache: {
  timestamp: number
  rates: Record<string, number>
} = {
  timestamp: 0,
  rates: {},
}

const CACHE_TTL_MS = 60 * 1000 // 1 minute

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
  }
  return res.json()
}

// Fetch base Gold & FX rates
async function getBaseMarketRates(): Promise<Record<string, number>> {
  const now = Date.now()
  if (now - cache.timestamp < CACHE_TTL_MS && Object.keys(cache.rates).length > 0) {
    return cache.rates
  }

  const rates: Record<string, number> = {}

  try {
    const [goldData, usdData, eurData] = await Promise.allSettled([
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d'),
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=1d'),
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/EURTRY=X?interval=1d&range=1d'),
    ])

    let goldOz = 2700
    let usdTry = 34.5
    let eurTry = 37.5

    if (goldData.status === 'fulfilled') {
      const p = goldData.value.chart?.result?.[0]?.meta?.regularMarketPrice
      if (p) goldOz = p
    }
    if (usdData.status === 'fulfilled') {
      const p = usdData.value.chart?.result?.[0]?.meta?.regularMarketPrice
      if (p) usdTry = p
    }
    if (eurData.status === 'fulfilled') {
      const p = eurData.value.chart?.result?.[0]?.meta?.regularMarketPrice
      if (p) eurTry = p
    }

    rates['USD'] = Math.round(usdTry * 100) / 100
    rates['EUR'] = Math.round(eurTry * 100) / 100
    rates['ONS_GOLD_USD'] = Math.round(goldOz * 100) / 100

    // Gold calculations
    const gramAltin = (goldOz / 31.1034768) * usdTry
    rates['GRAM_ALTIN'] = Math.round(gramAltin * 100) / 100
    rates['CEYREK_ALTIN'] = Math.round(gramAltin * 1.635 * 100) / 100
    rates['YARIM_ALTIN'] = Math.round(gramAltin * 3.27 * 100) / 100
    rates['TAM_ALTIN'] = Math.round(gramAltin * 6.54 * 100) / 100
    rates['CUMHURIYET_ALTIN'] = Math.round(gramAltin * 6.6 * 100) / 100

    cache = {
      timestamp: now,
      rates,
    }
  } catch (err) {
    console.error('Error fetching base market rates:', err)
  }

  return rates
}

// Fetch single BIST stock price
async function getBistPrice(symbol: string): Promise<number | null> {
  const cleanSymbol = symbol.trim().toUpperCase()
  const yahooSymbol = cleanSymbol.endsWith('.IS') ? cleanSymbol : `${cleanSymbol}.IS`

  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`
    )
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice
    return price ? Math.round(price * 100) / 100 : null
  } catch {
    return null
  }
}

// Fetch Crypto prices via CoinGecko
async function getCryptoPrice(symbol: string): Promise<number | null> {
  const clean = symbol.trim().toUpperCase()
  const mapping: Record<string, string> = {
    BTC: 'bitcoin',
    BITCOIN: 'bitcoin',
    ETH: 'ethereum',
    ETHEREUM: 'ethereum',
    SOL: 'solana',
    SOLANA: 'solana',
    USDT: 'tether',
    TETHER: 'tether',
    AVAX: 'avalanche-2',
    XRP: 'ripple',
  }

  const coinId = mapping[clean]
  if (!coinId) return null

  try {
    const data = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=try`
    )
    const price = data[coinId]?.try
    return price ? Math.round(price * 100) / 100 : null
  } catch {
    return null
  }
}

// Resolve price for an asset based on category & symbol
async function resolveAssetPrice(
  symbol: string,
  category: string,
  baseRates: Record<string, number>
): Promise<{ price: number; currency: string } | null> {
  const sym = symbol.trim().toUpperCase()
  const cat = category.trim()

  // 1. Emtia & Altın
  if (cat.includes('Altın') || cat.includes('Emtia') || sym.includes('ALTIN')) {
    if (sym.includes('CEYREK') || sym.includes('ÇEYREK')) {
      return { price: baseRates['CEYREK_ALTIN'] || 0, currency: 'TRY' }
    }
    if (sym.includes('YARIM')) {
      return { price: baseRates['YARIM_ALTIN'] || 0, currency: 'TRY' }
    }
    if (sym.includes('TAM')) {
      return { price: baseRates['TAM_ALTIN'] || 0, currency: 'TRY' }
    }
    if (sym.includes('CUMHURIYET')) {
      return { price: baseRates['CUMHURIYET_ALTIN'] || 0, currency: 'TRY' }
    }
    // Default Gold is Gram Altın
    return { price: baseRates['GRAM_ALTIN'] || 0, currency: 'TRY' }
  }

  // 2. Döviz
  if (cat.includes('Döviz') || sym === 'USD' || sym === 'EUR' || sym === 'DOLAR' || sym === 'EURO') {
    if (sym === 'EUR' || sym === 'EURO') {
      return { price: baseRates['EUR'] || 0, currency: 'TRY' }
    }
    return { price: baseRates['USD'] || 0, currency: 'TRY' }
  }

  // 3. Kripto Para
  if (cat.includes('Kripto') || ['BTC', 'ETH', 'SOL', 'USDT', 'AVAX', 'XRP'].includes(sym)) {
    const cryptoPrice = await getCryptoPrice(sym)
    if (cryptoPrice !== null) {
      return { price: cryptoPrice, currency: 'TRY' }
    }
  }

  // 4. Hisse Senedi (BIST)
  if (cat.includes('Hisse') || cat.includes('BIST')) {
    const bistPrice = await getBistPrice(sym)
    if (bistPrice !== null) {
      return { price: bistPrice, currency: 'TRY' }
    }
  }

  return null
}

// GET /api/market-prices?symbol=THYAO&category=Hisse%20Senedi
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const category = searchParams.get('category') || ''

  const baseRates = await getBaseMarketRates()

  if (!symbol) {
    // Return all base rates
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      baseRates,
    })
  }

  const result = await resolveAssetPrice(symbol, category, baseRates)

  if (!result) {
    return NextResponse.json(
      { success: false, message: `Could not resolve price for ${symbol}` },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    symbol: symbol.toUpperCase(),
    price: result.price,
    currency: result.currency,
    timestamp: new Date().toISOString(),
  })
}

// POST /api/market-prices — Bulk price resolution
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const items: Array<{ id?: string; symbol?: string; name?: string; category?: string }> =
      body.items || []

    const baseRates = await getBaseMarketRates()
    const results: Record<string, PriceResult> = {}

    // Process items in parallel batches
    await Promise.all(
      items.map(async (item) => {
        const key = item.id || item.symbol || item.name || 'unknown'
        const symbolToLookup = item.symbol || item.name || ''
        const category = item.category || ''

        const resolved = await resolveAssetPrice(symbolToLookup, category, baseRates)
        if (resolved && resolved.price > 0) {
          results[key] = {
            symbol: symbolToLookup.toUpperCase(),
            price: resolved.price,
            currency: resolved.currency,
            lastUpdated: new Date().toISOString(),
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      baseRates,
      results,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Error processing batch prices' },
      { status: 500 }
    )
  }
}
