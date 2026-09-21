'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarCheck,
  Plus,
  Play,
  Pause,
  Check,
  Clock,
  RotateCcw,
  Trash2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Sparkles,
  Timer,
  CheckCircle2,
  Circle,
  Briefcase,
  Building2,
  Rocket,
  Flame,
  BarChart3,
  ExternalLink,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Inbox,
  CheckCheck,
  CalendarPlus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import { isUUID } from '@/lib/utils'
import { useTimer, formatMinutesHours, type TimerMode } from '@/lib/timer-context'
import { isMissingRelationError, requireMutationData } from '@/lib/supabase/mutation'
import type { AgendaItem, Project } from '@/types/database'

function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return new Intl.DateTimeFormat('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return dateStr
  }
}

export type DayStatus = 'none' | 'all_completed' | 'has_overdue' | 'pending'

const MONTH_NAMES_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

const WEEKDAY_NAMES_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function getDayStatus(dateStr: string, dayItems: AgendaItem[], todayStr: string): DayStatus {
  if (!dayItems || dayItems.length === 0) return 'none'
  const isAllCompleted = dayItems.every((i) => i.status === 'completed')
  if (isAllCompleted) return 'all_completed'
  if (dateStr < todayStr) return 'has_overdue'
  return 'pending'
}

function AgendaContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const {
    activeTimer,
    isRunning,
    elapsedSeconds,
    remainingSeconds,
    timerMode,
    pomodoroTargetMinutes,
    startTimer,
    pauseTimer,
    resumeTimer,
    completeTimer,
    discardTimer,
    setTimerMode,
    formatTime,
  } = useTimer()

  const [viewMode, setViewMode] = useState<'daily' | 'calendar' | 'backlog'>('daily')
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()))
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()) // 0 - 11

  const [items, setItems] = useState<AgendaItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isDbFallback, setIsDbFallback] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'planned' | 'completed'>('all')
  const [backlogFilterTab, setBacklogFilterTab] = useState<'all' | 'planned' | 'completed'>('all')

  // Quick inline add state
  const [quickTitle, setQuickTitle] = useState('')
  const [quickProjectId, setQuickProjectId] = useState('')
  const [quickTime, setQuickTime] = useState('')
  const [quickIsBacklog, setQuickIsBacklog] = useState(false)
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  // Full Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalDate, setModalDate] = useState(() => toLocalDateString(new Date()))
  const [modalIsUndated, setModalIsUndated] = useState(false)
  const [modalTime, setModalTime] = useState('')
  const [modalProjectId, setModalProjectId] = useState('')
  const [modalTimerMode, setModalTimerMode] = useState<TimerMode>('stopwatch')
  const [modalSubmitting, setModalSubmitting] = useState(false)

  // Schedule undated item dialog/popover state
  const [schedulingItem, setSchedulingItem] = useState<AgendaItem | null>(null)
  const [scheduleTargetDate, setScheduleTargetDate] = useState(() => toLocalDateString(new Date()))

  // Complete with notes state
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')

  // Delete state
  const [itemToDelete, setItemToDelete] = useState<AgendaItem | null>(null)

  const todayStr = useMemo(() => toLocalDateString(new Date()), [])

  // Sync to state and localStorage cache
  const syncLocal = (newItems: AgendaItem[]) => {
    setItems(newItems)
    try {
      localStorage.setItem('pusula_local_agenda_items', JSON.stringify(newItems))
    } catch {}
  }

  // Load items & projects
  useEffect(() => {
    loadData()
  }, [])

  // Check URL query param ?new=true
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsModalOpen(true)
    }
  }, [searchParams])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: itemsData, error: itemsError }, { data: projectsData }] = await Promise.all([
        supabase
          .from('agenda_items')
          .select('*')
          .order('plan_time', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase.from('projects').select('*').order('name'),
      ])

      if (itemsError && isMissingRelationError(itemsError)) {
        console.warn('agenda_items remote notice (fallback to local):', itemsError.message)
        setIsDbFallback(true)
        const cached = localStorage.getItem('pusula_local_agenda_items')
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            const cleaned = Array.isArray(parsed)
              ? parsed.filter((it: any) => it.title !== 'Bugünün Öncelikli Görevini Tamamla')
              : []
            setItems(cleaned)
          } catch {
            setItems([])
          }
        } else {
          setItems([])
        }
      } else if (itemsError) {
        setIsDbFallback(false)
        throw new Error(itemsError.message)
      } else if (itemsData) {
        setIsDbFallback(false)
        const validItems = itemsData.filter((it: any) => it.title !== 'Bugünün Öncelikli Görevini Tamamla')
        setItems(validItems)
        localStorage.setItem('pusula_local_agenda_items', JSON.stringify(validItems))
      }

      if (projectsData) setProjects(projectsData)
    } catch (err: any) {
      console.error('Error loading agenda data:', err)
      toast.error(err.message || 'Ajanda verileri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  // Quick Add handler
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return

    setQuickSubmitting(true)
    const localId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'item-' + Date.now()
    const targetPlanDate = quickIsBacklog ? null : selectedDate
    const newItem: AgendaItem = {
      id: localId,
      user_id: 'local',
      title: quickTitle.trim(),
      plan_date: targetPlanDate,
      plan_time: quickIsBacklog ? null : (quickTime.trim() || null),
      project_id: quickProjectId || null,
      status: 'planned',
      timer_mode: 'stopwatch',
      pomodoro_target_minutes: 25,
      duration_seconds: 0,
      notes: null,
      completed_at: null,
      is_late_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) newItem.user_id = user.id

        const result = await supabase
          .from('agenda_items')
          .insert({
            user_id: newItem.user_id,
            title: newItem.title,
            plan_date: newItem.plan_date,
            plan_time: newItem.plan_time,
            project_id: newItem.project_id,
            status: 'planned',
            timer_mode: 'stopwatch',
            duration_seconds: 0,
            is_late_completed: false,
          })
          .select()
          .single()

        const data = requireMutationData(result, 'Ajanda kaydı backend tarafından doğrulanamadı.')
        syncLocal([...items, data])
      } else {
        syncLocal([...items, newItem])
        toast.warning('Ajanda tablosu bulunamadığı için kayıt yalnızca bu cihazda saklandı.')
        setQuickTitle('')
        setQuickTime('')
        setQuickProjectId('')
        setQuickIsBacklog(false)
        return
      }

      setQuickTitle('')
      setQuickTime('')
      setQuickProjectId('')
      setQuickIsBacklog(false)
      if (quickIsBacklog) {
        toast.success('Madde tarihsiz görev havuzuna eklendi!')
      } else {
        toast.success('Ajandaya eklendi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Ajanda kaydı oluşturulamadı.')
    } finally {
      setQuickSubmitting(false)
    }
  }

  // Modal Add handler
  const handleModalAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalTitle.trim()) return

    setModalSubmitting(true)
    const localId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'item-' + Date.now()
    const targetPlanDate = modalIsUndated ? null : (modalDate || null)
    const newItem: AgendaItem = {
      id: localId,
      user_id: 'local',
      title: modalTitle.trim(),
      plan_date: targetPlanDate,
      plan_time: modalIsUndated ? null : (modalTime.trim() || null),
      project_id: modalProjectId || null,
      status: 'planned',
      timer_mode: modalTimerMode,
      pomodoro_target_minutes: modalTimerMode === 'pomodoro' ? 25 : null,
      duration_seconds: 0,
      notes: null,
      completed_at: null,
      is_late_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) newItem.user_id = user.id

        const result = await supabase
          .from('agenda_items')
          .insert({
            user_id: newItem.user_id,
            title: newItem.title,
            plan_date: newItem.plan_date,
            plan_time: newItem.plan_time,
            project_id: newItem.project_id,
            status: 'planned',
            timer_mode: modalTimerMode,
            pomodoro_target_minutes: modalTimerMode === 'pomodoro' ? 25 : null,
            duration_seconds: 0,
            is_late_completed: false,
          })
          .select()
          .single()

        const data = requireMutationData(result, 'Ajanda kaydı backend tarafından doğrulanamadı.')
        syncLocal([...items, data])
      } else {
        syncLocal([...items, newItem])
        toast.warning('Ajanda tablosu bulunamadığı için kayıt yalnızca bu cihazda saklandı.')
        setIsModalOpen(false)
        return
      }

      setIsModalOpen(false)
      setModalTitle('')
      setModalTime('')
      setModalProjectId('')
      setModalIsUndated(false)
      if (modalIsUndated) {
        toast.success('Madde tarihsiz görev havuzuna eklendi!')
      } else {
        toast.success('Yeni ajanda maddesi oluşturuldu!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Ajanda kaydı oluşturulamadı.')
    } finally {
      setModalSubmitting(false)
    }
  }

  // Toggle item status (completed <-> planned)
  const handleToggleStatus = async (item: AgendaItem) => {
    const nextStatus: AgendaItem['status'] = item.status === 'completed' ? 'planned' : 'completed'
    const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null

    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const result = await supabase
          .from('agenda_items')
          .update({ status: nextStatus, completed_at: completedAt })
          .eq('id', item.id)
          .select('id')
          .single()
        requireMutationData(result, 'Ajanda durumu backend tarafından doğrulanamadı.')
      }
      const updated = items.map((i) => (i.id === item.id ? { ...i, status: nextStatus, completed_at: completedAt } : i))
      syncLocal(updated)
      if (nextStatus === 'completed') toast.success(`"${item.title}" tamamlandı!`)
    } catch (err: any) {
      toast.error(err.message || 'Ajanda durumu güncellenemedi.')
    }
  }

  // Delete item
  const handleDeleteItem = async () => {
    if (!itemToDelete) return
    const id = itemToDelete.id
    try {
      if (!isDbFallback && isUUID(id)) {
        const supabase = createClient()
        const result = await supabase.from('agenda_items').delete().eq('id', id).select('id').single()
        requireMutationData(result, 'Ajanda kaydının silindiği doğrulanamadı.')
      }
      syncLocal(items.filter((i) => i.id !== id))
      if (activeTimer?.itemId === id) discardTimer()
      toast.success('Ajanda maddesi silindi')
      setItemToDelete(null)
    } catch (err: any) {
      toast.error(err.message || 'Ajanda maddesi silinemedi.')
    }
  }

  // Move single item to today (Carry-over)
  const handleMoveToToday = async (item: AgendaItem) => {
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const result = await supabase.from('agenda_items').update({ plan_date: todayStr }).eq('id', item.id).select('id').single()
        requireMutationData(result, 'Ajanda taşıma işlemi doğrulanamadı.')
      }
      syncLocal(items.map((i) => (i.id === item.id ? { ...i, plan_date: todayStr } : i)))
      toast.success(`✨ "${item.title}" bugünün ajandasına aktarıldı!`)
    } catch (err: any) {
      toast.error(err.message || 'Ajanda maddesi taşınamadı.')
    }
  }

  // Move all uncompleted items of a past day to today
  const handleMoveAllToToday = async (uncompletedItems: AgendaItem[]) => {
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const ids = uncompletedItems.map((item) => item.id)
        const result = await supabase.from('agenda_items').update({ plan_date: todayStr }).in('id', ids).select('id')
        const rows = requireMutationData(result, 'Ajanda taşıma işlemi doğrulanamadı.')
        if (rows.length !== ids.length) throw new Error('Bazı ajanda kayıtları backend tarafından güncellenmedi.')
      }
      const uncompletedIds = new Set(uncompletedItems.map((i) => i.id))
      syncLocal(items.map((i) => (uncompletedIds.has(i.id) ? { ...i, plan_date: todayStr } : i)))
      toast.success(`✨ ${uncompletedItems.length} görev bugünün ajandasına aktarıldı!`)
      setSelectedDate(todayStr)
    } catch (err: any) {
      toast.error(err.message || 'Ajanda maddeleri taşınamadı.')
    }
  }

  // Mark past item as "Geç Tamamlandı" (preserves original plan_date)
  const handleLateComplete = async (item: AgendaItem) => {
    const completedAt = new Date().toISOString()
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const result = await supabase
          .from('agenda_items')
          .update({
            status: 'completed',
            completed_at: completedAt,
            is_late_completed: true,
          })
          .eq('id', item.id)
          .select('id')
          .single()
        requireMutationData(result, 'Geç tamamlama işlemi doğrulanamadı.')
      }
      syncLocal(
        items.map((i) =>
          i.id === item.id
            ? { ...i, status: 'completed', completed_at: completedAt, is_late_completed: true }
            : i
        )
      )
      toast.success(`✨ "${item.title}" geçmiş plan gününde tamamlandı olarak kaydedildi.`)
    } catch (err: any) {
      toast.error(err.message || 'Geç tamamlama işlemi gerçekleştirilemedi.')
    }
  }

  // Schedule an item to a specific date (or move from backlog)
  const handleScheduleItem = async (item: AgendaItem, targetDate: string) => {
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const result = await supabase
          .from('agenda_items')
          .update({ plan_date: targetDate })
          .eq('id', item.id)
          .select('id')
          .single()
        requireMutationData(result, 'Tarih atama işlemi doğrulanamadı.')
      }
      syncLocal(items.map((i) => (i.id === item.id ? { ...i, plan_date: targetDate } : i)))
      setSchedulingItem(null)
      if (targetDate === todayStr) {
        toast.success(`✨ "${item.title}" bugünün ajandasına planlandı!`)
      } else {
        toast.success(`✨ "${item.title}" ${formatDisplayDate(targetDate)} gününe planlandı!`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Tarih atanamadı.')
    }
  }

  // Move a dated item back to backlog (remove plan_date)
  const handleMoveToBacklog = async (item: AgendaItem) => {
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const result = await supabase
          .from('agenda_items')
          .update({ plan_date: null, plan_time: null })
          .eq('id', item.id)
          .select('id')
          .single()
        requireMutationData(result, 'Havuza aktarma işlemi doğrulanamadı.')
      }
      syncLocal(items.map((i) => (i.id === item.id ? { ...i, plan_date: null, plan_time: null } : i)))
      toast.info(`📥 "${item.title}" tarihsiz görev havuzuna aktarıldı.`)
    } catch (err: any) {
      toast.error(err.message || 'Havuza aktarılamadı.')
    }
  }

  // Handle Complete Active Timer
  const handleCompleteActiveTimer = async () => {
    if (await completeTimer(completionNotes.trim() || undefined)) {
      setIsCompleteModalOpen(false)
      setCompletionNotes('')
      await loadData()
    }
  }

  // Day shift helpers
  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const current = new Date(y, m - 1, d)
    current.setDate(current.getDate() + days)
    setSelectedDate(toLocalDateString(current))
  }

  // Filter items for selected day
  const dayItems = useMemo(() => {
    return items.filter((item) => item.plan_date === selectedDate)
  }, [items, selectedDate])

  const filteredDayItems = useMemo(() => {
    if (filterTab === 'planned') {
      return dayItems.filter((i) => i.status === 'planned' || i.status === 'in_progress')
    }
    if (filterTab === 'completed') {
      return dayItems.filter((i) => i.status === 'completed')
    }
    return dayItems
  }, [dayItems, filterTab])

  // Weekly stats
  const weeklyStats = useMemo(() => {
    const now = new Date()
    const day = now.getDay() || 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - day + 1)
    monday.setHours(0, 0, 0, 0)
    const mondayStr = toLocalDateString(monday)

    const weekItems = items.filter((i) => Boolean(i.plan_date && i.plan_date >= mondayStr))
    const totalDuration = weekItems.reduce((acc, i) => acc + (i.duration_seconds || 0), 0)
    const completedCount = weekItems.filter((i) => i.status === 'completed').length

    // Project breakdown
    const projectMap: Record<string, { name: string; seconds: number }> = {}
    weekItems.forEach((item) => {
      const sec = item.duration_seconds || 0
      if (sec <= 0) return
      const prj = projects.find((p) => p.id === item.project_id)
      const name = prj ? prj.name : 'Kişisel / Projesiz'
      const key = item.project_id || 'personal'
      if (!projectMap[key]) {
        projectMap[key] = { name, seconds: 0 }
      }
      projectMap[key].seconds += sec
    })

    const projectBreakdown = Object.values(projectMap).sort((a, b) => b.seconds - a.seconds)

    return { totalDuration, completedCount, projectBreakdown }
  }, [items, projects])

  // Get project helper
  const getProject = (projectId: string | null) => {
    if (!projectId) return null
    return projects.find((p) => p.id === projectId) || null
  }

  // Fast map lookup of items by date
  const itemsByDateMap = useMemo(() => {
    const map = new Map<string, AgendaItem[]>()
    items.forEach((item) => {
      if (!item.plan_date) return
      const list = map.get(item.plan_date) || []
      list.push(item)
      map.set(item.plan_date, list)
    })
    return map
  }, [items])

  // Undated items (Görev Havuzu / Backlog)
  const undatedItems = useMemo(() => {
    return items.filter((item) => !item.plan_date)
  }, [items])

  const filteredUndatedItems = useMemo(() => {
    if (backlogFilterTab === 'planned') {
      return undatedItems.filter((i) => i.status === 'planned' || i.status === 'in_progress')
    }
    if (backlogFilterTab === 'completed') {
      return undatedItems.filter((i) => i.status === 'completed')
    }
    return undatedItems
  }, [undatedItems, backlogFilterTab])

  // Calendar cells generation for calendarYear and calendarMonth
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1)
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
    const totalDaysInMonth = lastDay.getDate()

    // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
    // We align Monday = 0, Tuesday = 1, ..., Sunday = 6
    const startDayOfWeek = (firstDay.getDay() + 6) % 7

    const cells: {
      dateStr: string
      dayNum: number
      isCurrentMonth: boolean
      items: AgendaItem[]
      status: DayStatus
      totalDurationSeconds: number
      completedCount: number
      totalCount: number
    }[] = []

    // Previous month padding cells
    const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i
      const padDate = new Date(calendarYear, calendarMonth - 1, dayNum)
      const dateStr = toLocalDateString(padDate)
      const dayItems = itemsByDateMap.get(dateStr) || []
      const status = getDayStatus(dateStr, dayItems, todayStr)
      const totalDurationSeconds = dayItems.reduce((acc, it) => acc + (it.duration_seconds || 0), 0)
      const completedCount = dayItems.filter((it) => it.status === 'completed').length

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        items: dayItems,
        status,
        totalDurationSeconds,
        completedCount,
        totalCount: dayItems.length,
      })
    }

    // Current month cells
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const currDate = new Date(calendarYear, calendarMonth, dayNum)
      const dateStr = toLocalDateString(currDate)
      const dayItems = itemsByDateMap.get(dateStr) || []
      const status = getDayStatus(dateStr, dayItems, todayStr)
      const totalDurationSeconds = dayItems.reduce((acc, it) => acc + (it.duration_seconds || 0), 0)
      const completedCount = dayItems.filter((it) => it.status === 'completed').length

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: true,
        items: dayItems,
        status,
        totalDurationSeconds,
        completedCount,
        totalCount: dayItems.length,
      })
    }

    // Next month padding cells to complete rows of 7
    const remaining = (7 - (cells.length % 7)) % 7
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const padDate = new Date(calendarYear, calendarMonth + 1, dayNum)
      const dateStr = toLocalDateString(padDate)
      const dayItems = itemsByDateMap.get(dateStr) || []
      const status = getDayStatus(dateStr, dayItems, todayStr)
      const totalDurationSeconds = dayItems.reduce((acc, it) => acc + (it.duration_seconds || 0), 0)
      const completedCount = dayItems.filter((it) => it.status === 'completed').length

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        items: dayItems,
        status,
        totalDurationSeconds,
        completedCount,
        totalCount: dayItems.length,
      })
    }

    return cells
  }, [calendarYear, calendarMonth, itemsByDateMap, todayStr])

  // Monthly stats
  const monthStats = useMemo(() => {
    let totalItems = 0
    let completedItems = 0
    let overdueDays = 0
    let allCompletedDays = 0
    let pendingDays = 0
    let totalDurationSeconds = 0

    calendarGrid.forEach((cell) => {
      if (cell.isCurrentMonth && cell.items.length > 0) {
        totalItems += cell.totalCount
        completedItems += cell.completedCount
        totalDurationSeconds += cell.totalDurationSeconds
        if (cell.status === 'all_completed') allCompletedDays++
        else if (cell.status === 'has_overdue') overdueDays++
        else if (cell.status === 'pending') pendingDays++
      }
    })

    return {
      totalItems,
      completedItems,
      overdueDays,
      allCompletedDays,
      pendingDays,
      totalDurationSeconds,
      completionRate: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    }
  }, [calendarGrid])

  // Calendar day click handler - instantly switches to daily view for that date
  const handleCalendarDayClick = (dateStr: string) => {
    setSelectedDate(dateStr)
    setViewMode('daily')
    toast.info(`📅 ${formatDisplayDate(dateStr)} odak tezgâhına geçildi`)
  }

  // Month navigation
  const handlePrevMonth = () => {
    setCalendarMonth((prev) => {
      if (prev === 0) {
        setCalendarYear((y) => y - 1)
        return 11
      }
      return prev - 1
    })
  }

  const handleNextMonth = () => {
    setCalendarMonth((prev) => {
      if (prev === 11) {
        setCalendarYear((y) => y + 1)
        return 0
      }
      return prev + 1
    })
  }

  const handleGoToCurrentMonth = () => {
    const now = new Date()
    setCalendarYear(now.getFullYear())
    setCalendarMonth(now.getMonth())
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Ajanda yükleniyor">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-12 w-full bg-muted/40 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 h-96 bg-card border border-border rounded-xl" />
          <div className="h-96 bg-card border border-border rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top PageHeader */}
      <PageHeader
        title="Ajanda & Odak Masası"
        description="Günlük niyetleriniz, proje odak bloklarınız ve canlı çalışma sayacınız"
        actions={
          <Button
            onClick={() => {
              if (viewMode === 'backlog') {
                setModalIsUndated(true)
              } else {
                setModalIsUndated(false)
                setModalDate(selectedDate)
              }
              setIsModalOpen(true)
            }}
            className="gap-2 shadow-sm min-h-[36px] text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            Yeni Madde Ekle
          </Button>
        }
      />

      {isDbFallback && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">Yerel Mod Aktif (Supabase Tablosu Henüz Oluşturulmadı)</p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Ajanda maddeleriniz ve sayaç süreleriniz tarayıcınızın yerel hafızasında saklanıyor. Tüm özellikler eksiksiz çalışmaktadır.
              Bulut senkronizasyonu için Supabase SQL Editor&apos;de <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono">011_create_agenda_items.sql</code> migrasyonunu çalıştırmanız yeterlidir.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🎯 HERO: AKTİF ÇALIŞMA SAYACI (TIMER DESK)                                */}
      {/* ========================================================================= */}
      {activeTimer && (
        <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg shadow-primary/5 overflow-hidden relative">
          <div className="absolute -right-12 -top-12 h-40 w-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="primary"
                    className="text-[11px] px-2 py-0.5 flex items-center gap-1.5"
                  >
                    <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-primary animate-ping' : 'bg-amber-400'}`} />
                    <span>{isRunning ? 'Odak Seansı Aktif' : 'Sayaç Duraklatıldı'}</span>
                  </Badge>

                  {activeTimer.projectName && (
                    <Badge variant="outline" className="text-[11px] border-primary/25 text-primary">
                      🚀 {activeTimer.projectName}
                    </Badge>
                  )}

                  {/* Mode switch pills */}
                  <div className="flex items-center rounded-lg border border-border/80 bg-card p-0.5 ml-auto md:ml-0">
                    <button
                      type="button"
                      onClick={() => setTimerMode('stopwatch')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
                        timerMode === 'stopwatch'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ⏱️ Kronometre
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimerMode('pomodoro', 25)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
                        timerMode === 'pomodoro' && pomodoroTargetMinutes === 25
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      🍅 25 dk
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimerMode('pomodoro', 50)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
                        timerMode === 'pomodoro' && pomodoroTargetMinutes === 50
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      🍅 50 dk
                    </button>
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-foreground line-clamp-1">
                  {activeTimer.itemTitle}
                </h2>
              </div>

              {/* Big Timer Display & Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
                <div className="font-mono text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight bg-muted/40 px-4 py-2 rounded-xl border border-border/60 text-center">
                  {timerMode === 'pomodoro'
                    ? formatTime(remainingSeconds)
                    : formatTime(elapsedSeconds)}
                  {timerMode === 'pomodoro' && (
                    <span className="text-[10px] block font-sans text-muted-foreground font-normal">
                      Kalan Süre (Hedef: {pomodoroTargetMinutes} dk)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <Button
                      onClick={pauseTimer}
                      variant="outline"
                      className="gap-1.5 text-xs font-semibold h-10 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                    >
                      <Pause className="h-4 w-4" />
                      <span>Duraklat</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={resumeTimer}
                      className="gap-1.5 text-xs font-semibold h-10 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    >
                      <Play className="h-4 w-4" />
                      <span>Devam Et</span>
                    </Button>
                  )}

                  <Button
                    onClick={() => setIsCompleteModalOpen(true)}
                    className="gap-1.5 text-xs font-semibold h-10 bg-primary text-primary-foreground shadow-sm"
                  >
                    <Check className="h-4 w-4" />
                    <span>Tamamla</span>
                  </Button>

                  <Button
                    onClick={discardTimer}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                    title="Sayacı Sıfırla / İptal Et"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 🧭 VIEW MODE SWITCHER (GÜNLÜK TEZGÂH / AYLIK TAKVİM)                       */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-xs w-fit">
          <button
            type="button"
            onClick={() => setViewMode('daily')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'daily'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Günlük Tezgâh</span>
            {dayItems.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewMode === 'daily' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {dayItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedDate) {
                const [y, m] = selectedDate.split('-').map(Number)
                setCalendarYear(y)
                setCalendarMonth(m - 1)
              }
              setViewMode('calendar')
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'calendar'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Aylık Takvim</span>
            {items.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewMode === 'calendar' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {items.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('backlog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'backlog'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Görev Havuzu</span>
            {undatedItems.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewMode === 'backlog' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {undatedItems.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-2">
              <span>Seçili Gün:</span>
              <Badge variant="outline" className="text-xs border-primary/25 text-primary font-mono">
                {selectedDate}
              </Badge>
            </div>
          ) : viewMode === 'backlog' ? (
            <div className="flex items-center gap-2">
              <span>Havuzdaki Maddeler:</span>
              <Badge variant="outline" className="text-xs border-primary/25 text-primary font-mono">
                {undatedItems.length} Madde
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">İpucu: Günlere tıklayarak doğrudan tezgâha geçebilirsiniz</span>
              <button
                type="button"
                onClick={() => setViewMode('daily')}
                className="font-mono text-primary hover:underline flex items-center gap-1 font-semibold"
              >
                {selectedDate} Tezgâhına Dön <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <Card className="border-border/80 bg-card/60 backdrop-blur-xs shadow-md overflow-hidden">
          <CardHeader className="p-4 sm:p-5 pb-4 border-b border-border/40">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Month Navigation & Title */}
              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handlePrevMonth}
                  title="Önceki Ay"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <h2 className="text-base sm:text-xl font-bold text-foreground min-w-[150px] text-center sm:text-left">
                  {MONTH_NAMES_TR[calendarMonth]} {calendarYear}
                </h2>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleNextMonth}
                  title="Sonraki Ay"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5 ml-1 text-muted-foreground hover:text-foreground"
                  onClick={handleGoToCurrentMonth}
                >
                  Bugün
                </Button>
              </div>

              {/* Month Quick Summary Pills */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>{monthStats.allCompletedDays} gün tamamlandı</span>
                </div>

                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-1 rounded-lg font-medium">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>{monthStats.pendingDays} gün bekliyor</span>
                </div>

                {monthStats.overdueDays > 0 && (
                  <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2.5 py-1 rounded-lg font-medium">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    <span>{monthStats.overdueDays} gün gecikti</span>
                  </div>
                )}

                {monthStats.totalDurationSeconds > 0 && (
                  <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary px-2.5 py-1 rounded-lg font-mono">
                    <Clock className="h-3 w-3 text-primary" />
                    <span>{formatMinutesHours(monthStats.totalDurationSeconds)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 sm:p-5 space-y-3">
            {/* Weekday Header Row */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs font-semibold text-muted-foreground">
              {WEEKDAY_NAMES_TR.map((dayName, idx) => (
                <div
                  key={dayName}
                  className={`py-1.5 rounded-md ${idx >= 5 ? 'text-muted-foreground/60 bg-muted/20' : 'bg-muted/30'}`}
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* 7-Column Calendar Cells Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {calendarGrid.map((cell) => {
                const isToday = cell.dateStr === todayStr
                const isSelected = cell.dateStr === selectedDate

                // Color themes
                let cellTheme = 'bg-card/40 border-border/40 hover:border-border hover:bg-muted/30 text-muted-foreground'
                let badgeStyle = ''
                let badgeText = ''

                if (cell.status === 'all_completed') {
                  cellTheme =
                    'bg-emerald-950/20 border-emerald-500/40 hover:bg-emerald-900/30 hover:border-emerald-400 text-foreground'
                  badgeStyle = 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  badgeText = `✓ ${cell.completedCount}/${cell.totalCount}`
                } else if (cell.status === 'has_overdue') {
                  cellTheme =
                    'bg-rose-950/20 border-rose-500/40 hover:bg-rose-900/30 hover:border-rose-400 text-foreground'
                  badgeStyle = 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                  badgeText = `⚠️ ${cell.completedCount}/${cell.totalCount}`
                } else if (cell.status === 'pending') {
                  cellTheme =
                    'bg-amber-950/20 border-amber-500/40 hover:bg-amber-900/30 hover:border-amber-400 text-foreground'
                  badgeStyle = 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  badgeText = `⏳ ${cell.completedCount}/${cell.totalCount}`
                }

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => handleCalendarDayClick(cell.dateStr)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleCalendarDayClick(cell.dateStr)}
                    className={`group relative flex flex-col justify-between rounded-xl border p-1.5 sm:p-2.5 transition-all cursor-pointer min-h-[95px] sm:min-h-[115px] select-none ${cellTheme} ${
                      !cell.isCurrentMonth ? 'opacity-35 hover:opacity-80' : ''
                    } ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''} ${
                      isSelected ? 'shadow-md shadow-primary/20 border-primary ring-1 ring-primary' : ''
                    }`}
                    title={`${formatDisplayDate(cell.dateStr)} — Detaylar için tıkla`}
                  >
                    {/* Top Day Header */}
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span
                        className={`text-xs sm:text-sm font-bold tracking-tight ${
                          isToday
                            ? 'text-primary'
                            : cell.status === 'all_completed'
                            ? 'text-emerald-400'
                            : cell.status === 'has_overdue'
                            ? 'text-rose-400'
                            : cell.status === 'pending'
                            ? 'text-amber-400'
                            : cell.isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      <div className="flex items-center gap-1">
                        {isToday && (
                          <span className="hidden sm:inline text-[9px] font-semibold bg-primary/25 text-primary px-1 py-0.2 rounded">
                            Bugün
                          </span>
                        )}
                        {badgeText && (
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-1 sm:px-1.5 py-0.2 rounded ${badgeStyle}`}>
                            {badgeText}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Items Preview */}
                    <div className="space-y-1 my-1 flex-1 overflow-hidden">
                      {cell.items.slice(0, 2).map((it) => (
                        <div
                          key={it.id}
                          className={`text-[10px] sm:text-[11px] truncate flex items-center gap-1 ${
                            it.status === 'completed'
                              ? 'line-through text-muted-foreground/60'
                              : 'text-foreground/90 font-medium'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              it.status === 'completed'
                                ? 'bg-emerald-400'
                                : cell.status === 'has_overdue'
                                ? 'bg-rose-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span className="truncate">{it.title}</span>
                        </div>
                      ))}

                      {cell.items.length > 2 && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium pl-2.5">
                          +{cell.items.length - 2} daha
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Time and Quick Action hint */}
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-muted-foreground pt-1 border-t border-border/30 mt-auto">
                      {cell.totalDurationSeconds > 0 ? (
                        <span className="font-mono text-primary flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5 text-primary shrink-0" />
                          {formatMinutesHours(cell.totalDurationSeconds)}
                        </span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary flex items-center gap-0.5">
                          Aç <ExternalLink className="h-2.5 w-2.5" />
                        </span>
                      )}

                      <span className="opacity-0 group-hover:opacity-100 transition-opacity font-sans text-primary text-[10px] hidden sm:inline">
                        Tezgâha Git →
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bottom Color Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-border/40 text-xs text-muted-foreground">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-md bg-emerald-950/40 border border-emerald-500/50" />
                  <span className="text-emerald-400 font-medium">Yeşil:</span>
                  <span>Tüm maddeler tamamlandı</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-md bg-amber-950/40 border border-amber-500/50" />
                  <span className="text-amber-400 font-medium">Sarı:</span>
                  <span>Planlanmış / bekleyen iş var</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-md bg-rose-950/40 border border-rose-500/50" />
                  <span className="text-rose-400 font-medium">Kırmızı:</span>
                  <span>Günü geçmiş ve atlanmış iş var</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <span>Herhangi bir güne tıklayarak o günün tezgâhına anında geçebilirsiniz.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'backlog' ? (
        <div className="space-y-6">
          {/* Backlog Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-xl p-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">Tarihsiz Görev Havuzu</h2>
                <Badge variant="outline" className="text-xs border-primary/25 text-primary font-mono">
                  {undatedItems.length} Madde
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Henüz bir tarihe bağlanmamış serbest görevler, fikirler ve backlog maddeleri. Buradaki maddeleri doğrudan çalıştırabilir veya takvime planlayabilirsiniz.
              </p>
            </div>

            <Button
              onClick={() => {
                setModalIsUndated(true)
                setIsModalOpen(true)
              }}
              size="sm"
              className="gap-1.5 text-xs font-semibold shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Havuza Yeni Madde</span>
            </Button>
          </div>

          {/* Quick inline capture bar for backlog */}
          <form
            onSubmit={(e) => {
              setQuickIsBacklog(true)
              handleQuickAdd(e)
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-muted/30 border border-border/80 rounded-xl p-2.5 shadow-xs"
          >
            <div className="relative flex-1">
              <Input
                type="text"
                required
                placeholder="Havuza hızlı görev veya fikir ekle... (Örn: Blog yazısı taslağı hazırla, Refactor yap)"
                value={quickTitle}
                onChange={(e) => {
                  setQuickIsBacklog(true)
                  setQuickTitle(e.target.value)
                }}
                className="h-9 text-xs pl-3 pr-3 bg-card"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={quickProjectId}
                onChange={(e) => setQuickProjectId(e.target.value)}
                className="h-9 text-xs w-44 shrink-0 bg-card"
                aria-label="Proje Seçin"
              >
                <option value="">(Projesiz / Genel)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              <Button
                type="submit"
                disabled={quickSubmitting || !quickTitle.trim()}
                className="h-9 px-4 text-xs font-semibold shrink-0 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Havuza Ekle</span>
              </Button>
            </div>
          </form>

          {/* Main Grid: Backlog Items + Info Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2 Cols: Backlog Items List */}
            <div className="lg:col-span-2 space-y-3">
              {/* Backlog Filter Tabs */}
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBacklogFilterTab('all')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      backlogFilterTab === 'all'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    Tümü ({undatedItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBacklogFilterTab('planned')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      backlogFilterTab === 'planned'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    Bekleyenler ({undatedItems.filter((i) => i.status !== 'completed').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBacklogFilterTab('completed')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      backlogFilterTab === 'completed'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    Tamamlananlar ({undatedItems.filter((i) => i.status === 'completed').length})
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {filteredUndatedItems.map((item) => {
                  const prj = getProject(item.project_id)
                  const isItemActive = activeTimer?.itemId === item.id
                  const isCompleted = item.status === 'completed'

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                        isItemActive
                          ? 'border-primary/50 bg-primary/10 shadow-sm'
                          : isCompleted
                          ? 'border-border/40 bg-card/40 opacity-75'
                          : 'border-border bg-card hover:border-border/80 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Checkbox toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'border-muted-foreground/40 hover:border-primary'
                          }`}
                          title={isCompleted ? 'Tamamlanmadı olarak işaretle' : 'Tamamla'}
                        >
                          {isCompleted && <Check className="h-3.5 w-3.5" />}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-semibold ${
                                isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                              }`}
                            >
                              {item.title}
                            </span>

                            <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-300">
                              Tarihsiz Havuz
                            </Badge>

                            {prj && (
                              <Link
                                href={`/projects/${prj.slug}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline bg-primary/10 px-2 py-0.5 rounded border border-primary/20 truncate max-w-[150px]"
                                title={prj.name}
                              >
                                <span>{prj.name}</span>
                              </Link>
                            )}
                          </div>

                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic line-clamp-1">
                              "{item.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right side: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.duration_seconds > 0 && (
                          <span className="text-xs font-mono font-semibold text-foreground bg-muted/50 px-2 py-1 rounded-md border border-border/40 flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{formatMinutesHours(item.duration_seconds)}</span>
                          </span>
                        )}

                        {/* Quick Plan to Today Button */}
                        {!isCompleted && (
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => handleScheduleItem(item, todayStr)}
                            className="h-8 px-2.5 text-xs font-semibold gap-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 shadow-xs"
                            title="Bu maddeyi bugünün ajandasına ata"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Bugüne Planla</span>
                          </Button>
                        )}

                        {/* Select Custom Date Button */}
                        {!isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => {
                              setSchedulingItem(item)
                              setScheduleTargetDate(todayStr)
                            }}
                            className="h-8 px-2.5 text-xs font-semibold gap-1 border-border hover:bg-muted"
                            title="Takvimden bir gün seçerek planla"
                          >
                            <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="hidden md:inline">Tarih Ata</span>
                          </Button>
                        )}

                        {/* Start Timer Button */}
                        {!isCompleted && !isItemActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startTimer(item, prj?.name)}
                            className="h-8 px-2.5 text-xs font-semibold gap-1 border-primary/25 text-primary hover:bg-primary/10"
                            title="Sayacı Başlat"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span className="hidden sm:inline">Başlat</span>
                          </Button>
                        )}

                        {isItemActive && (
                          <Badge variant="primary" className="text-[10px] px-2 py-0.5 animate-pulse">
                            Çalışılıyor
                          </Badge>
                        )}

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 rounded text-muted-foreground/60 hover:text-destructive transition-colors"
                          title="Maddeyi Sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {filteredUndatedItems.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center space-y-2">
                    <Inbox className="h-6 w-6 text-muted-foreground mx-auto" />
                    <div className="text-sm font-semibold text-foreground">
                      Havuzda Madde Bulunmuyor
                    </div>
                    <div className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Belirli bir gün belirlemediğiniz fikir, yapılacak iş ve görevleri yukarıdaki kutudan ekleyerek burada toplayabilirsiniz.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right 1 Col: Backlog Guide & Metrics */}
            <div className="space-y-4">
              <Card className="border-border bg-card shadow-xs">
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-primary" />
                    <span>Havuz Durumu</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tarihsiz görevlerin genel dağılımı
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 p-3 rounded-lg border border-border/40">
                      <div className="text-[11px] text-muted-foreground">Bekleyen</div>
                      <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                        {undatedItems.filter((i) => i.status !== 'completed').length}
                      </div>
                    </div>
                    <div className="bg-muted/40 p-3 rounded-lg border border-border/40">
                      <div className="text-[11px] text-muted-foreground">Tamamlanan</div>
                      <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                        {undatedItems.filter((i) => i.status === 'completed').length}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground text-xs">Nasıl Kullanılır?</div>
                    <ul className="space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
                      <li>
                        <strong className="text-foreground">⚡ Bugüne Planla:</strong> Maddeyi anında bugünün ajandasına aktarır.
                      </li>
                      <li>
                        <strong className="text-foreground">📅 Tarih Ata:</strong> İleri bir tarihe randevu veya planlama yapar.
                      </li>
                      <li>
                        <strong className="text-foreground">⏱️ Doğrudan Başlat:</strong> Tarih atamadan da sayaç başlatıp efor sarf edebilirsiniz.
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* 📅 SECTION: DATE SELECTOR & NAVIGATION STRIP                              */}
          {/* ========================================================================= */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => shiftDate(-1)}
                title="Önceki Gün"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const yesterday = new Date()
                    yesterday.setDate(yesterday.getDate() - 1)
                    setSelectedDate(toLocalDateString(yesterday))
                  }}
                  className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors font-medium"
                >
                  Dün
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${
                    selectedDate === todayStr
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Bugün
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date()
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    setSelectedDate(toLocalDateString(tomorrow))
                  }}
                  className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors font-medium"
                >
                  Yarın
                </button>
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => shiftDate(1)}
                title="Sonraki Gün"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Current Selected Date Label & Date Picker & Quick Monthly button */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                <span>{formatDisplayDate(selectedDate)}</span>
              </div>

              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="h-7 text-xs w-36 py-0 px-2 bg-muted/40 font-mono"
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const [y, m] = selectedDate.split('-').map(Number)
                  setCalendarYear(y)
                  setCalendarMonth(m - 1)
                  setViewMode('calendar')
                }}
                className="h-7 px-2.5 text-xs gap-1.5 border-primary/25 text-primary hover:bg-primary/10"
                title="Aylık Takvim Görünümünü Aç"
              >
                <CalendarIcon className="h-3 w-3" />
                <span>Aylık Görünüm</span>
              </Button>
            </div>
          </div>

      {/* ========================================================================= */}
      {/* ⚡ QUICK INLINE CAPTURE BAR (HIZLI MADDE GİRİŞİ)                           */}
      {/* ========================================================================= */}
      <form
        onSubmit={handleQuickAdd}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-muted/30 border border-border/80 rounded-xl p-2.5 shadow-xs"
      >
        <div className="relative flex-1">
          <Input
            type="text"
            required
            placeholder={
              quickIsBacklog
                ? 'Tarihsiz görev havuzuna ne eklemek istersiniz?'
                : 'Bugün neye odaklanacaksın? (Örn: Watchpath auth mimarisi, Sunucu faturasını öde...)'
            }
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            className="h-9 text-xs pl-3 pr-3 bg-card"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setQuickIsBacklog((prev) => !prev)}
            className={`h-9 px-2.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors shrink-0 ${
              quickIsBacklog
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-xs'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
            title={quickIsBacklog ? 'Tarihsiz havuza eklenecek (tıkla: güne planla)' : 'Seçili güne eklenecek (tıkla: tarihsiz havuza ekle)'}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>{quickIsBacklog ? 'Tarihsiz Havuz' : 'Güne Planla'}</span>
          </button>

          <Select
            value={quickProjectId}
            onChange={(e) => setQuickProjectId(e.target.value)}
            className="h-9 text-xs w-44 shrink-0 bg-card"
            aria-label="Proje Seçin"
          >
            <option value="">(Proje Bağlantısız / Genel)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          {!quickIsBacklog && (
            <Input
              type="time"
              value={quickTime}
              onChange={(e) => setQuickTime(e.target.value)}
              className="h-9 text-xs w-24 shrink-0 font-mono bg-card"
              title="Saat (Opsiyonel)"
            />
          )}

          <Button
            type="submit"
            disabled={quickSubmitting || !quickTitle.trim()}
            className="h-9 px-4 text-xs font-semibold shrink-0 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Ekle</span>
          </Button>
        </div>
      </form>

      {/* ========================================================================= */}
      {/* 📋 MAIN CONTENT GRID: ITEMS LIST + WEEKLY SUMMARY                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Agenda Items List */}
        <div className="lg:col-span-2 space-y-3">
          {/* Tabs Filter */}
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  filterTab === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Tümü ({dayItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('planned')}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  filterTab === 'planned'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Planlananlar ({dayItems.filter((i) => i.status !== 'completed').length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('completed')}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  filterTab === 'completed'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Tamamlananlar ({dayItems.filter((i) => i.status === 'completed').length})
              </button>
            </div>

            <span className="text-xs text-muted-foreground hidden sm:inline">
              Günün Toplamı: {formatMinutesHours(dayItems.reduce((s, i) => s + i.duration_seconds, 0))}
            </span>
          </div>

          {/* Past Uncompleted Carry-over Banner */}
          {selectedDate < todayStr && dayItems.some((i) => i.status !== 'completed') && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 shadow-xs">
              <div className="flex items-center gap-2.5 text-xs">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <div>
                  <p className="font-semibold text-rose-300">
                    Bu geçmiş günde tamamlanmamış {dayItems.filter((i) => i.status !== 'completed').length} görev var
                  </p>
                  <p className="text-rose-200/80 text-[11px]">
                    İşi yapmadıysanız <strong>Bugüne Getir</strong> ile bugüne aktarabilir, o gün tamamlandıysa <strong>Geç Tamamlandı</strong> ile kapatabilirsiniz.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => handleMoveAllToToday(dayItems.filter((i) => i.status !== 'completed'))}
                className="h-8 px-3 text-xs font-semibold shrink-0 gap-1.5 bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Tümünü Bugüne Getir ({dayItems.filter((i) => i.status !== 'completed').length})</span>
              </Button>
            </div>
          )}

          {/* Items List */}
          <div className="space-y-2">
            {filteredDayItems.map((item) => {
              const prj = getProject(item.project_id)
              const isItemActive = activeTimer?.itemId === item.id
              const isCompleted = item.status === 'completed'
              const isPastUncompleted = Boolean(item.plan_date && item.plan_date < todayStr && !isCompleted)

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isItemActive
                      ? 'border-primary/50 bg-primary/10 shadow-sm'
                      : isCompleted
                      ? 'border-border/40 bg-card/40 opacity-75'
                      : isPastUncompleted
                      ? 'border-rose-500/30 bg-rose-950/10 hover:border-rose-500/50'
                      : 'border-border bg-card hover:border-border/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Checkbox toggle */}
                    <button
                      type="button"
                      disabled={isPastUncompleted}
                      onClick={() => {
                        if (isPastUncompleted) {
                          toast.warning("Geçmişte kalan görev doğrudan tamamlanamaz. Lütfen 'Geç Tamamlandı' veya 'Bugüne Getir' aksiyonunu kullanın.")
                          return
                        }
                        handleToggleStatus(item)
                      }}
                      className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : isPastUncompleted
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-400 cursor-not-allowed opacity-60'
                          : 'border-muted-foreground/40 hover:border-primary'
                      }`}
                      title={
                        isPastUncompleted
                          ? "Geçmişteki görev doğrudan işaretlenemez. 'Geç Tamamlandı' veya 'Bugüne Getir' seçiniz."
                          : isCompleted
                          ? 'Tamamlanmadı olarak işaretle'
                          : 'Tamamla'
                      }
                    >
                      {isCompleted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : isPastUncompleted ? (
                        <span className="text-[10px] font-bold text-rose-400">✕</span>
                      ) : null}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold ${
                            isCompleted
                              ? 'line-through text-muted-foreground'
                              : isPastUncompleted
                              ? 'text-rose-200'
                              : 'text-foreground'
                          }`}
                        >
                          {item.title}
                        </span>

                        {isPastUncompleted && (
                          <Badge variant="outline" className="text-[10px] border-rose-500/40 bg-rose-500/10 text-rose-300">
                            Geçmişte Atlandı
                          </Badge>
                        )}

                        {item.is_late_completed && (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center gap-1">
                            <CheckCheck className="h-3 w-3" />
                            <span>Geç Tamamlandı</span>
                          </Badge>
                        )}

                        {item.plan_time && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                            {item.plan_time}
                          </span>
                        )}

                        {prj && (
                          <Link
                            href={`/projects/${prj.slug}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline bg-primary/10 px-2 py-0.5 rounded border border-primary/20 truncate max-w-[150px]"
                            title={prj.name}
                          >
                            <span>{prj.name}</span>
                          </Link>
                        )}
                      </div>

                      {/* Notes if completed */}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic line-clamp-1">
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right side: Duration + Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Duration badge */}
                    {item.duration_seconds > 0 ? (
                      <span className="text-xs font-mono font-semibold text-foreground bg-muted/50 px-2 py-1 rounded-md border border-border/40 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{formatMinutesHours(item.duration_seconds)}</span>
                      </span>
                    ) : null}

                    {/* If past uncompleted: Show "Geç Tamamlandı" and "Bugüne Getir" buttons */}
                    {isPastUncompleted ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handleLateComplete(item)}
                          className="h-8 px-2.5 text-xs font-semibold gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 shadow-xs"
                          title="Bu görev o gün tamamlandı ancak işaretlenmedi olarak kaydet (orijinal plan_date korunur)"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          <span>Geç Tamamlandı</span>
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handleMoveToToday(item)}
                          className="h-8 px-2.5 text-xs font-semibold gap-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 shadow-xs"
                          title="Bu görevi bugünün ajandasına aktar ve çalışmaya aç"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span>Bugüne Getir</span>
                        </Button>
                      </div>
                    ) : (
                      /* Start Timer Button (if not completed and not currently active) */
                      !isCompleted && !isItemActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startTimer(item, prj?.name)}
                          className="h-8 px-2.5 text-xs font-semibold gap-1 border-primary/25 text-primary hover:bg-primary/10"
                          title="Sayacı Başlat"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span className="hidden sm:inline">Başlat</span>
                        </Button>
                      )
                    )}

                    {isItemActive && (
                      <Badge variant="primary" className="text-[10px] px-2 py-0.5 animate-pulse">
                        Çalışılıyor
                      </Badge>
                    )}

                    {/* Move to Backlog button (if not past uncompleted and not completed) */}
                    {!isPastUncompleted && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleMoveToBacklog(item)}
                        className="p-1.5 rounded text-muted-foreground/60 hover:text-amber-400 transition-colors"
                        title="Tarihsiz Görev Havuzuna Gönder (Tarihi Kaldır)"
                      >
                        <Inbox className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Delete button: ONLY allow deleting if NOT past uncompleted */}
                    {!isPastUncompleted ? (
                      <button
                        type="button"
                        onClick={() => setItemToDelete(item)}
                        className="p-1.5 rounded text-muted-foreground/60 hover:text-destructive transition-colors"
                        title="Maddeyi Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div
                        className="p-1.5 text-muted-foreground/30 cursor-not-allowed"
                        title="Geçmişteki kayıtlar silinemez. Önce bugüne getirmelisiniz."
                      >
                        <Trash2 className="h-3.5 w-3.5 opacity-30" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {filteredDayItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center space-y-2">
                <CalendarCheck className="h-6 w-6 text-muted-foreground mx-auto" />
                <div className="text-sm font-semibold text-foreground">
                  Bu Gün İçin Madde Bulunmuyor
                </div>
                <div className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Yukarıdaki hızlı ekleme kutusundan günün odak işini yazabilir veya yeni bir madde başlatabilirsiniz.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Weekly Focus Distribution & Habit Metrics */}
        <div className="space-y-4">
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Bu Haftanın Odak Karnesi</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Pazartesi'den bugüne harcanan toplam çalışma eforu
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/40 p-3 rounded-lg border border-border/40">
                  <div className="text-[11px] text-muted-foreground">Toplam Süre</div>
                  <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {formatMinutesHours(weeklyStats.totalDuration)}
                  </div>
                </div>
                <div className="bg-muted/40 p-3 rounded-lg border border-border/40">
                  <div className="text-[11px] text-muted-foreground">Tamamlanan İşler</div>
                  <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {weeklyStats.completedCount} adet
                  </div>
                </div>
              </div>

              {/* Project breakdown bars */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="text-xs font-semibold text-foreground">
                  Projelere Göre Dağılım
                </div>

                {weeklyStats.projectBreakdown.length > 0 ? (
                  <div className="space-y-2.5">
                    {weeklyStats.projectBreakdown.map((item, idx) => {
                      const pct = weeklyStats.totalDuration > 0
                        ? Math.round((item.seconds / weeklyStats.totalDuration) * 100)
                        : 0

                      return (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-medium text-foreground truncate max-w-[160px]">
                              {item.name}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {formatMinutesHours(item.seconds)} (%{pct})
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/70 italic py-2">
                    Bu hafta henüz kayıtlı çalışma süresi yok.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )}

      {/* ========================================================================= */}
      {/* 📝 MODAL: YENİ AJANDA MADDESİ                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Ajanda Maddesi"
        description="Gününüzü planlamak ve odaklanmak için yeni bir görev veya seans açın."
      >
        <form onSubmit={handleModalAdd} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="modal-item-title" className="text-xs font-semibold text-muted-foreground">
              Madde / Görev Başlığı
            </label>
            <Input
              id="modal-item-title"
              required
              placeholder="Örn: Watchpath - API endpoint'lerinin yazımı"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
            <input
              type="checkbox"
              id="modal-item-undated"
              checked={modalIsUndated}
              onChange={(e) => setModalIsUndated(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
            />
            <label htmlFor="modal-item-undated" className="text-xs font-medium text-foreground cursor-pointer select-none">
              Tarih Belirtme (Tarihsiz Görev Havuzuna Ekle)
            </label>
          </div>

          {!modalIsUndated && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="modal-item-date" className="text-xs font-semibold text-muted-foreground">
                  Tarih
                </label>
                <Input
                  id="modal-item-date"
                  type="date"
                  required={!modalIsUndated}
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="modal-item-time" className="text-xs font-semibold text-muted-foreground">
                  Planlanan Saat (Opsiyonel)
                </label>
                <Input
                  id="modal-item-time"
                  type="time"
                  value={modalTime}
                  onChange={(e) => setModalTime(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="modal-item-project" className="text-xs font-semibold text-muted-foreground">
                Bağlı Proje (Opsiyonel)
              </label>
              <Select
                id="modal-item-project"
                value={modalProjectId}
                onChange={(e) => setModalProjectId(e.target.value)}
                className="text-xs"
              >
                <option value="">(Proje Bağlantısız / Genel)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="modal-timer-mode" className="text-xs font-semibold text-muted-foreground">
                Sayaç Türü
              </label>
              <Select
                id="modal-timer-mode"
                value={modalTimerMode}
                onChange={(e) => setModalTimerMode(e.target.value as TimerMode)}
                className="text-xs"
              >
                <option value="stopwatch">⏱️ Kronometre (Serbest)</option>
                <option value="pomodoro">🍅 Pomodoro (25 dk Blok)</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={modalSubmitting || !modalTitle.trim()}>
              {modalSubmitting ? 'Ekleniyor...' : 'Ajandaya Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 📅 MODAL: GÖREVİ TAKVİME PLANLA (BACKLOG -> DATED)                        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!schedulingItem}
        onClose={() => setSchedulingItem(null)}
        title="Görevi Takvime Planla"
        description={`"${schedulingItem?.title}" maddesini takvimde bir güne atayın.`}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="schedule-target-date" className="text-xs font-semibold text-muted-foreground">
              Plan Tarihi
            </label>
            <Input
              id="schedule-target-date"
              type="date"
              required
              value={scheduleTargetDate}
              onChange={(e) => setScheduleTargetDate(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (schedulingItem) handleScheduleItem(schedulingItem, todayStr)
              }}
              className="text-xs gap-1.5 text-primary border-primary/25 hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Bugüne Planla ({todayStr})</span>
            </Button>

            <div className="flex items-center gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setSchedulingItem(null)}>
                İptal
              </Button>
              <Button
                size="sm"
                disabled={!scheduleTargetDate}
                onClick={() => {
                  if (schedulingItem && scheduleTargetDate) {
                    handleScheduleItem(schedulingItem, scheduleTargetDate)
                  }
                }}
                className="text-xs font-semibold bg-primary text-primary-foreground"
              >
                Tarihe Ata
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 🏆 MODAL: SEANSI TAMAMLA & NOT EKLE                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Odak Seansını Tamamla"
        description="Harcanan çalışma süresi projeye ve ajandaya kalıcı olarak işlenecektir."
      >
        <div className="space-y-4">
          <div className="p-3 bg-muted/40 rounded-lg border border-border/40 space-y-1 text-xs">
            <div className="text-muted-foreground">Tamamlanan İş:</div>
            <div className="font-semibold text-foreground text-sm">{activeTimer?.itemTitle}</div>
            <div className="font-mono text-primary font-bold pt-1">
              Harcanan Süre: {formatMinutesHours(elapsedSeconds)}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="complete-notes" className="text-xs font-semibold text-muted-foreground">
              Seans Notu (Opsiyonel)
            </label>
            <Input
              id="complete-notes"
              placeholder="Neler yapıldı? (Örn: Auth endpoint'leri test edildi)"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCompleteModalOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={handleCompleteActiveTimer} className="bg-primary text-primary-foreground font-semibold">
              Kaydet ve Tamamla
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteItem}
        title="Maddeyi Sil"
        description={`"${itemToDelete?.title}" ajanda maddesini silmek istediğinizden emin misiniz?`}
        confirmLabel="Sil"
        variant="destructive"
      />
    </div>
  )
}

export default function AgendaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Ajanda yükleniyor...
        </div>
      }
    >
      <AgendaContent />
    </Suspense>
  )
}
