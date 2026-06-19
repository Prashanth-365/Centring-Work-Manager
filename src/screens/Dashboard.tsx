import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  ChevronRight,
  HandCoins,
  PiggyBank,
  Plus,
  Settings as SettingsIcon,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Thumb } from '@/components/Thumb'
import { StatusPill } from '@/components/StatusPill'
import { Stat } from '@/components/Stat'
import { MoneyText } from '@/components/MoneyText'
import { EmptyState } from '@/components/EmptyState'
import { Fab } from '@/components/Fab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useAllAttendance,
  useAllMolds,
  useBuildings,
  useOtherExpenseTypes,
  useOwners,
  useReviewCount,
  useSettings,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { byId, buildingName, computeBuilding, groupBy, moldOutstanding } from '@/lib/select'
import { buildingMargin, overhead } from '@/lib/compute/profit'
import { workerBalance } from '@/lib/compute/balance'
import { foodForEntries } from '@/lib/compute/food'
import { weeklySummary } from '@/lib/compute/weekly'
import { PeriodSelector } from '@/components/PeriodSelector'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  daysSince,
  dateInPeriod,
  periodLabel,
  periodNow,
  periodRange,
  toISODate,
  todayISO,
  weekKey,
  type Period,
  type WeekStart,
} from '@/lib/dates'
import { money, pluralize } from '@/lib/format'
import type { Worker } from '@/lib/types'
import { format } from 'date-fns'

export function Dashboard() {
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const attendance = useAllAttendance()
  const workers = useWorkers()
  const txns = useTransactions()
  const settings = useSettings()
  const otherTypes = useOtherExpenseTypes()
  const reviewCount = useReviewCount()

  const [foodOpen, setFoodOpen] = React.useState(false)

  const ws = (settings.weekStartsOn ?? 1) as WeekStart
  const threshold = settings.collectAlertDays ?? 18

  const ownersById = React.useMemo(() => byId(owners), [owners])
  const workersById = React.useMemo(() => byId(workers), [workers])
  const moldsByBuilding = React.useMemo(() => groupBy(molds, (m) => m.buildingId), [molds])
  const attByWorker = React.useMemo(() => groupBy(attendance, (a) => a.workerId), [attendance])
  const txByWorker = React.useMemo(() => groupBy(txns, (t) => t.workerId), [txns])

  // Per-building computed (margin / receivable / current mold)
  const buildingComputed = React.useMemo(
    () =>
      buildings.map((b) => ({
        building: b,
        ...computeBuilding(b.id, moldsByBuilding.get(b.id) ?? [], attendance, workersById, txns),
      })),
    [buildings, moldsByBuilding, attendance, workersById, txns],
  )

  const activeBuildings = buildingComputed.filter((x) => x.building.status !== 'Closed')

  // Period selectors — Money and Overhead each scope their figures independently.
  const [moneyPeriod, setMoneyPeriod] = React.useState<Period>(() => periodNow('month'))
  const [ohPeriod, setOhPeriod] = React.useState<Period>(() => periodNow('month'))

  // Profit (revenue − labour − overhead) scoped to the Money period.
  const moneyAtt = React.useMemo(
    () => attendance.filter((a) => dateInPeriod(a.date, moneyPeriod, ws)),
    [attendance, moneyPeriod, ws],
  )
  const moneyTxns = React.useMemo(
    () => txns.filter((t) => dateInPeriod(t.date, moneyPeriod, ws)),
    [txns, moneyPeriod, ws],
  )
  const periodMargin = React.useMemo(
    () => buildings.reduce((s, b) => s + buildingMargin(b.id, moneyAtt, workersById, moneyTxns).margin, 0),
    [buildings, moneyAtt, workersById, moneyTxns],
  )
  const ohMoney = React.useMemo(
    () => overhead(workers, moneyAtt, moneyTxns, ws),
    [workers, moneyAtt, moneyTxns, ws],
  )
  const totalProfit = periodMargin - ohMoney.total

  // Overhead scoped to the Overhead period.
  const ohAtt = React.useMemo(
    () => attendance.filter((a) => dateInPeriod(a.date, ohPeriod, ws)),
    [attendance, ohPeriod, ws],
  )
  const ohTxns = React.useMemo(
    () => txns.filter((t) => dateInPeriod(t.date, ohPeriod, ws)),
    [txns, ohPeriod, ws],
  )
  const ohPeriodTotals = React.useMemo(
    () => overhead(workers, ohAtt, ohTxns, ws),
    [workers, ohAtt, ohTxns, ws],
  )

  // Break OtherExpense down by type so each shows as its own clickable line.
  const ohOther = React.useMemo(() => {
    const known = new Set(otherTypes.map((t) => t.name))
    const byType = new Map<string, number>()
    let rest = 0
    for (const t of ohTxns) {
      if (t.subCategory !== 'OtherExpense') continue
      const name = t.otherExpenseType ?? ''
      if (name && known.has(name)) byType.set(name, (byType.get(name) ?? 0) + t.amount)
      else rest += t.amount
    }
    return { byType: [...byType.entries()], rest }
  }, [ohTxns, otherTypes])

  // Clickable overhead line items. Transaction-backed lines deep-link to the
  // assigned-payments list filtered by that category AND the overhead period;
  // Food is a calculated figure, so it opens a per-worker breakdown instead.
  const ohRange = React.useMemo(() => periodRange(ohPeriod, ws), [ohPeriod, ws])
  const ohQuery = (cat: string) =>
    `tab=assigned&cat=${encodeURIComponent(cat)}&from=${toISODate(ohRange.start)}&to=${toISODate(ohRange.end)}`
  const overheadLines: { key: string; label: string; amount: number; food?: boolean }[] = [
    { key: 'food', label: 'Food', amount: ohPeriodTotals.food, food: true },
    { key: 'Transport', label: 'Transport', amount: ohPeriodTotals.transport },
    { key: 'Rent', label: 'Rent', amount: ohPeriodTotals.rent },
    { key: 'Material', label: 'Material', amount: ohPeriodTotals.material },
    ...ohOther.byType.map(([name, amt]) => ({ key: `other:${name}`, label: name, amount: amt })),
    ...(Math.abs(ohOther.rest) > 0.5 ? [{ key: 'other:__rest__', label: 'Other', amount: ohOther.rest }] : []),
  ]

  // Per-worker calculated food for the breakdown dialog (sums to overhead food).
  const foodRows = React.useMemo(() => {
    const byWorker = groupBy(ohAtt, (a) => a.workerId)
    return workers
      .map((w) => ({ w, food: foodForEntries(w, byWorker.get(w.id) ?? [], ws) }))
      .filter((r) => r.food > 0.5)
      .sort((a, b) => b.food - a.food)
  }, [ohAtt, workers, ws])

  // Receivables
  const totalReceivable = buildingComputed.reduce((s, x) => s + x.receivable, 0)

  // Go-collect: work done (cast or material removed) and not Paid past threshold.
  const goCollect = React.useMemo(() => {
    const items: { mold: (typeof molds)[number]; building: (typeof buildings)[number]; owner?: string; amount: number; days: number }[] = []
    for (const b of buildings) {
      if (b.status === 'Closed') continue
      for (const m of moldsByBuilding.get(b.id) ?? []) {
        if ((m.workStatus === 'Completed' || m.workStatus === 'Material Removed') && m.paymentStatus !== 'Paid') {
          const ref = m.removedDate ?? m.completedDate ?? m.startDate
          const overdue = ref ? daysSince(ref) : daysSince(format(new Date(m.updatedAt), 'yyyy-MM-dd'))
          if (overdue >= threshold) {
            items.push({
              mold: m,
              building: b,
              owner: b.ownerId ? ownersById.get(b.ownerId)?.name : undefined,
              amount: moldOutstanding(m, txns),
              days: overdue,
            })
          }
        }
      }
    }
    return items.sort((a, b) => b.days - a.days)
  }, [buildings, moldsByBuilding, ownersById, txns, threshold])

  // Money owed to workers
  const workerOwed = React.useMemo(() => {
    const rows = workers
      .map((w) => ({ w, bal: workerBalance(w, attByWorker.get(w.id) ?? [], txByWorker.get(w.id) ?? [], ws).balance }))
      .filter((r) => r.bal > 0.5)
      .sort((a, b) => b.bal - a.bal)
    return { total: rows.reduce((s, r) => s + r.bal, 0), rows }
  }, [workers, attByWorker, txByWorker, ws])

  // This week's wages
  const week = React.useMemo(
    () => weeklySummary(workers, attendance, txns, weekKey(todayISO(), ws), ws),
    [workers, attendance, txns, ws],
  )

  const hasData = buildings.length > 0 || workers.length > 0 || txns.length > 0

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-lg safe-top">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, d MMM')}</p>
            <h1 className="text-xl font-bold tracking-tight">Centering</h1>
          </div>
          <Button asChild variant="ghost" size="icon">
            <Link to="/settings" aria-label="Settings">
              <SettingsIcon className="size-5" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-5 p-4 pb-28">
        {!hasData ? (
          <EmptyState
            icon={Building2}
            title="Welcome to Centering"
            description="Start by adding a building, then record attendance and sync your payments."
            action={
              <Button asChild>
                <Link to="/buildings/new">
                  <Plus className="size-4" />
                  Add building
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            {/* Review nudge */}
            {reviewCount > 0 && (
              <Link
                to="/payments"
                className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 transition active:scale-[0.99]"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Wallet className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{pluralize(reviewCount, 'transaction')} to assign</p>
                  <p className="text-xs text-muted-foreground">Tap to review and assign</p>
                </div>
                <ArrowRight className="size-5 text-primary" />
              </Link>
            )}

            {/* Operational: active buildings */}
            <section className="space-y-2.5">
              <SectionTitle icon={Building2} title="Active work" trailing={`${activeBuildings.length}`} to="/buildings" />
              {activeBuildings.length === 0 ? (
                <EmptyState icon={Building2} title="No active buildings" />
              ) : (
                activeBuildings.map(({ building: b, margin, current, unpaidDoneAmount }) => {
                  return (
                    <Link
                      key={b.id}
                      to={`/buildings/${b.id}`}
                      className="block rounded-xl border border-border bg-card p-3.5 shadow-card transition active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-3">
                        <Thumb blob={b.photoThumb} name={buildingName(b, ownersById)} square />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-semibold">{buildingName(b, ownersById)}</p>
                            <StatusPill status={b.status} kind="building" />
                          </div>
                          {current && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">On {current.floorName}:</span>
                              <StatusPill status={current.workStatus} kind="work" />
                              <StatusPill status={current.paymentStatus} kind="payment" />
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                              Margin <MoneyText value={margin} className="text-xs" />
                            </span>
                            {unpaidDoneAmount > 0 && (
                              <Badge variant="danger">unpaid {money(unpaidDoneAmount)}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })
              )}
            </section>

            {/* Go collect */}
            {goCollect.length > 0 && (
              <section className="space-y-2.5">
                <SectionTitle icon={AlertTriangle} title="Go collect" trailing={`${goCollect.length}`} />
                <div className="space-y-2">
                  {goCollect.slice(0, 6).map(({ mold, building, owner, amount, days }) => (
                    <Link
                      key={mold.id}
                      to={`/molds/${mold.id}`}
                      className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 transition active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {buildingName(building, ownersById)} · {mold.floorName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {owner ?? 'No owner'} · {days} days overdue
                        </p>
                      </div>
                      {amount > 0 && <span className="tabular text-sm font-bold text-destructive">{money(amount)}</span>}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Analytical sections — two columns on wide screens. */}
            <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
            {/* Money */}
            <section className="space-y-2.5">
              <SectionTitle icon={PiggyBank} title="Money" />
              <PeriodSelector period={moneyPeriod} onChange={setMoneyPeriod} weekStartsOn={ws} />
              <div className="grid grid-cols-2 gap-2.5">
                <Link to={`/profit?type=${moneyPeriod.type}&anchor=${moneyPeriod.anchor}`} className="block transition active:scale-[0.99]">
                  <Stat label="Total profit" value={<MoneyText value={totalProfit} />} icon={TrendingUp} sub="View breakdown" />
                </Link>
                <Link to="/buildings?filter=due" className="block transition active:scale-[0.99]">
                  <Stat label="Receivables" value={money(totalReceivable)} icon={HandCoins} tone={totalReceivable > 0 ? 'warning' : 'default'} sub="Owners owe you" />
                </Link>
                <Link to="/workers?filter=owed" className="block transition active:scale-[0.99]">
                  <Stat label="Owed to workers" value={money(workerOwed.total)} icon={Wallet} tone={workerOwed.total > 0 ? 'danger' : 'default'} sub={`${workerOwed.rows.length} workers`} />
                </Link>
                <Link to="/weekly" className="block transition active:scale-[0.99]">
                  <Stat label="This week" value={money(week.totals.total)} icon={Banknote} sub={`Paid ${money(week.totals.paid)}`} />
                </Link>
              </div>
            </section>

            {/* Overhead */}
            <section className="space-y-2.5">
              <SectionTitle icon={Banknote} title="Overhead" trailing={money(ohPeriodTotals.total)} />
              <PeriodSelector period={ohPeriod} onChange={setOhPeriod} weekStartsOn={ws} />
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
                {overheadLines.map((line) =>
                  line.food ? (
                    <button
                      key={line.key}
                      type="button"
                      onClick={() => setFoodOpen(true)}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition active:bg-accent"
                    >
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {line.label}
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">calculated</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="tabular text-sm font-medium">{money(line.amount)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </span>
                    </button>
                  ) : (
                    <Link
                      key={line.key}
                      to={`/payments?${ohQuery(line.key)}`}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 transition active:bg-accent"
                    >
                      <span className="text-sm text-muted-foreground">{line.label}</span>
                      <span className="flex items-center gap-1">
                        <span className="tabular text-sm font-medium">{money(line.amount)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  ),
                )}
                <div className="flex items-center justify-between gap-2 bg-muted/40 px-3.5 py-2.5 font-semibold">
                  <span className="text-sm">Total overhead</span>
                  <span className="tabular text-sm">{money(ohPeriodTotals.total)}</span>
                </div>
              </div>
            </section>

            {/* Profit per building */}
            <section className="space-y-2.5">
              <SectionTitle icon={Building2} title="Profit by building" />
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {[...buildingComputed]
                  .sort((a, b) => {
                    const ac = a.building.status === 'Closed' ? 1 : 0
                    const bc = b.building.status === 'Closed' ? 1 : 0
                    return ac - bc || b.margin - a.margin
                  })
                  .slice(0, 8)
                  .map(({ building: b, margin, revenue, labour }) => (
                    <Link
                      key={b.id}
                      to={`/buildings/${b.id}`}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 transition active:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{buildingName(b, ownersById)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {money(revenue)} recd · {money(labour)} labour
                        </p>
                      </div>
                      <MoneyText value={margin} className="text-sm" />
                    </Link>
                  ))}
              </div>
            </section>

            {/* Who you owe */}
            {workerOwed.rows.length > 0 && (
              <section className="space-y-2.5">
                <SectionTitle icon={Wallet} title="You owe" trailing={money(workerOwed.total)} to="/weekly" />
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {workerOwed.rows.slice(0, 6).map(({ w, bal }) => (
                    <Link
                      key={w.id}
                      to={`/workers/${w.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 transition active:bg-accent"
                    >
                      <Thumb blob={w.photoThumb} name={w.name} className="size-9 text-xs" />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</p>
                      <MoneyText value={bal} className="text-sm" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
            </div>

            <FoodBreakdownDialog
              open={foodOpen}
              onOpenChange={setFoodOpen}
              rows={foodRows}
              total={ohPeriodTotals.food}
              periodText={periodLabel(ohPeriod, ws)}
            />
          </>
        )}
      </div>
      <Fab to="/attendance/new" icon={Plus} label="Attendance" />
    </>
  )
}

function SectionTitle({
  icon: Icon,
  title,
  trailing,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  trailing?: string
  to?: string
}) {
  const inner = (
    <div className="flex items-center justify-between px-1">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </h2>
      {trailing && (
        <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
          {trailing}
          {to && <ChevronRight className="size-3.5" />}
        </span>
      )}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

/** Per-worker calculated-food breakdown for the selected overhead period. Food
 * is a calculated cost (not a transaction), so it opens here instead of the
 * assigned-payments list. */
function FoodBreakdownDialog({
  open,
  onOpenChange,
  rows,
  total,
  periodText,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rows: { w: Worker; food: number }[]
  total: number
  periodText: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Food breakdown</DialogTitle>
          <DialogDescription>Calculated food per worker · {periodText}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No food calculated in this period.</p>
        ) : (
          <div className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map(({ w, food }) => (
              <div key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                <Thumb blob={w.photoThumb} name={w.name} className="size-8 text-xs" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</p>
                <span className="tabular text-sm font-semibold">{money(food)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2.5 font-semibold">
              <span className="text-sm">Total food</span>
              <span className="tabular text-sm">{money(total)}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
