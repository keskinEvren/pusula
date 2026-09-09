import { Routine, RoutineLog } from '@/types/database'

export type TimeBlock = 'morning' | 'afternoon' | 'evening' | 'night'
export type RoutineLogStatus = 'completed' | 'micro_dose' | 'kintsugi_repaired' | 'skipped' | 'frozen'

export interface StreakInfo {
  currentStreak: number
  longestStreak: number
  isCracked: boolean
  isKintsugi: boolean
}

export interface DailyRoutineItem extends Routine {
  todayLog?: RoutineLog
  isCompletedToday: boolean
  streak: StreakInfo
}

export interface DaySummary {
  date: string // YYYY-MM-DD
  dayName: string // Pzt, Sal, etc.
  dayNumber: number // 1..31
  isToday: boolean
  isSelected: boolean
  totalRoutines: number
  completedCount: number
  completionRate: number // 0..100
}

export interface ConstellationNode {
  id: string
  routineId: string
  title: string
  icon: string
  timeBlock: TimeBlock
  x: number // 0-100 %
  y: number // 0-100 %
  isCompleted: boolean
  status?: RoutineLogStatus
  streakCount: number
  identityPersona?: string | null
}

export interface ConstellationEdge {
  fromId: string
  toId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  isActive: boolean
}

export interface ConstellationGraph {
  nodes: ConstellationNode[]
  edges: ConstellationEdge[]
  completionRate: number
  formationName: string
  formationDescription: string
}

// ---------------------------------------------------------------------------
// Zaman ve Tarih Yardımcıları
// ---------------------------------------------------------------------------

export function formatDateToYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseYmdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// ---------------------------------------------------------------------------
// Zaman Dilimleri
// ---------------------------------------------------------------------------

export const TIME_BLOCK_META: Record<
  TimeBlock,
  { label: string; icon: string; timeRange: string; color: string }
> = {
  morning: {
    label: 'Sabah Ritüelleri',
    icon: '🌅',
    timeRange: '06:00 - 12:00',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  afternoon: {
    label: 'Gün İçi & Üretim',
    icon: '☀️',
    timeRange: '12:00 - 18:00',
    color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  evening: {
    label: 'Akşam & Kapanış',
    icon: '🌙',
    timeRange: '18:00 - 00:00',
    color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
  night: {
    label: 'Gece & Dinlenme',
    icon: '🌌',
    timeRange: '00:00 - 06:00',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
}

export function getCurrentTimeBlock(): TimeBlock {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour <= 23) return 'evening'
  return 'night'
}

export function filterRoutinesByTimeBlock(routines: Routine[], block: TimeBlock): Routine[] {
  return routines
    .filter((r) => r.is_active && r.time_block === block)
    .sort((a, b) => a.order_index - b.order_index)
}

// ---------------------------------------------------------------------------
// Streak & "Never Miss Twice" Hesaplama Motoru
// ---------------------------------------------------------------------------

export function calculateStreak(
  routineId: string,
  logs: RoutineLog[],
  referenceDateStr: string = formatDateToYmd(new Date())
): StreakInfo {
  // Yalnızca bu rutine ait ve geçerli tamamlama logları
  const routineLogs = logs
    .filter(
      (l) =>
        l.routine_id === routineId &&
        (l.status === 'completed' ||
          l.status === 'micro_dose' ||
          l.status === 'kintsugi_repaired' ||
          l.status === 'frozen')
    )
    .map((l) => l.log_date)
    .sort((a, b) => b.localeCompare(a)) // En yeniden en eskiye

  const logSet = new Set(routineLogs)
  const refDate = parseYmdToDate(referenceDateStr)

  // 1. Güncel Streak Hesabı
  let currentStreak = 0
  let isCracked = false
  let isKintsugi = false

  const todayStr = referenceDateStr
  const yesterdayStr = formatDateToYmd(addDays(refDate, -1))
  const dayBeforeYesterdayStr = formatDateToYmd(addDays(refDate, -2))

  const completedToday = logSet.has(todayStr)
  const completedYesterday = logSet.has(yesterdayStr)

  let checkDate: Date

  if (completedToday) {
    currentStreak = 1
    // Dün boş geçilmiş ama önceki gün yapılmışsa kintsugi (altın dikiş) durumu
    if (!completedYesterday && logSet.has(dayBeforeYesterdayStr)) {
      isKintsugi = true
    }
    checkDate = addDays(refDate, -1)
  } else {
    // Bugün henüz yapılmadı
    if (completedYesterday) {
      // Dün yapılmış, streak henüz bozulmadı
      currentStreak = 0 // Bugün henüz yapılmadığı için bugün hariç dünden geriye sayacağız
      checkDate = addDays(refDate, -1)
    } else if (logSet.has(dayBeforeYesterdayStr)) {
      // Dün kaçırıldı ama önceki gün yapıldı -> "Çatlak (Cracked)" durumu (Never Miss Twice)
      isCracked = true
      currentStreak = 0
      checkDate = addDays(refDate, -2)
    } else {
      // 2 gün üst üste kaçırıldı -> Zincir kırıldı
      return { currentStreak: 0, longestStreak: calculateLongestStreak(routineLogs), isCracked: false, isKintsugi: false }
    }
  }

  // Geriye doğru ardışık günleri say
  let consecutiveMisses = 0
  while (true) {
    const dStr = formatDateToYmd(checkDate)
    if (logSet.has(dStr)) {
      currentStreak++
      consecutiveMisses = 0
      checkDate = addDays(checkDate, -1)
    } else {
      // Asla iki kez kaçırma esnekliği: Tek günlük mola seriyi kırmaz ama streak sayısını artırmaz
      consecutiveMisses++
      if (consecutiveMisses >= 2) {
        break
      }
      checkDate = addDays(checkDate, -1)
    }
  }

  const longestStreak = Math.max(currentStreak, calculateLongestStreak(routineLogs))

  return {
    currentStreak,
    longestStreak,
    isCracked,
    isKintsugi,
  }
}

function calculateLongestStreak(sortedDatesDesc: string[]): number {
  if (sortedDatesDesc.length === 0) return 0
  const uniqueDates = Array.from(new Set(sortedDatesDesc)).sort((a, b) => a.localeCompare(b))
  let maxStreak = 1
  let current = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = parseYmdToDate(uniqueDates[i - 1])
    const curr = parseYmdToDate(uniqueDates[i])
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      current++
      if (current > maxStreak) maxStreak = current
    } else if (diffDays === 2) {
      // Tek günlük mola (Never miss twice toleransı)
      // Sayacı sıfırlama, devam ettir
      if (current > maxStreak) maxStreak = current
    } else {
      current = 1
    }
  }

  return maxStreak
}

// ---------------------------------------------------------------------------
// Günlük ve Haftalık Tamamlama Metrikleri
// ---------------------------------------------------------------------------

export function calculateDailyCompletion(
  routines: Routine[],
  logs: RoutineLog[],
  targetDateStr: string
): {
  totalActive: number
  completedCount: number
  percent: number
  isPerfectDay: boolean
} {
  const activeRoutines = routines.filter((r) => r.is_active)
  if (activeRoutines.length === 0) {
    return { totalActive: 0, completedCount: 0, percent: 0, isPerfectDay: false }
  }

  const targetLogs = logs.filter(
    (l) =>
      l.log_date === targetDateStr &&
      (l.status === 'completed' || l.status === 'micro_dose' || l.status === 'kintsugi_repaired')
  )

  const completedRoutineIds = new Set(targetLogs.map((l) => l.routine_id))
  let completedCount = 0

  for (const routine of activeRoutines) {
    if (completedRoutineIds.has(routine.id)) {
      completedCount++
    }
  }

  const percent = Math.round((completedCount / activeRoutines.length) * 100)
  const isPerfectDay = completedCount === activeRoutines.length && activeRoutines.length > 0

  return {
    totalActive: activeRoutines.length,
    completedCount,
    percent,
    isPerfectDay,
  }
}

// ---------------------------------------------------------------------------
// Haftalık Gün Şeridi Üretici
// ---------------------------------------------------------------------------

const TURKISH_DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

export function generateWeeklyDaySummaries(
  selectedDateStr: string,
  routines: Routine[],
  logs: RoutineLog[]
): DaySummary[] {
  const selectedDate = parseYmdToDate(selectedDateStr)
  const dayOfWeek = selectedDate.getDay() // 0 = Paz, 1 = Pzt ...
  // Pazartesi = 0 olacak şekilde ofset hesapla
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = addDays(selectedDate, mondayOffset)

  const todayStr = formatDateToYmd(new Date())
  const days: DaySummary[] = []

  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    const dStr = formatDateToYmd(d)
    const metrics = calculateDailyCompletion(routines, logs, dStr)

    days.push({
      date: dStr,
      dayName: TURKISH_DAYS_SHORT[d.getDay()],
      dayNumber: d.getDate(),
      isToday: dStr === todayStr,
      isSelected: dStr === selectedDateStr,
      totalRoutines: metrics.totalActive,
      completedCount: metrics.completedCount,
      completionRate: metrics.percent,
    })
  }

  return days
}

// ---------------------------------------------------------------------------
// Aylık Ritim Matrisi (Calendar Heat Grid)
// ---------------------------------------------------------------------------

export interface MonthCalendarDay {
  date: string
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  completionRate: number
  hasCompleted: boolean
  isPerfect: boolean
}

export function generateMonthCalendar(
  year: number,
  month: number, // 0-indexed (0 = Ocak)
  routines: Routine[],
  logs: RoutineLog[]
): MonthCalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const todayStr = formatDateToYmd(new Date())

  // Ayın ilk gününün haftanın hangi günü olduğu (Pazartesi = 1)
  let startOffset = firstDayOfMonth.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days: MonthCalendarDay[] = []

  // Önceki aydan taşan günler
  for (let i = startOffset; i > 0; i--) {
    const d = addDays(firstDayOfMonth, -i)
    const dStr = formatDateToYmd(d)
    const metrics = calculateDailyCompletion(routines, logs, dStr)
    days.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      completionRate: metrics.percent,
      hasCompleted: metrics.completedCount > 0,
      isPerfect: metrics.isPerfectDay,
    })
  }

  // Bu ayın günleri
  for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
    const current = new Date(year, month, d)
    const dStr = formatDateToYmd(current)
    const metrics = calculateDailyCompletion(routines, logs, dStr)
    days.push({
      date: dStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      completionRate: metrics.percent,
      hasCompleted: metrics.completedCount > 0,
      isPerfect: metrics.isPerfectDay,
    })
  }

  // Sonraki aydan taşan günler (42 gün / 6 haftayı tamamlayana kadar)
  const remaining = (7 - (days.length % 7)) % 7
  for (let i = 1; i <= remaining; i++) {
    const d = addDays(lastDayOfMonth, i)
    const dStr = formatDateToYmd(d)
    const metrics = calculateDailyCompletion(routines, logs, dStr)
    days.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      completionRate: metrics.percent,
      hasCompleted: metrics.completedCount > 0,
      isPerfect: metrics.isPerfectDay,
    })
  }

  return days
}

// ---------------------------------------------------------------------------
// Takımyıldızı Grafiği Üretici (Constellation Cosmos Engine)
// ---------------------------------------------------------------------------

// Estetik kozmik takımyıldız düğüm şablonları (0..100 koordinatlarında)
const CONSTELLATION_LAYOUTS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 50 }],
  2: [
    { x: 30, y: 50 },
    { x: 70, y: 50 },
  ],
  3: [
    { x: 50, y: 25 },
    { x: 25, y: 75 },
    { x: 75, y: 75 },
  ],
  4: [
    { x: 25, y: 35 },
    { x: 75, y: 35 },
    { x: 70, y: 75 },
    { x: 30, y: 75 },
  ],
  5: [
    { x: 50, y: 20 }, // Tepe Yıldız (Polaris)
    { x: 20, y: 45 },
    { x: 80, y: 45 },
    { x: 32, y: 80 },
    { x: 68, y: 80 },
  ],
  6: [
    { x: 25, y: 25 },
    { x: 50, y: 18 },
    { x: 75, y: 25 },
    { x: 75, y: 75 },
    { x: 50, y: 82 },
    { x: 25, y: 75 },
  ],
  7: [
    { x: 50, y: 15 },
    { x: 20, y: 35 },
    { x: 80, y: 35 },
    { x: 50, y: 50 }, // Merkez
    { x: 22, y: 75 },
    { x: 78, y: 75 },
    { x: 50, y: 88 },
  ],
}

export function generateConstellationGraph(
  routines: Routine[],
  logs: RoutineLog[],
  targetDateStr: string
): ConstellationGraph {
  const activeRoutines = routines.filter((r) => r.is_active).sort((a, b) => a.order_index - b.order_index)
  const count = activeRoutines.length

  if (count === 0) {
    return {
      nodes: [],
      edges: [],
      completionRate: 0,
      formationName: 'Karanlık Gökyüzü',
      formationDescription: 'Henüz aktif bir rutin tanımlanmadı.',
    }
  }

  const logMap = new Map<string, RoutineLog>()
  logs
    .filter((l) => l.log_date === targetDateStr)
    .forEach((l) => logMap.set(l.routine_id, l))

  const layout =
    CONSTELLATION_LAYOUTS[count] ||
    activeRoutines.map((_, idx) => {
      // Çember etrafında dağıt
      const angle = (idx / count) * 2 * Math.PI - Math.PI / 2
      return {
        x: Math.round(50 + 38 * Math.cos(angle)),
        y: Math.round(50 + 38 * Math.sin(angle)),
      }
    })

  const nodes: ConstellationNode[] = activeRoutines.map((r, idx) => {
    const pos = layout[idx] || { x: 50, y: 50 }
    const log = logMap.get(r.id)
    const isCompleted = !!log && (log.status === 'completed' || log.status === 'micro_dose' || log.status === 'kintsugi_repaired')
    const streakInfo = calculateStreak(r.id, logs, targetDateStr)

    return {
      id: `node-${r.id}`,
      routineId: r.id,
      title: r.title,
      icon: r.icon,
      timeBlock: r.time_block as TimeBlock,
      x: pos.x,
      y: pos.y,
      isCompleted,
      status: log?.status as RoutineLogStatus | undefined,
      streakCount: streakInfo.currentStreak,
      identityPersona: r.identity_persona,
    }
  })

  // Düğümler arası ışık hatları (Edges)
  // Tamamlanan ardışık düğümler arasında parlak enerji çizgileri çekilir
  const edges: ConstellationEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    const isActive = from.isCompleted && to.isCompleted
    edges.push({
      fromId: from.id,
      toId: to.id,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      isActive,
    })
  }

  // Eğer 3 veya daha fazla düğüm varsa ve hepsi tamamsa son ile ilki birleştirip halkayı/takımyıldızını kapat
  if (nodes.length >= 3) {
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const isLoopActive = first.isCompleted && last.isCompleted
    edges.push({
      fromId: last.id,
      toId: first.id,
      fromX: last.x,
      fromY: last.y,
      toX: first.x,
      toY: first.y,
      isActive: isLoopActive,
    })
  }

  const completedNodesCount = nodes.filter((n) => n.isCompleted).length
  const rate = Math.round((completedNodesCount / count) * 100)

  // Takımyıldız Formasyon İsimleri
  let formationName = 'Kıvılcım Başlangıcı'
  let formationDescription = 'İlk rutin tamamlandığında takımyıldızınız parlamaya başlar.'

  if (rate === 100) {
    formationName = '⭐ Kuzey Yıldızı Formasyonu (Tam Kilit)'
    formationDescription = 'Muhteşem! Tüm yıldızlar kenetlendi, bugünün gökyüzü kusursuz parlıyor.'
  } else if (rate >= 60) {
    formationName = '🌌 Parlayan Nebula (Yüksek İvme)'
    formationDescription = 'Işık hatları birbirine bağlandı, takımyıldızı şekilleniyor.'
  } else if (rate > 0) {
    formationName = '✨ Doğuş Evresi (Aktif Işık)'
    formationDescription = 'İlk enerji hatları kuruldu. Sıradaki rutinle halkayı genişlet.'
  }

  return {
    nodes,
    edges,
    completionRate: rate,
    formationName,
    formationDescription,
  }
}

// ---------------------------------------------------------------------------
// Başlangıç İlham Şablonları (Seed Routines)
// ---------------------------------------------------------------------------

export const INITIAL_SAMPLE_ROUTINES: Routine[] = [
  {
    id: 'sample-routine-1',
    user_id: 'local',
    title: '1 Bardak Su & Sabah Güneş Işığı',
    icon: '☀️',
    time_block: 'morning',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 5,
    minimum_effective_dose: '1 yudum su iç ve pencereden dışarı bak',
    dream_id: 'sample-2',
    identity_persona: 'Bedenine Saygılı Zanaatkar',
    is_active: true,
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-routine-2',
    user_id: 'local',
    title: '10 dk Sabah Mobilitesi & Postür',
    icon: '🧘',
    time_block: 'morning',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 10,
    minimum_effective_dose: '2 dakika kollarını esnet ve derin nefes al',
    dream_id: 'sample-5',
    identity_persona: 'Dayanıklı & Kararlı Sporcu',
    is_active: true,
    order_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-routine-3',
    user_id: 'local',
    title: '90 dk Kesintisiz Kod / Deep Work',
    icon: '💻',
    time_block: 'afternoon',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 90,
    minimum_effective_dose: 'Editörü aç, 1 commit veya 1 satır kod yaz',
    dream_id: 'sample-3',
    identity_persona: 'Bağımsız Üretici',
    is_active: true,
    order_index: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-routine-4',
    user_id: 'local',
    title: '15 dk Yabancı Dil Pratiği',
    icon: '🌍',
    time_block: 'afternoon',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 15,
    minimum_effective_dose: '3 yeni kelime tekrar et veya 1 video izle',
    dream_id: 'sample-1',
    identity_persona: 'Dünya Gezgini',
    is_active: true,
    order_index: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-routine-5',
    user_id: 'local',
    title: '20 sf Kitap Okuma & Zihin Kapanışı',
    icon: '📚',
    time_block: 'evening',
    frequency: 'daily',
    target_days: [1, 2, 3, 4, 5, 6, 7],
    target_duration_minutes: 20,
    minimum_effective_dose: 'Kitabı eline al ve sadece 1 sayfa oku',
    dream_id: 'sample-3',
    identity_persona: 'Sakin Zihin',
    is_active: true,
    order_index: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
