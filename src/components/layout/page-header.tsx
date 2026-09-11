import React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  description?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  className?: string
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  backHref,
  backLabel = 'Geri Dön',
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/60', className)}>
      <div className="space-y-1">
        {backHref && (
          <div className="mb-1.5">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{backLabel}</span>
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-normal">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0 w-full sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
