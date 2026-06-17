import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Building2, MapPin, Pencil, Phone } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Thumb } from '@/components/Thumb'
import { Stat } from '@/components/Stat'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useAllMolds, useBuildings, useOwner, useTransactions } from '@/lib/hooks'
import { byId, buildingName, groupBy } from '@/lib/select'
import { buildingReceivable, receiptsForBuilding } from '@/lib/compute/profit'
import { money } from '@/lib/format'

export function OwnerDetail() {
  const { id } = useParams()
  const owner = useOwner(id)
  const buildings = useBuildings()
  const molds = useAllMolds()
  const txns = useTransactions()
  const moldsByBuilding = React.useMemo(() => groupBy(molds, (m) => m.buildingId), [molds])

  if (!owner) return <PageHeader title="Owner" back />

  const ownersById = byId([owner])
  const obuildings = buildings.filter((b) => b.ownerId === owner.id)
  const totalOutstanding = obuildings.reduce(
    (s, b) => s + buildingReceivable(moldsByBuilding.get(b.id) ?? [], txns),
    0,
  )
  const totalReceived = obuildings.reduce((s, b) => s + receiptsForBuilding(b.id, txns), 0)

  return (
    <>
      <PageHeader
        title={owner.name}
        subtitle={owner.location}
        back
        actions={
          <Button asChild variant="ghost" size="icon">
            <Link to={`/owners/${owner.id}/edit`} aria-label="Edit">
              <Pencil className="size-5" />
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <Thumb blob={owner.photoThumb} name={owner.name} className="size-14 text-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            {owner.location && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {owner.location}
              </p>
            )}
            {owner.phone && <p className="text-sm text-muted-foreground">{owner.phone}</p>}
          </div>
          {owner.phone && (
            <Button asChild variant="outline" size="icon">
              <a href={`tel:${owner.phone}`} aria-label="Call">
                <Phone className="size-5" />
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Outstanding" value={money(totalOutstanding)} tone={totalOutstanding > 0 ? 'warning' : 'default'} />
          <Stat label="Received" value={money(totalReceived)} tone="success" />
        </div>

        {owner.notes && (
          <p className="rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">{owner.notes}</p>
        )}

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Buildings ({obuildings.length})</h2>
          {obuildings.length === 0 ? (
            <EmptyState icon={Building2} title="No buildings linked" />
          ) : (
            <div className="space-y-2">
              {obuildings.map((b) => {
                const due = buildingReceivable(moldsByBuilding.get(b.id) ?? [], txns)
                return (
                  <Link
                    key={b.id}
                    to={`/buildings/${b.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-card transition active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{buildingName(b, ownersById)}</p>
                      <div className="mt-1">
                        <StatusPill status={b.status} kind="building" />
                      </div>
                    </div>
                    {due > 0 && <span className="tabular text-sm font-semibold text-warning-foreground">{money(due)}</span>}
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
