'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
  activeClassName?: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
  fullWidth?: boolean
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  fullWidth = true,
}: SegmentedControlProps<T>) {
  const sizeStyles = {
    sm: 'p-0.5 text-xs gap-0.5',
    md: 'p-1 text-xs gap-1',
  }

  const btnSizeStyles = {
    sm: 'py-1 px-2.5',
    md: 'py-1.5 px-3',
  }

  return (
    <div
      className={cn(
        'inline-flex rounded-xl bg-muted/40 border border-border/60 select-none',
        sizeStyles[size],
        fullWidth && 'w-full flex',
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98]',
              btnSizeStyles[size],
              fullWidth && 'flex-1',
              isSelected
                ? cn(
                    'bg-card text-foreground font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.08)] border border-border/80',
                    opt.activeClassName
                  )
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
            )}
          >
            {opt.icon && <span className="shrink-0 text-current">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
