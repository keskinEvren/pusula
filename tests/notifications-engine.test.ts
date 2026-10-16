import { describe, it, expect } from 'vitest'
import {
  buildMorningDigest,
  buildEveningDigest,
  getTurkishDayName,
  addDaysYmd,
} from '@/lib/notifications/event-digest-engine'
import {
  renderMorningEmailHtml,
  renderEveningEmailHtml,
  escapeHtml,
} from '@/lib/notifications/email-templates'
import { sendEmail, sendPushToUser } from '@/lib/notifications/dispatcher'
import type { AgendaItem, Routine, RoutineLog, CreditCard, Subscription, Account, Debt } from '@/types/database'

describe('Notifications Engine', () => {
  describe('Date Helpers', () => {
    it('getTurkishDayName returns correct day names', () => {
      expect(getTurkishDayName('2026-10-16')).toBe('Cuma')
      expect(getTurkishDayName('2026-10-17')).toBe('Cumartesi')
      expect(getTurkishDayName('2026-10-18')).toBe('Pazar')
      expect(getTurkishDayName('2026-10-19')).toBe('Pazartesi')
      expect(getTurkishDayName('invalid-date')).toBe('')
    })

    it('addDaysYmd adds and subtracts days correctly', () => {
      expect(addDaysYmd('2026-10-16', 1)).toBe('2026-10-17')
      expect(addDaysYmd('2026-10-16', 3)).toBe('2026-10-19')
      expect(addDaysYmd('2026-10-16', -1)).toBe('2026-10-15')
    })
  })

  describe('buildMorningDigest', () => {
    const today = '2026-10-16' // Cuma (Friday)

    it('handles empty inputs gracefully without throwing', () => {
      const digest = buildMorningDigest(
        {
          agendaItems: [],
          routines: [],
          routineLogs: [],
        },
        today
      )

      expect(digest.date).toBe(today)
      expect(digest.dayName).toBe('Cuma')
      expect(digest.isMonday).toBe(false)
      expect(digest.todayAgendaItems).toEqual([])
      expect(digest.overdueAgendaCount).toBe(0)
      expect(digest.morningRoutines).toEqual([])
      expect(digest.statementCards).toEqual([])
      expect(digest.dueCards).toEqual([])
      expect(digest.subscriptionAlerts).toEqual([])
      expect(digest.weeklyFinanceSummary).toBeNull()
      expect(digest.pushTitle).toContain('Günaydın! Cuma Brifingi')
      expect(digest.pushBody).toContain('planlı görev yok')
    })

    it('filters today focus agenda items and sorts by plan_time', () => {
      const agendaItems: Partial<AgendaItem>[] = [
        { id: '1', title: 'Öğle Toplantısı', plan_date: today, plan_time: '14:00', status: 'planned', duration_seconds: 0 },
        { id: '2', title: 'Sabah Standup', plan_date: today, plan_time: '09:30', status: 'planned', duration_seconds: 0 },
        { id: '3', title: 'Bitmiş Görev', plan_date: today, plan_time: '08:00', status: 'completed', duration_seconds: 1200 },
        { id: '4', title: 'Gecikmiş Görev', plan_date: '2026-10-15', plan_time: '10:00', status: 'planned', duration_seconds: 0 },
        { id: '5', title: 'Gelecek Görev', plan_date: '2026-10-20', plan_time: '11:00', status: 'planned', duration_seconds: 0 },
      ]

      const digest = buildMorningDigest(
        {
          agendaItems: agendaItems as AgendaItem[],
          routines: [],
          routineLogs: [],
        },
        today
      )

      expect(digest.todayAgendaItems.length).toBe(2)
      expect(digest.todayAgendaItems[0].title).toBe('Sabah Standup')
      expect(digest.todayAgendaItems[1].title).toBe('Öğle Toplantısı')
      expect(digest.overdueAgendaCount).toBe(1)
      expect(digest.overdueAgendaItems[0].title).toBe('Gecikmiş Görev')
      expect(digest.pushBody).toContain('2 odak görevi')
    })

    it('filters morning routines and excludes already completed ones', () => {
      const routines: Partial<Routine>[] = [
        { id: 'r1', title: 'Sabah Meditasyonu', time_block: 'morning', is_active: true, target_duration_minutes: 15 },
        { id: 'r2', title: 'Soğuk Duş', time_block: 'morning', is_active: true, target_duration_minutes: 5 },
        { id: 'r3', title: 'Akşam Yürüyüşü', time_block: 'evening', is_active: true, target_duration_minutes: 30 },
        { id: 'r4', title: 'Pasif Rutin', time_block: 'morning', is_active: false, target_duration_minutes: 10 },
      ]

      const routineLogs: Partial<RoutineLog>[] = [
        { id: 'l1', routine_id: 'r1', log_date: today, status: 'completed' }, // r1 is completed today
      ]

      const digest = buildMorningDigest(
        {
          agendaItems: [],
          routines: routines as Routine[],
          routineLogs: routineLogs as RoutineLog[],
        },
        today
      )

      expect(digest.morningRoutines.length).toBe(1)
      expect(digest.morningRoutines[0].id).toBe('r2')
      expect(digest.morningRoutines[0].title).toBe('Soğuk Duş')
    })

    it('triggers credit card statement date and due date alerts correctly', () => {
      const cards: Partial<CreditCard>[] = [
        {
          id: 'c1',
          card_name: 'Garanti Bonus',
          bank: 'Garanti',
          statement_date: '2026-10-16', // Exact match today
          due_date: '2026-10-26',
          statement_debt: 8500,
          current_debt: 12000,
        },
        {
          id: 'c2',
          card_name: 'Yapı Kredi World',
          bank: 'Yapı Kredi',
          statement_date: '2026-09-16', // Day 16 matches today's day (16)
          due_date: '2026-10-17', // Due TOMORROW
          statement_debt: 3400,
          current_debt: 5000,
        },
        {
          id: 'c3',
          card_name: 'Sıfır Borçlu Kart',
          bank: 'Enpara',
          due_date: '2026-10-16', // Due today BUT 0 debt
          statement_debt: 0,
          current_debt: 0,
        },
      ]

      const digest = buildMorningDigest(
        {
          agendaItems: [],
          routines: [],
          routineLogs: [],
          creditCards: cards as CreditCard[],
        },
        today
      )

      // Statement alerts: c1 (exact date) and c2 (day of month 16)
      expect(digest.statementCards.map((c) => c.card_name)).toContain('Garanti Bonus')
      expect(digest.statementCards.map((c) => c.card_name)).toContain('Yapı Kredi World')

      // Due date alert: c2 is due tomorrow with debt > 0
      expect(digest.dueCards.length).toBe(1)
      expect(digest.dueCards[0].card_name).toBe('Yapı Kredi World')
      expect(digest.dueCards[0].isToday).toBe(false)
      // c3 is excluded because statement_debt is 0
    })

    it('flags subscription renewal and decision alerts', () => {
      const subscriptions: Partial<Subscription>[] = [
        {
          id: 's1',
          service: 'ChatGPT Plus',
          amount: 20,
          currency: 'USD',
          status: 'Aktif',
          decision: 'Kararsız', // Decision flag
          end_date: '2026-10-28',
        },
        {
          id: 's2',
          service: 'Netflix',
          amount: 299,
          currency: 'TRY',
          status: 'Aktif',
          decision: 'Devam',
          end_date: '2026-10-18', // Expiring in 2 days (within 3 days)
        },
        {
          id: 's3',
          service: 'Spotify',
          amount: 99,
          currency: 'TRY',
          status: 'İptal', // Inactive
          decision: 'İptal Et',
          end_date: '2026-10-16',
        },
      ]

      const digest = buildMorningDigest(
        {
          agendaItems: [],
          routines: [],
          routineLogs: [],
          subscriptions: subscriptions as Subscription[],
        },
        today
      )

      expect(digest.subscriptionAlerts.length).toBe(2)
      expect(digest.subscriptionAlerts[0].service).toBe('ChatGPT Plus')
      expect(digest.subscriptionAlerts[0].reason).toBe('decision_needed')
      expect(digest.subscriptionAlerts[1].service).toBe('Netflix')
      expect(digest.subscriptionAlerts[1].reason).toBe('renewal_approaching')
    })

    it('includes weekly finance summary on Mondays or when forced', () => {
      const accounts: Partial<Account>[] = [{ id: 'a1', balance: 50000 }]
      const debts: Partial<Debt>[] = [{ id: 'd1', type: 'Alacak', remaining: 10000, status: 'Açık' }]
      const creditCards: Partial<CreditCard>[] = [{ id: 'c1', current_debt: 15000 }]

      // Friday without force -> null
      const fridayDigest = buildMorningDigest(
        {
          agendaItems: [],
          routines: [],
          routineLogs: [],
          accounts: accounts as Account[],
          debts: debts as Debt[],
          creditCards: creditCards as CreditCard[],
          forceWeeklyFinance: false,
        },
        '2026-10-16' // Friday
      )
      expect(fridayDigest.weeklyFinanceSummary).toBeNull()

      // Monday (2026-10-19) -> computed
      const mondayDigest = buildMorningDigest(
        {
          agendaItems: [],
          routines: [],
          routineLogs: [],
          accounts: accounts as Account[],
          debts: debts as Debt[],
          creditCards: creditCards as CreditCard[],
        },
        '2026-10-19' // Monday
      )
      expect(mondayDigest.weeklyFinanceSummary).toEqual({
        totalCash: 50000,
        totalCardDebt: 15000,
        totalReceivables: 10000,
        netWorth: 45000, // 50000 + 10000 - 15000
      })
    })
  })

  describe('buildEveningDigest', () => {
    const today = '2026-10-16' // Friday
    const yesterday = '2026-10-15'

    it('detects streaks at risk for incomplete routines when streak >= 1', () => {
      const routines: Partial<Routine>[] = [
        { id: 'r1', title: 'Kodlama / Proje', is_active: true, time_block: 'evening' },
        { id: 'r2', title: 'Kitap Okuma', is_active: true, time_block: 'night' },
        { id: 'r3', title: 'Spor Salonu', is_active: true, time_block: 'afternoon' },
      ]

      const routineLogs: Partial<RoutineLog>[] = [
        // r1 was completed yesterday -> streak = 1 up to yesterday
        { id: 'l1', routine_id: 'r1', log_date: yesterday, status: 'completed' },
        // r3 is already completed TODAY -> streak intact
        { id: 'l2', routine_id: 'r3', log_date: today, status: 'completed' },
      ]

      const digest = buildEveningDigest(
        {
          agendaItems: [],
          routines: routines as Routine[],
          routineLogs: routineLogs as RoutineLog[],
        },
        today
      )

      expect(digest.totalActiveRoutinesCount).toBe(3)
      expect(digest.completedRoutinesCount).toBe(1)
      expect(digest.atRiskRoutines.length).toBe(1)
      expect(digest.atRiskRoutines[0].id).toBe('r1')
      expect(digest.atRiskRoutines[0].title).toBe('Kodlama / Proje')
      expect(digest.atRiskRoutines[0].currentStreak).toBe(1)

      expect(digest.incompleteOtherRoutines.length).toBe(1)
      expect(digest.incompleteOtherRoutines[0].id).toBe('r2')

      expect(digest.pushTitle).toContain('🔥 1 Rutin Serisi Tehlikede!')
      expect(digest.pushBody).toContain('Zinciri kırma: "Kodlama / Proje"')
    })

    it('summarizes agenda completion counts accurately', () => {
      const agendaItems: Partial<AgendaItem>[] = [
        { id: 'a1', title: 'Görev 1', plan_date: today, status: 'completed' },
        { id: 'a2', title: 'Görev 2', plan_date: today, status: 'completed' },
        { id: 'a3', title: 'Görev 3', plan_date: today, status: 'in_progress' },
        { id: 'a4', title: 'Görev 4', plan_date: '2026-10-15', status: 'completed' }, // yesterday, not today
      ]

      const digest = buildEveningDigest(
        {
          agendaItems: agendaItems as AgendaItem[],
          routines: [],
          routineLogs: [],
        },
        today
      )

      expect(digest.completedAgendaCount).toBe(2)
      expect(digest.pendingAgendaCount).toBe(1)
      expect(digest.pushBody).toContain('Bugün 2 görev tamamlandı')
    })
  })

  describe('HTML Email Templates & Escaping', () => {
    it('escapes dangerous HTML characters to prevent XSS in email clients', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
      expect(escapeHtml("John & Mary's Dog")).toBe('John &amp; Mary&#39;s Dog')
      expect(escapeHtml(null)).toBe('')
      expect(escapeHtml(undefined)).toBe('')
    })

    it('renders morning email HTML with dark palette and action links', () => {
      const digest = buildMorningDigest(
        {
          agendaItems: [
            { id: 'a1', title: 'Kritik Kod İnceleme <script>', plan_date: '2026-10-16', plan_time: '10:00', status: 'planned', duration_seconds: 0 } as AgendaItem,
          ],
          routines: [
            { id: 'r1', title: 'Göz Egzersizi', time_block: 'morning', is_active: true, target_duration_minutes: 10 } as Routine,
          ],
          routineLogs: [],
          creditCards: [
            { id: 'c1', card_name: 'Bonus', bank: 'Garanti', due_date: '2026-10-16', statement_debt: 5000 } as CreditCard,
          ],
        },
        '2026-10-16'
      )

      const html = renderMorningEmailHtml(digest, 'https://pusula.app')

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('#0b0f19') // Pusula dark background
      expect(html).toContain('#111827') // Pusula card background
      expect(html).toContain('PUSULA')
      expect(html).toContain('SABAH BRİFİNGİ')
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('<script>')
      expect(html).toContain('https://pusula.app/agenda')
      expect(html).toContain('https://pusula.app/routines')
    })

    it('renders evening email HTML with streak warning badge', () => {
      const digest = buildEveningDigest(
        {
          agendaItems: [
            { id: 'a1', title: 'Tamamlanan İş', plan_date: '2026-10-16', status: 'completed' } as AgendaItem,
          ],
          routines: [
            { id: 'r1', title: 'Kitap Okuma', is_active: true, time_block: 'night' } as Routine,
          ],
          routineLogs: [
            { id: 'l1', routine_id: 'r1', log_date: '2026-10-15', status: 'completed' } as RoutineLog,
          ],
        },
        '2026-10-16'
      )

      const html = renderEveningEmailHtml(digest, 'https://pusula.app')

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('AKŞAM KAPANIŞI')
      expect(html).toContain('1 GÜNLÜK SERİ TEHLİKEDE')
      expect(html).toContain('Kitap Okuma')
      expect(html).toContain('https://pusula.app/routines')
    })
  })

  describe('Dispatcher Error Handling', () => {
    it('sendEmail fails gracefully when SMTP credentials are missing', async () => {
      const prevHost = process.env.SMTP_HOST
      delete process.env.SMTP_HOST

      const res = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('SMTP ayarları eksik')

      process.env.SMTP_HOST = prevHost
    })

    it('sendPushToUser fails gracefully when VAPID keys are missing', async () => {
      const prevKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      const fakeClient = {} as any
      const res = await sendPushToUser(fakeClient, 'user-123', {
        title: 'Test',
        body: 'Body',
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('VAPID anahtarları eksik')

      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = prevKey
    })
  })
})
