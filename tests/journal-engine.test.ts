import { describe, it, expect, vi } from 'vitest'
import {
  countWords,
  calculateReadingTimeMinutes,
  filterJournalEntries,
  calculateJournalMetrics,
  buildDayContextSummary,
  JOURNAL_MOODS,
  JOURNAL_TEMPLATES,
} from '@/lib/journal-engine'
import type { JournalEntry, Routine, RoutineLog, Transaction } from '@/types/database'

vi.mock('@/lib/supabase/client')

describe('journal-engine', () => {
  describe('countWords', () => {
    it('normal metinlerde kelime sayısını doğru hesaplamalıdır', () => {
      const text = 'Bu bir test metnidir ve altı kelimeden oluşur.'
      expect(countWords(text)).toBe(8)
    })

    it('markdown başlıklarını ve format karakterlerini temizleyerek saymalıdır', () => {
      const text = '### Başlık 1\n\nBu bir **kalın** yazıdır ve [link](url) içerir.'
      expect(countWords(text)).toBe(10)
    })

    it('boş veya geçersiz string verildiğinde 0 döndürmelidir', () => {
      expect(countWords('')).toBe(0)
      expect(countWords('   ')).toBe(0)
      expect(countWords('---')).toBe(0)
    })
  })

  describe('calculateReadingTimeMinutes', () => {
    it('200 kelimelik metin için okuma süresini 1 dakika olarak hesaplamalıdır', () => {
      expect(calculateReadingTimeMinutes(200)).toBe(1)
      expect(calculateReadingTimeMinutes(400)).toBe(2)
      expect(calculateReadingTimeMinutes(201)).toBe(2)
    })

    it('0 kelime için okuma süresini 0 olarak hesaplamalıdır', () => {
      expect(calculateReadingTimeMinutes(0)).toBe(0)
      expect(calculateReadingTimeMinutes(-5)).toBe(0)
    })
  })

  describe('filterJournalEntries', () => {
    const mockEntries: JournalEntry[] = [
      {
        id: '1',
        user_id: 'user1',
        entry_date: '2023-10-01',
        title: 'Mutlu Gün',
        content: 'Bugün harika bir gün.',
        mood: 'high_energy',
        template_type: 'freeform',
        tags: ['mutluluk', 'günlük'],
        pinned: true,
        word_count: 4,
        created_at: '',
        updated_at: '',
      },
      {
        id: '2',
        user_id: 'user1',
        entry_date: '2023-10-02',
        title: 'Yorgun Akşam',
        content: 'Çok çalıştım ve yoruldum.',
        mood: 'low_energy',
        template_type: 'stoic',
        tags: ['iş', 'yorgunluk'],
        pinned: false,
        word_count: 4,
        created_at: '',
        updated_at: '',
      },
      {
        id: '3',
        user_id: 'user1',
        entry_date: '2023-10-03',
        title: 'Normal Bir Gün',
        content: 'Sıradan bir gün geçti.',
        mood: 'calm',
        template_type: 'freeform',
        tags: ['sıradan'],
        pinned: true,
        word_count: 4,
        created_at: '',
        updated_at: '',
      },
    ] as JournalEntry[]

    it('mood ve template filtresini doğru uygulamalıdır', () => {
      const highEnergy = filterJournalEntries(mockEntries, { mood: 'high_energy' })
      expect(highEnergy).toHaveLength(1)
      expect(highEnergy[0].id).toBe('1')

      const stoic = filterJournalEntries(mockEntries, { templateType: 'stoic' })
      expect(stoic).toHaveLength(1)
      expect(stoic[0].id).toBe('2')
    })

    it('query (arama) parametresine göre doğru filtrelemelidir', () => {
      const searchResult = filterJournalEntries(mockEntries, { query: 'harika' })
      expect(searchResult).toHaveLength(1)
      expect(searchResult[0].id).toBe('1')
      
      const tagSearch = filterJournalEntries(mockEntries, { query: 'iş' })
      expect(tagSearch).toHaveLength(1)
      expect(tagSearch[0].id).toBe('2')
    })

    it('pinnedOnly seçeneği aktif olduğunda sadece sabitlenenleri getirmelidir', () => {
      const pinned = filterJournalEntries(mockEntries, { pinnedOnly: true })
      expect(pinned).toHaveLength(2)
      expect(pinned.map(e => e.id)).toContain('1')
      expect(pinned.map(e => e.id)).toContain('3')
    })

    it('sabitlenenleri her zaman en başa alarak sıralamalıdır', () => {
      const sorted = filterJournalEntries(mockEntries, {})
      expect(sorted[0].pinned).toBe(true)
      expect(sorted[1].pinned).toBe(true)
      expect(sorted[2].pinned).toBe(false)
    })

    it('boş bir dizi verildiğinde boş bir dizi döndürmelidir', () => {
      const result = filterJournalEntries([], { mood: 'calm' })
      expect(result).toEqual([])
    })
  })

  describe('calculateJournalMetrics', () => {
    it('metrikleri doğru şekilde toplamalıdır', () => {
      const entries = [
        {
          id: '1', user_id: 'u1', entry_date: '2023-10-01', title: '1', content: 'Bir iki', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, word_count: 2, created_at: '', updated_at: ''
        },
        {
          id: '2', user_id: 'u1', entry_date: '2023-10-02', title: '2', content: 'Üç dört beş', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, word_count: 3, created_at: '', updated_at: ''
        },
      ] as unknown as JournalEntry[]

      const metrics = calculateJournalMetrics(entries, '2023-10-03')
      expect(metrics.totalEntries).toBe(2)
      expect(metrics.totalWords).toBe(5)
      expect(metrics.avgWordsPerEntry).toBe(3) // 5 / 2 = 2.5 => Math.round(2.5) = 3
      expect(metrics.mostFrequentMood).toBe('calm')
      expect(metrics.totalReadingTimeMinutes).toBe(1)
    })

    it('yazma serisini (streak) art arda günler için doğru hesaplamalıdır', () => {
      const entries: JournalEntry[] = [
        { id: '1', user_id: 'u1', entry_date: '2023-10-01', title: '', content: '', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, weather_note: null, word_count: 0, created_at: '', updated_at: '' },
        { id: '2', user_id: 'u1', entry_date: '2023-10-02', title: '', content: '', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, weather_note: null, word_count: 0, created_at: '', updated_at: '' },
        { id: '3', user_id: 'u1', entry_date: '2023-10-03', title: '', content: '', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, weather_note: null, word_count: 0, created_at: '', updated_at: '' },
      ]

      const metrics = calculateJournalMetrics(entries, '2023-10-03')
      expect(metrics.writingStreak).toBe(3)
    })

    it('yazma serisini aradaki boşluklarda (gap) sıfırlamalıdır', () => {
      const entries: JournalEntry[] = [
        { id: '1', user_id: 'u1', entry_date: '2023-10-01', title: '', content: '', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, weather_note: null, word_count: 0, created_at: '', updated_at: '' },
        { id: '3', user_id: 'u1', entry_date: '2023-10-03', title: '', content: '', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, weather_note: null, word_count: 0, created_at: '', updated_at: '' },
      ]

      const metrics = calculateJournalMetrics(entries, '2023-10-04')
      expect(metrics.writingStreak).toBe(1)
    })

    it('boş bir dizi için sıfır (0) değerlerini döndürmelidir', () => {
      const metrics = calculateJournalMetrics([], '2023-10-01')
      expect(metrics.totalEntries).toBe(0)
      expect(metrics.totalWords).toBe(0)
      expect(metrics.avgWordsPerEntry).toBe(0)
      expect(metrics.writingStreak).toBe(0)
      expect(metrics.mostFrequentMood).toBeNull()
      expect(metrics.totalReadingTimeMinutes).toBe(0)
    })
  })

  describe('buildDayContextSummary', () => {
    it('veriler mevcut olduğunda doğru özeti oluşturmalıdır', () => {
      const dateStr = '2023-10-01'
      const routines = [
        { id: 'r1', user_id: 'u', title: 'Rutin 1', frequency: 'daily', is_active: true, created_at: '', updated_at: '' },
        { id: 'r2', user_id: 'u', title: 'Rutin 2', frequency: 'daily', is_active: true, created_at: '', updated_at: '' }
      ] as any
      const logs = [
        { id: 'l1', routine_id: 'r1', user_id: 'u', log_date: dateStr, status: 'completed', duration_minutes: 10, completed_at: '' }
      ] as any
      const txs = [
        { id: 't1', user_id: 'u', account_id: 'a1', amount: 150, type: 'Harcama', date: dateStr, description: 'T1', created_at: '', updated_at: '', analysis_group: 'Kişisel' },
        { id: 't2', user_id: 'u', account_id: 'a1', amount: 50, type: 'Harcama', date: dateStr, description: 'T2', created_at: '', updated_at: '', analysis_group: 'Kişisel' }
      ] as any

      const summary = buildDayContextSummary(dateStr, routines, logs, txs)
      expect(summary.routinesCompleted).toBe(1)
      expect(summary.routinesTotal).toBe(2)
      expect(summary.totalSpent).toBe(200)
      expect(summary.txCount).toBe(2)
      expect(summary.summaryText).toContain('1/2 Rutin')
      expect(summary.summaryText).toContain('200 ₺ Harcama (2 işlem)')
    })

    it('veri olmadığında varsayılan özeti oluşturmalıdır', () => {
      const summary = buildDayContextSummary('2023-10-01', [], [], [])
      expect(summary.routinesCompleted).toBe(0)
      expect(summary.routinesTotal).toBe(0)
      expect(summary.totalSpent).toBe(0)
      expect(summary.txCount).toBe(0)
      expect(summary.summaryText).toContain('Harcama yok (Sıfır Tüketim)')
    })
  })

  describe('Constants', () => {
    it('JOURNAL_MOODS 5 adet ruh hali içermelidir', () => {
      expect(Object.keys(JOURNAL_MOODS)).toHaveLength(5)
    })

    it('JOURNAL_TEMPLATES 4 adet şablon içermelidir', () => {
      expect(Object.keys(JOURNAL_TEMPLATES)).toHaveLength(4)
    })
  })
})
