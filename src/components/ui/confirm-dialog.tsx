'use client'

import * as React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Modal } from './modal'
import { Button } from './button'

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'warning' | 'default'
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  variant = 'destructive',
  isLoading = false,
}: ConfirmDialogProps) {
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null)

  const handleConfirm = async () => {
    await onConfirm()
  }

  const iconConfig = {
    destructive: {
      icon: AlertCircle,
      iconClass: 'text-destructive',
      bgClass: 'bg-destructive/10 border-destructive/25',
      confirmVariant: 'destructive' as const,
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-warning',
      bgClass: 'bg-warning/10 border-warning/25',
      confirmVariant: 'default' as const,
    },
    default: {
      icon: Info,
      iconClass: 'text-primary',
      bgClass: 'bg-primary/10 border-primary/25',
      confirmVariant: 'default' as const,
    },
  }[variant]

  const Icon = iconConfig.icon

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocusRef={cancelBtnRef}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border p-3.5 bg-muted/20 border-border/70">
          <div className={`p-2 rounded-lg border shrink-0 ${iconConfig.bgClass}`}>
            <Icon className={`h-5 w-5 ${iconConfig.iconClass}`} />
          </div>
          <div className="text-xs leading-relaxed text-muted-foreground pt-0.5">
            {description}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="min-w-[80px]"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={iconConfig.confirmVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading}
            className="min-w-[90px]"
          >
            {isLoading ? 'İşleniyor...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
