import { describe, it, expect } from 'vitest'
import {
  calculateStreak,
  calculateDailyCompletion,
  filterRoutinesByTimeBlock,
  generateWeeklyDaySummaries,
  generateMonthCalendar,
  generateConstellationGraph,
  INITIAL_SAMPLE_ROUTINES,
} from '../src/lib/routines-engine'
import { Routine, RoutineLog } from '../src/types/database'

describe('Pusula Rutinler & Gökyüzü Motoru Testleri', () => {
  const dummyRoutines: Routine[] = [
    {
      id: 'r1',
      user_id: 'test',
      title: 'Sabah Suyu',
      icon: '☀️',
      time_block: 'morning',
      frequency: 'daily',
      target_days: [1, 2, 3, 4, 5, 6, 7],
      target_duration_minutes: 5,
      minimum_effective_dose: '1 yudum su',
      dream_id: null,
      identity_persona: 'Zinde İnsan',
      is_active: true,
      order_index: 0,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'r2',
      user_id: 'test',
      title: 'Deep Work',
      icon: '💻',
      time_block: 'afternoon',
      frequency: 'daily',
      target_days: [1, 2, 3, 4, 5, 6, 7],
      target_duration_minutes: 90,
      minimum_effective_dose: '1 commit',
      dream_id: null,
      identity_persona: 'Üretici',
      is_active: true,
      order_index: 1,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'r3',
      user_id: 'test',
      title: 'Kitap',
      icon: '📚',
      time_block: 'evening',
      frequency: 'daily',
      target_days: [1, 2, 3, 4, 5, 6, 7],
      target_duration_minutes: 20,
      minimum_effective_dose: '1 sayfa',
      dream_id: null,
      identity_persona: 'Sakin Zihin',
      is_active: false, // pasif
      order_index: 2,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ]

  it('1. Zaman dilimlerine göre aktif rutinleri doğru filtreler', () => {
    const morning = filterRoutinesByTimeBlock(dummyRoutines, 'morning')
    expect(morning.length).toBe(1)
    expect(morning[0].id).toBe('r1')

    const afternoon = filterRoutinesByTimeBlock(dummyRoutines, 'afternoon')
    expect(afternoon.length).toBe(1)
    expect(afternoon[0].id).toBe('r2')

    // r3 pasif olduğu için filtrelenmelidir
    const evening = filterRoutinesByTimeBlock(dummyRoutines, 'evening')
    expect(evening.length).toBe(0)
  })

  it('2. Günlük tamamlama oranını ve mükemmel gün durumunu hesaplar', () => {
    const logs: RoutineLog[] = [
      {
        id: 'l1',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-09',
        status: 'completed',
        note: 'Yapıldı',
        duration_minutes: 5,
        completed_at: '2026-09-09T08:00:00Z',
      },
    ]

    // 2 aktif rutin var (r1 ve r2), 1 tanesi tamamlandı -> %50
    const res1 = calculateDailyCompletion(dummyRoutines, logs, '2026-09-09')
    expect(res1.totalActive).toBe(2)
    expect(res1.completedCount).toBe(1)
    expect(res1.percent).toBe(50)
    expect(res1.isPerfectDay).toBe(false)

    // İkinci rutin de micro_dose ile tamamlanırsa
    logs.push({
      id: 'l2',
      user_id: 'test',
      routine_id: 'r2',
      log_date: '2026-09-09',
      status: 'micro_dose',
      note: 'Yorgundum, 1 satır yazdım',
      duration_minutes: 2,
      completed_at: '2026-09-09T17:00:00Z',
    })

    const res2 = calculateDailyCompletion(dummyRoutines, logs, '2026-09-09')
    expect(res2.completedCount).toBe(2)
    expect(res2.percent).toBe(100)
    expect(res2.isPerfectDay).toBe(true)
  })

  it('3. Standart ardışık günlerde streak (zincir) sayısını doğru artırır', () => {
    const logs: RoutineLog[] = [
      {
        id: 'l1',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-09',
        status: 'completed',
        note: null,
        duration_minutes: 5,
        completed_at: '2026-09-09T08:00:00Z',
      },
      {
        id: 'l2',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-08',
        status: 'completed',
        note: null,
        duration_minutes: 5,
        completed_at: '2026-09-08T08:00:00Z',
      },
      {
        id: 'l3',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-07',
        status: 'completed',
        note: null,
        duration_minutes: 5,
        completed_at: '2026-09-07T08:00:00Z',
      },
    ]

    const streak = calculateStreak('r1', logs, '2026-09-09')
    expect(streak.currentStreak).toBe(3)
    expect(streak.longestStreak).toBe(3)
    expect(streak.isCracked).toBe(false)
    expect(streak.isKintsugi).toBe(false)
  })

  it('4. "Never Miss Twice" kuralını işletir: 1 gün kaçırılınca çatlak olur, ertesi gün Kintsugi ile onarılır', () => {
    // Senaryo A: 07 Eylül yapıldı, 08 Eylül kaçırıldı, 09 Eylül henüz yapılmadı -> Çatlak (Cracked)
    const logsMissedYesterday: RoutineLog[] = [
      {
        id: 'l1',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-07',
        status: 'completed',
        note: null,
        duration_minutes: 5,
        completed_at: '2026-09-07T08:00:00Z',
      },
    ]

    const streakCracked = calculateStreak('r1', logsMissedYesterday, '2026-09-09')
    expect(streakCracked.isCracked).toBe(true)

    // Senaryo B: 09 Eylül'de rutin yapılırsa -> Kintsugi (Altın Onarım) devreye girer
    logsMissedYesterday.push({
      id: 'l2',
      user_id: 'test',
      routine_id: 'r1',
      log_date: '2026-09-09',
      status: 'completed',
      note: null,
      duration_minutes: 5,
      completed_at: '2026-09-09T08:00:00Z',
    })

    const streakKintsugi = calculateStreak('r1', logsMissedYesterday, '2026-09-09')
    expect(streakKintsugi.isKintsugi).toBe(true)
    expect(streakKintsugi.currentStreak).toBeGreaterThan(0)

    // Senaryo C: 2 gün üst üste yapılmazsa (örn. 06 Eylül'den beri yapılmadı) zincir sıfırlanır
    const streakBroken = calculateStreak('r1', [], '2026-09-09')
    expect(streakBroken.currentStreak).toBe(0)
  })

  it('5. Haftalık gün şeridi ve aylık takvim matrisini doğru üretir', () => {
    const weekly = generateWeeklyDaySummaries('2026-09-09', dummyRoutines, [])
    expect(weekly.length).toBe(7)
    // 09 Eylül seçili olmalı
    const selectedDay = weekly.find((w) => w.isSelected)
    expect(selectedDay?.date).toBe('2026-09-09')

    const monthly = generateMonthCalendar(2026, 8, dummyRoutines, []) // Eylül 2026
    expect(monthly.length).toBeGreaterThanOrEqual(28)
    const sep9 = monthly.find((m) => m.date === '2026-09-09')
    expect(sep9).toBeDefined()
    expect(sep9?.dayNumber).toBe(9)
  })

  it('6. Takımyıldız grafiğinde düğümleri ve tamamlanan kenarları üretir', () => {
    const logs: RoutineLog[] = [
      {
        id: 'l1',
        user_id: 'test',
        routine_id: dummyRoutines[0].id,
        log_date: '2026-09-09',
        status: 'completed',
        note: null,
        duration_minutes: 5,
        completed_at: '2026-09-09T08:00:00Z',
      },
      {
        id: 'l2',
        user_id: 'test',
        routine_id: dummyRoutines[1].id,
        log_date: '2026-09-09',
        status: 'completed',
        note: null,
        duration_minutes: 90,
        completed_at: '2026-09-09T15:00:00Z',
      },
    ]

    const graph = generateConstellationGraph(dummyRoutines, logs, '2026-09-09')
    // 2 aktif rutin var -> 2 düğüm
    expect(graph.nodes.length).toBe(2)
    expect(graph.nodes.every((n) => n.isCompleted)).toBe(true)
    expect(graph.completionRate).toBe(100)
    expect(graph.formationName).toContain('Tam Zincir')
    // Düğümler arasındaki kenar aktif olmalı
    expect(graph.edges.length).toBe(1)
    expect(graph.edges[0].isActive).toBe(true)
  })

  it('7. Başlangıç ilham şablonları (INITIAL_SAMPLE_ROUTINES) eksiksiz ve geçerlidir', () => {
    expect(INITIAL_SAMPLE_ROUTINES.length).toBeGreaterThanOrEqual(5)
    expect(INITIAL_SAMPLE_ROUTINES.every((r) => r.is_active)).toBe(true)
    expect(INITIAL_SAMPLE_ROUTINES.every((r) => r.title && r.icon && r.time_block)).toBe(true)
  })
})
