import * as React from 'react'
import { format, parseISO } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Printer,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Stat } from '@/components/Stat'
import { Switch } from '@/components/ui/switch'
import { useAllAttendance, useSettings, useTransactions, useWorkers } from '@/lib/hooks'
import { weeklySummary, type WeeklyRow, type WeeklySummary, type WeeklyTotals } from '@/lib/compute/weekly'
import { formatRange, shiftWeek, todayISO, weekKey, type WeekStart } from '@/lib/dates'
import { days, money } from '@/lib/format'
import { isNative, lockLandscape, unlockOrientation } from '@/lib/native'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/** Totals over only the displayed rows, so the footer/stat cards always foot. */
function sumRows(rows: WeeklyRow[]): WeeklyTotals {
  return rows.reduce<WeeklyTotals>(
    (a, r) => ({
      totalDays: a.totalDays + r.totalDays,
      totalWage: a.totalWage + r.totalWage,
      food: a.food + r.food,
      total: a.total + r.total,
      paid: a.paid + r.paid,
      current: a.current + r.current,
      previousBalance: a.previousBalance + r.previousBalance,
      finalBalance: a.finalBalance + r.finalBalance,
    }),
    { totalDays: 0, totalWage: 0, food: 0, total: 0, paid: 0, current: 0, previousBalance: 0, finalBalance: 0 },
  )
}

export function Weekly() {
  const workers = useWorkers()
  const attendance = useAllAttendance()
  const txns = useTransactions()
  const settings = useSettings()
  const ws = (settings.weekStartsOn ?? 1) as WeekStart

  const [weekStart, setWeekStart] = React.useState(() => weekKey(todayISO(), ws))
  const [showAll, setShowAll] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)

  React.useEffect(() => {
    setWeekStart((w) => weekKey(w, ws))
  }, [ws])

  // Full-screen view is optimised for landscape (the table is wide). Try to lock
  // the device to landscape while it's open and release the lock on exit; reset
  // the zoom each time it opens.
  React.useEffect(() => {
    if (!fullscreen) return
    setZoom(1)
    void lockLandscape()
    return () => unlockOrientation()
  }, [fullscreen])

  const summary = React.useMemo(
    () => weeklySummary(workers, attendance, txns, weekStart, ws),
    [workers, attendance, txns, weekStart, ws],
  )

  // Only workers who actually worked this week (days > 0). The "Show all" toggle
  // reveals everyone (incl. zero-day workers carrying a balance).
  const rows = showAll ? summary.rows : summary.rows.filter((r) => r.totalDays > 0)
  const totals = React.useMemo(() => sumRows(rows), [rows])
  const isThisWeek = weekStart === weekKey(todayISO(), ws)

  async function print() {
    // Web: the @media print sheet handles landscape. Native: the WebView can't
    // open the system print dialog, so render a landscape PDF and share/save it.
    if (!isNative()) {
      window.print()
      return
    }
    try {
      const { location } = await import('@/lib/weeklyPdf').then((m) =>
        m.shareWeeklyPdf({
          title: `Weekly summary · ${formatRange(summary.start, summary.end)}`,
          days: summary.days,
          rows,
          totals,
        }),
      )
      toast.success(location === 'download' ? 'PDF created.' : `Saved ${location}`)
    } catch (e) {
      toast.error((e as Error).message || 'Could not create the weekly PDF.')
    }
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
          <Stat label="Wage + food" value={money(totals.total)} />
          <Stat label="Paid" value={money(totals.paid)} tone="success" />
          <Stat label="Balance" value={money(totals.finalBalance)} tone={totals.finalBalance > 0.5 ? 'danger' : 'default'} />
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Show all active workers</span>
          <Switch checked={showAll} onCheckedChange={setShowAll} />
        </label>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No payroll this week" description="No workers had attendance in the selected week." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
            <WeeklyTable days={summary.days} rows={rows} totals={totals} />
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
        <WeeklyTable days={summary.days} rows={rows} totals={totals} print />
      </div>

      {/* Full-screen, landscape-friendly view with pinch / button zoom. */}
      {fullscreen && (
        <FullscreenWeekly
          summary={summary}
          rows={rows}
          totals={totals}
          zoom={zoom}
          setZoom={setZoom}
          onPrint={print}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  )
}

function FullscreenWeekly({
  summary,
  rows,
  totals,
  zoom,
  setZoom,
  onPrint,
  onClose,
}: {
  summary: WeeklySummary
  rows: WeeklyRow[]
  totals: WeeklyTotals
  zoom: number
  setZoom: React.Dispatch<React.SetStateAction<number>>
  onPrint: () => void
  onClose: () => void
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Pinch-to-zoom. Listeners are non-passive so preventDefault() stops the
  // browser's own page zoom while we scale the table via the CSS `zoom` property.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let startDist = 0
    let startZoom = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoomRef.current
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        setZoom(clampZoom((startZoom * dist(e.touches)) / startDist))
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [setZoom])

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-background print:hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 safe-top">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Weekly summary</p>
          <p className="truncate text-xs text-muted-foreground">{formatRange(summary.start, summary.end)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Zoom controls */}
          <div className="mr-1 flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - 0.25))}
              className="flex size-8 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95 disabled:opacity-40"
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[2.75rem] rounded-full px-1 text-center text-xs font-semibold tabular-nums transition hover:bg-accent"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + 0.25))}
              className="flex size-8 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95 disabled:opacity-40"
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onPrint}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
            aria-label="Print this week"
          >
            <Printer className="size-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
            aria-label="Exit full screen"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 touch-none overflow-auto p-3">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No payroll this week" description="No workers had attendance in the selected week." />
        ) : (
          <div className="min-w-max origin-top-left" style={{ zoom } as React.CSSProperties}>
            <WeeklyTable days={summary.days} rows={rows} totals={totals} />
          </div>
        )}
      </div>
    </div>
  )
}

/** The wide payroll register table, reused inline, full-screen and in print. */
function WeeklyTable({
  days: dayList,
  rows,
  totals,
  print = false,
}: {
  days: string[]
  rows: WeeklyRow[]
  totals: WeeklyTotals
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
          {dayList.map((d) => (
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
          {dayList.map((_, i) => (
            <td key={i} className="px-2 py-2" />
          ))}
          <td className="px-2 py-2">{days(totals.totalDays)}</td>
          <td className="px-2 py-2">{Math.round(totals.totalWage)}</td>
          <td className="px-2 py-2">{Math.round(totals.food)}</td>
          <td className="px-2 py-2">{Math.round(totals.total)}</td>
          <td className="px-2 py-2 text-success">{Math.round(totals.paid)}</td>
          <td className="px-2 py-2 text-muted-foreground">{Math.round(totals.previousBalance)}</td>
          <td className="px-3 py-2">{Math.round(totals.finalBalance)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
