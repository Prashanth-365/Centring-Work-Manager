import * as React from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, Tag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'
import { assignTransaction, createOtherExpenseType, quickCreateWorker } from '@/lib/repo'
import { SUBCATEGORY_FIELDS } from '@/lib/constants'
import { byId, buildingName } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Building, Mold, OtherExpenseType, Owner, SyncedTransaction, Worker } from '@/lib/types'

/** Tries to match a tag against entity lists and returns a suggested id/value. */
function matchTag(
  tag: string,
  buildings: Building[],
  owners: Owner[],
  workers: Worker[],
  molds: Mold[],
  ownersById: Map<string, Owner>,
): {
  buildingId?: string
  moldId?: string
  workerId?: string
} {
  const t = tag.toLowerCase()

  const worker = workers.find((w) => w.name.toLowerCase().includes(t))
  if (worker) return { workerId: worker.id }

  const owner = owners.find((o) => o.name.toLowerCase().includes(t))
  if (owner) {
    const b = buildings.find((b) => b.ownerId === owner.id)
    if (b) return { buildingId: b.id }
  }

  const building = buildings.find(
    (b) =>
      b.location?.toLowerCase().includes(t) ||
      buildingName(b, ownersById).toLowerCase().includes(t),
  )
  if (building) return { buildingId: building.id }

  const mold = molds.find((m) => m.floorName.toLowerCase().includes(t))
  if (mold) return { moldId: mold.id }

  return {}
}

/** Merge a set of tag suggestions, first match wins per field. */
function suggestFromTags(
  tags: string[],
  buildings: Building[],
  owners: Owner[],
  workers: Worker[],
  molds: Mold[],
  ownersById: Map<string, Owner>,
) {
  let out: { buildingId?: string; moldId?: string; workerId?: string } = {}
  for (const tag of tags) {
    const m = matchTag(tag, buildings, owners, workers, molds, ownersById)
    if (!out.buildingId && m.buildingId) out = { ...out, buildingId: m.buildingId }
    if (!out.moldId && m.moldId) out = { ...out, moldId: m.moldId }
    if (!out.workerId && m.workerId) out = { ...out, workerId: m.workerId }
  }
  return out
}

interface AssignPopupProps {
  txn: SyncedTransaction
  index: number
  total: number
  buildings: Building[]
  owners: Owner[]
  workers: Worker[]
  molds: Mold[]
  otherTypes: OtherExpenseType[]
  onClose: () => void
  onNext: () => void
}

export function AssignPopup({
  txn,
  index,
  total,
  buildings,
  owners,
  workers,
  molds,
  otherTypes,
  onClose,
  onNext,
}: AssignPopupProps) {
  const fields = SUBCATEGORY_FIELDS[txn.subCategory] ?? []
  const ownersById = React.useMemo(() => byId(owners), [owners])

  // Compute suggestions from tags once per transaction.
  const suggestions = React.useMemo(
    () => suggestFromTags(txn.tags ?? [], buildings, owners, workers, molds, ownersById),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txn.id],
  )

  const [buildingId, setBuildingId] = React.useState(txn.buildingId ?? suggestions.buildingId)
  const [moldId, setMoldId] = React.useState(txn.moldId ?? suggestions.moldId)
  const [workerId, setWorkerId] = React.useState(txn.workerId ?? suggestions.workerId)
  const [material, setMaterial] = React.useState(txn.materialDescription ?? txn.description ?? '')
  const [otherType, setOtherType] = React.useState(txn.otherExpenseType)
  const [saving, setSaving] = React.useState(false)

  // Reset state when txn changes.
  React.useEffect(() => {
    setBuildingId(txn.buildingId ?? suggestions.buildingId)
    setMoldId(txn.moldId ?? suggestions.moldId)
    setWorkerId(txn.workerId ?? suggestions.workerId)
    setMaterial(txn.materialDescription ?? txn.description ?? '')
    setOtherType(txn.otherExpenseType)
    setSaving(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id])

  const buildingMolds = molds.filter((m) => m.buildingId === buildingId)
  const isCredit = txn.direction === 'credit'
  const needsReview = txn.assignmentStatus === 'needsReview'

  const canAssign =
    (!fields.includes('building') || !!buildingId) &&
    (!fields.includes('worker') || !!workerId) &&
    (!fields.includes('materialDescription') || material.trim().length > 0) &&
    (!fields.includes('otherExpenseType') || !!otherType)

  async function doAssign() {
    setSaving(true)
    const patch: Partial<SyncedTransaction> = {}
    if (fields.includes('building')) patch.buildingId = buildingId
    if (fields.includes('mold')) patch.moldId = moldId
    if (fields.includes('worker')) patch.workerId = workerId
    if (fields.includes('materialDescription')) patch.materialDescription = material.trim()
    if (fields.includes('otherExpenseType')) patch.otherExpenseType = otherType
    await assignTransaction(txn.id, patch)
  }

  async function assignAndNext() {
    await doAssign()
    onNext()
  }

  async function assignAndClose() {
    await doAssign()
    onClose()
  }

  const hasSuggestion =
    (!!suggestions.buildingId && fields.includes('building')) ||
    (!!suggestions.moldId && fields.includes('mold')) ||
    (!!suggestions.workerId && fields.includes('worker'))

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <span>
              Assign transaction
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {index + 1} / {total}
              </span>
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} aria-label="Previous">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} aria-label="Next">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Transaction summary */}
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant={isCredit ? 'success' : 'secondary'} className="text-xs">
                  {txn.subCategory}
                </Badge>
                {needsReview && (
                  <Badge variant="warning" className="text-xs">
                    <RefreshCw className="size-3" />
                    amount changed
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(txn.date)}</p>
              {txn.description && (
                <p className="mt-0.5 text-xs text-foreground/80">{txn.description}</p>
              )}
              {(txn.tags ?? []).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {txn.tags!.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                    >
                      <Tag className="size-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div
              className={cn(
                'flex shrink-0 items-center gap-1 font-bold',
                isCredit ? 'text-green-600 dark:text-green-400' : 'text-foreground',
              )}
            >
              {isCredit ? (
                <ArrowDownLeft className="size-4" />
              ) : (
                <ArrowUpRight className="size-4" />
              )}
              <span className="tabular">{money(txn.amount)}</span>
            </div>
          </div>
        </div>

        {hasSuggestion && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tag className="size-3 text-primary" />
            Pre-filled from tags — review before assigning.
          </p>
        )}

        {/* Assignment fields */}
        <div className="space-y-2.5">
          {fields.includes('building') && (
            <Field label="Building">
              <Combobox
                options={buildings.map((b) => ({
                  value: b.id,
                  label: buildingName(b, ownersById),
                  sublabel: b.location,
                }))}
                value={buildingId}
                onChange={(v) => {
                  setBuildingId(v)
                  setMoldId(undefined)
                }}
                placeholder="Assign building"
                invalid={!buildingId}
              />
            </Field>
          )}
          {fields.includes('mold') && (
            <Field label="Floor / mold">
              <Combobox
                options={buildingMolds.map((m) => ({ value: m.id, label: m.floorName }))}
                value={moldId}
                onChange={setMoldId}
                placeholder={buildingId ? 'Floor (optional)' : 'Pick building first'}
                disabled={!buildingId}
                allowClear
              />
            </Field>
          )}
          {fields.includes('worker') && (
            <Field label="Worker">
              <Combobox
                options={workers.map((w) => ({ value: w.id, label: w.name, sublabel: w.type }))}
                value={workerId}
                onChange={setWorkerId}
                onCreate={quickCreateWorker}
                placeholder="Assign worker"
                invalid={!workerId}
              />
            </Field>
          )}
          {fields.includes('materialDescription') && (
            <Field label="Material">
              <Input
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. Plywood sheets, nails…"
              />
            </Field>
          )}
          {fields.includes('otherExpenseType') && (
            <Field label="Expense type">
              <Combobox
                options={otherTypes.map((t) => ({ value: t.name, label: t.name }))}
                value={otherType}
                onChange={setOtherType}
                onCreate={async (label) => {
                  await createOtherExpenseType(label)
                  return label
                }}
                placeholder="FinanceCost / Theft / add…"
                invalid={!otherType}
              />
            </Field>
          )}
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Unknown subcategory &ldquo;{txn.subCategory}&rdquo; — assign to acknowledge.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={assignAndNext}
            disabled={!canAssign || saving}
            className="flex-1"
            size="sm"
          >
            Assign &amp; next
          </Button>
          <Button
            onClick={assignAndClose}
            disabled={!canAssign || saving}
            variant="secondary"
            className="flex-1"
            size="sm"
          >
            Assign &amp; close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
