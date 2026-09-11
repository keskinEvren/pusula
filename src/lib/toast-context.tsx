'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void
    error: (message: string, duration?: number) => void
    warning: (message: string, duration?: number) => void
    info: (message: string, duration?: number) => void
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev, { id, type, message }])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast]
  )

  const toast = React.useMemo(
    () => ({
      success: (msg: string, duration?: number) => addToast('success', msg, duration),
      error: (msg: string, duration?: number) => addToast('error', msg, duration),
      warning: (msg: string, duration?: number) => addToast('warning', msg, duration),
      info: (msg: string, duration?: number) => addToast('info', msg, duration),
    }),
    [addToast]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Render Alanı (Mobilde Bottom Nav Üstü, Masaüstünde Sağ Alt) */}
      <div
        className="fixed bottom-24 left-4 right-4 sm:bottom-4 sm:right-4 sm:left-auto z-50 flex flex-col gap-2 pointer-events-none sm:max-w-sm w-auto"
      >
        {toasts.map((t) => {
          const Icon =
            t.type === 'success'
              ? CheckCircle2
              : t.type === 'error'
              ? AlertCircle
              : t.type === 'warning'
              ? AlertTriangle
              : Info

          const colorClasses =
            t.type === 'success'
              ? 'border-success/30 bg-[#061e14]/95 text-emerald-100 shadow-emerald-950/40'
              : t.type === 'error'
              ? 'border-destructive/30 bg-[#20080d]/95 text-rose-100 shadow-rose-950/40'
              : t.type === 'warning'
              ? 'border-warning/30 bg-[#241705]/95 text-amber-100 shadow-amber-950/40'
              : 'border-primary/30 bg-[#071927]/95 text-sky-100 shadow-sky-950/40'

          const iconColors =
            t.type === 'success'
              ? 'text-success'
              : t.type === 'error'
              ? 'text-destructive'
              : t.type === 'warning'
              ? 'text-warning'
              : 'text-primary'

          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 duration-200',
                colorClasses
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', iconColors)} />
              <div className="flex-1 text-xs font-medium leading-relaxed break-words">
                {t.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="shrink-0 h-7 w-7 sm:h-6 sm:w-6 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-white/10 transition-all text-foreground"
                aria-label="Kapat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    return {
      toast: {
        success: (msg: string) => console.log('[Toast Success]:', msg),
        error: (msg: string) => console.error('[Toast Error]:', msg),
        warning: (msg: string) => console.warn('[Toast Warning]:', msg),
        info: (msg: string) => console.info('[Toast Info]:', msg),
      },
    }
  }
  return context
}
