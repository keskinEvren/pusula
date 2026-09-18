'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Orbit,
  Flame,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { requireMutationData } from '@/lib/supabase/mutation'
import { useToast } from '@/lib/toast-context'
import { isUUID } from '@/lib/utils'
import type { Routine, RoutineLog } from '@/types/database'
import {
  getCurrentTimeBlock,
  TIME_BLOCK_META,
  formatDateToYmd,
} from '@/lib/routines-engine'

const STORAGE_KEY_ROUTINES = 'pusula_local_routines'
const STORAGE_KEY_LOGS = 'pusula_local_routine_logs'

export function DashboardRoutineStrip() {
  const { toast } = useToast()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [logs, setLogs] = useState<RoutineLog[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  const todayStr = formatDateToYmd(new Date())
  const currentBlock = getCurrentTimeBlock()
  const blockMeta = TIME_BLOCK_META[currentBlock]

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()

      try {
        const { data: rData, error: rError } = await supabase
          .from('routines')
          .select('*')
          .eq('is_active', true)
          .order('order_index', { ascending: true })

        if (rError) {
          // DB hatası — localStorage fallback
          const localRoutines = localStorage.getItem(STORAGE_KEY_ROUTINES)
          if (localRoutines) {
            try {
              const parsed = JSON.parse(localRoutines) as Routine[]
              const cleaned = Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith?.('sample-')) : []
              setRoutines(cleaned)
            } catch {
              setRoutines([])
            }
          } else {
            setRoutines([])
          }
        } else if (rData && rData.length > 0) {
          const validData = rData.filter((r: any) => !r.id?.startsWith?.('sample-'))
          setRoutines(validData as Routine[])
        } else {
          // DB boş — yerel kontrol
          const localRoutines = localStorage.getItem(STORAGE_KEY_ROUTINES)
          if (localRoutines) {
            try {
              const parsed = JSON.parse(localRoutines) as Routine[]
              const cleaned = Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith?.('sample-')) : []
              setRoutines(cleaned)
            } catch {
              setRoutines([])
            }
          } else {
            setRoutines([])
          }
        }

        const { data: lData } = await supabase
          .from('routine_logs')
          .select('*')
          .eq('log_date', todayStr)

        if (lData && lData.length > 0) {
          setLogs(lData as RoutineLog[])
        } else {
          const localLogs = localStorage.getItem(STORAGE_KEY_LOGS)
          setLogs(localLogs ? JSON.parse(localLogs) : [])
        }
      } catch (err) {
        console.error('Dashboard routine strip load error:', err)
        const localRoutines = localStorage.getItem(STORAGE_KEY_ROUTINES)
        if (localRoutines) {
          try {
            const parsed = JSON.parse(localRoutines) as Routine[]
            setRoutines(Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith?.('sample-')) : [])
          } catch {
            setRoutines([])
          }
        } else {
          setRoutines([])
        }
        const localLogs = localStorage.getItem(STORAGE_KEY_LOGS)
        setLogs(localLogs ? JSON.parse(localLogs) : [])
      } finally {
        setIsLoaded(true)
      }
    }

    loadData()
  }, [todayStr])

  // O anki zaman dilimine ait aktif rutinler (yoksa tüm aktif rutinler)
  const currentBlockRoutines = routines.filter((r) => r.time_block === currentBlock)
  const displayRoutines = currentBlockRoutines.length > 0 ? currentBlockRoutines : routines.slice(0, 4)

  const completedCount = displayRoutines.filter((r) =>
    logs.some((l) => l.routine_id === r.id && l.log_date === todayStr)
  ).length
  const totalCount = displayRoutines.length
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  async function handleToggle(routineId: string) {
    const existingLog = logs.find(
      (l) => l.routine_id === routineId && l.log_date === todayStr
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
        const updatedLogs = logs.filter((l) => l.id !== existingLog.id)
        setLogs(updatedLogs)
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs))
        return
      }

      const newLog: RoutineLog = {
        id: crypto.randomUUID(),
        user_id: user?.id || 'local',
        routine_id: routineId,
        log_date: todayStr,
        status: 'completed',
        note: null,
        duration_minutes: 0,
        completed_at: new Date().toISOString(),
      }

      if (user) {
        const saved = requireMutationData(
          await supabase.from('routine_logs').insert([newLog]).select('*').single(),
          'Rutin tamamlaması backend tarafından doğrulanamadı.'
        )
        const updatedLogs = [saved as RoutineLog, ...logs]
        setLogs(updatedLogs)
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs))
      } else {
        const updatedLogs = [newLog, ...logs]
        setLogs(updatedLogs)
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs))
      }
    } catch (err: any) {
      toast.error(err.message || 'Rutin durumu güncellenemedi.')
    }
  }

  if (!isLoaded || displayRoutines.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-r from-card via-card/80 to-card/60 p-2.5 sm:p-3 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Sol Taraf: Aktif Zaman Bloğu ve İlerleme */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 text-xs font-semibold">
            <span>{blockMeta.icon}</span>
            <span className="text-foreground">{blockMeta.label.split(' ')[0]}</span>
            <span className="text-[10px] text-muted-foreground font-normal">
              ({completedCount}/{totalCount})
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>%{percent}</span>
          </div>
        </div>

        {/* Orta Taraf: Hızlı Tikleme Hapları (Chips) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-1 justify-start sm:justify-center">
          {displayRoutines.map((routine) => {
            const isDone = logs.some(
              (l) => l.routine_id === routine.id && l.log_date === todayStr
            )

            return (
              <button
                key={routine.id}
                type="button"
                onClick={() => handleToggle(routine.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 border ${
                  isDone
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-background/60 text-foreground/80 border-border/80 hover:bg-muted'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded flex items-center justify-center text-[10px] transition-colors ${
                    isDone
                      ? 'bg-emerald-500 text-black'
                      : 'border border-muted-foreground/40'
                  }`}
                >
                  {isDone && <Check className="h-3 w-3 stroke-[3]" />}
                </span>
                <span>{routine.icon}</span>
                <span className={`truncate max-w-[120px] ${isDone ? 'line-through opacity-70' : ''}`}>
                  {routine.title}
                </span>
              </button>
            )
          })}
        </div>

        {/* Sağ Taraf: Gökyüzü Modülü Linki */}
        <div className="flex items-center justify-end shrink-0 pl-1">
          <Link
            href="/routines"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <Orbit className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Gökyüzü & Takvim</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
