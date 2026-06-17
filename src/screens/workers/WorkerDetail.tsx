import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ClipboardList, Pencil, Phone, Wallet } from 'lucide-react'
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
  useSettings,
  useTransactionsForWorker,
  useWorker,
} from '@/lib/hooks'
import { workerBalance } from '@/lib/compute/balance'
import { BALANCE_SUBCATS } from '@/lib/constants'
import { byId } from '@/lib/select'
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
  const molds = useAllMolds()
  const settings = useSettings()
  const buildingsById = React.useMemo(() => byId(buildings), [buildings])
  const moldsById = React.useMemo(() => byId(molds), [molds])

  if (!worker) return <PageHeader title="Worker" back />
  const ws = (settings.weekStartsOn ?? 1) as WeekStart
  const bal = workerBalance(worker, attendance, txns, ws)
  const payTxns = [...txns].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <PageHeader
        title={worker.name}
        subtitle={`${worker.type} · ${worker.code}`}
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
              {money(worker.dailyWage)}/day · Food: {FOOD_LABEL[worker.foodMode]}
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
                {attendance.map((a) => {
                  const b = buildingsById.get(a.buildingId)
                  const m = a.moldId ? moldsById.get(a.moldId) : undefined
                  return (
                    <Link
                      key={a.id}
                      to={`/attendance/${a.id}/edit`}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 transition active:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {b?.name ?? 'Building'}
                          {m ? ` · ${m.floorName}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-sm font-semibold">{days(a.dayFraction)} day</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {money(a.dayFraction * worker.dailyWage)}
                        </p>
                      </div>
                    </Link>
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
