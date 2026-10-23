'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  size?: ModalSize
  className?: string
  children: React.ReactNode
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-3xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'lg',
  className,
  children,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  // Track previous focus and manage body scroll lock
  React.useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus management
    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length > 0) {
          focusable[0].focus()
        } else {
          dialogRef.current.focus()
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
  }, [isOpen, initialFocusRef])

  // Escape key & Tab focus trap
  React.useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)

        if (focusable.length === 0) return

        const firstElement = focusable[0]
        const lastElement = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex flex-col w-full rounded-t-2xl sm:rounded-2xl border border-white/[0.12] bg-[#16161b] p-4 sm:p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_24px_64px_-12px_rgba(0,0,0,0.85),0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-hidden outline-none',
          sizeClasses[size],
          className
        )}
      >
        {/* Mobile handle indicator */}
        <div className="w-12 h-1 rounded-full bg-white/20 mx-auto mb-2.5 sm:hidden shrink-0" />

        <div className="flex items-start justify-between gap-3 pb-2.5 sm:pb-3 border-b border-white/[0.08] shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm sm:text-base font-bold text-foreground leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
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
        <div className="mt-3 flex-1 overflow-y-auto min-h-0 pr-0.5">{children}</div>
      </div>
    </div>
  )
}
