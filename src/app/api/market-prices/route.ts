import { NextResponse } from 'next/server'

interface PriceResult {
  symbol: string
  price: number
  currency: string
  name?: string
  lastUpdated: string
  isStale?: boolean
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
const MAX_BATCH_SIZE = 50

async function fetchJson(url: string, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

// Fetch base Gold & FX rates without returning fake fabricated prices
async function getBaseMarketRates(): Promise<{ rates: Record<string, number>; isStale: boolean }> {
  const now = Date.now()
  if (now - cache.timestamp < CACHE_TTL_MS && Object.keys(cache.rates).length > 0) {
    return { rates: cache.rates, isStale: false }
  }

  const rates: Record<string, number> = {}

  try {
    const [goldData, usdData, eurData] = await Promise.allSettled([
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d'),
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=1d'),
      fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/EURTRY=X?interval=1d&range=1d'),
    ])

    let goldOz: number | null = null
    let usdTry: number | null = null
    let eurTry: number | null = null

    if (goldData.status === 'fulfilled') {
      const p = goldData.value?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (typeof p === 'number' && p > 0) goldOz = p
    }
    if (usdData.status === 'fulfilled') {
      const p = usdData.value?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (typeof p === 'number' && p > 0) usdTry = p
    }
    if (eurData.status === 'fulfilled') {
      const p = eurData.value?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (typeof p === 'number' && p > 0) eurTry = p
    }

    if (usdTry) rates['USD'] = Math.round(usdTry * 100) / 100
    if (eurTry) rates['EUR'] = Math.round(eurTry * 100) / 100
    if (goldOz) rates['ONS_GOLD_USD'] = Math.round(goldOz * 100) / 100

    // Gold calculations
    if (goldOz && usdTry) {
      const gramAltin = (goldOz / 31.1034768) * usdTry
      rates['GRAM_ALTIN'] = Math.round(gramAltin * 100) / 100
      rates['CEYREK_ALTIN'] = Math.round(gramAltin * 1.635 * 100) / 100
      rates['YARIM_ALTIN'] = Math.round(gramAltin * 3.27 * 100) / 100
      rates['TAM_ALTIN'] = Math.round(gramAltin * 6.54 * 100) / 100
      rates['CUMHURIYET_ALTIN'] = Math.round(gramAltin * 6.6 * 100) / 100
    }

    if (Object.keys(rates).length > 0) {
      const mergedRates = { ...cache.rates, ...rates }
      cache = {
        timestamp: now,
        rates: mergedRates,
      }
      return { rates: mergedRates, isStale: false }
    }
  } catch (err) {
    console.error('Error fetching base market rates:', err)
  }

  // If live fetch failed, check if previous cache exists
  if (Object.keys(cache.rates).length > 0) {
    return { rates: cache.rates, isStale: true }
  }

  return { rates: {}, isStale: true }
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
    let p = baseRates['GRAM_ALTIN']
    if (sym.includes('CEYREK') || sym.includes('ÇEYREK')) {
      p = baseRates['CEYREK_ALTIN']
    } else if (sym.includes('YARIM')) {
      p = baseRates['YARIM_ALTIN']
    } else if (sym.includes('TAM')) {
      p = baseRates['TAM_ALTIN']
    } else if (sym.includes('CUMHURIYET')) {
      p = baseRates['CUMHURIYET_ALTIN']
    }

    if (p && p > 0) return { price: p, currency: 'TRY' }
    return null
  }

  // 2. Döviz
  if (cat.includes('Döviz') || sym === 'USD' || sym === 'EUR' || sym === 'DOLAR' || sym === 'EURO') {
    const isEur = sym === 'EUR' || sym === 'EURO'
    const p = isEur ? baseRates['EUR'] : baseRates['USD']
    if (p && p > 0) return { price: p, currency: 'TRY' }
    return null
  }

  // 3. Kripto Para
  if (cat.includes('Kripto') || ['BTC', 'ETH', 'SOL', 'USDT', 'AVAX', 'XRP'].includes(sym)) {
    const cryptoPrice = await getCryptoPrice(sym)
    if (cryptoPrice !== null && cryptoPrice > 0) {
      return { price: cryptoPrice, currency: 'TRY' }
    }
  }

  // 4. Hisse Senedi (BIST)
  if (cat.includes('Hisse') || cat.includes('BIST')) {
    const bistPrice = await getBistPrice(sym)
    if (bistPrice !== null && bistPrice > 0) {
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

  const { rates: baseRates, isStale } = await getBaseMarketRates()

  if (!symbol) {
    const hasRates = Object.keys(baseRates).length > 0
    if (!hasRates) {
      return NextResponse.json(
        {
          success: false,
          message: 'Piyasa kurları şu an alınamıyor.',
          timestamp: new Date().toISOString(),
          baseRates: {},
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      success: true,
      isStale,
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
    isStale,
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
    const rawItems: Array<{ id?: string; symbol?: string; name?: string; category?: string }> =
      body.items || []

    // Batch bound & deduplication (F12)
    const seen = new Set<string>()
    const items = rawItems
      .filter((item) => {
        const key = item.id || item.symbol || item.name || ''
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, MAX_BATCH_SIZE)

    const { rates: baseRates, isStale } = await getBaseMarketRates()
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
            isStale,
          }
        }
      })
    )

    const hasAnyResults = Object.keys(results).length > 0 || Object.keys(baseRates).length > 0

    return NextResponse.json({
      success: hasAnyResults,
      isStale,
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
