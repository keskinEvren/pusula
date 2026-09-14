import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDateToYmd,
  parseYmdToDate,
  addDays,
  getCurrentTimeBlock,
  filterRoutinesByTimeBlock,
  calculateStreak,
  calculateDailyCompletion,
  generateWeeklyDaySummaries,
  generateMonthCalendar,
  generateConstellationGraph,
  TIME_BLOCK_META,
  INITIAL_SAMPLE_ROUTINES,
} from '@/lib/routines-engine'
import { Routine, RoutineLog } from '@/types/database'

// Mock supabase to ensure no real DB connection
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Routines Engine Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Fixtures
  const createRoutine = (overrides?: Partial<Routine>): Routine => ({
    id: 'r1',
    user_id: 'u1',
    title: 'Test Routine',
    icon: '🚀',
    time_block: 'morning',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 15,
    minimum_effective_dose: 'Just do it',
    dream_id: null,
    identity_persona: 'Tester',
    is_active: true,
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  })

  const createLog = (overrides?: Partial<RoutineLog>): RoutineLog => ({
    id: 'l1',
    routine_id: 'r1',
    user_id: 'u1',
    log_date: '2026-09-15',
    status: 'completed',
    duration_minutes: 15,
    note: null,
    completed_at: '2026-09-15T00:00:00Z',
    ...overrides,
  })

  describe('formatDateToYmd', () => {
    it('1. Date objesini YYYY-MM-DD formatına dönüştürmeli', () => {
      const date = new Date(2026, 8, 15) // 8 = Eylül
      expect(formatDateToYmd(date)).toBe('2026-09-15')
    })
  })

  describe('parseYmdToDate', () => {
    it('2. YYYY-MM-DD formatındaki stringi Date objesine dönüştürmeli', () => {
      const date = parseYmdToDate('2026-09-15')
      expect(date.getFullYear()).toBe(2026)
      expect(date.getMonth()).toBe(8)
      expect(date.getDate()).toBe(15)
    })
  })

  describe('addDays', () => {
    it('3. Belirtilen tarihe pozitif ve negatif gün ofseti ekleyebilmeli', () => {
      const baseDate = new Date(2026, 8, 15)
      
      const plus2 = addDays(baseDate, 2)
      expect(plus2.getDate()).toBe(17)
      
      const minus3 = addDays(baseDate, -3)
      expect(minus3.getDate()).toBe(12)
    })
  })

  describe('getCurrentTimeBlock', () => {
    it('4. Saat bazlı doğru zaman dilimini (morning, afternoon, evening, night) döndürmeli', () => {
      vi.setSystemTime(new Date('2026-09-15T08:00:00'))
      expect(getCurrentTimeBlock()).toBe('morning')
      
      vi.setSystemTime(new Date('2026-09-15T14:00:00'))
      expect(getCurrentTimeBlock()).toBe('afternoon')
      
      vi.setSystemTime(new Date('2026-09-15T20:00:00'))
      expect(getCurrentTimeBlock()).toBe('evening')
      
      vi.setSystemTime(new Date('2026-09-15T03:00:00'))
      expect(getCurrentTimeBlock()).toBe('night')
    })
  })

  describe('filterRoutinesByTimeBlock', () => {
    it('5. İnaktifleri hariç tutarak sabah rutinlerini filtrelemeli ve sıralamalı', () => {
      const routines = [
        createRoutine({ id: 'r1', time_block: 'morning', order_index: 2, is_active: true }),
        createRoutine({ id: 'r2', time_block: 'morning', order_index: 1, is_active: true }),
        createRoutine({ id: 'r3', time_block: 'morning', order_index: 3, is_active: false }),
        createRoutine({ id: 'r4', time_block: 'afternoon', order_index: 0, is_active: true }),
      ]
      
      const filtered = filterRoutinesByTimeBlock(routines, 'morning')
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('r2')
      expect(filtered[1].id).toBe('r1')
    })

    it('6. Boş liste verildiğinde boş dönmeli', () => {
      expect(filterRoutinesByTimeBlock([], 'morning')).toEqual([])
    })
  })

  describe('calculateStreak', () => {
    const refDate = '2026-09-15'

    it('7. 5 ardışık gün loglandığında streak=5 olmalı', () => {
      const logs = [
        createLog({ log_date: '2026-09-15' }),
        createLog({ log_date: '2026-09-14' }),
        createLog({ log_date: '2026-09-13' }),
        createLog({ log_date: '2026-09-12' }),
        createLog({ log_date: '2026-09-11' }),
      ]
      
      const result = calculateStreak('r1', logs, refDate)
      expect(result.currentStreak).toBe(5)
    })

    it('8. 1 günlük kaçırma durumunda (Never Miss Twice) isCracked=true dönmeli ve streak sıfırlanmamalı', () => {
      const logs = [
        createLog({ log_date: '2026-09-13' }),
        createLog({ log_date: '2026-09-12' }),
      ]
      
      const result = calculateStreak('r1', logs, refDate)
      expect(result.isCracked).toBe(true)
      expect(result.currentStreak).toBe(2)
    })

    it('9. 2 ardışık kaçırma durumunda streak=0 olmalı', () => {
      const logs = [
        createLog({ log_date: '2026-09-12' }),
      ]
      
      const result = calculateStreak('r1', logs, refDate)
      expect(result.currentStreak).toBe(0)
    })

    it('10. Kaçırmadan sonra geri dönüşte isKintsugi=true dönmeli', () => {
      const logs = [
        createLog({ log_date: '2026-09-15' }),
        createLog({ log_date: '2026-09-13' }),
      ]
      
      const result = calculateStreak('r1', logs, refDate)
      expect(result.isKintsugi).toBe(true)
      expect(result.currentStreak).toBe(2)
    })

    it('11. Hiç log yoksa streak=0 olmalı', () => {
      const result = calculateStreak('r1', [], refDate)
      expect(result.currentStreak).toBe(0)
    })
  })

  describe('calculateDailyCompletion', () => {
    it('12. 3 rutinden 2si tamamlandığında tamamlanma oranı yaklaşık %67 olmalı', () => {
      const routines = [
        createRoutine({ id: 'r1' }),
        createRoutine({ id: 'r2' }),
        createRoutine({ id: 'r3' }),
      ]
      const logs = [
        createLog({ routine_id: 'r1' }),
        createLog({ routine_id: 'r2' }),
      ]
      
      const result = calculateDailyCompletion(routines, logs, '2026-09-15')
      expect(result.completedCount).toBe(2)
      expect(result.percent).toBe(67)
      expect(result.isPerfectDay).toBe(false)
    })

    it('13. micro_dose logları da tamamlanmış sayılmalı', () => {
      const routines = [createRoutine({ id: 'r1' })]
      const logs = [createLog({ routine_id: 'r1', status: 'micro_dose' })]
      
      const result = calculateDailyCompletion(routines, logs, '2026-09-15')
      expect(result.completedCount).toBe(1)
    })

    it('14. Tüm aktif rutinler tamamlandığında isPerfectDay=true dönmeli', () => {
      const routines = [createRoutine({ id: 'r1' })]
      const logs = [createLog({ routine_id: 'r1' })]
      
      const result = calculateDailyCompletion(routines, logs, '2026-09-15')
      expect(result.isPerfectDay).toBe(true)
    })
  })

  describe('generateWeeklyDaySummaries', () => {
    it('15. Seçili tarihe göre 7 günlük doğru tarih şeridini üretmeli', () => {
      vi.setSystemTime(new Date('2026-09-15T12:00:00'))
      const routines = [createRoutine({ id: 'r1' })]
      const logs: RoutineLog[] = []
      
      const summaries = generateWeeklyDaySummaries('2026-09-15', routines, logs)
      
      expect(summaries).toHaveLength(7)
      expect(summaries[0].date).toBe('2026-09-14')
      expect(summaries[1].date).toBe('2026-09-15')
      expect(summaries[1].isSelected).toBe(true)
      expect(summaries[1].isToday).toBe(true)
    })
  })

  describe('generateMonthCalendar', () => {
    it('16. Aylık takvim grid boyutunu ve taşan günleri doğru hesaplamalı (ör. 28-31 gün + padding)', () => {
      vi.setSystemTime(new Date('2026-09-15T12:00:00'))
      const routines: Routine[] = []
      const logs: RoutineLog[] = []
      
      const days = generateMonthCalendar(2026, 8, routines, logs)
      expect(days.length).toBeGreaterThanOrEqual(30)
      
      expect(days[0].date).toBe('2026-08-31')
      expect(days[0].isCurrentMonth).toBe(false)
      
      expect(days[1].date).toBe('2026-09-01')
      expect(days[1].isCurrentMonth).toBe(true)
    })

    it('17. Tamamlanmış günler için hasCompleted ve isPerfect durumlarını doğru işaretlemeli', () => {
      vi.setSystemTime(new Date('2026-09-15T12:00:00'))
      const routines = [createRoutine({ id: 'r1' }), createRoutine({ id: 'r2' })]
      const logs = [
        createLog({ routine_id: 'r1', log_date: '2026-09-01' }),
        createLog({ routine_id: 'r2', log_date: '2026-09-01' }),
        createLog({ routine_id: 'r1', log_date: '2026-09-02' }),
      ]
      
      const days = generateMonthCalendar(2026, 8, routines, logs)
      
      const sep1 = days.find((d) => d.date === '2026-09-01')
      expect(sep1?.hasCompleted).toBe(true)
      expect(sep1?.isPerfect).toBe(true)
      
      const sep2 = days.find((d) => d.date === '2026-09-02')
      expect(sep2?.hasCompleted).toBe(true)
      expect(sep2?.isPerfect).toBe(false)
    })
  })

  describe('generateConstellationGraph', () => {
    it('18. Grafikteki node sayısı aktif rutin sayısına eşit olmalı', () => {
      const routines = [
        createRoutine({ id: 'r1' }),
        createRoutine({ id: 'r2' }),
        createRoutine({ id: 'r3', is_active: false })
      ]
      const graph = generateConstellationGraph(routines, [], '2026-09-15')
      
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
    })

    it('19. Tamamlanmış node\'lar arasındaki edge (bağlantı) isActive=true olmalı', () => {
      const routines = [
        createRoutine({ id: 'r1', order_index: 0 }),
        createRoutine({ id: 'r2', order_index: 1 }),
        createRoutine({ id: 'r3', order_index: 2 })
      ]
      const logs = [
        createLog({ routine_id: 'r1', log_date: '2026-09-15' }),
        createLog({ routine_id: 'r2', log_date: '2026-09-15' })
      ]
      
      const graph = generateConstellationGraph(routines, logs, '2026-09-15')
      
      const r1r2 = graph.edges.find((e) => e.fromId === 'node-r1' && e.toId === 'node-r2')
      const r2r3 = graph.edges.find((e) => e.fromId === 'node-r2' && e.toId === 'node-r3')
      
      expect(r1r2?.isActive).toBe(true)
      expect(r2r3?.isActive).toBe(false)
    })
  })

  describe('Constants', () => {
    it('20. TIME_BLOCK_META 4 zaman dilimini doğru metadatalarla içermeli', () => {
      expect(TIME_BLOCK_META.morning).toBeDefined()
      expect(TIME_BLOCK_META.afternoon).toBeDefined()
      expect(TIME_BLOCK_META.evening).toBeDefined()
      expect(TIME_BLOCK_META.night).toBeDefined()
      
      expect(TIME_BLOCK_META.morning.label).toBeDefined()
      expect(TIME_BLOCK_META.morning.icon).toBeDefined()
      expect(TIME_BLOCK_META.morning.timeRange).toBeDefined()
    })

    it('21. INITIAL_SAMPLE_ROUTINES geçerli başlangıç rutin verilerini (id, time_block) barındırmalı', () => {
      expect(INITIAL_SAMPLE_ROUTINES.length).toBeGreaterThan(0)
      INITIAL_SAMPLE_ROUTINES.forEach((r) => {
        expect(r.id).toBeDefined()
        expect(['morning', 'afternoon', 'evening', 'night']).toContain(r.time_block)
        expect(r.title).toBeDefined()
        expect(r.is_active).toBe(true)
      })
    })
  })
})
