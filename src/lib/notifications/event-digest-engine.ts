/**
 * 🧭 PUSULA — Olay & Özet Motoru (Event Digest Engine)
 * Saf fonksiyonlar: DB bağımsız, deterministik ve birim testi yapılabilir.
 */

import { calculateStreak } from '@/lib/routines-engine'
import { calculateNetWorth } from '@/lib/finance-engine'
import type { AgendaItem, Routine, RoutineLog, CreditCard, Subscription, Account, Debt, Investment } from '@/types/database'

export interface MorningDigestInput {
  agendaItems: AgendaItem[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  creditCards?: CreditCard[]
  subscriptions?: Subscription[]
  accounts?: Account[]
  debts?: Debt[]
  investments?: Investment[]
  weeklyFinanceEnabled?: boolean
  forceWeeklyFinance?: boolean
}

export interface MorningDigest {
  date: string
  dayName: string
  isMonday: boolean
  // Ajanda
  todayAgendaItems: Array<{
    id: string
    title: string
    plan_time?: string | null
    status: string
    duration_seconds: number
  }>
  overdueAgendaCount: number
  overdueAgendaItems: Array<{
    id: string
    title: string
    plan_date: string
  }>
  // Sabah Rutinleri
  morningRoutines: Array<{
    id: string
    title: string
    icon: string
    target_duration_minutes: number | null
    minimum_effective_dose: string | null
    streakCount: number
  }>
  // Olay Bazlı Finansal Uyarılar
  statementCards: Array<{
    id: string
    card_name: string
    bank: string
    last_four: string | null
    statement_debt: number
    current_debt: number
  }>
  dueCards: Array<{
    id: string
    card_name: string
    bank: string
    last_four: string | null
    due_date: string
    statement_debt: number
    isToday: boolean
  }>
  subscriptionAlerts: Array<{
    id: string
    service: string
    amount: number
    currency: string
    end_date: string | null
    decision: string
    reason: 'decision_needed' | 'renewal_approaching'
  }>
  weeklyFinanceSummary: {
    totalCash: number
    totalCardDebt: number
    totalReceivables: number
    netWorth: number
  } | null
  // Push Özeti
  pushTitle: string
  pushBody: string
}

export interface EveningDigestInput {
  agendaItems: AgendaItem[]
  routines: Routine[]
  routineLogs: RoutineLog[]
}

export interface EveningDigest {
  date: string
  dayName: string
  // Rutin Durumu & Seri Koruması
  atRiskRoutines: Array<{
    id: string
    title: string
    currentStreak: number
    time_block: string
  }>
  incompleteOtherRoutines: Array<{
    id: string
    title: string
    time_block: string
  }>
  totalActiveRoutinesCount: number
  completedRoutinesCount: number
  // Ajanda Kapanış
  completedAgendaCount: number
  pendingAgendaCount: number
  // Push Özeti
  pushTitle: string
  pushBody: string
}

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function getTurkishDayName(dateStr: string): string {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return ''
  }
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  return DAYS_TR[d.getUTCDay()] || ''
}

export function addDaysYmd(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 🌅 Sabah Odak ve Ajanda Brifingi Üreticisi
 */
export function buildMorningDigest(input: MorningDigestInput, todayStr: string): MorningDigest {
  const dayName = getTurkishDayName(todayStr)
  const parts = todayStr.split('-').map(Number)
  const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const isMonday = dateObj.getUTCDay() === 1
  const dayOfMonthStr = String(parts[2]).padStart(2, '0')

  // 1. Ajanda Filtreleme (YYYY-MM-DD normalizasyonu ile)
  const todayAgendaItems = (input.agendaItems || [])
    .filter((item) => {
      const pDate = item.plan_date ? item.plan_date.slice(0, 10) : null
      return pDate === todayStr && (item.status === 'planned' || item.status === 'in_progress')
    })
    .sort((a, b) => (a.plan_time || '99:99').localeCompare(b.plan_time || '99:99'))
    .map((item) => ({
      id: item.id,
      title: item.title,
      plan_time: item.plan_time,
      status: item.status,
      duration_seconds: item.duration_seconds || 0,
    }))

  const overdueList = (input.agendaItems || []).filter((item) => {
    const pDate = item.plan_date ? item.plan_date.slice(0, 10) : null
    return Boolean(pDate && pDate < todayStr && (item.status === 'planned' || item.status === 'in_progress'))
  })

  const overdueAgendaCount = overdueList.length
  const overdueAgendaItems = overdueList.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    plan_date: item.plan_date!.slice(0, 10),
  }))

  // 2. Sabah Rutinleri (time_block === 'morning' ve bugün tamamlanmamış)
  const todayCompletedRoutineIds = new Set(
    (input.routineLogs || [])
      .filter((l) => {
        const lDate = l.log_date ? l.log_date.slice(0, 10) : ''
        return lDate === todayStr && ['completed', 'micro_dose', 'kintsugi_repaired', 'frozen'].includes(l.status)
      })
      .map((l) => l.routine_id)
  )

  const morningRoutines = (input.routines || [])
    .filter((r) => r.is_active && r.time_block === 'morning' && !todayCompletedRoutineIds.has(r.id))
    .map((r) => {
      const streak = calculateStreak(r.id, input.routineLogs || [], todayStr)
      return {
        id: r.id,
        title: r.title,
        icon: r.icon || '☀️',
        target_duration_minutes: r.target_duration_minutes,
        minimum_effective_dose: r.minimum_effective_dose,
        streakCount: streak.currentStreak,
      }
    })

  // 3. Modüler Finansal Olaylar
  // A. Kredi Kartı Ekstre Kesim Günü (Tam tarih, YYYY-MM-DD günü veya gün numarası eşleşmesi)
  const statementCards = (input.creditCards || [])
    .filter((c) => {
      if (!c.statement_date) return false
      const raw = String(c.statement_date).trim()
      const normalizedDate = raw.slice(0, 10)
      if (normalizedDate === todayStr) return true
      if (raw.length >= 10 && raw.includes('-')) {
        const cDay = raw.slice(8, 10)
        return cDay === dayOfMonthStr
      }
      const num = parseInt(raw, 10)
      return !isNaN(num) && num === parts[2]
    })
    .map((c) => ({
      id: c.id,
      card_name: c.card_name,
      bank: c.bank,
      last_four: c.last_four,
      statement_debt: Number(c.statement_debt || 0),
      current_debt: Number(c.current_debt || 0),
    }))

  // B. Kredi Kartı Son Ödeme Uyarısı (Bugün veya Yarın & Borç > 0, hem statement_debt hem current_debt kontrolü)
  const tomorrowStr = addDaysYmd(todayStr, 1)
  const dueCards = (input.creditCards || [])
    .filter((c) => {
      if (!c.due_date) return false
      const debt = Number(c.statement_debt || c.current_debt || 0)
      if (debt <= 0) return false
      const cDueDate = c.due_date.slice(0, 10)
      return cDueDate === todayStr || cDueDate === tomorrowStr
    })
    .map((c) => {
      const cDueDate = c.due_date!.slice(0, 10)
      return {
        id: c.id,
        card_name: c.card_name,
        bank: c.bank,
        last_four: c.last_four,
        due_date: cDueDate,
        statement_debt: Number(c.statement_debt || c.current_debt || 0),
        isToday: cDueDate === todayStr,
      }
    })

  // C. Abonelik Karar / Yaklaşan Yenileme (ISO tarih normalizasyonu ile)
  const in3DaysStr = addDaysYmd(todayStr, 3)
  const subscriptionAlerts = (input.subscriptions || [])
    .filter((s) => {
      if (s.status !== 'Aktif') return false
      const isDecisionFlag = s.decision === 'İptal Et' || s.decision === 'Kararsız'
      const normalizedEnd = s.end_date ? s.end_date.slice(0, 10) : null
      const isExpiring = Boolean(normalizedEnd && normalizedEnd >= todayStr && normalizedEnd <= in3DaysStr)
      return isDecisionFlag || isExpiring
    })
    .map((s) => {
      const isDecisionFlag = s.decision === 'İptal Et' || s.decision === 'Kararsız'
      const normalizedEnd = s.end_date ? s.end_date.slice(0, 10) : null
      return {
        id: s.id,
        service: s.service,
        amount: Number(s.amount || 0),
        currency: s.currency || 'TRY',
        end_date: normalizedEnd,
        decision: s.decision || 'Devam',
        reason: isDecisionFlag ? ('decision_needed' as const) : ('renewal_approaching' as const),
      }
    })

  // D. Haftalık Finans Özeti (Pazartesi ve kullanıcı tercihi aktifse veya zorunlu test)
  const weeklyFinanceEnabled = input.weeklyFinanceEnabled ?? true
  let weeklyFinanceSummary: MorningDigest['weeklyFinanceSummary'] = null
  if (((isMonday && weeklyFinanceEnabled) || input.forceWeeklyFinance) && (input.accounts || input.debts || input.creditCards)) {
    const nw = calculateNetWorth(
      input.accounts || [],
      input.debts || [],
      input.creditCards || [],
      input.investments || []
    )
    weeklyFinanceSummary = {
      totalCash: nw.totalCash,
      totalCardDebt: nw.totalCardDebt,
      totalReceivables: nw.totalReceivables,
      netWorth: nw.netWorth,
    }
  }

  // Push Bildirim Metinleri Oluşturma
  let pushTitle = `🌅 Günaydın! ${dayName} Brifingi`
  const bodyParts: string[] = []

  if (todayAgendaItems.length > 0) {
    bodyParts.push(`🎯 ${todayAgendaItems.length} odak görevi`)
  } else {
    bodyParts.push(`🎯 Bugün planlı görev yok`)
  }

  if (morningRoutines.length > 0) {
    bodyParts.push(`☀️ ${morningRoutines.length} sabah rutini`)
  }

  if (dueCards.length > 0) {
    const card = dueCards[0]
    bodyParts.push(`⚠️ ${card.card_name} son ödeme: ${card.statement_debt} TL (${card.isToday ? 'Bugün' : 'Yarın'})`)
  } else if (statementCards.length > 0) {
    bodyParts.push(`💳 ${statementCards[0].card_name} ekstresi bugün kesiliyor`)
  } else if (overdueAgendaCount > 0) {
    bodyParts.push(`⏰ ${overdueAgendaCount} gecikmiş görev`)
  }

  const pushBody = bodyParts.join(' • ')

  return {
    date: todayStr,
    dayName,
    isMonday,
    todayAgendaItems,
    overdueAgendaCount,
    overdueAgendaItems,
    morningRoutines,
    statementCards,
    dueCards,
    subscriptionAlerts,
    weeklyFinanceSummary,
    pushTitle,
    pushBody,
  }
}

/**
 * 🌙 Akşam Rutin ve Seri Koruması Kapanış Üreticisi
 */
export function buildEveningDigest(input: EveningDigestInput, todayStr: string): EveningDigest {
  const dayName = getTurkishDayName(todayStr)

  const activeRoutines = (input.routines || []).filter((r) => r.is_active)
  const totalActiveRoutinesCount = activeRoutines.length

  const todayCompletedRoutineIds = new Set(
    (input.routineLogs || [])
      .filter((l) => {
        const lDate = l.log_date ? l.log_date.slice(0, 10) : ''
        return lDate === todayStr && ['completed', 'micro_dose', 'kintsugi_repaired', 'frozen'].includes(l.status)
      })
      .map((l) => l.routine_id)
  )

  const completedRoutinesCount = activeRoutines.filter((r) => todayCompletedRoutineIds.has(r.id)).length

  const incompleteRoutines = activeRoutines.filter((r) => !todayCompletedRoutineIds.has(r.id))

  const atRiskRoutines: EveningDigest['atRiskRoutines'] = []
  const incompleteOtherRoutines: EveningDigest['incompleteOtherRoutines'] = []

  for (const routine of incompleteRoutines) {
    const streak = calculateStreak(routine.id, input.routineLogs || [], todayStr)
    // Eğer dün tamamlanmışsa veya cracked durumdaysa (yani serisi >= 1 veya zincir tehlikedeyse)
    if (streak.currentStreak >= 1 || streak.isCracked) {
      atRiskRoutines.push({
        id: routine.id,
        title: routine.title,
        currentStreak: streak.currentStreak,
        time_block: routine.time_block,
      })
    } else {
      incompleteOtherRoutines.push({
        id: routine.id,
        title: routine.title,
        time_block: routine.time_block,
      })
    }
  }

  // Ajanda Tamamlanma Durumu (YYYY-MM-DD normalizasyonu ile)
  const todayAgenda = (input.agendaItems || []).filter((item) => {
    const pDate = item.plan_date ? item.plan_date.slice(0, 10) : null
    return pDate === todayStr
  })
  const completedAgendaCount = todayAgenda.filter((item) => item.status === 'completed').length
  const pendingAgendaCount = todayAgenda.filter((item) => item.status === 'planned' || item.status === 'in_progress').length

  // Push Bildirim Metinleri Oluşturma
  let pushTitle = `🌙 Akşam Kapanışı & Rutin Kontrolü`
  if (atRiskRoutines.length > 0) {
    pushTitle = `🔥 ${atRiskRoutines.length} Rutin Serisi Tehlikede!`
  }

  const bodyParts: string[] = []
  if (atRiskRoutines.length > 0) {
    const top = atRiskRoutines[0]
    bodyParts.push(`Zinciri kırma: "${top.title}" (${top.currentStreak} günlük seri)`)
  } else if (incompleteRoutines.length > 0) {
    bodyParts.push(`${incompleteRoutines.length} tamamlanmamış rutin var`)
  } else {
    bodyParts.push(`Tüm rutinler tamamlandı, harika iş!`)
  }

  if (completedAgendaCount > 0) {
    bodyParts.push(`Bugün ${completedAgendaCount} görev tamamlandı`)
  }

  const pushBody = bodyParts.join(' • ')

  return {
    date: todayStr,
    dayName,
    atRiskRoutines,
    incompleteOtherRoutines,
    totalActiveRoutinesCount,
    completedRoutinesCount,
    completedAgendaCount,
    pendingAgendaCount,
    pushTitle,
    pushBody,
  }
}
