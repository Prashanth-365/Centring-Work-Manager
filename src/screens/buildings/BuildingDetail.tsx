import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarRange,
  CirclePlus,
  ClipboardList,
  FileText,
  Layers,
  MapPin,
  Pencil,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Thumb } from '@/components/Thumb'
import { StatusPill } from '@/components/StatusPill'
import { MoneyText } from '@/components/MoneyText'
import { EmptyState } from '@/components/EmptyState'
import { Stat } from '@/components/Stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useAttendanceForBuilding,
  useBuilding,
  useMolds,
  useOwner,
  useTransactionsForBuilding,
  useWorkers,
} from '@/lib/hooks'
import { byId, buildingName, computeBuilding, moldOutstanding } from '@/lib/select'
import { receiptsForMold } from '@/lib/compute/profit'
import { formatDate } from '@/lib/dates'
import { money } from '@/lib/format'

export function BuildingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const building = useBuilding(id)
  const molds = useMolds(id)
  const owner = useOwner(building?.ownerId)
  const attendance = useAttendanceForBuilding(id)
  const workers = useWorkers()
  const txns = useTransactionsForBuilding(id)
  const workersById = React.useMemo(() => byId(workers), [workers])

  if (!building) {
    return <PageHeader title="Building" back />
  }

  const c = computeBuilding(building.id, molds, attendance, workersById, txns)
  const name = buildingName(building, byId(owner ? [owner] : []))

  return (
    <>
      <PageHeader
        title={name}
        back
        actions={
          <>
            <Button asChild variant="ghost" size="icon">
              <Link to={`/buildings/${building.id}/bill`} aria-label="Consolidated bill">
                <FileText className="size-5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link to={`/buildings/${building.id}/edit`} aria-label="Edit">
                <Pencil className="size-5" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-4">
        {/* Hero */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <Thumb blob={building.photoThumb} name={name} square className="size-16 text-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <StatusPill status={building.status} kind="building" />
              {owner && (
                <Link
                  to={`/owners/${owner.id}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                >
                  <User className="size-4 text-muted-foreground" />
                  {owner.name}
                </Link>
              )}
              {building.location && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {building.location}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarRange className="size-4" />
                {formatDate(building.startDate)} → {formatDate(building.endDate)}
              </p>
              {building.ratePerSqft != null && (
                <p className="text-sm text-muted-foreground">
                  Rate <span className="font-medium text-foreground">{money(building.ratePerSqft)}/sqft</span>
                </p>
              )}
            </div>
          </div>
          {building.notes && (
            <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">{building.notes}</p>
          )}
        </div>

        {/* Money */}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Running margin" value={<MoneyText value={c.margin} />} sub="Received − labour" />
          <Stat label="Receivable" value={money(c.receivable)} tone={c.receivable > 0 ? 'warning' : 'default'} sub="Billed, unpaid" />
          <Stat label="Received" value={money(c.revenue)} tone="success" />
          <Stat label="Labour to date" value={money(c.labour)} sub="From attendance" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <Button asChild variant="secondary">
            <Link to={`/attendance/new?building=${building.id}`}>
              <ClipboardList className="size-4" />
              Add attendance
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/buildings/${building.id}/molds/new`}>
              <CirclePlus className="size-4" />
              Add floor
            </Link>
          </Button>
          <Button asChild variant="secondary" className="col-span-2">
            <Link to={`/buildings/${building.id}/bill`}>
              <FileText className="size-4" />
              Consolidated bill
            </Link>
          </Button>
        </div>

        {/* Molds */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Layers className="size-4" />
              Floors / molds
            </h2>
            <span className="text-xs text-muted-foreground">{molds.length}</span>
          </div>
          {molds.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No floors yet"
              description="Add the ground floor / plinth mold to begin."
              action={
                <Button asChild size="sm">
                  <Link to={`/buildings/${building.id}/molds/new`}>
                    <CirclePlus className="size-4" />
                    Add floor
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {molds.map((m) => {
                const received = receiptsForMold(m.id, txns)
                const outstanding = moldOutstanding(m, txns)
                return (
                  <Link
                    key={m.id}
                    to={`/molds/${m.id}`}
                    className="block rounded-xl border border-border bg-card p-3 shadow-card transition active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{m.floorName}</p>
                      {m.billPdfLink && <FileText className="size-4 shrink-0 text-primary" />}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={m.workStatus} kind="work" />
                      <StatusPill status={m.paymentStatus} kind="payment" />
                      {m.sqft != null && (
                        <Badge variant="outline">{m.sqft} sqft</Badge>
                      )}
                    </div>
                    {(m.billAmount != null || received > 0) && (
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Bill {money(m.billAmount ?? 0)} · Recd {money(received)}
                        </span>
                        {outstanding > 0 && <span className="font-medium text-destructive">Due {money(outstanding)}</span>}
                      </div>
                    )}
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
