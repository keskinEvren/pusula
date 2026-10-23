'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface HeroCurrencyInputProps {
  id?: string
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
  id,
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
  const generatedId = React.useId()
  const inputId = id || generatedId
  const strValue = value === 0 || value === '0' ? '' : value?.toString() || ''

  const accentStyles = {
    expense: 'focus-within:border-destructive/60 focus-within:ring-destructive/30',
    income: 'focus-within:border-success/60 focus-within:ring-success/30',
    neutral: 'focus-within:border-primary/60 focus-within:ring-primary/30',
  }

  const badgeStyles = {
    expense: 'bg-destructive/10 text-destructive border-destructive/25',
    income: 'bg-success/10 text-success border-success/25',
    neutral: 'bg-primary/10 text-primary border-primary/25',
  }

  const typeLabels = {
    expense: 'Gider',
    income: 'Gelir',
    neutral: 'Tutar',
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground cursor-pointer">{label}</label>
          <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold border', badgeStyles[type])}>
            {typeLabels[type]}
          </span>
        </div>
      )}

      <div
        className={cn(
          'relative flex items-center justify-between rounded-xl border border-border/80 bg-background/50 px-3.5 py-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all focus-within:ring-2',
          accentStyles[type]
        )}
      >
        <div className="flex items-baseline gap-1.5 w-full min-w-0">
          <span className="text-xl font-light text-muted-foreground/60 select-none">
            {currencySymbol}
          </span>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="any"
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="w-full bg-transparent font-mono text-xl sm:text-2xl font-extrabold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/20 tabular-nums"
          />
        </div>

        {!label && (
          <div className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0', badgeStyles[type])}>
            {typeLabels[type]}
          </div>
        )}
      </div>

      {/* Ergonomik Hızlı Tutar Çipleri */}
      {presets.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                const current = parseFloat(strValue) || 0
                onChange((current + preset).toString())
              }}
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 transition-all"
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
