'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface HeroCurrencyInputProps {
  value: string | number
  onChange: (val: string) => void
  type?: 'expense' | 'income' | 'neutral'
  currencySymbol?: string
  placeholder?: string
  label?: string
  autoFocus?: boolean
  className?: string
  presets?: number[]
}

export function HeroCurrencyInput({
  value,
  onChange,
  type = 'expense',
  currencySymbol = '₺',
  placeholder = '0',
  label,
  autoFocus = false,
  className,
  presets = [50, 100, 500, 1000, 5000],
}: HeroCurrencyInputProps) {
  const strValue = value === 0 || value === '0' ? '' : value?.toString() || ''

  const accentStyles = {
    expense: 'focus-within:border-rose-500/40 focus-within:ring-rose-500/20',
    income: 'focus-within:border-emerald-500/40 focus-within:ring-emerald-500/20',
    neutral: 'focus-within:border-primary/40 focus-within:ring-primary/20',
  }

  const badgeStyles = {
    expense: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
    income: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    neutral: 'bg-primary/10 text-primary border-primary/25',
  }

  const typeLabels = {
    expense: 'Gider',
    income: 'Gelir',
    neutral: 'Tutar',
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold border', badgeStyles[type])}>
            {typeLabels[type]}
          </span>
        </div>
      )}

      <div
        className={cn(
          'relative flex items-center justify-between rounded-xl border border-border/80 bg-background/50 px-4 py-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all focus-within:ring-2',
          accentStyles[type]
        )}
      >
        <div className="flex items-baseline gap-2 w-full min-w-0">
          <span className="text-2xl font-light text-muted-foreground/60 select-none">
            {currencySymbol}
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="w-full bg-transparent font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/20 tabular-nums"
          />
        </div>

        {!label && (
          <div className={cn('px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0', badgeStyles[type])}>
            {typeLabels[type]}
          </div>
        )}
      </div>

      {/* Ergonomik Hızlı Tutar Çipleri */}
      {presets.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                const current = parseFloat(strValue) || 0
                onChange((current + preset).toString())
              }}
              className="rounded-lg border border-border/60 bg-muted/30 px-2 py-1 text-[11px] font-mono text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 transition-all"
            >
              +{preset.toLocaleString('tr-TR')} ₺
            </button>
          ))}
          {strValue && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="ml-auto text-[11px] text-muted-foreground/70 hover:text-rose-400 px-1.5 transition-colors"
            >
              Temizle
            </button>
          )}
        </div>
      )}
    </div>
  )
}
