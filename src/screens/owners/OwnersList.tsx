import * as React from 'react'
import { Link } from 'react-router-dom'
import { Contact, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAllMolds, useBuildings, useOwners, useTransactions } from '@/lib/hooks'
import { groupBy } from '@/lib/select'
import { buildingReceivable } from '@/lib/compute/profit'
import { money, pluralize } from '@/lib/format'

export function OwnersList() {
  const owners = useOwners()
  const buildings = useBuildings()
  const molds = useAllMolds()
  const txns = useTransactions()
  const [q, setQ] = React.useState('')

  const buildingsByOwner = React.useMemo(() => groupBy(buildings, (b) => b.ownerId), [buildings])
  const moldsByBuilding = React.useMemo(() => groupBy(molds, (m) => m.buildingId), [molds])

  const filtered = owners.filter((o) =>
    !q ? true : [o.name, o.phone, o.location].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <>
      <PageHeader
        title="Owners"
        subtitle={`${owners.length} total`}
        actions={
          <Button asChild size="sm">
            <Link to="/owners/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search owners…" className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={owners.length === 0 ? 'No owners yet' : 'No matches'}
            action={
              owners.length === 0 ? (
                <Button asChild>
                  <Link to="/owners/new">
                    <Plus className="size-4" />
                    New owner
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => {
              const obuildings = buildingsByOwner.get(o.id) ?? []
              const outstanding = obuildings.reduce(
                (s, b) => s + buildingReceivable(moldsByBuilding.get(b.id) ?? [], txns),
                0,
              )
              return (
                <Link
                  key={o.id}
                  to={`/owners/${o.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition active:scale-[0.99]"
                >
                  <Thumb blob={o.photoThumb} name={o.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pluralize(obuildings.length, 'building')}
                      {o.location ? ` · ${o.location}` : ''}
                    </p>
                  </div>
                  {outstanding > 0 && (
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold text-warning-foreground">{money(outstanding)}</p>
                      <p className="text-[11px] text-muted-foreground">due</p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
