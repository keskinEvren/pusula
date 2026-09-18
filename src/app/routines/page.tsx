'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Orbit,
  Plus,
  Sparkles,
  Flame,
  Battery,
  BatteryCharging,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Compass,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  SunMedium,
  Check,
  X,
  Target,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { requireMutationData } from '@/lib/supabase/mutation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import { isUUID } from '@/lib/utils'
import type { Routine, RoutineLog, Dream } from '@/types/database'
import {
  TimeBlock,
  TIME_BLOCK_META,
  getCurrentTimeBlock,
  filterRoutinesByTimeBlock,
  calculateStreak,
  calculateDailyCompletion,
  generateWeeklyDaySummaries,
  generateMonthCalendar,
  generateConstellationGraph,
  formatDateToYmd,
  parseYmdToDate,
  addDays,
} from '@/lib/routines-engine'

const STORAGE_KEY_ROUTINES = 'pusula_local_routines'
const STORAGE_KEY_LOGS = 'pusula_local_routine_logs'

function RoutinesPageContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const todayStr = formatDateToYmd(new Date())

  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineLogs, setRoutineLogs] = useState<RoutineLog[]>([])
  const [dreams, setDreams] = useState<Dream[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Düşük Pil Modu (Minimum Etkili Doz Toggle)
  const [isLowBattery, setIsLowBattery] = useState(false)

  // Aylık takvim navigasyonu (Yıl ve Ay)
  const [calendarMonthDate, setCalendarMonthDate] = useState(new Date())

  // Mobil takımyıldızı / takvim aç/kapa
  const [showConstellationOnMobile, setShowConstellationOnMobile] = useState(false)

  // Modal Durumları
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [routineToDelete, setRoutineToDelete] = useState<{ id: string; title: string } | null>(null)

  // Zen / Odak Sayacı Modalı
  const [isTimerOpen, setIsTimerOpen] = useState(false)
  const [activeTimerRoutine, setActiveTimerRoutine] = useState<Routine | null>(null)
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(25 * 60)
  const [isTimerRunning, setIsTimerRunning] = useState(false)

  // Not Ekleme Popover / Modalı
  const [noteRoutine, setNoteRoutine] = useState<Routine | null>(null)
  const [noteInput, setNoteInput] = useState('')

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    icon: '☀️',
    time_block: 'morning' as TimeBlock,
    frequency: 'daily',
    target_duration_minutes: 15,
    minimum_effective_dose: '',
    dream_id: '',
    identity_persona: '',
  })

  // Timer Interval Ref
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 1. Veri Yükleme (Supabase + Otomatik Yerel-Bulut Senkronizasyonu)
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    try {
      // Rutinleri çek
      const { data: dbRoutines, error: rError } = await supabase
        .from('routines')
        .select('*')
        .order('order_index', { ascending: true })

      if (!rError && dbRoutines && dbRoutines.length > 0) {
        // DB'de doğrulanmış rutinler var — doğrudan kullan
        const validData = dbRoutines.filter((r: any) => !r.id?.startsWith?.('sample-'))
        setRoutines(validData as Routine[])
        localStorage.setItem(STORAGE_KEY_ROUTINES, JSON.stringify(validData))
      } else if (!rError && user) {
        // DB henüz boş. Eğer kullanıcının daha önceden yerelde eklediği gerçek (sample olmayan) rutinler varsa aktar
        const localRoutinesStr = localStorage.getItem(STORAGE_KEY_ROUTINES)
        let realLocalRoutines: Routine[] = []
        if (localRoutinesStr) {
          try {
            const parsed = JSON.parse(localRoutinesStr) as Routine[]
            if (Array.isArray(parsed)) {
              realLocalRoutines = parsed.filter((r) => !r.id?.startsWith?.('sample-'))
            }
          } catch {}
        }

        if (realLocalRoutines.length > 0) {
          // Gerçek yerel rutinleri user.id ile Supabase'e aktar
          const seedPayload = realLocalRoutines.map((item, idx) => ({
            user_id: user.id,
            title: item.title,
            icon: item.icon || '✨',
            time_block: item.time_block || 'morning',
            frequency: item.frequency || 'daily',
            target_days: Array.isArray(item.target_days) ? item.target_days : [1, 2, 3, 4, 5, 6, 7],
            target_duration_minutes: Number(item.target_duration_minutes) || 15,
            minimum_effective_dose: item.minimum_effective_dose || null,
            dream_id: isUUID(item.dream_id) ? item.dream_id : null,
            identity_persona: item.identity_persona || null,
            is_active: item.is_active ?? true,
            order_index: idx,
          }))

          try {
            const { data: seededData, error: seedErr } = await supabase
              .from('routines')
              .insert(seedPayload)
              .select()

            if (!seedErr && seededData && seededData.length > 0) {
              setRoutines(seededData as Routine[])
              localStorage.setItem(STORAGE_KEY_ROUTINES, JSON.stringify(seededData))
            } else {
              if (seedErr) toast.error(seedErr.message || 'Yerel rutinler buluta aktarılamadı.')
              setRoutines(realLocalRoutines)
            }
          } catch {
            setRoutines(realLocalRoutines)
          }
        } else {
          // Sıfır kullanıcı: Hiç rutin yok, temiz başla
          setRoutines([])
          localStorage.setItem(STORAGE_KEY_ROUTINES, JSON.stringify([]))
        }
      } else {
        // Giriş yapılmamış veya DB hatası — localStorage fallback
        const localRoutinesStr = localStorage.getItem(STORAGE_KEY_ROUTINES)
        if (localRoutinesStr) {
          try {
            const parsed = JSON.parse(localRoutinesStr)
            const cleaned = Array.isArray(parsed) ? parsed.filter((r: any) => !r.id?.startsWith?.('sample-')) : []
            setRoutines(cleaned)
          } catch {
            setRoutines([])
          }
        } else {
          setRoutines([])
        }
      }

      // Logları çek
      const { data: dbLogs } = await supabase.from('routine_logs').select('*')
      if (dbLogs && dbLogs.length > 0) {
        setRoutineLogs(dbLogs as RoutineLog[])
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(dbLogs))
      } else {
        const localLogsStr = localStorage.getItem(STORAGE_KEY_LOGS)
        if (localLogsStr) {
          try {
            setRoutineLogs(JSON.parse(localLogsStr))
          } catch {
            setRoutineLogs([])
          }
        }
      }

      // Hayaller tablosundan kimlik ve hedefleri al (bağlantı için)
      const { data: dbDreams } = await supabase.from('dreams').select('*')
      if (dbDreams) {
        setDreams(dbDreams as Dream[])
      } else {
        const localDreams = localStorage.getItem('pusula_local_dreams')
        if (localDreams) {
          try {
            setDreams(JSON.parse(localDreams))
          } catch {}
        }
      }
    } catch (err) {
      console.error('Routines load error:', err)
      const localRoutinesStr = localStorage.getItem(STORAGE_KEY_ROUTINES)
      if (localRoutinesStr) {
        try {
          const parsed = JSON.parse(localRoutinesStr)
          setRoutines(Array.isArray(parsed) ? parsed.filter((r: any) => !r.id?.startsWith?.('sample-')) : [])
        } catch {
          setRoutines([])
        }
      } else {
        setRoutines([])
      }
      const localLogsStr = localStorage.getItem(STORAGE_KEY_LOGS)
      if (localLogsStr) setRoutineLogs(JSON.parse(localLogsStr))
    } finally {
      setIsLoading(false)
    }
  }

  // URL'de ?new=true varsa otomatik modal aç
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      handleOpenCreateModal()
    }
  }, [searchParams])

  // Timer Tick Mantığı
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current!)
            setIsTimerRunning(false)
            // Otomatik tamamla
            if (activeTimerRoutine) {
              handleToggleRoutine(activeTimerRoutine.id)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isTimerRunning, activeTimerRoutine])

  // LocalStorage senkronizasyonu
  function saveRoutinesToLocal(updated: Routine[]) {
    setRoutines(updated)
    localStorage.setItem(STORAGE_KEY_ROUTINES, JSON.stringify(updated))
  }

  function saveLogsToLocal(updated: RoutineLog[]) {
    setRoutineLogs(updated)
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated))
  }

  // -------------------------------------------------------------------------
  // Rutin Tamamlama / Geri Alma (Optimistic Toggle)
  // -------------------------------------------------------------------------
  async function handleToggleRoutine(routineId: string, customStatus?: 'completed' | 'micro_dose') {
    const statusToSet = customStatus || (isLowBattery ? 'micro_dose' : 'completed')
    const existingLog = routineLogs.find(
      (l) => l.routine_id === routineId && l.log_date === selectedDate
    )

    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (existingLog) {
        if (user && isUUID(existingLog.id)) {
          requireMutationData(
            await supabase.from('routine_logs').delete().eq('id', existingLog.id).select('id').single(),
            'Rutin kaydının silindiği doğrulanamadı.'
          )
        }
        saveLogsToLocal(routineLogs.filter((l) => l.id !== existingLog.id))
        return
      }

      const newLog: RoutineLog = {
        id: crypto.randomUUID(),
        user_id: user?.id || 'local',
        routine_id: routineId,
        log_date: selectedDate,
        status: statusToSet,
        note: null,
        duration_minutes: 0,
        completed_at: new Date().toISOString(),
      }

      if (user) {
        const saved = requireMutationData(
          await supabase.from('routine_logs').insert([newLog]).select('*').single(),
          'Rutin tamamlaması backend tarafından doğrulanamadı.'
        )
        saveLogsToLocal([saved, ...routineLogs])
      } else {
        saveLogsToLocal([newLog, ...routineLogs])
      }
    } catch (err: any) {
      toast.error(err.message || 'Rutin durumu güncellenemedi.')
    }
  }

  // -------------------------------------------------------------------------
  // Not Kaydetme
  // -------------------------------------------------------------------------
  async function handleSaveNote() {
    if (!noteRoutine) return
    const log = routineLogs.find(
      (l) => l.routine_id === noteRoutine.id && l.log_date === selectedDate
    )

    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (log) {
        if (user && isUUID(log.id)) {
          requireMutationData(
            await supabase.from('routine_logs').update({ note: noteInput }).eq('id', log.id).select('id').single(),
            'Rutin notu backend tarafından doğrulanamadı.'
          )
        }
        saveLogsToLocal(routineLogs.map((l) => l.id === log.id ? { ...l, note: noteInput } : l))
      } else {
      const newLog: RoutineLog = {
        id: crypto.randomUUID(),
        user_id: user?.id || 'local',
        routine_id: noteRoutine.id,
        log_date: selectedDate,
        status: isLowBattery ? 'micro_dose' : 'completed',
        note: noteInput,
        duration_minutes: 0,
        completed_at: new Date().toISOString(),
      }
        if (user) {
          const saved = requireMutationData(
            await supabase.from('routine_logs').insert([newLog]).select('*').single(),
            'Rutin notu backend tarafından doğrulanamadı.'
          )
          saveLogsToLocal([saved, ...routineLogs])
        } else {
          saveLogsToLocal([newLog, ...routineLogs])
        }
      }
      setNoteRoutine(null)
      setNoteInput('')
    } catch (err: any) {
      toast.error(err.message || 'Rutin notu kaydedilemedi.')
    }
  }

  // -------------------------------------------------------------------------
  // Form / CRUD
  // -------------------------------------------------------------------------
  function handleOpenCreateModal() {
    setEditingRoutine(null)
    setFormData({
      title: '',
      icon: '☀️',
      time_block: getCurrentTimeBlock(),
      frequency: 'daily',
      target_duration_minutes: 15,
      minimum_effective_dose: '',
      dream_id: '',
      identity_persona: '',
    })
    setIsFormOpen(true)
  }

  function handleOpenEditModal(r: Routine) {
    setEditingRoutine(r)
    setFormData({
      title: r.title,
      icon: r.icon,
      time_block: r.time_block as TimeBlock,
      frequency: r.frequency,
      target_duration_minutes: r.target_duration_minutes || 15,
      minimum_effective_dose: r.minimum_effective_dose || '',
      dream_id: r.dream_id || '',
      identity_persona: r.identity_persona || '',
    })
    setIsFormOpen(true)
  }

  async function handleSaveRoutine(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.title.trim()) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast.error('Buluta kaydedilemedi: Oturum açık değil! Lütfen önce giriş yapın.')
      // Çevrimdışı/oturumsuz yerel fallback
      const localId = editingRoutine ? editingRoutine.id : `local-${Date.now()}`
      const localItem: Routine = {
        id: localId,
        user_id: 'local',
        title: formData.title.trim(),
        icon: formData.icon || '✨',
        time_block: formData.time_block,
        frequency: formData.frequency as any,
        target_days: [1, 2, 3, 4, 5, 6, 7],
        target_duration_minutes: Number(formData.target_duration_minutes) || 15,
        minimum_effective_dose: formData.minimum_effective_dose || null,
        dream_id: null,
        identity_persona: formData.identity_persona || null,
        is_active: true,
        order_index: routines.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const updatedList = editingRoutine
        ? routines.map((r) => (r.id === editingRoutine.id ? localItem : r))
        : [...routines, localItem]
      saveRoutinesToLocal(updatedList)
      setIsFormOpen(false)
      setEditingRoutine(null)
      return
    }

    // Kullanıcı oturumu açık — Supabase için temiz payload
    const routinePayload = {
      user_id: user.id,
      title: formData.title.trim(),
      icon: formData.icon || '✨',
      time_block: formData.time_block,
      frequency: formData.frequency as any,
      target_days: editingRoutine?.target_days || [1, 2, 3, 4, 5, 6, 7],
      target_duration_minutes: Number(formData.target_duration_minutes) || 15,
      minimum_effective_dose: formData.minimum_effective_dose || null,
      dream_id: isUUID(formData.dream_id) ? formData.dream_id : null,
      identity_persona: formData.identity_persona || null,
      is_active: editingRoutine?.is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingRoutine && isUUID(editingRoutine.id)) {
        // Mevcut UUID'li rutini güncelle
        const { data: updData, error: updErr } = await supabase
          .from('routines')
          .update(routinePayload)
          .eq('id', editingRoutine.id)
          .select('*')
          .single()

        if (updErr) throw updErr
        if (!updData) throw new Error('Rutin güncellemesi backend tarafından doğrulanamadı.')
        const updatedList = routines.map((r) => (r.id === editingRoutine.id ? updData as Routine : r))
        saveRoutinesToLocal(updatedList)
        toast.success('Rutin başarıyla güncellendi ve buluta kaydedildi!')
        setIsFormOpen(false)
        setEditingRoutine(null)
        return
      }

      // Yeni rutin ekle veya sample-id'den kalıcı UUID ile veritabanına kaydet
      const { data: insData, error: insErr } = await supabase
        .from('routines')
        .insert([{
          ...routinePayload,
          order_index: editingRoutine?.order_index ?? routines.length,
          created_at: new Date().toISOString(),
        }])
        .select('*')
        .single()

      if (insErr) {
        console.error('Supabase save routine error:', insErr)
        toast.error(`Buluta kaydedilemedi: ${insErr.message}`)
        return
      }

      if (insData) {
        const savedRoutine = insData as Routine
        const updatedList = editingRoutine
          ? routines.map((r) => (r.id === editingRoutine.id ? savedRoutine : r))
          : [...routines, savedRoutine]
        saveRoutinesToLocal(updatedList)
        toast.success(editingRoutine ? 'Rutin başarıyla güncellendi ve buluta kaydedildi!' : 'Yeni rutin başarıyla eklendi ve buluta kaydedildi!')
        setIsFormOpen(false)
        setEditingRoutine(null)
      }
    } catch (err: any) {
      console.error('Save routine catch error:', err)
      toast.error(`Bağlantı hatası: ${err?.message || 'Bilinmeyen hata'}`)
    }
  }

  async function confirmDeleteRoutine() {
    if (!routineToDelete) return
    const routineId = routineToDelete.id

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (isUUID(routineId) && user) {
      try {
        const { data, error } = await supabase.from('routines').delete().eq('id', routineId).select('id').single()
        if (error) {
          console.error('Delete routine error:', error)
          toast.error(`Sunucudan silinemedi: ${error.message}`)
          return
        }
        if (!data) {
          toast.error('Rutin silme işlemi backend tarafından doğrulanamadı.')
          return
        }
      } catch (err) {
        console.error('Delete routine error:', err)
        toast.error('Sunucu bağlantı hatası. Rutin yerel olarak kaldırıldı.')
        return
      }
    }

    const updated = routines.filter((r) => r.id !== routineId)
    saveRoutinesToLocal(updated)
    toast.success('Rutin silindi.')
    setRoutineToDelete(null)
  }



  // -------------------------------------------------------------------------
  // Timer Başlatma
  // -------------------------------------------------------------------------
  function handleStartTimer(routine: Routine) {
    setActiveTimerRoutine(routine)
    setTimerSecondsLeft((routine.target_duration_minutes || 25) * 60)
    setIsTimerRunning(true)
    setIsTimerOpen(true)
  }

  // -------------------------------------------------------------------------
  // Veri ve Metrik Hesaplamaları
  // -------------------------------------------------------------------------
  const dailyCompletion = calculateDailyCompletion(routines, routineLogs, selectedDate)
  const weeklyDays = generateWeeklyDaySummaries(selectedDate, routines, routineLogs)
  const constellationGraph = generateConstellationGraph(routines, routineLogs, selectedDate)

  // Aylık takvim
  const calYear = calendarMonthDate.getFullYear()
  const calMonth = calendarMonthDate.getMonth()
  const monthCalendarDays = generateMonthCalendar(calYear, calMonth, routines, routineLogs)
  const monthName = calendarMonthDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  const timeBlocks: TimeBlock[] = ['morning', 'afternoon', 'evening', 'night']

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Rutinler yükleniyor">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted/60 rounded" />
        </div>
        <div className="h-20 bg-card border border-border rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="h-24 bg-card border border-border rounded-xl" />
            <div className="h-64 bg-card border border-border rounded-xl" />
          </div>
          <div className="lg:col-span-5 space-y-4">
            <div className="h-80 bg-card border border-border rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık & Kontroller */}
      <PageHeader
        title="Rutinler & Alışkanlıklar"
        description="Günlük alışkanlıklarınızı takip edin, tutarlılık zincirini koruyun ve aylık ritminizi inceleyin."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Düşük Pil Modu Anahtarı */}
            <button
              type="button"
              onClick={() => setIsLowBattery(!isLowBattery)}
              role="switch"
              aria-checked={isLowBattery}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all min-h-[36px] ${
                isLowBattery
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
              title="Enerjinizin düşük olduğu günlerde rutinleri 2 dakikalık mikro versiyonuna çevirir."
            >
              {isLowBattery ? (
                <BatteryCharging className="h-4 w-4 text-amber-400" />
              ) : (
                <Battery className="h-4 w-4" />
              )}
              <span>{isLowBattery ? 'Düşük Enerji Modu Aktif' : 'Düşük Enerji Modu'}</span>
            </button>

            {/* Yeni Rutin Ekle Butonu */}
            <Button onClick={handleOpenCreateModal} className="gap-2 min-h-[36px]">
              <Plus className="h-4 w-4" />
              <span>Yeni Rutin</span>
            </Button>
          </div>
        }
      />

      {/* 2. Haftalık Gün Şeridi (Weekly Day Strip) */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 pr-2 border-r border-border/50">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span className="font-medium hidden sm:inline">Haftalık Akış:</span>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-between">
              {weeklyDays.map((day) => {
                const isSelected = day.isSelected
                const isToday = day.isToday
                const isFull = day.completionRate === 100 && day.totalRoutines > 0

                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`flex flex-col items-center justify-center py-2 px-3 sm:px-4 rounded-xl transition-all min-w-[58px] sm:min-w-[70px] ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40'
                        : isToday
                        ? 'bg-muted/80 text-foreground border border-primary/50'
                        : 'bg-background/40 hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                      {day.dayName}
                    </span>
                    <span className="text-sm sm:text-base font-bold my-0.5">
                      {day.dayNumber}
                    </span>
                    <div className="flex items-center gap-1">
                      {isFull ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                      ) : day.completedCount > 0 ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {selectedDate !== todayStr && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(todayStr)}
                className="shrink-0 text-xs gap-1 ml-2"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Bugüne Dön</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. İki Sütunlu Ana Gövde (Sol: Komuta Masası | Sağ: Takımyıldızı & Takvim) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SOL SÜTUN: GÜNÜN KOMUTA MASASI (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Canlı Günlük İlerleme Özeti */}
          <Card className="border-border/60 bg-gradient-to-r from-card to-card/50 overflow-hidden relative">
            <div
              className="absolute bottom-0 left-0 top-0 bg-primary/10 transition-all duration-500"
              style={{ width: `${dailyCompletion.percent}%` }}
            />
            <CardContent className="p-4 relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {parseYmdToDate(selectedDate).toLocaleDateString('tr-TR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  {dailyCompletion.isPerfectDay && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 gap-1 text-[11px]">
                      <Sparkles className="h-3 w-3" /> Kusursuz Gün
                    </Badge>
                  )}
                </div>
                <div className="text-xl font-bold mt-0.5">
                  %{dailyCompletion.percent} Tamamlandı
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({dailyCompletion.completedCount}/{dailyCompletion.totalActive} Rutin)
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-end">
                  <Flame className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-foreground">
                    {constellationGraph.formationName.split(' ')[0]}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {dailyCompletion.percent === 100
                    ? 'Tüm rutinler tamamlandı'
                    : `${dailyCompletion.totalActive - dailyCompletion.completedCount} adım kaldı`}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Düşük Pil Uyarısı */}
          {isLowBattery && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
              <BatteryCharging className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>Düşük Enerji Modu:</strong> Yoğun hedefler yerine 2 dakikalık <em>Minimum Etkili Dozları</em> uygulayarak devamlılığı koruyabilirsiniz.
              </span>
            </div>
          )}

          {/* Zaman Dilimlerine Göre Gruplu Rutinler */}
          {timeBlocks.map((block) => {
            const blockMeta = TIME_BLOCK_META[block]
            const blockRoutines = filterRoutinesByTimeBlock(routines, block)

            if (blockRoutines.length === 0) return null

            return (
              <div key={block} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{blockMeta.icon}</span>
                    <h3 className="text-sm font-semibold text-foreground tracking-wide">
                      {blockMeta.label}
                    </h3>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({blockMeta.timeRange})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {
                      blockRoutines.filter((r) =>
                        routineLogs.some(
                          (l) => l.routine_id === r.id && l.log_date === selectedDate
                        )
                      ).length
                    }
                    /{blockRoutines.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {blockRoutines.map((routine) => {
                    const todayLog = routineLogs.find(
                      (l) => l.routine_id === routine.id && l.log_date === selectedDate
                    )
                    const isCompleted = !!todayLog
                    const streak = calculateStreak(routine.id, routineLogs, selectedDate)

                    return (
                      <div
                        key={routine.id}
                        className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 ${
                          isCompleted
                            ? todayLog?.status === 'micro_dose'
                              ? 'bg-amber-500/5 border-amber-500/30'
                              : 'bg-emerald-500/5 border-emerald-500/30'
                            : 'bg-card/70 border-border/70 hover:border-border'
                        }`}
                      >
                        {/* Sol Taraf: Tik Butonu ve Bilgiler */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRoutine(routine.id)}
                            className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                              isCompleted
                                ? todayLog?.status === 'micro_dose'
                                  ? 'bg-amber-500 text-black shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                  : 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                : 'border-2 border-muted-foreground/30 hover:border-primary text-transparent'
                            }`}
                          >
                            <Check className="h-4 w-4 stroke-[3]" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{routine.icon}</span>
                              <span
                                className={`text-sm font-semibold truncate ${
                                  isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
                                }`}
                              >
                                {routine.title}
                              </span>

                              {/* Streak Rozeti */}
                              {streak.currentStreak > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-400 gap-0.5"
                                >
                                  <Flame className="h-3 w-3" />
                                  {streak.currentStreak}g
                                </Badge>
                              )}

                              {streak.isCracked && !isCompleted && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] px-1.5 py-0 border-rose-500/40 bg-rose-500/10 text-rose-400 gap-0.5"
                                  title="Dün kaçırıldı! Bugün yaparsan zincir kurtarılacak (Never Miss Twice)."
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Çatlak!
                                </Badge>
                              )}

                              {streak.isKintsugi && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-300 gap-0.5"
                                  title="Altın dikişle onarıldı (Kintsugi). Asla iki kez kaçırmadın!"
                                >
                                  ✨ Onarıldı
                                </Badge>
                              )}
                            </div>

                            {/* Açıklama / Hedef / Minimum Doz */}
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              {isLowBattery && routine.minimum_effective_dose ? (
                                <span className="text-amber-400/90 font-medium">
                                  🎯 Mikro: {routine.minimum_effective_dose}
                                </span>
                              ) : (
                                <span>{routine.target_duration_minutes || 15} dk</span>
                              )}

                              {routine.identity_persona && (
                                <>
                                  <span>•</span>
                                  <span className="text-primary/80 font-medium">
                                    {routine.identity_persona}
                                  </span>
                                </>
                              )}

                              {todayLog?.note && (
                                <>
                                  <span>•</span>
                                  <span className="italic text-muted-foreground/80 truncate max-w-[140px]">
                                    "{todayLog.note}"
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Sağ Taraf: Hızlı Araçlar (Sayaç, Not, Düzenle) */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          {/* Sayaç Başlat */}
                          <button
                            type="button"
                            onClick={() => handleStartTimer(routine)}
                            className="h-8 w-8 min-h-[32px] min-w-[32px] rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                            aria-label={`"${routine.title}" için sayaç başlat`}
                            title="Zen Odak Sayacını Başlat"
                          >
                            <Clock className="h-4 w-4" />
                          </button>

                          {/* Not Ekle */}
                          <button
                            type="button"
                            onClick={() => {
                              setNoteRoutine(routine)
                              setNoteInput(todayLog?.note || '')
                            }}
                            className="h-8 w-8 min-h-[32px] min-w-[32px] rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                            aria-label={`"${routine.title}" için not ekle`}
                            title="Bugün için not ekle"
                          >
                            <FileText className="h-4 w-4" />
                          </button>

                          {/* Düzenle */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(routine)}
                            className="h-8 w-8 min-h-[32px] min-w-[32px] rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                            aria-label={`"${routine.title}" rutinini düzenle`}
                            title="Rutini Düzenle"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          {/* Sil */}
                          <button
                            type="button"
                            onClick={() => setRoutineToDelete({ id: routine.id, title: routine.title })}
                            className="h-8 w-8 min-h-[32px] min-w-[32px] rounded-md hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 flex items-center justify-center"
                            aria-label={`"${routine.title}" rutinini sil`}
                            title="Rutini Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {routines.length === 0 && (
            <Card className="border-dashed border-border p-8 text-center">
              <Orbit className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h4 className="text-sm font-semibold">Henüz Bir Rutin Eklenmedi</h4>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Günün ritmini yakalamak için ilk alışkanlığını oluşturabilirsin.
              </p>
              <Button size="sm" onClick={handleOpenCreateModal}>
                + İlk Rutinini Ekle
              </Button>
            </Card>
          )}
        </div>

        {/* Mobile Toggle for Constellation & Calendar */}
        <div className="lg:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConstellationOnMobile(!showConstellationOnMobile)}
            className="w-full flex items-center justify-between text-xs min-h-[38px] border-border/80"
          >
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span>Alışkanlık Ağı & Aylık Takvim</span>
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {showConstellationOnMobile ? 'Gizle ▲' : 'Göster ▼'}
            </span>
          </Button>
        </div>

        {/* SAĞ SÜTUN: ALIŞKANLIK AĞI & AYLIK TAKVİM (lg:col-span-5) */}
        <div className={`lg:col-span-5 space-y-6 ${showConstellationOnMobile ? 'block' : 'hidden lg:block'}`}>
          {/* ÜST KUTU: İNTERAKTİF ALIŞKANLIK AĞI */}
          <Card className="border-border bg-card overflow-hidden relative shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground tracking-wide">
                    Alışkanlık & Ritim Ağı
                  </h3>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {constellationGraph.formationDescription}
                </p>
              </div>

              <Badge
                variant="outline"
                className="text-xs px-2 text-foreground border-border"
              >
                {constellationGraph.formationName}
              </Badge>
            </div>

            {/* SVG Alanı */}
            <div className="relative w-full aspect-square max-h-[360px] bg-muted/20 flex items-center justify-center p-4">
              <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 overflow-visible">
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="activeBeam" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
                  </linearGradient>
                </defs>

                {/* Işık Bağlantıları (Edges) */}
                {constellationGraph.edges.map((edge, idx) => (
                  <line
                    key={`edge-${idx}`}
                    x1={edge.fromX}
                    y1={edge.fromY}
                    x2={edge.toX}
                    y2={edge.toY}
                    stroke={edge.isActive ? 'url(#activeBeam)' : '#1e293b'}
                    strokeWidth={edge.isActive ? '1.8' : '0.8'}
                    strokeDasharray={edge.isActive ? 'none' : '2 2'}
                    filter={edge.isActive ? 'url(#glow)' : undefined}
                    className="transition-all duration-700"
                  />
                ))}

                {/* Yıldız Düğümleri (Nodes) */}
                {constellationGraph.nodes.map((node) => {
                  const isDone = node.isCompleted

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer group/star transition-transform duration-300"
                      onClick={() => handleToggleRoutine(node.routineId)}
                    >
                      {/* Dış Halka Işıma */}
                      {isDone && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="6"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="0.5"
                          opacity="0.6"
                          className="animate-ping origin-center"
                        />
                      )}

                      {/* Ana Yıldız Gövdesi */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isDone ? '3.8' : '2.8'}
                        fill={isDone ? '#10b981' : '#334155'}
                        stroke={isDone ? '#6ee7b7' : '#475569'}
                        strokeWidth="1"
                        filter={isDone ? 'url(#glow)' : undefined}
                        className="transition-all duration-500 group-hover/star:scale-125"
                      />

                      {/* Emoji / İkon Etiketi */}
                      <text
                        x={node.x}
                        y={node.y - 6}
                        textAnchor="middle"
                        className="text-[4.5px] fill-slate-300 font-sans pointer-events-none select-none"
                      >
                        {node.icon} {node.title.slice(0, 10)}
                      </text>
                    </g>
                  )
                })}
              </svg>

              {/* Ortada Pusula / Boş Durum Bilgisi */}
              {constellationGraph.nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <Compass className="h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Rutin eklediğinizde aktivite haritası görüntülenecektir.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ALT KUTU: AYLIK RİTİM TAKVİMİ (MONTHLY CALENDAR HEAT GRID) */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4 space-y-3">
              {/* Ay Başlığı ve Navigasyon */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold capitalize">
                    {monthName}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonthDate(new Date(calYear, calMonth - 1, 1))
                    }
                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Önceki Ay"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonthDate(new Date())}
                    className="text-[11px] font-medium px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
                  >
                    Bugün
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonthDate(new Date(calYear, calMonth + 1, 1))
                    }
                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Sonraki Ay"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Hafta Günleri Başlığı */}
              <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/50">
                <span>Pzt</span>
                <span>Sal</span>
                <span>Çar</span>
                <span>Per</span>
                <span>Cum</span>
                <span>Cmt</span>
                <span>Paz</span>
              </div>

              {/* Takvim Günleri Izgarası */}
              <div className="grid grid-cols-7 gap-1">
                {monthCalendarDays.map((day, idx) => {
                  const isSelected = day.date === selectedDate
                  const isFull = day.isPerfect

                  return (
                    <button
                      key={`cal-${day.date}-${idx}`}
                      onClick={() => setSelectedDate(day.date)}
                      className={`h-9 flex flex-col items-center justify-center rounded-lg text-xs transition-all relative ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                          : day.isToday
                          ? 'border border-primary/60 text-foreground font-semibold bg-muted/30'
                          : day.isCurrentMonth
                          ? 'text-foreground/90 hover:bg-muted/70'
                          : 'text-muted-foreground/30 hover:bg-muted/40'
                      }`}
                    >
                      <span className="text-[11px] leading-none">{day.dayNumber}</span>

                      {/* Tamamlama Gösterge Noktası */}
                      <div className="mt-1 flex items-center justify-center">
                        {isFull ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#10b981]" />
                        ) : day.hasCompleted ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px_#10b981]" />
                  Tamamlandı (%100)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Kısmi Tamamlama
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 4. Rutin Ekleme / Düzenleme Modalı */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRoutine ? 'Rutini Düzenle' : 'Yeni Rutin / Ritüel Ekle'}
      >
        <form onSubmit={handleSaveRoutine} className="space-y-4">
          <div className="flex gap-3">
            <div className="w-14 shrink-0">
              <label htmlFor="routine-form-icon" className="text-xs font-semibold block mb-1 text-muted-foreground">İkon</label>
              <Input
                id="routine-form-icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="text-center text-xl p-0 h-9"
                placeholder="☀️"
                maxLength={4}
                required
              />
            </div>
            <div className="flex-1">
              <label htmlFor="routine-form-title" className="text-xs font-semibold block mb-1 text-muted-foreground">Rutin Başlığı</label>
              <Input
                id="routine-form-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Örn: 90 dk Kesintisiz Kod / Deep Work"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="routine-form-timeblock" className="text-xs font-semibold block mb-1 text-muted-foreground">Zaman Dilimi</label>
              <Select
                id="routine-form-timeblock"
                value={formData.time_block}
                onChange={(e) =>
                  setFormData({ ...formData, time_block: e.target.value as TimeBlock })
                }
              >
                <option value="morning">🌅 Sabah (06:00 - 12:00)</option>
                <option value="afternoon">☀️ Gün İçi (12:00 - 18:00)</option>
                <option value="evening">🌙 Akşam (18:00 - 00:00)</option>
                <option value="night">🌌 Gece (00:00 - 06:00)</option>
              </Select>
            </div>

            <div>
              <label htmlFor="routine-form-duration" className="text-xs font-semibold block mb-1 text-muted-foreground">Hedef Süre</label>
              <Input
                id="routine-form-duration"
                type="number"
                min="1"
                max="240"
                suffix="dk"
                value={formData.target_duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    target_duration_minutes: Number(e.target.value),
                  })
                }
                placeholder="15"
              />
            </div>
          </div>

          <div>
            <label htmlFor="routine-form-med" className="text-xs font-semibold block mb-1">
              Minimum Etkili Doz (Düşük Pil Hedefi)
            </label>
            <Input
              id="routine-form-med"
              value={formData.minimum_effective_dose}
              onChange={(e) =>
                setFormData({ ...formData, minimum_effective_dose: e.target.value })
              }
              placeholder="Zor günlerde: 1 sayfa oku / 2 dk esne / 1 satır kod yaz"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Yorgun olduğunda zinciri kurtaracak 2 dakikalık acil durum görevi.
            </p>
          </div>

          {/* Hayallerim & Kimlik Köprüsü */}
          <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Compass className="h-4 w-4" />
              <span>Hayallerim & Kimlik Köprüsü (Life OS)</span>
            </div>

            <div>
              <label htmlFor="routine-form-dream" className="text-xs text-muted-foreground block mb-1">
                Bağlı Hayal / Vizyon
              </label>
              <Select
                id="routine-form-dream"
                value={formData.dream_id}
                onChange={(e) => {
                  const selected = dreams.find((d) => d.id === e.target.value)
                  setFormData({
                    ...formData,
                    dream_id: e.target.value,
                    identity_persona: selected?.identity_persona || formData.identity_persona,
                  })
                }}
              >
                <option value="">(İsteğe bağlı bir hayale bağla)</option>
                {dreams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.identity_persona || 'Kimliksiz'})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="routine-form-persona" className="text-xs text-muted-foreground block mb-1">
                Hedeflenen Kimlik Personası
              </label>
              <Input
                id="routine-form-persona"
                value={formData.identity_persona}
                onChange={(e) =>
                  setFormData({ ...formData, identity_persona: e.target.value })
                }
                placeholder="Örn: Bağımsız Üretici, Sakin Zihin, Dayanıklı Sporcu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFormOpen(false)}
            >
              Vazgeç
            </Button>
            <Button type="submit">
              {editingRoutine ? 'Değişiklikleri Kaydet' : 'Rutini Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. Mini Zen Odak Sayacı Modalı (Pomodoro) */}
      <Modal
        isOpen={isTimerOpen}
        onClose={() => {
          setIsTimerOpen(false)
          setIsTimerRunning(false)
        }}
        title={`Zen Odak Sayacı: ${activeTimerRoutine?.title || 'Odak'}`}
      >
        <div className="text-center py-6 space-y-6">
          <div className="inline-block p-8 rounded-full border-4 border-primary/30 bg-primary/5 shadow-2xl relative">
            <div className="text-5xl sm:text-6xl font-mono font-bold tracking-tight text-foreground">
              {String(Math.floor(timerSecondsLeft / 60)).padStart(2, '0')}:
              {String(timerSecondsLeft % 60).padStart(2, '0')}
            </div>
            <div className="text-xs text-muted-foreground mt-2 font-medium">
              {activeTimerRoutine?.identity_persona
                ? `Oy Verilen Kimlik: ${activeTimerRoutine.identity_persona}`
                : 'Derin Odak Seansı'}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={isTimerRunning ? 'outline' : 'default'}
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="gap-2 px-6"
            >
              {isTimerRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              <span>{isTimerRunning ? 'Duraklat' : 'Başlat'}</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setIsTimerRunning(false)
                setTimerSecondsLeft((activeTimerRoutine?.target_duration_minutes || 25) * 60)
              }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Sıfırla</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                if (activeTimerRoutine) {
                  handleToggleRoutine(activeTimerRoutine.id)
                  setIsTimerOpen(false)
                  setIsTimerRunning(false)
                }
              }}
              className="gap-2 text-emerald-400"
            >
              <Check className="h-5 w-5" />
              <span>Tamamlandı İşaretle</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* 6. Hızlı Not Ekleme Modalı */}
      <Modal
        isOpen={!!noteRoutine}
        onClose={() => setNoteRoutine(null)}
        title={`Günün Notu: ${noteRoutine?.title || ''}`}
      >
        <div className="space-y-4">
          <label htmlFor="routine-note-input" className="text-xs text-muted-foreground block">
            {selectedDate} tarihi için bu rutine dair kısa bir hatıra veya ölçüm not et (Örn: "24 sayfa okundu", "3km koşuldu").
          </label>
          <Input
            id="routine-note-input"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Notunu yaz..."
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteRoutine(null)}>
              İptal
            </Button>
            <Button onClick={handleSaveNote}>Notu Kaydet</Button>
          </div>
        </div>
      </Modal>

      {/* 7. Rutin Silme Onay Modalı */}
      <ConfirmDialog
        isOpen={!!routineToDelete}
        onClose={() => setRoutineToDelete(null)}
        onConfirm={confirmDeleteRoutine}
        title="Rutini Sil"
        description={`"${routineToDelete?.title}" adlı rutini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Rutini Sil"
        variant="destructive"
      />
    </div>
  )
}

export default function RoutinesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground text-sm">
          Gökyüzü yükleniyor...
        </div>
      }
    >
      <RoutinesPageContent />
    </Suspense>
  )
}
