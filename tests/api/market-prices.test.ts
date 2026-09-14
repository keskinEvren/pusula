import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/market-prices/route'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Market Prices API Tests', () => {
  let currentTime = 1_000_000

  beforeEach(() => {
    vi.restoreAllMocks()
    currentTime += 100_000 // advance time beyond 60s TTL so cache resets between tests
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('GET and POST endpoints', () => {
    it('GET bilinmeyen sembol -> 404, success: false dönmeli', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 404, statusText: 'Not Found' }))
      )

      const req = new Request('http://localhost/api/market-prices?symbol=UNKNOWN123')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.success).toBe(false)
    })

    it('GET BIST hissesi (mock Yahoo response) -> doğru fiyatı dönmeli', async () => {
      vi.mocked(fetch).mockImplementation((url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('THYAO.IS')) {
          return Promise.resolve(new Response(JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 285.50 } }] }
          })))
        }
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: null } }] }
        })))
      })

      const req = new Request('http://localhost/api/market-prices?symbol=THYAO&category=Hisse Senedi (BIST)')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.price).toBe(285.50)
      expect(data.symbol).toBe('THYAO')
    })

    it('GET döviz (USDTRY) -> fiyat dönmeli', async () => {
      vi.mocked(fetch).mockImplementation((url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('USDTRY=X')) {
          return Promise.resolve(new Response(JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 32.50 } }] }
          })))
        }
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: null } }] }
        })))
      })

      const req = new Request('http://localhost/api/market-prices?symbol=USD&category=Döviz')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.price).toBe(32.50)
      expect(data.symbol).toBe('USD')
    })

    it('GET altın -> gram hesaplaması (ons / 31.1034768 * USDTRY) doğru yapılmalı', async () => {
      vi.mocked(fetch).mockImplementation((url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('GC=F')) {
          return Promise.resolve(new Response(JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 2000 } }] }
          })))
        }
        if (urlStr.includes('USDTRY=X')) {
          return Promise.resolve(new Response(JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 30.0 } }] }
          })))
        }
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: null } }] }
        })))
      })

      const req = new Request('http://localhost/api/market-prices?symbol=GRAM_ALTIN&category=Emtia & Altın')
      const res = await GET(req)
      const data = await res.json()

      expect(data.success).toBe(true)
      // 2000 / 31.1034768 * 30.0 = 1929.04
      expect(data.price).toBe(1929.04)
    })

    it('GET kripto (mock CoinGecko response) -> TRY fiyatı dönmeli', async () => {
      vi.mocked(fetch).mockImplementation((url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('coingecko.com') && urlStr.includes('bitcoin')) {
          return Promise.resolve(new Response(JSON.stringify({
            bitcoin: { try: 2000000.55 }
          })))
        }
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: null } }] }
        })))
      })

      const req = new Request('http://localhost/api/market-prices?symbol=BTC&category=Kripto Para')
      const res = await GET(req)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.price).toBe(2000000.55)
    })

    it('POST batch: >50 items -> 50 ile sınırlandırılmalı', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: 10 } }] }
        })))
      )

      const items = Array.from({ length: 60 }).map((_, i) => ({
        symbol: `SYM${i}`,
        category: 'Hisse Senedi (BIST)'
      }))
      const req = new Request('http://localhost/api/market-prices', {
        method: 'POST',
        body: JSON.stringify({ items })
      })

      const res = await POST(req)
      const data = await res.json()

      expect(Object.keys(data.results).length).toBe(50)
    })

    it('POST batch: aynı semboller -> tekilleştirilmeli (dedup)', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: 10 } }] }
        })))
      )

      const items = [
        { symbol: 'THYAO', category: 'Hisse Senedi (BIST)' },
        { symbol: 'THYAO', category: 'Hisse Senedi (BIST)' }
      ]
      const req = new Request('http://localhost/api/market-prices', {
        method: 'POST',
        body: JSON.stringify({ items })
      })

      const res = await POST(req)
      const data = await res.json()

      expect(Object.keys(data.results).length).toBe(1)
    })

    it('Cache: aynı sembol arka arkaya çağrıldığında tek upstream fetch yapılmalı', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: 20 } }] }
        })))
      )

      // 1st GET: fetches base rates (3) + BIST (1) = 4 calls
      const req = new Request('http://localhost/api/market-prices?symbol=CACHE_TEST&category=Hisse Senedi (BIST)')
      await GET(req)

      // 2nd GET without advancing time: base rates hit cache (0 calls) + BIST (1 call) = 1 call
      const req2 = new Request('http://localhost/api/market-prices?symbol=CACHE_TEST&category=Hisse Senedi (BIST)')
      await GET(req2)

      // Total calls should be 4 + 1 = 5
      expect(vi.mocked(fetch).mock.calls.length).toBe(5)
    })

    it('Upstream hatası -> isStale: true fallback olmalı', async () => {
      // First populate cache with successful USD
      vi.mocked(fetch).mockImplementation((url: any) => {
        const urlStr = String(url)
        if (urlStr.includes('USDTRY=X')) {
          return Promise.resolve(new Response(JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 32.0 } }] }
          })))
        }
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: null } }] }
        })))
      })
      const seedReq = new Request('http://localhost/api/market-prices?symbol=USD&category=Döviz')
      await GET(seedReq)

      // Advance time past TTL
      currentTime += 100_000

      // Now fetch fails completely
      vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('Network Error')))

      const req = new Request('http://localhost/api/market-prices?symbol=USD&category=Döviz')
      const res = await GET(req)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.isStale).toBe(true)
      expect(data.price).toBe(32.0)
    })

    it('POST empty items -> hata veya boş sonuç dönmeli', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({
          chart: { result: [{ meta: { regularMarketPrice: 10 } }] }
        })))
      )

      const req = new Request('http://localhost/api/market-prices', {
        method: 'POST',
        body: JSON.stringify({ items: [] })
      })

      const res = await POST(req)
      const data = await res.json()

      expect(Object.keys(data.results || {})).toHaveLength(0)
    })
  })
})
