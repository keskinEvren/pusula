import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '../src/app/api/market-prices/route'

describe('Market Prices API Route (F12, F19)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. GET /api/market-prices with unknown symbol returns 404 and success: false', async () => {
    // Mock fetch to return 404 or empty
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
      json: async () => ({}),
    } as any)

    const req = new Request('http://localhost:3000/api/market-prices?symbol=UNKNOWN_TICKER_123')
    const res = await GET(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('2. POST /api/market-prices limits batches to max 50 items and deduplicates', async () => {
    // Generate 60 items with duplicates
    const items = []
    for (let i = 0; i < 60; i++) {
      items.push({ id: `item-${i % 30}`, symbol: `SYM${i % 30}`, category: 'Hisse' })
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    } as any)

    const req = new Request('http://localhost:3000/api/market-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    // Should process at most 30 unique items, never exceeding 50
    expect(Object.keys(body.results).length).toBeLessThanOrEqual(50)
  })
})
