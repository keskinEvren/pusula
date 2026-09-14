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
import { useTimer, formatMinutesHours, type TimerMode } from '@/lib/timer-context'
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

  const [viewMode, setViewMode] = useState<'daily' | 'calendar'>('daily')
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()))
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()) // 0 - 11

  const [items, setItems] = useState<AgendaItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isDbFallback, setIsDbFallback] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'planned' | 'completed'>('all')

  // Quick inline add state
  const [quickTitle, setQuickTitle] = useState('')
  const [quickProjectId, setQuickProjectId] = useState('')
  const [quickTime, setQuickTime] = useState('')
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  // Full Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalDate, setModalDate] = useState(() => toLocalDateString(new Date()))
  const [modalTime, setModalTime] = useState('')
  const [modalProjectId, setModalProjectId] = useState('')
  const [modalTimerMode, setModalTimerMode] = useState<TimerMode>('stopwatch')
  const [modalSubmitting, setModalSubmitting] = useState(false)

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

      if (itemsError) {
        console.warn('agenda_items remote notice (fallback to local):', itemsError.message)
        setIsDbFallback(true)
        const cached = localStorage.getItem('pusula_local_agenda_items')
        if (cached) {
          try {
            setItems(JSON.parse(cached))
          } catch {
            setItems([])
          }
        } else {
          // Starter mock task for instant usability
          const sampleItem: AgendaItem = {
            id: 'local-' + Date.now(),
            user_id: 'local',
            title: 'Bugünün Öncelikli Görevini Tamamla',
            plan_date: toLocalDateString(new Date()),
            plan_time: '10:00',
            project_id: null,
            status: 'planned',
            timer_mode: 'stopwatch',
            pomodoro_target_minutes: 25,
            duration_seconds: 0,
            notes: null,
            completed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setItems([sampleItem])
          localStorage.setItem('pusula_local_agenda_items', JSON.stringify([sampleItem]))
        }
      } else if (itemsData) {
        setIsDbFallback(false)
        setItems(itemsData)
        localStorage.setItem('pusula_local_agenda_items', JSON.stringify(itemsData))
      }

      if (projectsData) setProjects(projectsData)
    } catch (err: any) {
      console.warn('Error loading agenda data:', err)
      setIsDbFallback(true)
      const cached = localStorage.getItem('pusula_local_agenda_items')
      if (cached) {
        try {
          setItems(JSON.parse(cached))
        } catch {}
      }
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
    const newItem: AgendaItem = {
      id: localId,
      user_id: 'local',
      title: quickTitle.trim(),
      plan_date: selectedDate,
      plan_time: quickTime.trim() || null,
      project_id: quickProjectId || null,
      status: 'planned',
      timer_mode: 'stopwatch',
      pomodoro_target_minutes: 25,
      duration_seconds: 0,
      notes: null,
      completed_at: null,
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

        const { data, error } = await supabase
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
          })
          .select()
          .single()

        if (error) {
          console.warn('Supabase insert notice, using local cache:', error.message)
          setIsDbFallback(true)
          syncLocal([...items, newItem])
        } else if (data) {
          syncLocal([...items, data])
        }
      } else {
        syncLocal([...items, newItem])
      }

      setQuickTitle('')
      setQuickTime('')
      setQuickProjectId('')
      toast.success('Ajandaya eklendi!')
    } catch {
      syncLocal([...items, newItem])
      setQuickTitle('')
      setQuickTime('')
      setQuickProjectId('')
      toast.success('Ajandaya eklendi!')
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
    const newItem: AgendaItem = {
      id: localId,
      user_id: 'local',
      title: modalTitle.trim(),
      plan_date: modalDate,
      plan_time: modalTime.trim() || null,
      project_id: modalProjectId || null,
      status: 'planned',
      timer_mode: modalTimerMode,
      pomodoro_target_minutes: modalTimerMode === 'pomodoro' ? 25 : null,
      duration_seconds: 0,
      notes: null,
      completed_at: null,
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

        const { data, error } = await supabase
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
          })
          .select()
          .single()

        if (error) {
          console.warn('Supabase modal insert notice, using local cache:', error.message)
          setIsDbFallback(true)
          syncLocal([...items, newItem])
        } else if (data) {
          syncLocal([...items, data])
        }
      } else {
        syncLocal([...items, newItem])
      }

      setIsModalOpen(false)
      setModalTitle('')
      setModalTime('')
      setModalProjectId('')
      toast.success('Yeni ajanda maddesi oluşturuldu!')
    } catch {
      syncLocal([...items, newItem])
      setIsModalOpen(false)
      setModalTitle('')
      setModalTime('')
      setModalProjectId('')
      toast.success('Yeni ajanda maddesi oluşturuldu!')
    } finally {
      setModalSubmitting(false)
    }
  }

  // Toggle item status (completed <-> planned)
  const handleToggleStatus = async (item: AgendaItem) => {
    const nextStatus: AgendaItem['status'] = item.status === 'completed' ? 'planned' : 'completed'
    const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null

    const updated = items.map((i) => (i.id === item.id ? { ...i, status: nextStatus, completed_at: completedAt } : i))
    syncLocal(updated)

    if (nextStatus === 'completed') {
      toast.success(`"${item.title}" tamamlandı!`)
    }

    if (!isDbFallback) {
      try {
        const supabase = createClient()
        await supabase
          .from('agenda_items')
          .update({ status: nextStatus, completed_at: completedAt })
          .eq('id', item.id)
      } catch (err) {
        console.warn('Status update db notice:', err)
      }
    }
  }

  // Delete item
  const handleDeleteItem = async () => {
    if (!itemToDelete) return
    const id = itemToDelete.id
    const updated = items.filter((i) => i.id !== id)
    syncLocal(updated)
    if (activeTimer?.itemId === id) {
      discardTimer()
    }
    toast.success('Ajanda maddesi silindi')
    setItemToDelete(null)

    if (!isDbFallback) {
      try {
        const supabase = createClient()
        await supabase.from('agenda_items').delete().eq('id', id)
      } catch (err) {
        console.warn('Delete db notice:', err)
      }
    }
  }

  // Move single item to today (Carry-over)
  const handleMoveToToday = async (item: AgendaItem) => {
    const updated = items.map((i) => (i.id === item.id ? { ...i, plan_date: todayStr } : i))
    syncLocal(updated)
    toast.success(`✨ "${item.title}" bugünün ajandasına aktarıldı!`)

    if (!isDbFallback) {
      try {
        const supabase = createClient()
        await supabase.from('agenda_items').update({ plan_date: todayStr }).eq('id', item.id)
      } catch (err) {
        console.warn('Move to today db notice:', err)
      }
    }
  }

  // Move all uncompleted items of a past day to today
  const handleMoveAllToToday = async (uncompletedItems: AgendaItem[]) => {
    const uncompletedIds = new Set(uncompletedItems.map((i) => i.id))
    const updated = items.map((i) => (uncompletedIds.has(i.id) ? { ...i, plan_date: todayStr } : i))
    syncLocal(updated)
    toast.success(`✨ ${uncompletedItems.length} görev bugünün ajandasına aktarıldı!`)

    if (!isDbFallback) {
      try {
        const supabase = createClient()
        for (const it of uncompletedItems) {
          await supabase.from('agenda_items').update({ plan_date: todayStr }).eq('id', it.id)
        }
      } catch (err) {
        console.warn('Move all to today db notice:', err)
      }
    }
    // Switch view to today
    setSelectedDate(todayStr)
  }

  // Handle Complete Active Timer
  const handleCompleteActiveTimer = async () => {
    await completeTimer(completionNotes.trim() || undefined)
    setIsCompleteModalOpen(false)
    setCompletionNotes('')
    loadData()
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

    const weekItems = items.filter((i) => i.plan_date >= mondayStr)
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
      const list = map.get(item.plan_date) || []
      list.push(item)
      map.set(item.plan_date, list)
    })
    return map
  }, [items])

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
              setModalDate(selectedDate)
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
        <Card className="border-purple-500/40 bg-gradient-to-br from-purple-950/30 via-card to-card shadow-lg shadow-purple-950/20 overflow-hidden relative">
          <div className="absolute -right-12 -top-12 h-40 w-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="purple"
                    className="text-[11px] px-2 py-0.5 flex items-center gap-1.5"
                  >
                    <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-purple-400 animate-ping' : 'bg-amber-400'}`} />
                    <span>{isRunning ? 'Odak Seansı Aktif' : 'Sayaç Duraklatıldı'}</span>
                  </Badge>

                  {activeTimer.projectName && (
                    <Badge variant="outline" className="text-[11px] border-purple-500/30 text-purple-300">
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
                          ? 'bg-purple-600 text-white shadow-xs'
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
                          ? 'bg-purple-600 text-white shadow-xs'
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
                          ? 'bg-purple-600 text-white shadow-xs'
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
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Günlük Tezgâh</span>
            {dayItems.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewMode === 'daily' ? 'bg-purple-800 text-white' : 'bg-muted text-muted-foreground'
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
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Aylık Takvim</span>
            {items.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewMode === 'calendar' ? 'bg-purple-800 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {items.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-2">
              <span>Seçili Gün:</span>
              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300 font-mono">
                {selectedDate}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">İpucu: Günlere tıklayarak doğrudan tezgâha geçebilirsiniz</span>
              <button
                type="button"
                onClick={() => setViewMode('daily')}
                className="font-mono text-purple-400 hover:underline flex items-center gap-1 font-semibold"
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
                  <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-lg font-mono">
                    <Clock className="h-3 w-3 text-purple-400" />
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
                      isSelected ? 'shadow-md shadow-purple-950/40 border-purple-500 ring-1 ring-purple-500' : ''
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
                        <span className="font-mono text-purple-300 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5 text-purple-400 shrink-0" />
                          {formatMinutesHours(cell.totalDurationSeconds)}
                        </span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 flex items-center gap-0.5">
                          Aç <ExternalLink className="h-2.5 w-2.5" />
                        </span>
                      )}

                      <span className="opacity-0 group-hover:opacity-100 transition-opacity font-sans text-purple-400 text-[10px] hidden sm:inline">
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
                <Sparkles className="h-3 w-3 text-purple-400 shrink-0" />
                <span>Herhangi bir güne tıklayarak o günün tezgâhına anında geçebilirsiniz.</span>
              </div>
            </div>
          </CardContent>
        </Card>
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
                className="h-7 px-2.5 text-xs gap-1.5 border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
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
            placeholder="Bugün neye odaklanacaksın? (Örn: Watchpath auth mimarisi, Sunucu faturasını öde...)"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
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
            <option value="">(Proje Bağlantısız / Genel)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Input
            type="time"
            value={quickTime}
            onChange={(e) => setQuickTime(e.target.value)}
            className="h-9 text-xs w-24 shrink-0 font-mono bg-card"
            title="Saat (Opsiyonel)"
          />

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
                    Geçmiş görevler doğrudan tamamlanamaz veya silinemez; üzerinde çalışmak için bugünün ajandasına aktarmalısınız.
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
              const isPastUncompleted = item.plan_date < todayStr && !isCompleted

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isItemActive
                      ? 'border-purple-500/60 bg-purple-500/10 shadow-sm'
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
                          toast.warning("Geçmişte kalan görev doğrudan tamamlanamaz. Lütfen önce 'Bugüne Getir' butonuna basın.")
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
                          ? "Geçmişteki görev doğrudan tamamlanamaz. Önce 'Bugüne Getir' demelisiniz."
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

                        {item.plan_time && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                            {item.plan_time}
                          </span>
                        )}

                        {prj && (
                          <Link
                            href={`/projects/${prj.slug}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:underline bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 truncate max-w-[150px]"
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

                    {/* If past uncompleted: Show "Bugüne Getir" button */}
                    {isPastUncompleted ? (
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => handleMoveToToday(item)}
                        className="h-8 px-3 text-xs font-semibold gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 shadow-xs"
                        title="Bu görevi bugünün ajandasına aktar ve çalışmaya aç"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span>Bugüne Getir</span>
                      </Button>
                    ) : (
                      /* Start Timer Button (if not completed and not currently active) */
                      !isCompleted && !isItemActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startTimer(item, prj?.name)}
                          className="h-8 px-2.5 text-xs font-semibold gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          title="Sayacı Başlat"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span className="hidden sm:inline">Başlat</span>
                        </Button>
                      )
                    )}

                    {isItemActive && (
                      <Badge variant="purple" className="text-[10px] px-2 py-0.5 animate-pulse">
                        Çalışılıyor
                      </Badge>
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
                <BarChart3 className="h-4 w-4 text-purple-400" />
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
                              className="h-full bg-purple-500 rounded-full"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="modal-item-date" className="text-xs font-semibold text-muted-foreground">
                Tarih
              </label>
              <Input
                id="modal-item-date"
                type="date"
                required
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
            <div className="font-mono text-purple-400 font-bold pt-1">
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
