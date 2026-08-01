import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Inbox, RefreshCw, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignPopup } from './AssignPopup'
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
import type { OtherExpenseType, SubCategory, SyncedTransaction } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Compact row in the review queue list. */
function ReviewRow({
  txn,
  buildingsById,
  ownersById,
  workersById,
  moldsById,
  onClick,
}: {
  txn: SyncedTransaction
  buildingsById: Map<string, import('@/lib/types').Building>
  ownersById: Map<string, import('@/lib/types').Owner>
  workersById: Map<string, import('@/lib/types').Worker>
  moldsById: Map<string, import('@/lib/types').Mold>
  onClick: () => void
}) {
  const isCredit = txn.direction === 'credit'
  const needsReview = txn.assignmentStatus === 'needsReview'

  let target = '—'
  if (txn.buildingId) {
    const b = buildingName(buildingsById.get(txn.buildingId), ownersById)
    const m = txn.moldId ? moldsById.get(txn.moldId)?.floorName : undefined
    target = m ? `${b} · ${m}` : b
  } else if (txn.workerId) {
    target = workersById.get(txn.workerId)?.name ?? 'Worker'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card p-3.5 text-left shadow-card transition hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={isCredit ? 'success' : 'secondary'} className="text-xs">
              {txn.subCategory}
            </Badge>
            {needsReview && (
              <Badge variant="warning" className="text-xs">
                <RefreshCw className="size-3" />
                changed
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatDate(txn.date)}
            {txn.description ? ` · ${txn.description}` : ''}
          </p>
          {(txn.tags ?? []).length > 0 && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {txn.tags!.join(' · ')}
            </p>
          )}
          {target !== '—' && (
            <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">{target}</p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 font-bold tabular-nums',
            isCredit ? 'text-green-600 dark:text-green-400' : 'text-foreground',
          )}
        >
          {money(txn.amount)}
        </span>
      </div>
    </button>
  )
}

interface CatDef {
  key: string
  label: string
  match: (t: SyncedTransaction) => boolean
}

const BASE_CATS: { key: SubCategory; label: string }[] = [
  { key: 'OwnerReceipt', label: 'Owner Receipts' },
  { key: 'Wage', label: 'Wage' },
  { key: 'Advance', label: 'Advance' },
  { key: 'Food', label: 'Food' },
  { key: 'Transport', label: 'Transport' },
  { key: 'Rent', label: 'Rent' },
  { key: 'Material', label: 'Material' },
]

/** Filter categories: the 7 base sub-categories + one per OtherExpense type
 * (Finance Cost, Theft, …) + a catch-all "Other" for uncategorised OtherExpense.
 * Keys (e.g. `other:FinanceCost`) double as the deep-link `cat` param. */
function buildCategoryDefs(otherTypes: OtherExpenseType[]): CatDef[] {
  const known = new Set(otherTypes.map((t) => t.name))
  const base: CatDef[] = BASE_CATS.map((b) => ({
    key: b.key,
    label: b.label,
    match: (t) => t.subCategory === b.key,
  }))
  const others: CatDef[] = otherTypes.map((ot) => ({
    key: `other:${ot.name}`,
    label: ot.name,
    match: (t) => t.subCategory === 'OtherExpense' && t.otherExpenseType === ot.name,
  }))
  const rest: CatDef = {
    key: 'other:__rest__',
    label: 'Other',
    match: (t) => t.subCategory === 'OtherExpense' && !known.has(t.otherExpenseType ?? ''),
  }
  return [...base, ...others, rest]
}

export function Payments() {
  const [params] = useSearchParams()
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

  // Deep-link state (Dashboard overhead → assigned tab, filtered by category + period).
  const [tab, setTab] = React.useState(() => (params.get('tab') === 'assigned' ? 'assigned' : 'review'))
  const [popupIdx, setPopupIdx] = React.useState<number | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set((params.get('cat') ?? '').split(',').filter(Boolean)),
  )
  const [from, setFrom] = React.useState(params.get('from') ?? '')
  const [to, setTo] = React.useState(params.get('to') ?? '')

  // Re-apply when the URL params change (e.g. navigating in again from the dashboard).
  React.useEffect(() => {
    if (params.get('tab') === 'assigned') setTab('assigned')
    const cat = params.get('cat')
    if (cat != null) setSelected(new Set(cat.split(',').filter(Boolean)))
    if (params.get('from') != null) setFrom(params.get('from') ?? '')
    if (params.get('to') != null) setTo(params.get('to') ?? '')
  }, [params])

  const catDefs = React.useMemo(() => buildCategoryDefs(otherTypes), [otherTypes])
  const matchByKey = React.useMemo(() => new Map(catDefs.map((d) => [d.key, d.match])), [catDefs])

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

  // Date-range filtered, then category filtered (empty selection = all categories).
  const dateFiltered = React.useMemo(
    () => assigned.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)),
    [assigned, from, to],
  )
  const filteredAssigned = React.useMemo(() => {
    if (selected.size === 0) return dateFiltered
    return dateFiltered.filter((t) => [...selected].some((k) => matchByKey.get(k)?.(t)))
  }, [dateFiltered, selected, matchByKey])

  const countByKey = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const d of catDefs) m.set(d.key, dateFiltered.filter(d.match).length)
    return m
  }, [catDefs, dateFiltered])

  function toggleCat(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  const total = filteredAssigned.reduce((s, t) => s + t.amount, 0)

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
        <Tabs value={tab} onValueChange={setTab}>
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
              <>
                {sortedQueue.map((t, i) => (
                  <ReviewRow
                    key={t.id}
                    txn={t}
                    buildingsById={buildingsById}
                    ownersById={ownersById}
                    workersById={workersById}
                    moldsById={moldsById}
                    onClick={() => setPopupIdx(i)}
                  />
                ))}
                {popupIdx !== null && (
                  <AssignPopup
                    txn={sortedQueue[popupIdx]}
                    index={popupIdx}
                    total={sortedQueue.length}
                    buildings={buildings}
                    owners={owners}
                    workers={workers}
                    molds={molds}
                    otherTypes={otherTypes}
                    onClose={() => setPopupIdx(null)}
                    onNext={() => {
                      const next = popupIdx + 1
                      if (next < sortedQueue.length) setPopupIdx(next)
                      else setPopupIdx(null)
                    }}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="assigned" className="space-y-3">
            {assigned.length === 0 ? (
              <EmptyState icon={Inbox} title="No assigned payments yet" />
            ) : (
              <>
                {/* Date range */}
                <div className="flex items-end gap-2">
                  <label className="flex-1 text-xs text-muted-foreground">
                    From
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 text-sm" />
                  </label>
                  <label className="flex-1 text-xs text-muted-foreground">
                    To
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 text-sm" />
                  </label>
                  {(from || to) && (
                    <Button variant="outline" className="h-10" onClick={() => { setFrom(''); setTo('') }}>
                      Clear
                    </Button>
                  )}
                </div>

                {/* Category multi-select */}
                <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                  <button
                    onClick={() => setSelected(new Set())}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition',
                      selected.size === 0
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-foreground/70 hover:text-foreground',
                    )}
                  >
                    All
                  </button>
                  {catDefs.map((d) => {
                    const on = selected.has(d.key)
                    const n = countByKey.get(d.key) ?? 0
                    return (
                      <button
                        key={d.key}
                        onClick={() => toggleCat(d.key)}
                        className={cn(
                          'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition',
                          on
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-foreground/70 hover:text-foreground',
                        )}
                      >
                        {d.label}
                        {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Result count + total */}
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>{filteredAssigned.length} of {assigned.length}</span>
                  <span className="tabular font-medium text-foreground">{money(total)}</span>
                </div>

                {filteredAssigned.length === 0 ? (
                  <EmptyState icon={Inbox} title="No matches" description="Try adjusting the date range or categories." />
                ) : (
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
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
