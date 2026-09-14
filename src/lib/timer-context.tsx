'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/toast-context'
import type { AgendaItem } from '@/types/database'

export type TimerMode = 'stopwatch' | 'pomodoro'

export interface ActiveTimerData {
  itemId: string
  itemTitle: string
  projectId: string | null
  projectName: string | null
  timerMode: TimerMode
  pomodoroTargetMinutes: number
  baseElapsedSeconds: number
  startedAtTimestamp: number | null // null if paused
  isRunning: boolean
}

interface TimerContextValue {
  activeTimer: ActiveTimerData | null
  isRunning: boolean
  elapsedSeconds: number
  remainingSeconds: number // For Pomodoro: (target * 60) - elapsedSeconds
  timerMode: TimerMode
  pomodoroTargetMinutes: number
  startTimer: (item: AgendaItem, projectName?: string | null) => Promise<void>
  pauseTimer: () => Promise<void>
  resumeTimer: () => void
  completeTimer: (notes?: string) => Promise<void>
  discardTimer: () => void
  setTimerMode: (mode: TimerMode, targetMinutes?: number) => void
  formatTime: (seconds: number) => string
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined)

const STORAGE_KEY = 'pusula_active_focus_timer'

function playChime() {
  try {
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3) // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch (err) {
    // Ignore audio failures
  }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const [activeTimer, setActiveTimer] = useState<ActiveTimerData | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const pomodoroChimedRef = useRef(false)

  // Initialize from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: ActiveTimerData = JSON.parse(saved)
        if (parsed && parsed.itemId) {
          let currentElapsed = parsed.baseElapsedSeconds || 0
          if (parsed.isRunning && parsed.startedAtTimestamp) {
            const now = Date.now()
            const deltaSeconds = Math.max(0, Math.floor((now - parsed.startedAtTimestamp) / 1000))
            currentElapsed += deltaSeconds
          }
          setActiveTimer(parsed)
          setElapsedSeconds(currentElapsed)
        }
      }
    } catch (e) {
      console.error('Error loading active timer from storage:', e)
    }
  }, [])

  // Sync to LocalStorage
  const saveStateToStorage = useCallback((timer: ActiveTimerData | null) => {
    try {
      if (timer) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (e) {
      console.error('Error saving timer state to storage:', e)
    }
  }, [])

  // Tick loop
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (activeTimer && activeTimer.isRunning && activeTimer.startedAtTimestamp) {
      intervalRef.current = setInterval(() => {
        const now = Date.now()
        const deltaSeconds = Math.max(0, Math.floor((now - activeTimer.startedAtTimestamp!) / 1000))
        const total = activeTimer.baseElapsedSeconds + deltaSeconds
        setElapsedSeconds(total)

        // Check Pomodoro target
        if (activeTimer.timerMode === 'pomodoro') {
          const targetSec = (activeTimer.pomodoroTargetMinutes || 25) * 60
          if (total >= targetSec && !pomodoroChimedRef.current) {
            pomodoroChimedRef.current = true
            playChime()
            toast.success(`🎉 ${activeTimer.pomodoroTargetMinutes} dakikalık Pomodoro odak bloğu tamamlandı! Mola verebilir veya devam edebilirsiniz.`)
          }
        }
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [activeTimer, toast])

  // Start or switch to an item
  const startTimer = useCallback(async (item: AgendaItem, projectName?: string | null) => {
    // If currently running another item, first pause/save it
    const now = Date.now()
    const timerMode: TimerMode = item.timer_mode || 'stopwatch'
    const pomodoroTargetMinutes = item.pomodoro_target_minutes || 25
    pomodoroChimedRef.current = false

    const newTimer: ActiveTimerData = {
      itemId: item.id,
      itemTitle: item.title,
      projectId: item.project_id || null,
      projectName: projectName || null,
      timerMode,
      pomodoroTargetMinutes,
      baseElapsedSeconds: item.duration_seconds || 0,
      startedAtTimestamp: now,
      isRunning: true,
    }

    setActiveTimer(newTimer)
    setElapsedSeconds(item.duration_seconds || 0)
    saveStateToStorage(newTimer)

    // Mark as in_progress in Supabase
    try {
      const supabase = createClient()
      await supabase
        .from('agenda_items')
        .update({ status: 'in_progress', timer_mode: timerMode, pomodoro_target_minutes: pomodoroTargetMinutes })
        .eq('id', item.id)
    } catch (err) {
      console.error('Error updating item to in_progress:', err)
    }

    toast.info(`⏱️ "${item.title}" için sayaç başlatıldı`)
  }, [saveStateToStorage, toast])

  // Pause
  const pauseTimer = useCallback(async () => {
    if (!activeTimer || !activeTimer.isRunning) return

    const now = Date.now()
    const delta = activeTimer.startedAtTimestamp ? Math.floor((now - activeTimer.startedAtTimestamp) / 1000) : 0
    const newBase = activeTimer.baseElapsedSeconds + delta

    const paused: ActiveTimerData = {
      ...activeTimer,
      baseElapsedSeconds: newBase,
      startedAtTimestamp: null,
      isRunning: false,
    }

    setActiveTimer(paused)
    setElapsedSeconds(newBase)
    saveStateToStorage(paused)

    // Sync seconds to Supabase
    try {
      const supabase = createClient()
      await supabase
        .from('agenda_items')
        .update({ duration_seconds: newBase })
        .eq('id', activeTimer.itemId)
    } catch (err) {
      console.error('Error updating duration on pause:', err)
    }

    toast.info('Sayaç duraklatıldı')
  }, [activeTimer, saveStateToStorage, toast])

  // Resume
  const resumeTimer = useCallback(() => {
    if (!activeTimer || activeTimer.isRunning) return

    const resumed: ActiveTimerData = {
      ...activeTimer,
      startedAtTimestamp: Date.now(),
      isRunning: true,
    }

    setActiveTimer(resumed)
    saveStateToStorage(resumed)
    toast.info('Sayaç devam ediyor')
  }, [activeTimer, saveStateToStorage, toast])

  // Complete
  const completeTimer = useCallback(async (notes?: string) => {
    if (!activeTimer) return

    let finalSeconds = activeTimer.baseElapsedSeconds
    if (activeTimer.isRunning && activeTimer.startedAtTimestamp) {
      const delta = Math.floor((Date.now() - activeTimer.startedAtTimestamp) / 1000)
      finalSeconds += delta
    }

    try {
      const supabase = createClient()
      await supabase
        .from('agenda_items')
        .update({
          status: 'completed',
          duration_seconds: finalSeconds,
          completed_at: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        })
        .eq('id', activeTimer.itemId)

      playChime()
      toast.success(`✅ "${activeTimer.itemTitle}" tamamlandı! Toplam süre: ${formatMinutesHours(finalSeconds)}`)
    } catch (err: any) {
      toast.error('Tamamlanırken hata oluştu: ' + (err.message || ''))
    } finally {
      setActiveTimer(null)
      setElapsedSeconds(0)
      saveStateToStorage(null)
    }
  }, [activeTimer, saveStateToStorage, toast])

  // Discard
  const discardTimer = useCallback(() => {
    setActiveTimer(null)
    setElapsedSeconds(0)
    saveStateToStorage(null)
    toast.info('Aktif sayaç oturumu sıfırlandı')
  }, [saveStateToStorage, toast])

  // Set mode (Stopwatch / Pomodoro)
  const setTimerMode = useCallback((mode: TimerMode, targetMinutes = 25) => {
    if (!activeTimer) return

    const updated: ActiveTimerData = {
      ...activeTimer,
      timerMode: mode,
      pomodoroTargetMinutes: targetMinutes,
    }
    setActiveTimer(updated)
    saveStateToStorage(updated)
    pomodoroChimedRef.current = false

    // Update in Supabase
    const supabase = createClient()
    supabase
      .from('agenda_items')
      .update({ timer_mode: mode, pomodoro_target_minutes: targetMinutes })
      .eq('id', activeTimer.itemId)
      .then(() => {})
  }, [activeTimer, saveStateToStorage])

  const formatTime = (totalSec: number): string => {
    const hours = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    const secs = totalSec % 60
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const timerMode = activeTimer?.timerMode || 'stopwatch'
  const pomodoroTargetMinutes = activeTimer?.pomodoroTargetMinutes || 25
  const remainingSeconds = Math.max(0, pomodoroTargetMinutes * 60 - elapsedSeconds)

  return (
    <TimerContext.Provider
      value={{
        activeTimer,
        isRunning: activeTimer?.isRunning || false,
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
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const context = useContext(TimerContext)
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider')
  }
  return context
}

export function formatMinutesHours(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 dk'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0 && minutes > 0) {
    return `${hours} sa ${minutes} dk`
  }
  if (hours > 0) {
    return `${hours} sa`
  }
  return `${minutes} dk`
}
