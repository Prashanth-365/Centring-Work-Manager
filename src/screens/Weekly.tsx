import * as React from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Maximize2, Printer, Users, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Stat } from '@/components/Stat'
import { Switch } from '@/components/ui/switch'
import { useAllAttendance, useSettings, useTransactions, useWorkers } from '@/lib/hooks'
import { weeklySummary, type WeeklySummary } from '@/lib/compute/weekly'
import { formatRange, shiftWeek, todayISO, weekKey, type WeekStart } from '@/lib/dates'
import { days, money } from '@/lib/format'
import { lockLandscape, unlockOrientation } from '@/lib/native'
import { cn } from '@/lib/utils'

export function Weekly() {
  const workers = useWorkers()
  const attendance = useAllAttendance()
  const txns = useTransactions()
  const settings = useSettings()
  const ws = (settings.weekStartsOn ?? 1) as WeekStart

  const [weekStart, setWeekStart] = React.useState(() => weekKey(todayISO(), ws))
  const [showAll, setShowAll] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => {
    setWeekStart((w) => weekKey(w, ws))
  }, [ws])

  // Full-screen view is optimised for landscape (the table is wide). Try to lock
  // the device to landscape while it's open and release the lock on exit.
  React.useEffect(() => {
    if (!fullscreen) return
    void lockLandscape()
    return () => unlockOrientation()
  }, [fullscreen])

  const summary = React.useMemo(
    () => weeklySummary(workers, attendance, txns, weekStart, ws),
    [workers, attendance, txns, weekStart, ws],
  )

  const rows = showAll ? summary.rows : summary.rows.filter((r) => r.hasActivity)
  const isThisWeek = weekStart === weekKey(todayISO(), ws)

  function print() {
    window.print()
  }

  return (
    <>
      <PageHeader
        title="Weekly summary"
        subtitle="Payroll register"
        back
        className="print:hidden"
        actions={
          <>
            <button
              type="button"
              onClick={print}
              className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
              aria-label="Print this week"
            >
              <Printer className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
              aria-label="Full screen"
            >
              <Maximize2 className="size-5" />
            </button>
          </>
        }
      />
      <div className="space-y-3 p-4 print:hidden">
        {/* Week navigator */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-1.5 shadow-card">
          <button
            onClick={() => setWeekStart(shiftWeek(weekStart, -1, ws))}
            className="flex size-9 items-center justify-center rounded-lg transition hover:bg-accent"
            aria-label="Previous week"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatRange(summary.start, summary.end)}</p>
            {isThisWeek && <p className="text-[11px] text-primary">This week</p>}
          </div>
          <button
            onClick={() => setWeekStart(shiftWeek(weekStart, 1, ws))}
            className="flex size-9 items-center justify-center rounded-lg transition hover:bg-accent"
            aria-label="Next week"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Wage + food" value={money(summary.totals.total)} />
          <Stat label="Paid" value={money(summary.totals.paid)} tone="success" />
          <Stat label="Balance" value={money(summary.totals.finalBalance)} tone={summary.totals.finalBalance > 0.5 ? 'danger' : 'default'} />
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Show all active workers</span>
          <Switch checked={showAll} onCheckedChange={setShowAll} />
        </label>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No payroll this week" description="No attendance or balances for the selected week." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
            <WeeklyTable summary={summary} rows={rows} />
          </div>
        )}
        <p className="px-1 text-[11px] text-muted-foreground">
          Amounts in ₹. Final balance &gt; 0 means you owe the worker. Transport &amp; rent are provisions and don’t
          affect balances.
        </p>
      </div>

      {/* Print sheet — only this renders on paper (see @media print in index.css). */}
      <div className="weekly-print hidden print:block">
        <h1 className="mb-1 text-base font-bold">Weekly summary · {formatRange(summary.start, summary.end)}</h1>
        <WeeklyTable summary={summary} rows={rows} print />
      </div>

      {/* Full-screen, landscape-friendly view. */}
      {fullscreen && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-background print:hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 safe-top">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">Weekly summary</p>
              <p className="truncate text-xs text-muted-foreground">{formatRange(summary.start, summary.end)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={print}
                className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
                aria-label="Print this week"
              >
                <Printer className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
                aria-label="Exit full screen"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No payroll this week" description="No attendance or balances for the selected week." />
            ) : (
              <div className="min-w-max">
                <WeeklyTable summary={summary} rows={rows} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** The wide payroll register table, reused inline, full-screen and in print. */
function WeeklyTable({
  summary,
  rows,
  print = false,
}: {
  summary: WeeklySummary
  rows: WeeklySummary['rows']
  print?: boolean
}) {
  return (
    <table
      className={cn(
        'w-full border-collapse text-right',
        print ? 'weekly-print-table text-[10px]' : 'text-xs',
      )}
    >
      <thead>
        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
          <th className={cn('px-3 py-2 text-left font-medium', !print && 'sticky left-0 z-10 bg-card')}>Worker</th>
          {summary.days.map((d) => (
            <th key={d} className="px-2 py-2 font-medium">
              {format(parseISO(d), print ? 'EEE' : 'EEEEE')}
            </th>
          ))}
          <th className="px-2 py-2 font-medium">Days</th>
          <th className="px-2 py-2 font-medium">Wage</th>
          <th className="px-2 py-2 font-medium">Food</th>
          <th className="px-2 py-2 font-medium">Total</th>
          <th className="px-2 py-2 font-medium">Paid</th>
          <th className="px-2 py-2 font-medium">Prev</th>
          <th className="px-3 py-2 font-medium">Final</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r) => (
          <tr key={r.worker.id} className="border-b border-border/60 last:border-0">
            <td className={cn('px-3 py-2 text-left font-medium', !print && 'sticky left-0 z-10 max-w-[7rem] truncate bg-card')}>
              {r.worker.name}
            </td>
            {r.perDay.map((d, i) => (
              <td key={i} className={cn('px-2 py-2', d === 0 && 'text-muted-foreground/40')}>
                {d === 0 ? '·' : days(d)}
              </td>
            ))}
            <td className="px-2 py-2 font-semibold">{days(r.totalDays)}</td>
            <td className="px-2 py-2">{Math.round(r.totalWage)}</td>
            <td className="px-2 py-2">{Math.round(r.food)}</td>
            <td className="px-2 py-2 font-semibold">{Math.round(r.total)}</td>
            <td className="px-2 py-2 text-success">{Math.round(r.paid)}</td>
            <td className="px-2 py-2 text-muted-foreground">{Math.round(r.previousBalance)}</td>
            <td className={cn('px-3 py-2 font-bold', r.finalBalance > 0.5 ? 'text-destructive' : 'text-foreground')}>
              {Math.round(r.finalBalance)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border bg-muted/40 font-semibold">
          <td className={cn('px-3 py-2 text-left', !print && 'sticky left-0 z-10 bg-muted/40')}>Total</td>
          {summary.days.map((_, i) => (
            <td key={i} className="px-2 py-2" />
          ))}
          <td className="px-2 py-2">{days(summary.totals.totalDays)}</td>
          <td className="px-2 py-2">{Math.round(summary.totals.totalWage)}</td>
          <td className="px-2 py-2">{Math.round(summary.totals.food)}</td>
          <td className="px-2 py-2">{Math.round(summary.totals.total)}</td>
          <td className="px-2 py-2 text-success">{Math.round(summary.totals.paid)}</td>
          <td className="px-2 py-2 text-muted-foreground">{Math.round(summary.totals.previousBalance)}</td>
          <td className="px-3 py-2">{Math.round(summary.totals.finalBalance)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
