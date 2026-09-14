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

  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()))
  const [items, setItems] = useState<AgendaItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
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
      const [{ data: itemsData }, { data: projectsData }] = await Promise.all([
        supabase
          .from('agenda_items')
          .select('*')
          .order('plan_time', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase.from('projects').select('*').order('name'),
      ])

      if (itemsData) setItems(itemsData)
      if (projectsData) setProjects(projectsData)
    } catch (err: any) {
      console.error('Error loading agenda data:', err)
      toast.error('Ajanda verileri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  // Quick Add handler
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return

    setQuickSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('agenda_items')
        .insert({
          user_id: user.id,
          title: quickTitle.trim(),
          plan_date: selectedDate,
          plan_time: quickTime.trim() || null,
          project_id: quickProjectId || null,
          status: 'planned',
          timer_mode: 'stopwatch',
          duration_seconds: 0,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setItems((prev) => [...prev, data])
        setQuickTitle('')
        setQuickTime('')
        setQuickProjectId('')
        toast.success('Ajandaya eklendi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Madde eklenemedi')
    } finally {
      setQuickSubmitting(false)
    }
  }

  // Modal Add handler
  const handleModalAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalTitle.trim()) return

    setModalSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('agenda_items')
        .insert({
          user_id: user.id,
          title: modalTitle.trim(),
          plan_date: modalDate,
          plan_time: modalTime.trim() || null,
          project_id: modalProjectId || null,
          status: 'planned',
          timer_mode: modalTimerMode,
          pomodoro_target_minutes: modalTimerMode === 'pomodoro' ? 25 : null,
          duration_seconds: 0,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setItems((prev) => [...prev, data])
        setIsModalOpen(false)
        setModalTitle('')
        setModalTime('')
        setModalProjectId('')
        toast.success('Yeni ajanda maddesi oluşturuldu!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Madde oluşturulamadı')
    } finally {
      setModalSubmitting(false)
    }
  }

  // Toggle item status (completed <-> planned)
  const handleToggleStatus = async (item: AgendaItem) => {
    const nextStatus: AgendaItem['status'] = item.status === 'completed' ? 'planned' : 'completed'
    const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('agenda_items')
        .update({ status: nextStatus, completed_at: completedAt })
        .eq('id', item.id)

      if (error) throw error

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus, completed_at: completedAt } : i))
      )

      if (nextStatus === 'completed') {
        toast.success(`"${item.title}" tamamlandı olarak işaretlendi!`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  // Delete item
  const handleDeleteItem = async () => {
    if (!itemToDelete) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('agenda_items').delete().eq('id', itemToDelete.id)
      if (error) throw error

      setItems((prev) => prev.filter((i) => i.id !== itemToDelete.id))
      if (activeTimer?.itemId === itemToDelete.id) {
        discardTimer()
      }
      toast.success('Ajanda maddesi silindi')
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    } finally {
      setItemToDelete(null)
    }
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

        {/* Current Selected Date Label & Date Picker */}
        <div className="flex items-center gap-2.5">
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

          {/* Items List */}
          <div className="space-y-2">
            {filteredDayItems.map((item) => {
              const prj = getProject(item.project_id)
              const isItemActive = activeTimer?.itemId === item.id
              const isCompleted = item.status === 'completed'

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isItemActive
                      ? 'border-purple-500/60 bg-purple-500/10 shadow-sm'
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
                          className={`text-sm font-semibold text-foreground ${
                            isCompleted ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {item.title}
                        </span>

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

                    {/* Start Timer Button (if not completed and not currently active) */}
                    {!isCompleted && !isItemActive && (
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
                    )}

                    {isItemActive && (
                      <Badge variant="purple" className="text-[10px] px-2 py-0.5 animate-pulse">
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
