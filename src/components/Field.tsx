import * as React from 'react'
import { Label } from './ui/label'
import { cn } from '@/lib/utils'

let counter = 0
function useId(prefix: string) {
  return React.useMemo(() => `${prefix}-${(counter += 1)}`, [prefix])
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode | ((id: string) => React.ReactNode)
  className?: string
}) {
  const id = useId('f')
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} className="flex items-center gap-1">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
