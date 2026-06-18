import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ClipboardList, Pencil, Phone, UtensilsCrossed, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Thumb } from '@/components/Thumb'
import { Stat } from '@/components/Stat'
import { MoneyText } from '@/components/MoneyText'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useAllMolds,
  useAttendanceForWorker,
  useBuildings,
  useOwners,
  useSettings,
  useTransactionsForWorker,
  useWorker,
} from '@/lib/hooks'
import { workerBalance } from '@/lib/compute/balance'
import { currentWage, wageOnDate } from '@/lib/compute/wage'
import { dailyFoodBreakdown, type FoodEntry } from '@/lib/compute/food'
import { BALANCE_SUBCATS } from '@/lib/constants'
import { byId, buildingName } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { days, money } from '@/lib/format'
import type { WeekStart } from '@/lib/dates'

const FOOD_LABEL: Record<string, string> = {
  meal: 'Per meal',
  fixedPerDay: 'Fixed / day',
  fixedPerWeek: 'Fixed / week',
}

export function WorkerDetail() {
  const { id } = useParams()
  const worker = useWorker(id)
  const attendance = useAttendanceForWorker(id)
  const txns = useTransactionsForWorker(id)
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const settings = useSettings()
  const buildingsById = React.useMemo(() => byId(buildings), [buildings])
  const ownersById = React.useMemo(() => byId(owners), [owners])
  const moldsById = React.useMemo(() => byId(molds), [molds])

  if (!worker) return <PageHeader title="Worker" back />
  const ws = (settings.weekStartsOn ?? 1) as WeekStart
  const bal = workerBalance(worker, attendance, txns, ws)
  const payTxns = [...txns].sort((a, b) => (a.date < b.date ? 1 : -1))

  // Computed daily food per day (display-only — never a transaction, no
  // double-count). Shown as a single line at the end of each day's lines.
  const foodByDate = new Map<string, number>()
  for (const f of dailyFoodBreakdown(worker, attendance as FoodEntry[])) {
    foodByDate.set(f.date, f.foodAmount)
  }
  // Attendance rows interleaved with a food line whenever the date changes.
  const sortedAttendance = [...attendance].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <PageHeader
        title={worker.name}
        subtitle={worker.type}
        back
        actions={
          <Button asChild variant="ghost" size="icon">
            <Link to={`/workers/${worker.id}/edit`} aria-label="Edit">
              <Pencil className="size-5" />
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <Thumb blob={worker.photoThumb} name={worker.name} className="size-14 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="muted">{worker.type}</Badge>
              {!worker.active && <Badge variant="outline">Inactive</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {money(currentWage(worker))}/day · Food: {FOOD_LABEL[worker.foodMode]}
            </p>
          </div>
          {worker.phone && (
            <Button asChild variant="outline" size="icon">
              <a href={`tel:${worker.phone}`} aria-label="Call">
                <Phone className="size-5" />
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Owed" value={money(bal.owed)} sub="Wage + food" />
          <Stat label="Paid" value={money(bal.paid)} tone="success" />
          <Stat
            label="Balance"
            value={<MoneyText value={bal.balance} balance />}
            sub={bal.balance > 0.5 ? 'you owe' : bal.balance < -0.5 ? 'advance' : 'settled'}
          />
        </div>

        <Tabs defaultValue="attendance">
          <TabsList className="w-full">
            <TabsTrigger value="attendance">
              <ClipboardList className="size-4" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="payments">
              <Wallet className="size-4" />
              Payments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            {attendance.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No attendance" />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {sortedAttendance.map((a, i) => {
                  const b = buildingsById.get(a.buildingId)
                  const m = a.moldId ? moldsById.get(a.moldId) : undefined
                  // Last line for this date? (rows are sorted newest-first, grouped by date)
                  const isDayEnd = sortedAttendance[i + 1]?.date !== a.date
                  const food = foodByDate.get(a.date) ?? 0
                  return (
                    <React.Fragment key={a.id}>
                      <Link
                        to={`/attendance/${a.id}/edit`}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 transition active:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {buildingName(b, ownersById)}
                            {m ? ` · ${m.floorName}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="tabular text-sm font-semibold">{days(a.dayFraction)} day</p>
                          <p className="tabular text-xs text-muted-foreground">
                            {money(a.dayFraction * wageOnDate(worker, a.date))}
                          </p>
                        </div>
                      </Link>
                      {isDayEnd && food > 0 && (
                        <div className="flex items-center justify-between gap-2 bg-muted/40 px-3.5 py-1.5">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UtensilsCrossed className="size-3.5" />
                            Food — {formatDate(a.date)}
                          </span>
                          <span className="tabular text-xs font-medium text-muted-foreground">{money(food)}</span>
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments">
            {payTxns.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments assigned" />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {payTxns.map((t) => {
                  const affectsBalance = BALANCE_SUBCATS.has(t.subCategory)
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.subCategory}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(t.date)}
                          {!affectsBalance && ' · provision'}
                        </p>
                      </div>
                      <span className="tabular text-sm font-semibold">{money(t.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
