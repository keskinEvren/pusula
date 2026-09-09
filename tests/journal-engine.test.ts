import { describe, it, expect } from 'vitest'
import {
  countWords,
  calculateReadingTimeMinutes,
  filterJournalEntries,
  calculateJournalMetrics,
  buildDayContextSummary,
  JOURNAL_MOODS,
  JOURNAL_TEMPLATES,
  INITIAL_SAMPLE_JOURNAL_ENTRIES,
} from '../src/lib/journal-engine'
import { JournalEntry, Routine, RoutineLog, Transaction } from '../src/types/database'

describe('Pusula Seyir Defteri (Journal Engine) Testleri', () => {
  const dummyEntries: JournalEntry[] = [
    {
      id: 'j1',
      user_id: 'test',
      entry_date: '2026-09-09',
      title: 'Sakin Sabah',
      content: 'Bugün erken uyandım ve filtre kahve yaptım. Sessizlik çok iyi geldi.',
      mood: 'calm',
      template_type: 'stoic',
      tags: ['Sabah', 'Felsefe'],
      weather_note: 'Açık',
      pinned: true,
      word_count: 11,
      created_at: '2026-09-09T08:00:00Z',
      updated_at: '2026-09-09T08:00:00Z',
    },
    {
      id: 'j2',
      user_id: 'test',
      entry_date: '2026-09-08',
      title: 'Fırtına ve Stres',
      content: 'İşler yetişmedi ve çok stresli bir gün geçirdim.',
      mood: 'stormy',
      template_type: 'freeform',
      tags: ['Stres', 'İş'],
      weather_note: 'Yağmurlu',
      pinned: false,
      word_count: 9,
      created_at: '2026-09-08T20:00:00Z',
      updated_at: '2026-09-08T20:00:00Z',
    },
    {
      id: 'j3',
      user_id: 'test',
      entry_date: '2026-09-07',
      title: 'Yeni Proje Başlangıcı',
      content: 'Büyük bir enerjiyle kod yazmaya başladım. Harika gidiyor.',
      mood: 'high_energy',
      template_type: 'gratitude_victory',
      tags: ['Kod', 'Enerji'],
      weather_note: 'Güneşli',
      pinned: false,
      word_count: 9,
      created_at: '2026-09-07T12:00:00Z',
      updated_at: '2026-09-07T12:00:00Z',
    },
  ]

  it('1. Kelime sayısını ve tahmini okuma süresini doğru hesaplar', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('Merhaba dünya, bugün nasılsın?')).toBe(4)
    expect(countWords('### Başlık\n* Madde 1\n* Madde 2')).toBe(5)

    // Okuma süresi (dakikada ~200 kelime)
    expect(calculateReadingTimeMinutes(0)).toBe(0)
    expect(calculateReadingTimeMinutes(50)).toBe(1)
    expect(calculateReadingTimeMinutes(250)).toBe(2)
  })

  it('2. Seyir defteri kayıtlarını ruh haline ve arama sorgusuna göre filtreler', () => {
    // Ruh haline göre
    const calmOnly = filterJournalEntries(dummyEntries, { mood: 'calm' })
    expect(calmOnly.length).toBe(1)
    expect(calmOnly[0].id).toBe('j1')

    // Arama sorgusuna göre (büyük/küçük harf duyarsız)
    const searchRes = filterJournalEntries(dummyEntries, { query: 'stresli' })
    expect(searchRes.length).toBe(1)
    expect(searchRes[0].id).toBe('j2')

    // Etiket araması
    const tagRes = filterJournalEntries(dummyEntries, { query: 'Felsefe' })
    expect(tagRes.length).toBe(1)
    expect(tagRes[0].id).toBe('j1')

    // Sabitlenenler (pinned) her zaman en başta olmalı
    const all = filterJournalEntries(dummyEntries)
    expect(all[0].pinned).toBe(true)
    expect(all[0].id).toBe('j1')
  })

  it('3. Seyir defteri metriklerini (toplam yazı, kelime, serisi) doğru hesaplar', () => {
    const metrics = calculateJournalMetrics(dummyEntries, '2026-09-09')
    expect(metrics.totalEntries).toBe(3)
    expect(metrics.totalWords).toBe(29)
    expect(metrics.avgWordsPerEntry).toBe(10)
    // 07, 08, 09 Eylül ardışık 3 gün yazılmış -> streak 3
    expect(metrics.writingStreak).toBe(3)
    expect(metrics.totalReadingTimeMinutes).toBe(1)
  })

  it('4. Günün akıllı bağlamını (Smart Day Context Ribbon) rutin ve harcamalarla sentezler', () => {
    const dummyRoutines: Routine[] = [
      {
        id: 'r1',
        user_id: 'test',
        title: 'Sabah Koşusu',
        icon: '🏃',
        time_block: 'morning',
        frequency: 'daily',
        target_days: [1, 2, 3, 4, 5, 6, 7],
        target_duration_minutes: 30,
        minimum_effective_dose: null,
        dream_id: null,
        identity_persona: 'Sporcu',
        is_active: true,
        order_index: 0,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ]

    const dummyLogs: RoutineLog[] = [
      {
        id: 'l1',
        user_id: 'test',
        routine_id: 'r1',
        log_date: '2026-09-09',
        status: 'completed',
        note: null,
        duration_minutes: 30,
        completed_at: '2026-09-09T08:00:00Z',
      },
    ]

    const dummyTransactions: Transaction[] = [
      {
        id: 't1',
        user_id: 'test',
        account_id: 'acc1',
        card_id: null,
        date: '2026-09-09',
        amount: -150,
        type: 'Harcama',
        description: 'Kahve & Sandviç',
        analysis_group: 'Kişisel',
        merchant: 'Starbucks',
        recurrence: null,
        statement_date: null,
        project_id: null,
        source_account_id: null,
        target_account_id: null,
        related_debt_id: null,
        import_id: null,
        account_or_card: null,
        created_at: '2026-09-09T09:00:00Z',
        updated_at: '2026-09-09T09:00:00Z',
      },
    ]

    const context = buildDayContextSummary(
      '2026-09-09',
      dummyRoutines,
      dummyLogs,
      dummyTransactions
    )

    expect(context.routinesCompleted).toBe(1)
    expect(context.routinesTotal).toBe(1)
    expect(context.totalSpent).toBe(150)
    expect(context.txCount).toBe(1)
    expect(context.summaryText).toContain('1/1 Rutin')
    expect(context.summaryText).toContain('150 ₺ Harcama')
  })

  it('5. Ruh hali ve şablon tanımları eksiksizdir', () => {
    expect(Object.keys(JOURNAL_MOODS)).toHaveLength(5)
    expect(JOURNAL_MOODS.calm.icon).toBe('🌊')
    expect(JOURNAL_MOODS.high_energy.icon).toBe('⚡')

    expect(Object.keys(JOURNAL_TEMPLATES)).toHaveLength(4)
    expect(JOURNAL_TEMPLATES.stoic.content).toContain('Kontrol Çemberi')
    expect(JOURNAL_TEMPLATES.gratitude_victory.content).toContain('Üç Şükran Detayı')

    expect(INITIAL_SAMPLE_JOURNAL_ENTRIES.length).toBeGreaterThanOrEqual(3)
  })
})
