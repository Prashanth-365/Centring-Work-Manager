import * as React from 'react'
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  getYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toISODate, type Period, type WeekStart } from '@/lib/dates'
import { cn } from '@/lib/utils'

const TITLES = { week: 'Pick a week', month: 'Pick a month', year: 'Pick a year' } as const

/**
 * A specific-period picker for the Week / Month / Year selector. Opens a
 * calendar week-picker, a month grid, or a year grid depending on `period.type`,
 * seeded to the current selection with quick prev/next navigation. Choosing a
 * period commits via `onChange` and closes.
 */
export function PeriodPicker({
  open,
  onOpenChange,
  period,
  onChange,
  weekStartsOn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  period: Period
  onChange: (p: Period) => void
  weekStartsOn: WeekStart
}) {
  // The visible month/year being browsed — seeded from the selection, reset on open.
  const [view, setView] = React.useState(() => parseISO(period.anchor))
  React.useEffect(() => {
    if (open) setView(parseISO(period.anchor))
  }, [open, period.anchor])

  function commit(anchor: string) {
    onChange({ type: period.type, anchor })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{TITLES[period.type]}</DialogTitle>
        </DialogHeader>
        {period.type === 'week' && (
          <WeekGrid view={view} setView={setView} period={period} weekStartsOn={weekStartsOn} onPick={commit} />
        )}
        {period.type === 'month' && (
          <MonthGrid view={view} setView={setView} period={period} onPick={commit} />
        )}
        {period.type === 'year' && (
          <YearGrid view={view} setView={setView} period={period} onPick={commit} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Prev / label / next strip shared by the three grids. */
function NavHeader({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        className="flex size-9 items-center justify-center rounded-lg transition hover:bg-accent"
        aria-label="Previous"
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="text-sm font-semibold">{label}</span>
      <button
        type="button"
        onClick={onNext}
        className="flex size-9 items-center justify-center rounded-lg transition hover:bg-accent"
        aria-label="Next"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}

const CELL = 'rounded-lg py-2 text-sm font-medium transition'
const SELECTED = 'bg-primary text-primary-foreground'
const TODAYISH = 'ring-1 ring-primary/50'
const NORMAL = 'hover:bg-accent'

function WeekGrid({
  view,
  setView,
  period,
  weekStartsOn,
  onPick,
}: {
  view: Date
  setView: (d: Date) => void
  period: Period
  weekStartsOn: WeekStart
  onPick: (anchor: string) => void
}) {
  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn })
  const gridEnd = endOfWeek(endOfMonth(view), { weekStartsOn })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const rows: Date[][] = []
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))

  const selectedWeek = toISODate(startOfWeek(parseISO(period.anchor), { weekStartsOn }))
  const todayWeek = toISODate(startOfWeek(new Date(), { weekStartsOn }))

  return (
    <div className="space-y-2">
      <NavHeader
        label={format(view, 'MMMM yyyy')}
        onPrev={() => setView(addMonths(view, -1))}
        onNext={() => setView(addMonths(view, 1))}
      />
      <div className="grid grid-cols-7 gap-1 px-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
        {rows[0].map((d) => (
          <span key={d.toISOString()}>{format(d, 'EEEEE')}</span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((row) => {
          const weekStartIso = toISODate(row[0])
          const isSelected = weekStartIso === selectedWeek
          const isThisWeek = weekStartIso === todayWeek
          return (
            <button
              key={weekStartIso}
              type="button"
              onClick={() => onPick(weekStartIso)}
              className={cn(
                'grid w-full grid-cols-7 gap-1 rounded-lg px-1 py-0.5 transition',
                isSelected ? 'bg-primary text-primary-foreground' : isThisWeek ? 'ring-1 ring-primary/50' : 'hover:bg-accent',
              )}
            >
              {row.map((d) => (
                <span
                  key={d.toISOString()}
                  className={cn(
                    'py-1.5 text-center text-sm tabular',
                    getMonth(d) !== getMonth(view) && !isSelected && 'text-muted-foreground/40',
                  )}
                >
                  {format(d, 'd')}
                </span>
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MonthGrid({
  view,
  setView,
  period,
  onPick,
}: {
  view: Date
  setView: (d: Date) => void
  period: Period
  onPick: (anchor: string) => void
}) {
  const year = getYear(view)
  const anchor = parseISO(period.anchor)
  const now = new Date()
  return (
    <div className="space-y-2">
      <NavHeader
        label={String(year)}
        onPrev={() => setView(addYears(view, -1))}
        onNext={() => setView(addYears(view, 1))}
      />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, m) => {
          const isSelected = year === getYear(anchor) && m === getMonth(anchor)
          const isCurrent = year === getYear(now) && m === getMonth(now)
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(toISODate(new Date(year, m, 1)))}
              className={cn(CELL, isSelected ? SELECTED : isCurrent ? TODAYISH : NORMAL)}
            >
              {format(new Date(2000, m, 1), 'MMM')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function YearGrid({
  view,
  setView,
  period,
  onPick,
}: {
  view: Date
  setView: (d: Date) => void
  period: Period
  onPick: (anchor: string) => void
}) {
  const base = getYear(view)
  const decadeStart = base - (base % 10)
  const years = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i)
  const selectedYear = getYear(parseISO(period.anchor))
  const currentYear = getYear(new Date())
  return (
    <div className="space-y-2">
      <NavHeader
        label={`${decadeStart}–${decadeStart + 9}`}
        onPrev={() => setView(addYears(view, -10))}
        onNext={() => setView(addYears(view, 10))}
      />
      <div className="grid grid-cols-3 gap-2">
        {years.map((y) => {
          const isSelected = y === selectedYear
          const isCurrent = y === currentYear
          return (
            <button
              key={y}
              type="button"
              onClick={() => onPick(toISODate(new Date(y, 0, 1)))}
              className={cn(CELL, isSelected ? SELECTED : isCurrent ? TODAYISH : NORMAL)}
            >
              {y}
            </button>
          )
        })}
      </div>
    </div>
  )
}
