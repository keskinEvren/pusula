import { describe, it, expect } from 'vitest'
import {
  parsePageResults,
  deduplicateById,
  getMonthDateRange,
  buildKeysetFilter,
  type KeysetCursor,
} from '@/lib/keyset-pagination'

describe('Keyset Pagination & Big Data Logic', () => {
  describe('getMonthDateRange (Sargability)', () => {
    it('geçerli YYYY-MM için sargable [start, end) aralığı üretmelidir', () => {
      const range = getMonthDateRange('2026-09')
      expect(range).toEqual({
        start: '2026-09-01',
        end: '2026-10-01',
      })
    })

    it('yıl sonu (Aralık) için sonraki yılın Ocak ayını end olarak vermelidir', () => {
      const range = getMonthDateRange('2026-12')
      expect(range).toEqual({
        start: '2026-12-01',
        end: '2027-01-01',
      })
    })

    it('ALL, boş veya geçersiz formatlar için null dönmelidir', () => {
      expect(getMonthDateRange('ALL')).toBeNull()
      expect(getMonthDateRange('')).toBeNull()
      expect(getMonthDateRange(null)).toBeNull()
      expect(getMonthDateRange('invalid')).toBeNull()
      expect(getMonthDateRange('2026-13')).toBeNull()
      expect(getMonthDateRange('2026-00')).toBeNull()
    })
  })

  describe('buildKeysetFilter (PostgREST or Syntax)', () => {
    it('date DESC cursor için doğru PostgREST koşulu üretmelidir', () => {
      const cursor: KeysetCursor = { field: 'date', date: '2026-09-15', id: 'uuid-123' }
      const filter = buildKeysetFilter(cursor, 'desc')
      expect(filter).toBe('date.lt.2026-09-15,and(date.eq.2026-09-15,id.lt.uuid-123)')
    })

    it('date ASC cursor için doğru PostgREST koşulu üretmelidir', () => {
      const cursor: KeysetCursor = { field: 'date', date: '2026-09-15', id: 'uuid-123' }
      const filter = buildKeysetFilter(cursor, 'asc')
      expect(filter).toBe('date.gt.2026-09-15,and(date.eq.2026-09-15,id.gt.uuid-123)')
    })

    it('amount DESC cursor için doğru PostgREST koşulu üretmelidir', () => {
      const cursor: KeysetCursor = { field: 'amount', amount: 1500.5, id: 'uuid-456' }
      const filter = buildKeysetFilter(cursor, 'desc')
      expect(filter).toBe('amount.lt.1500.5,and(amount.eq.1500.5,id.lt.uuid-456)')
    })

    it('amount ASC cursor için doğru PostgREST koşulu üretmelidir', () => {
      const cursor: KeysetCursor = { field: 'amount', amount: 250, id: 'uuid-789' }
      const filter = buildKeysetFilter(cursor, 'asc')
      expect(filter).toBe('amount.gt.250,and(amount.eq.250,id.gt.uuid-789)')
    })
  })

  describe('parsePageResults (pageSize + 1 tekniği)', () => {
    it('51 kayıt geldiğinde pageSize=50 için ilk 50 kaydı dönmeli, hasMore=true olmalı ve 50. kayıttan cursor üretmelidir', () => {
      const raw = Array.from({ length: 51 }, (_, i) => ({
        id: `tx-${i + 1}`,
        date: `2026-09-${String(51 - i).padStart(2, '0')}`,
        amount: (i + 1) * 10,
      }))

      const res = parsePageResults(raw, 50, 'date')
      expect(res.items.length).toBe(50)
      expect(res.hasMore).toBe(true)
      expect(res.items[0].id).toBe('tx-1')
      expect(res.items[49].id).toBe('tx-50')
      expect(res.nextCursor).toEqual({
        field: 'date',
        date: '2026-09-02',
        id: 'tx-50',
      })
    })

    it('tam 50 kayıt geldiğinde hasMore=false olmalı ve nextCursor=null dönmelidir (son sayfa)', () => {
      const raw = Array.from({ length: 50 }, (_, i) => ({
        id: `tx-${i + 1}`,
        date: `2026-09-01`,
        amount: 100,
      }))

      const res = parsePageResults(raw, 50, 'date')
      expect(res.items.length).toBe(50)
      expect(res.hasMore).toBe(false)
      expect(res.nextCursor).toBeNull()
    })

    it('50den az kayıt geldiğinde hasMore=false ve nextCursor=null olmalıdır', () => {
      const raw = Array.from({ length: 15 }, (_, i) => ({
        id: `tx-${i + 1}`,
        date: `2026-09-01`,
        amount: 100,
      }))

      const res = parsePageResults(raw, 50, 'amount')
      expect(res.items.length).toBe(15)
      expect(res.hasMore).toBe(false)
      expect(res.nextCursor).toBeNull()
    })

    it('sortField=amount iken nextCursor amount bazlı oluşturulmalıdır', () => {
      const raw = Array.from({ length: 51 }, (_, i) => ({
        id: `tx-${i + 1}`,
        date: '2026-09-10',
        amount: 5000 - i * 10,
      }))

      const res = parsePageResults(raw, 50, 'amount')
      expect(res.hasMore).toBe(true)
      expect(res.nextCursor).toEqual({
        field: 'amount',
        amount: 5000 - 49 * 10,
        id: 'tx-50',
      })
    })
  })

  describe('deduplicateById (Concurrent Mutation Protection)', () => {
    it('aynı IDli kayıtları filtrelemeli ve mükerrer oluşumunu engellemelidir', () => {
      const existing = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ]
      const incoming = [
        { id: '2', name: 'Item 2 Duplicate' },
        { id: '3', name: 'Item 3' },
      ]

      const merged = deduplicateById(existing, incoming)
      expect(merged.length).toBe(3)
      expect(merged.map((m) => m.id)).toEqual(['1', '2', '3'])
      expect(merged[1].name).toBe('Item 2') // Eski referansı korur
    })
  })

  describe('Deterministic Tie-Breaker (Aynı date ve aynı amount senaryoları)', () => {
    it('aynı date değerine sahip kayıtlarda ID tie-breaker deterministik sıralamayı korur', () => {
      const sameDateItems = [
        { id: 'c', date: '2026-09-10', amount: 100 },
        { id: 'b', date: '2026-09-10', amount: 200 },
        { id: 'a', date: '2026-09-10', amount: 300 },
      ]

      // Keyset simülasyonu: 1. elemandan sonra gelenler (DESC: date < cursor.date OR (date = cursor.date AND id < cursor.id))
      const cursor = { field: 'date' as const, date: '2026-09-10', id: 'c' }
      const nextBatch = sameDateItems.filter(
        (item) =>
          item.date < cursor.date ||
          (item.date === cursor.date && item.id < cursor.id)
      )

      expect(nextBatch.map((i) => i.id)).toEqual(['b', 'a'])
    })

    it('aynı amount değerine sahip kayıtlarda ID tie-breaker deterministik sıralamayı korur', () => {
      const sameAmountItems = [
        { id: 'z', date: '2026-09-03', amount: 500 },
        { id: 'y', date: '2026-09-02', amount: 500 },
        { id: 'x', date: '2026-09-01', amount: 500 },
      ]

      const cursor = { field: 'amount' as const, amount: 500, id: 'z' }
      const nextBatch = sameAmountItems.filter(
        (item) =>
          item.amount < cursor.amount ||
          (item.amount === cursor.amount && item.id < cursor.id)
      )

      expect(nextBatch.map((i) => i.id)).toEqual(['y', 'x'])
    })
  })

  describe('10.000+ Kayıt Büyük Veri Simülasyonu', () => {
    it('10.000 kayıtlık veri kümesinde keyset sayfalaması tüm kayıtları eksiksiz ve mükerrersiz tarar', () => {
      // 10.000 sentetik hareket üret
      const totalCount = 10000
      const pageSize = 50
      const allData = Array.from({ length: totalCount }, (_, i) => {
        const d = new Date(2026, 0, 1)
        d.setMinutes(d.getMinutes() + (totalCount - i))
        return {
          id: `id-${String(i + 1).padStart(5, '0')}`,
          date: d.toISOString().slice(0, 10),
          amount: Math.round(((i % 500) + 1) * 10),
        }
      })

      // Sıralama: date DESC, id DESC
      allData.sort((a, b) => {
        const cmp = b.date.localeCompare(a.date)
        if (cmp !== 0) return cmp
        return b.id.localeCompare(a.id)
      })

      const paginatedResults: typeof allData = []
      let currentCursor: KeysetCursor | null = null
      let pageCount = 0

      while (true) {
        pageCount++
        // Keyset simülasyonu (PostgreSQL Index Seek)
        const candidates: Array<{ id: string; date: string; amount: number }> = currentCursor
          ? allData.filter(
              (item) =>
                item.date < (currentCursor as { date: string }).date ||
                (item.date === (currentCursor as { date: string }).date &&
                  item.id < (currentCursor as { id: string }).id)
            )
          : allData

        // Limit pageSize + 1
        const batchWithLookahead = candidates.slice(0, pageSize + 1)
        const parsed = parsePageResults(batchWithLookahead, pageSize, 'date')

        paginatedResults.push(...parsed.items)

        if (!parsed.hasMore || !parsed.nextCursor) {
          break
        }
        currentCursor = parsed.nextCursor
      }

      expect(pageCount).toBe(200) // 10.000 / 50 = 200 sayfa
      expect(paginatedResults.length).toBe(totalCount)

      // Deduplication doğrulaması: 10.000 eşsiz ID
      const uniqueIds = new Set(paginatedResults.map((r) => r.id))
      expect(uniqueIds.size).toBe(totalCount)
    })
  })
})
