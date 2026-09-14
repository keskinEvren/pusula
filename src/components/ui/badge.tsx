import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'muted' | 'purple' | 'primary'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground',
    primary: 'border-primary/25 bg-primary/10 text-primary',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
    outline: 'border-border text-foreground/80 bg-transparent',
    muted: 'border-border/60 bg-muted/60 text-muted-foreground',
    success: 'border-success/25 bg-success/10 text-success',
    warning: 'border-warning/25 bg-warning/10 text-warning',
    purple: 'border-primary/25 bg-primary/10 text-primary',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
