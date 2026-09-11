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
    sm: 'p-1 text-xs gap-1',
    md: 'p-1 text-xs gap-1.5',
  }

  const btnSizeStyles = {
    sm: 'min-h-[36px] py-1.5 px-3',
    md: 'min-h-[40px] py-2 px-3.5',
  }

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % options.length
      onChange(options[nextIndex].value)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + options.length) % options.length
      onChange(options[prevIndex].value)
    }
  }

  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex rounded-xl bg-muted/40 border border-border/60 select-none p-1',
        sizeStyles[size],
        fullWidth && 'w-full flex',
        className
      )}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            type="button"
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
