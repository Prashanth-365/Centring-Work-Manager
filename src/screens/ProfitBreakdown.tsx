import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { MoneyText } from '@/components/MoneyText'
import { EmptyState } from '@/components/EmptyState'
import { PeriodSelector } from '@/components/PeriodSelector'
import {
  useAllAttendance,
  useAllMolds,
  useBuildings,
  useOwners,
  useSettings,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { buildingMargin, overhead } from '@/lib/compute/profit'
import { byId, buildingName } from '@/lib/select'
import {
  dateInPeriod,
  periodLabel,
  periodNow,
  type Period,
  type PeriodType,
  type WeekStart,
} from '@/lib/dates'
import { money } from '@/lib/format'

function periodFromParams(search: URLSearchParams): Period {
  const type = search.get('type')
  const anchor = search.get('anchor')
  const valid: PeriodType[] = ['week', 'month', 'year']
  return {
    type: valid.includes(type as PeriodType) ? (type as PeriodType) : 'month',
    anchor: anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : periodNow('month').anchor,
  }
}

export function ProfitBreakdown() {
  const [search, setSearch] = useSearchParams()
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const attendance = useAllAttendance()
  const workers = useWorkers()
  const txns = useTransactions()
  const settings = useSettings()
  const ws = (settings.weekStartsOn ?? 1) as WeekStart

  const [period, setPeriod] = React.useState<Period>(() => periodFromParams(search))
  React.useEffect(() => {
    setSearch({ type: period.type, anchor: period.anchor }, { replace: true })
  }, [period, setSearch])

  const ownersById = React.useMemo(() => byId(owners), [owners])
  const workersById = React.useMemo(() => byId(workers), [workers])

  // Filter attendance + transactions to the selected period.
  const periodAtt = React.useMemo(
    () => attendance.filter((a) => dateInPeriod(a.date, period, ws)),
    [attendance, period, ws],
  )
  const periodTxns = React.useMemo(
    () => txns.filter((t) => dateInPeriod(t.date, period, ws)),
    [txns, period, ws],
  )

  // Revenue / labour / margin per building, within the period.
  const perBuilding = React.useMemo(
    () =>
      buildings
        .map((b) => ({ building: b, ...buildingMargin(b.id, periodAtt, workersById, periodTxns) }))
        .filter((x) => x.revenue !== 0 || x.labour !== 0)
        .sort((a, b) => b.margin - a.margin),
    [buildings, periodAtt, workersById, periodTxns],
  )

  const oh = React.useMemo(
    () => overhead(workers, periodAtt, periodTxns, ws),
    [workers, periodAtt, periodTxns, ws],
  )

  const totalRevenue = perBuilding.reduce((s, x) => s + x.revenue, 0)
  const totalLabour = perBuilding.reduce((s, x) => s + x.labour, 0)
  const totalMargin = totalRevenue - totalLabour
  const net = totalMargin - oh.total

  const overheadLines = [
    { label: 'Food (calculated)', v: oh.food },
    { label: 'Transport', v: oh.transport },
    { label: 'Rent', v: oh.rent },
    { label: 'Material', v: oh.material },
    { label: 'Other', v: oh.other },
  ]

  const hasData = perBuilding.length > 0 || oh.total !== 0

  return (
    <>
      <PageHeader title="Profit breakdown" subtitle={periodLabel(period, ws)} back />
      <div className="space-y-4 p-4 pb-10">
        <PeriodSelector period={period} onChange={setPeriod} weekStartsOn={ws} />

        {/* Net profit headline */}
        <div className="rounded-xl border border-border bg-card p-4 text-center shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net profit</p>
          <p className="mt-1 text-3xl font-bold leading-none">
            <MoneyText value={net} />
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {money(totalMargin)} margin − {money(oh.total)} overhead
          </p>
        </div>

        {!hasData ? (
          <EmptyState icon={Receipt} title="No activity" description="Nothing recorded in this period." />
        ) : (
          <>
            {/* Revenue & labour per building */}
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-muted-foreground">
                <Building2 className="size-4" />
                Revenue per building
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {perBuilding.length === 0 ? (
                  <p className="px-3.5 py-3 text-sm text-muted-foreground">No building revenue or labour.</p>
                ) : (
                  perBuilding.map(({ building: b, revenue, labour, margin }) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{buildingName(b, ownersById)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {money(revenue)} revenue · {money(labour)} labour
                        </p>
                      </div>
                      <MoneyText value={margin} className="text-sm" />
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between gap-2 bg-muted/40 px-3.5 py-2.5 font-semibold">
                  <span className="text-sm">Total margin</span>
                  <MoneyText value={totalMargin} className="text-sm" />
                </div>
              </div>
            </section>

            {/* Overhead lines */}
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-muted-foreground">
                <Receipt className="size-4" />
                Overhead
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {overheadLines.map((x) => (
                  <div key={x.label} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                    <span className="text-sm text-muted-foreground">{x.label}</span>
                    <span className="tabular text-sm font-medium">{money(x.v)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 bg-muted/40 px-3.5 py-2.5 font-semibold">
                  <span className="text-sm">Total overhead</span>
                  <span className="tabular text-sm">{money(oh.total)}</span>
                </div>
              </div>
            </section>

            {/* Net */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3 shadow-card">
              <span className="text-sm font-semibold">Net profit</span>
              <MoneyText value={net} className="text-base" />
            </div>
          </>
        )}
      </div>
    </>
  )
}
