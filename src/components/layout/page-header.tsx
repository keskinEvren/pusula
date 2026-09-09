import React from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border/50">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/80 leading-normal">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
