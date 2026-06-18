import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { StatusPill } from '@/components/StatusPill'
import { MoneyText } from '@/components/MoneyText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAllAttendance,
  useAllMolds,
  useBuildings,
  useOwners,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { byId, buildingName, computeBuilding, groupBy } from '@/lib/select'
import { BUILDING_STATUSES, MOLD_PAYMENT_STATUSES } from '@/lib/constants'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = '__all__'

export function BuildingsList() {
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const attendance = useAllAttendance()
  const workers = useWorkers()
  const txns = useTransactions()
  const [params] = useSearchParams()

  // Main filters
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState<string>(ALL)
  const [ownerId, setOwnerId] = React.useState<string>(ALL)
  // `?filter=due` from the dashboard pre-applies the due/unpaid quick filter.
  const [dueOnly, setDueOnly] = React.useState(params.get('filter') === 'due')
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [location, setLocation] = React.useState('')
  const [fromDate, setFromDate] = React.useState('')
  const [toDate, setToDate] = React.useState('')
  const [paymentStatus, setPaymentStatus] = React.useState<string>(ALL)

  React.useEffect(() => {
    if (params.get('filter') === 'due') setDueOnly(true)
  }, [params])

  const ownersById = React.useMemo(() => byId(owners), [owners])
  const workersById = React.useMemo(() => byId(workers), [workers])
  const moldsByBuilding = React.useMemo(() => groupBy(molds, (m) => m.buildingId), [molds])

  // Compute each building once (used for both filtering and the card body).
  const rows = React.useMemo(
    () =>
      buildings.map((b) => {
        const bm = moldsByBuilding.get(b.id) ?? []
        return { b, bm, c: computeBuilding(b.id, bm, attendance, workersById, txns), name: buildingName(b, ownersById) }
      }),
    [buildings, moldsByBuilding, attendance, workersById, txns, ownersById],
  )

  const filtered = rows.filter(({ b, bm, c, name }) => {
    if (status !== ALL && b.status !== status) return false
    if (ownerId !== ALL && b.ownerId !== ownerId) return false
    if (q && !`${name} ${b.location ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (dueOnly && c.receivable <= 0 && c.unpaidDoneAmount <= 0) return false
    if (location && !(b.location ?? '').toLowerCase().includes(location.toLowerCase())) return false
    if (fromDate && (!b.startDate || b.startDate < fromDate)) return false
    if (toDate && (!b.startDate || b.startDate > toDate)) return false
    if (paymentStatus !== ALL && !bm.some((m) => m.paymentStatus === paymentStatus)) return false
    return true
  })

  const advancedCount =
    (location ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (paymentStatus !== ALL ? 1 : 0)

  return (
    <>
      <PageHeader
        title="Buildings"
        subtitle={`${filtered.length} of ${buildings.length}`}
        actions={
          <Button asChild size="sm">
            <Link to="/buildings/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {/* Main filter row */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search buildings…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {BUILDING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All owners</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDueOnly((v) => !v)}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
              dueOnly
                ? 'border-warning-foreground/30 bg-warning/15 text-warning-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            Due / unpaid only
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-accent',
              showAdvanced && 'bg-accent',
            )}
          >
            <SlidersHorizontal className="size-4" />
            Advanced
            {advancedCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {advancedCount}
              </span>
            )}
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location contains…"
              className="h-10 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                Started from
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-10 text-sm" />
              </label>
              <label className="text-xs text-muted-foreground">
                Started to
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-10 text-sm" />
              </label>
            </div>
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Payment status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any payment status</SelectItem>
                {MOLD_PAYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={buildings.length === 0 ? 'No buildings yet' : 'No matches'}
            description={
              buildings.length === 0
                ? 'Add your first building to start tracking centering work.'
                : 'Try adjusting or clearing the filters.'
            }
            action={
              buildings.length === 0 ? (
                <Button asChild>
                  <Link to="/buildings/new">
                    <Plus className="size-4" />
                    New building
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(({ b, c, name }) => {
              return (
                <Link
                  key={b.id}
                  to={`/buildings/${b.id}`}
                  className="block rounded-xl border border-border bg-card p-3.5 shadow-card transition active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3">
                    <Thumb blob={b.photoThumb} name={name} square />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold">{name}</p>
                        <StatusPill status={b.status} kind="building" />
                      </div>
                      {b.ratePerSqft != null && (
                        <p className="truncate text-xs text-muted-foreground">{money(b.ratePerSqft)}/sqft</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {c.current && (
                          <span className="text-muted-foreground">
                            On <span className="font-medium text-foreground">{c.current.floorName}</span>
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          Margin <MoneyText value={c.margin} className="text-xs" />
                        </span>
                        {c.unpaidDoneAmount > 0 && (
                          <Badge variant="danger">unpaid {money(c.unpaidDoneAmount)}</Badge>
                        )}
                        {c.receivable > 0 && <Badge variant="warning">due {money(c.receivable)}</Badge>}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
