import * as React from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { StatusPill } from '@/components/StatusPill'
import { MoneyText } from '@/components/MoneyText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  useAllAttendance,
  useAllMolds,
  useBuildings,
  useOwners,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { byId, buildingName, computeBuilding, groupBy } from '@/lib/select'
import { money } from '@/lib/format'

export function BuildingsList() {
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()
  const attendance = useAllAttendance()
  const workers = useWorkers()
  const txns = useTransactions()
  const [q, setQ] = React.useState('')
  const [showClosed, setShowClosed] = React.useState(false)

  const ownersById = React.useMemo(() => byId(owners), [owners])
  const workersById = React.useMemo(() => byId(workers), [workers])
  const moldsByBuilding = React.useMemo(() => groupBy(molds, (m) => m.buildingId), [molds])

  const filtered = buildings.filter((b) => {
    if (!showClosed && b.status === 'Closed') return false
    if (!q) return true
    return [buildingName(b, ownersById), b.location]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q.toLowerCase())
  })

  return (
    <>
      <PageHeader
        title="Buildings"
        subtitle={`${buildings.length} total`}
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search buildings…"
            className="pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Show closed buildings</span>
          <Switch checked={showClosed} onCheckedChange={setShowClosed} />
        </label>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={buildings.length === 0 ? 'No buildings yet' : 'No matches'}
            description={
              buildings.length === 0
                ? 'Add your first building to start tracking centering work.'
                : 'Try a different search or show closed buildings.'
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
            {filtered.map((b) => {
              const bm = moldsByBuilding.get(b.id) ?? []
              const c = computeBuilding(b.id, bm, attendance, workersById, txns)
              const name = buildingName(b, ownersById)
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
