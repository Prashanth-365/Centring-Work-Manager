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
  useOwners,
  useReviewCount,
  useSettings,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { byId, buildingName, computeBuilding, groupBy, moldOutstanding } from '@/lib/select'
import { overhead } from '@/lib/compute/profit'
import { workerBalance } from '@/lib/compute/balance'
import { weeklySummary } from '@/lib/compute/weekly'
import { daysSince, formatDate, monthRange, dateInRange, todayISO, weekKey, type WeekStart } from '@/lib/dates'
import { money, pluralize } from '@/lib/format'
import { format, parseISO } from 'date-fns'

export function Dashboard() {
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const attendance = useAllAttendance()
  const workers = useWorkers()
  const txns = useTransactions()
  const settings = useSettings()
  const reviewCount = useReviewCount()

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

  // Total profit after overhead (all-time)
  const totalMargin = buildingComputed.reduce((s, x) => s + x.margin, 0)
  const ohAll = React.useMemo(() => overhead(workers, attendance, txns, ws), [workers, attendance, txns, ws])
  const totalProfit = totalMargin - ohAll.total

  // Overhead this month
  const { start: mStart, end: mEnd } = monthRange(todayISO())
  const monthAtt = React.useMemo(() => attendance.filter((a) => dateInRange(a.date, mStart, mEnd)), [attendance, mStart, mEnd])
  const monthTxns = React.useMemo(() => txns.filter((t) => dateInRange(t.date, mStart, mEnd)), [txns, mStart, mEnd])
  const ohMonth = React.useMemo(() => overhead(workers, monthAtt, monthTxns, ws), [workers, monthAtt, monthTxns, ws])

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

            {/* Money */}
            <section className="space-y-2.5">
              <SectionTitle icon={PiggyBank} title="Money" />
              <div className="grid grid-cols-2 gap-2.5">
                <Stat label="Total profit" value={<MoneyText value={totalProfit} />} icon={TrendingUp} sub="After overhead" />
                <Stat label="Receivables" value={money(totalReceivable)} icon={HandCoins} tone={totalReceivable > 0 ? 'warning' : 'default'} sub="Owners owe you" />
                <Stat label="Owed to workers" value={money(workerOwed.total)} icon={Wallet} tone={workerOwed.total > 0 ? 'danger' : 'default'} sub={`${workerOwed.rows.length} workers`} />
                <Stat label="This week" value={money(week.totals.total)} icon={Banknote} sub={`Paid ${money(week.totals.paid)}`} />
              </div>
            </section>

            {/* Overhead this month */}
            <section className="space-y-2.5">
              <SectionTitle icon={Banknote} title={`Overhead · ${format(new Date(), 'MMM')}`} trailing={money(ohMonth.total)} />
              <div className="grid grid-cols-5 gap-1.5 rounded-xl border border-border bg-card p-3 text-center shadow-card">
                {[
                  { label: 'Food', v: ohMonth.food },
                  { label: 'Transp', v: ohMonth.transport },
                  { label: 'Rent', v: ohMonth.rent },
                  { label: 'Material', v: ohMonth.material },
                  { label: 'Other', v: ohMonth.other },
                ].map((x) => (
                  <div key={x.label}>
                    <p className="tabular text-sm font-bold">{money(x.v)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{x.label}</p>
                  </div>
                ))}
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
