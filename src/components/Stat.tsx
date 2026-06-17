import * as React from 'react'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'brand'

const TONE_VALUE: Record<Tone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  danger: 'text-destructive',
  warning: 'text-warning-foreground',
  brand: 'text-primary',
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  icon: Icon,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-3.5 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground/70" />}
      </div>
      <p className={cn('tabular mt-1.5 text-2xl font-bold leading-none', TONE_VALUE[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
