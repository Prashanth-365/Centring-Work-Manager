import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarRange, ClipboardList, ExternalLink, FileText, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { Stat } from '@/components/Stat'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import {
  useAttendanceForBuilding,
  useBuilding,
  useMold,
  useOwner,
  useTransactionsForBuilding,
  useWorkers,
} from '@/lib/hooks'
import { updateMold } from '@/lib/repo'
import { receiptsForMold } from '@/lib/compute/profit'
import { moldDatesForStatusChange } from '@/lib/compute/status'
import { byId, buildingName, moldOutstanding } from '@/lib/select'
import { formatDate, todayISO } from '@/lib/dates'
import { days, money } from '@/lib/format'
import type { MoldWorkStatus } from '@/lib/types'

export function MoldDetail() {
  const { id } = useParams()
  const mold = useMold(id)
  const building = useBuilding(mold?.buildingId)
  const owner = useOwner(building?.ownerId)
  const txns = useTransactionsForBuilding(mold?.buildingId)
  const attendanceAll = useAttendanceForBuilding(mold?.buildingId)
  const workers = useWorkers()
  const workersById = React.useMemo(() => byId(workers), [workers])

  if (!mold) return <PageHeader title="Floor" back />

  const received = receiptsForMold(mold.id, txns)
  const outstanding = moldOutstanding(mold, txns)
  const entries = attendanceAll
    .filter((a) => a.moldId === mold.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // Advance the work status and stamp its date (today when empty) so the change
  // survives the midnight auto-advance.
  function advanceTo(next: MoldWorkStatus) {
    if (!mold) return
    const patch = moldDatesForStatusChange(
      next,
      {
        startDate: mold.startDate,
        completedDate: mold.completedDate,
        removedDate: mold.removedDate,
      },
      todayISO(),
    )
    void updateMold(mold.id, { workStatus: next, ...patch })
  }

  return (
    <>
      <PageHeader
        title={mold.floorName}
        subtitle={buildingName(building, byId(owner ? [owner] : []))}
        back
        actions={
          <>
            <Button asChild variant="ghost" size="icon">
              <Link to={mold.bill ? `/molds/${mold.id}/bill/view` : `/molds/${mold.id}/bill`} aria-label="Bill">
                <FileText className="size-5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link to={`/molds/${mold.id}/edit`} aria-label="Edit">
                <Pencil className="size-5" />
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={mold.workStatus} kind="work" />
          <StatusPill status={mold.paymentStatus} kind="payment" />
          {mold.sqft != null && <span className="text-sm text-muted-foreground">{mold.sqft} sqft</span>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarRange className="size-4" />
            {formatDate(mold.startDate)} → {formatDate(mold.completedDate)} → {formatDate(mold.removedDate)}
          </p>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to={mold.bill ? `/molds/${mold.id}/bill/view` : `/molds/${mold.id}/bill`}>
              <FileText className="size-4" />
              {mold.bill ? 'Bill' : 'Create bill'}
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Bill" value={money(mold.billAmount ?? 0)} />
          <Stat label="Received" value={money(received)} tone="success" />
          <Stat label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? 'danger' : 'default'} />
        </div>

        {/* Quick status actions. Each advances the work status and stamps its
            date so it survives the midnight auto-advance; payment status is
            auto-derived from the bill and assigned owner receipts, so it has no
            manual button. */}
        <div className="flex flex-wrap gap-2">
          {mold.workStatus === 'Not Started' && (
            <Button variant="secondary" size="sm" onClick={() => advanceTo('In Progress')}>
              Start work
            </Button>
          )}
          {mold.workStatus === 'In Progress' && (
            <Button variant="secondary" size="sm" onClick={() => advanceTo('Completed')}>
              Mark cast
            </Button>
          )}
          {mold.workStatus === 'Completed' && (
            <Button variant="secondary" size="sm" onClick={() => advanceTo('Material Removed')}>
              Mark removed
            </Button>
          )}
        </div>

        {mold.billPdfLink && (
          <Button asChild variant="outline" className="w-full">
            <a href={mold.billPdfLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              Open bill PDF
            </a>
          </Button>
        )}

        {mold.notes && (
          <p className="rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">{mold.notes}</p>
        )}

        <Button asChild variant="secondary" className="w-full">
          <Link to={`/attendance/new?building=${mold.buildingId}&mold=${mold.id}`}>
            <ClipboardList className="size-4" />
            Add attendance to this floor
          </Link>
        </Button>

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">
            Attendance on this floor ({entries.length})
          </h2>
          {entries.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No attendance yet" />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {entries.map((a) => {
                const w = workersById.get(a.workerId)
                return (
                  <Link
                    key={a.id}
                    to={`/attendance/${a.id}/edit`}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 transition active:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w?.name ?? 'Worker'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                    </div>
                    <span className="tabular text-sm font-semibold">{days(a.dayFraction)} day</span>
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
