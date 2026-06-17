import * as React from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Inbox, RefreshCw, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReviewCard } from './ReviewCard'
import {
  useAllMolds,
  useBuildings,
  useOtherExpenseTypes,
  useOwners,
  useReviewQueue,
  useTransactions,
  useWorkers,
} from '@/lib/hooks'
import { unassignTransaction } from '@/lib/repo'
import { byId, buildingName } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { money } from '@/lib/format'
import type { SyncedTransaction } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Payments() {
  const queue = useReviewQueue()
  const allTxns = useTransactions()
  const buildings = useBuildings()
  const owners = useOwners()
  const workers = useWorkers()
  const molds = useAllMolds()
  const otherTypes = useOtherExpenseTypes()

  const buildingsById = React.useMemo(() => byId(buildings), [buildings])
  const ownersById = React.useMemo(() => byId(owners), [owners])
  const workersById = React.useMemo(() => byId(workers), [workers])
  const moldsById = React.useMemo(() => byId(molds), [molds])

  const sortedQueue = React.useMemo(
    () =>
      [...queue].sort((a, b) => {
        if (a.assignmentStatus !== b.assignmentStatus)
          return a.assignmentStatus === 'needsReview' ? -1 : 1
        return a.date < b.date ? 1 : -1
      }),
    [queue],
  )

  const assigned = React.useMemo(
    () =>
      allTxns
        .filter((t) => t.assignmentStatus === 'assigned')
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [allTxns],
  )

  const [filter, setFilter] = React.useState<string>('All')
  const subcats = React.useMemo(
    () => ['All', ...Array.from(new Set(assigned.map((t) => t.subCategory)))],
    [assigned],
  )
  const filteredAssigned = filter === 'All' ? assigned : assigned.filter((t) => t.subCategory === filter)

  function targetLabel(t: SyncedTransaction): string {
    if (t.buildingId) {
      const b = buildingName(buildingsById.get(t.buildingId), ownersById)
      const m = t.moldId ? moldsById.get(t.moldId)?.floorName : undefined
      return m ? `${b} · ${m}` : b
    }
    if (t.workerId) return workersById.get(t.workerId)?.name ?? 'Worker'
    if (t.materialDescription) return t.materialDescription
    if (t.otherExpenseType) return t.otherExpenseType
    return '—'
  }

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={queue.length > 0 ? `${queue.length} to review` : 'All assigned'}
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link to="/payments/sync">
              <RefreshCw className="size-4" />
              Sync
            </Link>
          </Button>
        }
      />
      <div className="p-4">
        <Tabs defaultValue="review">
          <TabsList className="w-full">
            <TabsTrigger value="review">
              Review
              {queue.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {queue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="assigned">Assigned ({assigned.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="space-y-2.5">
            {sortedQueue.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to review"
                description="Sync your transaction app to pull in new Construction entries."
                action={
                  <Button asChild variant="secondary">
                    <Link to="/payments/sync">
                      <RefreshCw className="size-4" />
                      Sync now
                    </Link>
                  </Button>
                }
              />
            ) : (
              sortedQueue.map((t) => (
                <ReviewCard
                  key={t.id}
                  txn={t}
                  buildings={buildings}
                  owners={owners}
                  workers={workers}
                  molds={molds}
                  otherTypes={otherTypes}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="assigned" className="space-y-3">
            {assigned.length === 0 ? (
              <EmptyState icon={Inbox} title="No assigned payments yet" />
            ) : (
              <>
                <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                  {subcats.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition',
                        filter === s
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {filteredAssigned.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={t.direction === 'credit' ? 'success' : 'muted'}>{t.subCategory}</Badge>
                          <span className="truncate text-sm font-medium">{targetLabel(t)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                      </div>
                      <span className="tabular text-sm font-semibold">{money(t.amount)}</span>
                      <button
                        onClick={() => unassignTransaction(t.id)}
                        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent"
                        aria-label="Unassign"
                      >
                        <Undo2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
