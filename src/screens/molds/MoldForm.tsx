import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAllMolds, useBuilding, useMold, useOwner } from '@/lib/hooks'
import { createMold, deleteMold, updateMold } from '@/lib/repo'
import { moldDatesForStatusChange } from '@/lib/compute/status'
import { runAutoAdvance } from '@/lib/autoAdvance'
import { byId, buildingName } from '@/lib/select'
import { MOLD_WORK_STATUSES } from '@/lib/constants'
import type { MoldWorkStatus } from '@/lib/types'

const FLOOR_SUGGESTIONS = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Plinth / Sump',
]

export function MoldForm() {
  const params = useParams()
  const editing = !!params.id
  const existing = useMold(params.id)
  const buildingId = editing ? existing?.buildingId : params.buildingId
  const building = useBuilding(buildingId)
  const owner = useOwner(building?.ownerId)
  const allMolds = useAllMolds()
  const navigate = useNavigate()

  const [floorName, setFloorName] = React.useState('')
  const [sqft, setSqft] = React.useState('')
  const [billAmount, setBillAmount] = React.useState('')
  const [billPdfLink, setBillPdfLink] = React.useState('')
  const [workStatus, setWorkStatus] = React.useState<MoldWorkStatus>('Not Started')
  const [startDate, setStartDate] = React.useState('')
  const [completedDate, setCompletedDate] = React.useState('')
  const [removedDate, setRemovedDate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      setFloorName(existing.floorName)
      setSqft(existing.sqft != null ? String(existing.sqft) : '')
      setBillAmount(existing.billAmount != null ? String(existing.billAmount) : '')
      setBillPdfLink(existing.billPdfLink ?? '')
      setWorkStatus(existing.workStatus)
      setStartDate(existing.startDate ?? '')
      setCompletedDate(existing.completedDate ?? '')
      setRemovedDate(existing.removedDate ?? '')
      setNotes(existing.notes ?? '')
    }
  }, [existing])

  // Floor name is an inline combobox of previously-used names (§11) + the common
  // suggestions; free typing adds a new one.
  const floorOptions = React.useMemo(() => {
    const names = new Set<string>(FLOOR_SUGGESTIONS)
    for (const m of allMolds) if (m.floorName?.trim()) names.add(m.floorName.trim())
    if (floorName.trim()) names.add(floorName.trim())
    return [...names].map((n) => ({ value: n, label: n }))
  }, [allMolds, floorName])

  /** Work status → date as the user picks (sets today when empty; clears on reset). */
  function applyWorkStatus(next: MoldWorkStatus) {
    setWorkStatus(next)
    const patch = moldDatesForStatusChange(next, {
      startDate: startDate || undefined,
      completedDate: completedDate || undefined,
      removedDate: removedDate || undefined,
    })
    if ('startDate' in patch) setStartDate(patch.startDate ?? '')
    if ('completedDate' in patch) setCompletedDate(patch.completedDate ?? '')
    if ('removedDate' in patch) setRemovedDate(patch.removedDate ?? '')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!floorName.trim()) {
      setError('Floor name is required')
      return
    }
    if (!buildingId) return
    setSaving(true)
    // Payment status is NOT set here — it auto-derives from bill + owner receipts.
    const data = {
      floorName: floorName.trim(),
      sqft: sqft ? Number(sqft) : undefined,
      billAmount: billAmount ? Number(billAmount) : undefined,
      billPdfLink: billPdfLink.trim() || undefined,
      workStatus,
      startDate: startDate || undefined,
      completedDate: completedDate || undefined,
      removedDate: removedDate || undefined,
      notes: notes.trim() || undefined,
    }
    if (editing) {
      await updateMold(params.id!, data)
    } else {
      await createMold({ buildingId, ...data })
    }
    await runAutoAdvance() // reconcile payment/work status immediately
    navigate(editing ? `/molds/${params.id}` : `/buildings/${buildingId}`, { replace: true })
  }

  return (
    <FormScaffold
      title={editing ? 'Edit floor' : 'New floor / mold'}
      subtitle={buildingName(building, byId(owner ? [owner] : []))}
      onSubmit={submit}
      submitting={saving}
      footerExtra={
        editing ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-4" />
          </Button>
        ) : undefined
      }
    >
      <Field label="Floor name" required error={error} hint="One mold = one floor (§2)">
        <Combobox
          options={floorOptions}
          value={floorName || undefined}
          onChange={(v) => {
            setFloorName(v ?? '')
            setError('')
          }}
          onCreate={(label) => label}
          createLabel={(q) => `Use “${q}”`}
          placeholder="Select or type a floor"
          searchPlaceholder="e.g. Ground Floor"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sqft">
          {(fid) => (
            <Input id={fid} type="number" inputMode="decimal" value={sqft} onChange={(e) => setSqft(e.target.value)} />
          )}
        </Field>
        <Field label="Bill amount" hint="Drives payment status">
          {(fid) => (
            <Input
              id={fid}
              type="number"
              inputMode="decimal"
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value)}
              placeholder="₹"
            />
          )}
        </Field>
      </div>

      <Field label="Work status" hint="Auto-advances from the dates below">
        <Select value={workStatus} onValueChange={(v) => applyWorkStatus(v as MoldWorkStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOLD_WORK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Start date" hint="Work began">
          {(fid) => (
            <Input id={fid} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          )}
        </Field>
        <Field label="Completed date" hint="Slab cast">
          {(fid) => (
            <Input
              id={fid}
              type="date"
              value={completedDate}
              onChange={(e) => setCompletedDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Removed date" hint="Material off">
          {(fid) => (
            <Input id={fid} type="date" value={removedDate} onChange={(e) => setRemovedDate(e.target.value)} />
          )}
        </Field>
      </div>

      <Field label="Bill PDF link" hint="Paste a Drive / OneDrive share link">
        {(fid) => (
          <Input
            id={fid}
            type="url"
            value={billPdfLink}
            onChange={(e) => setBillPdfLink(e.target.value)}
            placeholder="https://…"
          />
        )}
      </Field>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this floor?"
        description="Attendance entries will be kept but unlinked from this mold."
        onConfirm={async () => {
          await deleteMold(params.id!)
          navigate(`/buildings/${buildingId}`, { replace: true })
        }}
      />
    </FormScaffold>
  )
}
