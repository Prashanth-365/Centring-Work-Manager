import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  periodIsCurrent,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodType,
  type WeekStart,
} from '@/lib/dates'
import { cn } from '@/lib/utils'

const TYPES: { value: PeriodType; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

/**
 * Week / Month / Year selector with prev/next navigation. Each type defaults to
 * the current period; the arrows let you pick a specific past/future one.
 */
export function PeriodSelector({
  period,
  onChange,
  weekStartsOn,
  className,
}: {
  period: Period
  onChange: (p: Period) => void
  weekStartsOn: WeekStart
  className?: string
}) {
  const current = periodIsCurrent(period, weekStartsOn)
  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange({ type: t.value, anchor: period.anchor })}
            className={cn(
              'rounded-lg py-1.5 text-xs font-medium transition',
              period.type === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => onChange(shiftPeriod(period, -1, weekStartsOn))}
          className="flex size-8 items-center justify-center rounded-lg transition hover:bg-accent"
          aria-label="Previous period"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{periodLabel(period, weekStartsOn)}</p>
          {current && <p className="text-[11px] text-primary">Current</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange(shiftPeriod(period, 1, weekStartsOn))}
          className="flex size-8 items-center justify-center rounded-lg transition hover:bg-accent"
          aria-label="Next period"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  )
}
