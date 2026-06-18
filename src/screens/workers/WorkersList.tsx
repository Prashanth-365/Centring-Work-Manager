import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
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
import { useAllAttendance, useBuildings, useOwners, useSettings, useTransactions, useWorkers } from '@/lib/hooks'
import { byId, buildingName, groupBy } from '@/lib/select'
import { workerBalance } from '@/lib/compute/balance'
import { currentWage } from '@/lib/compute/wage'
import { WORKER_TYPES } from '@/lib/constants'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WeekStart } from '@/lib/dates'

const ALL = '__all__'

export function WorkersList() {
  const workers = useWorkers()
  const attendance = useAllAttendance()
  const buildings = useBuildings()
  const owners = useOwners()
  const txns = useTransactions()
  const settings = useSettings()
  const [params] = useSearchParams()

  // Main filters
  const [q, setQ] = React.useState('')
  const [activity, setActivity] = React.useState<'active' | 'inactive' | 'all'>('active')
  const [type, setType] = React.useState<string>(ALL)
  // Advanced filters — `?filter=owed` pre-applies the balance-owed quick filter.
  const [showAdvanced, setShowAdvanced] = React.useState(params.get('filter') === 'owed')
  const [owedOnly, setOwedOnly] = React.useState(params.get('filter') === 'owed')
  const [buildingId, setBuildingId] = React.useState<string>(ALL)

  React.useEffect(() => {
    if (params.get('filter') === 'owed') {
      setOwedOnly(true)
      setShowAdvanced(true)
    }
  }, [params])

  const attByWorker = React.useMemo(() => groupBy(attendance, (a) => a.workerId), [attendance])
  const txByWorker = React.useMemo(() => groupBy(txns, (t) => t.workerId), [txns])
  const ownersById = React.useMemo(() => byId(owners), [owners])
  const ws = (settings.weekStartsOn ?? 1) as WeekStart

  const rows = React.useMemo(
    () =>
      workers.map((w) => {
        const att = attByWorker.get(w.id) ?? []
        return {
          w,
          att,
          bal: workerBalance(w, att, txByWorker.get(w.id) ?? [], ws),
          buildingIds: new Set(att.map((a) => a.buildingId)),
        }
      }),
    [workers, attByWorker, txByWorker, ws],
  )

  const filtered = rows.filter(({ w, bal, buildingIds }) => {
    if (activity === 'active' && !w.active) return false
    if (activity === 'inactive' && w.active) return false
    if (type !== ALL && w.type !== type) return false
    if (q && ![w.name, w.phone, w.type].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())) return false
    if (owedOnly && bal.balance <= 0.5) return false
    if (buildingId !== ALL && !buildingIds.has(buildingId)) return false
    return true
  })

  const activeCount = workers.filter((w) => w.active).length
  const advancedCount = (owedOnly ? 1 : 0) + (buildingId !== ALL ? 1 : 0)

  return (
    <>
      <PageHeader
        title="Workers"
        subtitle={`${activeCount} active`}
        actions={
          <Button asChild size="sm">
            <Link to="/workers/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workers…" className="pl-9" />
        </div>

        {/* Main filter row: active/inactive + type */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={activity} onValueChange={(v) => setActivity(v as typeof activity)}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {WORKER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-accent',
            showAdvanced && 'bg-accent',
          )}
        >
          <SlidersHorizontal className="size-4" />
          Advanced filters
          {advancedCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {advancedCount}
            </span>
          )}
        </button>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => setOwedOnly((v) => !v)}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm font-medium transition',
                owedOnly
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              Balance owed only
            </button>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Building worked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any building</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {buildingName(b, ownersById)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={workers.length === 0 ? 'No workers yet' : 'No matches'}
            description={workers.length === 0 ? undefined : 'Try adjusting or clearing the filters.'}
            action={
              workers.length === 0 ? (
                <Button asChild>
                  <Link to="/workers/new">
                    <Plus className="size-4" />
                    New worker
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(({ w, bal }) => {
              return (
                <Link
                  key={w.id}
                  to={`/workers/${w.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition active:scale-[0.99]"
                >
                  <Thumb blob={w.photoThumb} name={w.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{w.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="muted">{w.type}</Badge>
                      {!w.active && <Badge variant="outline">Inactive</Badge>}
                      {money(currentWage(w))}/day
                    </p>
                  </div>
                  <div className="text-right">
                    <MoneyText value={bal.balance} balance className="text-sm" />
                    <p className="text-[11px] text-muted-foreground">
                      {bal.balance > 0.5 ? 'you owe' : bal.balance < -0.5 ? 'advance' : 'settled'}
                    </p>
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
