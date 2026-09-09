'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from './button'

import { cn } from '@/lib/utils'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  size?: ModalSize
  className?: string
  children: React.ReactNode
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'lg',
  className,
  children,
}: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div
        className={cn(
          'relative w-full rounded-2xl border border-white/[0.12] bg-[#16161b] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_24px_64px_-12px_rgba(0,0,0,0.85),0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-200 my-8 max-h-[90vh] overflow-y-auto',
          sizeClasses[size],
          className
        )}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
