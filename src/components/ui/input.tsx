import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  sizeVariant?: 'sm' | 'md' | 'lg'
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  wrapperClassName?: string
}

const sizeClasses = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-3.5 text-base',
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      sizeVariant = 'md',
      prefix,
      suffix,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const inputElement = (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-lg border border-input bg-card/60 py-1 text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          sizeClasses[sizeVariant],
          prefix && (sizeVariant === 'sm' ? 'pl-7' : sizeVariant === 'lg' ? 'pl-10' : 'pl-8'),
          suffix && (sizeVariant === 'sm' ? 'pr-8' : sizeVariant === 'lg' ? 'pr-12' : 'pr-10'),
          type === 'number' &&
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          className
        )}
        ref={ref}
        {...props}
      />
    )

    if (!prefix && !suffix) {
      return inputElement
    }

    return (
      <div className={cn('relative flex items-center w-full', wrapperClassName)}>
        {prefix && (
          <div className="absolute left-2.5 flex items-center pointer-events-none text-muted-foreground text-xs font-semibold select-none z-10">
            {prefix}
          </div>
        )}
        {inputElement}
        {suffix && (
          <div className="absolute right-2.5 flex items-center pointer-events-none text-muted-foreground text-xs font-medium select-none z-10">
            {suffix}
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }

