import * as React from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'
import {
  assignTransaction,
  createOtherExpenseType,
  quickCreateBuilding,
  quickCreateWorker,
} from '@/lib/repo'
import { SUBCATEGORY_FIELDS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Building, Mold, OtherExpenseType, SyncedTransaction, Worker } from '@/lib/types'

export function ReviewCard({
  txn,
  buildings,
  workers,
  molds,
  otherTypes,
}: {
  txn: SyncedTransaction
  buildings: Building[]
  workers: Worker[]
  molds: Mold[]
  otherTypes: OtherExpenseType[]
}) {
  const fields = SUBCATEGORY_FIELDS[txn.subCategory] ?? []
  const [buildingId, setBuildingId] = React.useState(txn.buildingId)
  const [moldId, setMoldId] = React.useState(txn.moldId)
  const [workerId, setWorkerId] = React.useState(txn.workerId)
  const [material, setMaterial] = React.useState(txn.materialDescription ?? txn.description ?? '')
  const [otherType, setOtherType] = React.useState(txn.otherExpenseType)
  const [saving, setSaving] = React.useState(false)

  const buildingMolds = molds.filter((m) => m.buildingId === buildingId)
  const needsReview = txn.assignmentStatus === 'needsReview'
  const isCredit = txn.direction === 'credit'

  const canAssign =
    (!fields.includes('building') || !!buildingId) &&
    (!fields.includes('worker') || !!workerId) &&
    (!fields.includes('materialDescription') || material.trim().length > 0) &&
    (!fields.includes('otherExpenseType') || !!otherType)

  async function assign() {
    setSaving(true)
    const patch: Partial<SyncedTransaction> = {}
    if (fields.includes('building')) patch.buildingId = buildingId
    if (fields.includes('mold')) patch.moldId = moldId
    if (fields.includes('worker')) patch.workerId = workerId
    if (fields.includes('materialDescription')) patch.materialDescription = material.trim()
    if (fields.includes('otherExpenseType')) patch.otherExpenseType = otherType
    await assignTransaction(txn.id, patch)
    // component unmounts as it leaves the queue
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant={isCredit ? 'success' : 'secondary'}>{txn.subCategory}</Badge>
            {needsReview && (
              <Badge variant="warning">
                <RefreshCw className="size-3" />
                amount changed
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {formatDate(txn.date)}
            {txn.description ? ` · ${txn.description}` : ''}
          </p>
        </div>
        <div className={cn('flex shrink-0 items-center gap-1 font-bold', isCredit ? 'text-success' : 'text-foreground')}>
          {isCredit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
          <span className="tabular">{money(txn.amount)}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {fields.includes('building') && (
          <Field label="Building">
            <Combobox
              options={buildings.map((b) => ({ value: b.id, label: b.name, sublabel: b.code }))}
              value={buildingId}
              onChange={(v) => {
                setBuildingId(v)
                setMoldId(undefined)
              }}
              onCreate={quickCreateBuilding}
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
            Unknown subcategory “{txn.subCategory}” — assign to acknowledge.
          </p>
        )}
      </div>

      <Button onClick={assign} disabled={!canAssign || saving} className="w-full" size="sm">
        <Check className="size-4" />
        Assign
      </Button>
    </div>
  )
}
