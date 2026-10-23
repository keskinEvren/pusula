'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  size?: SheetSize
  className?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

const sheetSizeClasses: Record<SheetSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
}

export function Sheet({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  className,
  children,
  footer,
}: SheetProps) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  // Track previous focus and body scroll lock
  React.useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      if (sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length > 0) {
          focusable[0].focus()
        } else {
          sheetRef.current.focus()
        }
      }
    }, 50)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen])

  // Escape key & Tab trap
  React.useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)

        if (focusable.length === 0) return

        const firstElement = focusable[0]
        const lastElement = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !sheetRef.current.contains(document.activeElement)) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement || !sheetRef.current.contains(document.activeElement)) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex flex-col w-full h-full bg-[#16161b] text-foreground border-l border-white/[0.12] shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden outline-none',
          sheetSizeClasses[size],
          className
        )}
      >
        {/* Sheet Top Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-white/[0.08] bg-muted/10 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id={titleId} className="text-base sm:text-lg font-bold text-foreground leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full shrink-0 -mr-1 -mt-0.5"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-muted/10 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
