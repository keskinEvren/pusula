'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type ViewMode = 'grid' | 'table'

export interface ViewToggleOption<T extends string = string> {
  value: T
  label: string
  icon?: React.ElementType
}

export interface ViewToggleProps<T extends string = string> {
  value: T
  onChange: (val: T) => void
  options: ViewToggleOption<T>[]
  className?: string
  size?: 'sm' | 'md'
}

export function ViewToggle<T extends string = string>({
  value,
  onChange,
  options,
  className,
  size = 'sm',
}: ViewToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label="Görünüm seçici"
      className={cn(
        'inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 shadow-xs',
        className
      )}
    >
      {options.map((option) => {
        const Icon = option.icon
        const isSelected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-all select-none',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs',
              isSelected
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
            title={option.label}
          >
            {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
