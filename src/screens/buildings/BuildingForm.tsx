import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { PhotoPicker } from '@/components/PhotoPicker'
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
import { useBuilding, useOwners } from '@/lib/hooks'
import { createBuilding, deleteBuilding, quickCreateOwner, updateBuilding } from '@/lib/repo'
import { buildingDatesForStatusChange } from '@/lib/compute/status'
import { runAutoAdvance } from '@/lib/autoAdvance'
import { byId, buildingName } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { BUILDING_STATUSES } from '@/lib/constants'
import type { BuildingStatus } from '@/lib/types'

export function BuildingForm() {
  const { id } = useParams()
  const editing = !!id
  const existing = useBuilding(id)
  const owners = useOwners()
  const navigate = useNavigate()

  const [ownerId, setOwnerId] = React.useState<string>()
  const [location, setLocation] = React.useState('')
  const [rate, setRate] = React.useState('')
  const [status, setStatus] = React.useState<BuildingStatus>('In Progress')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [photo, setPhoto] = React.useState<Blob>()
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      setOwnerId(existing.ownerId)
      setLocation(existing.location ?? '')
      setRate(existing.ratePerSqft != null ? String(existing.ratePerSqft) : '')
      setStatus(existing.status)
      setStartDate(existing.startDate ?? '')
      setEndDate(existing.endDate ?? '')
      setNotes(existing.notes ?? '')
      setPhoto(existing.photoThumb)
    }
  }, [existing])

  // The building's name is derived (§3) — preview it live as the user picks.
  const ownersById = React.useMemo(() => byId(owners), [owners])
  const derivedName = buildingName({ ownerId, location: location.trim() || undefined }, ownersById)

  /**
   * Status → date. Building dates are otherwise DERIVED from the molds (read-only
   * below); only a manual Completed/Closed stamps endDate = today.
   */
  function applyStatus(next: BuildingStatus) {
    setStatus(next)
    const patch = buildingDatesForStatusChange(next, { endDate: endDate || undefined })
    if ('endDate' in patch) setEndDate(patch.endDate ?? '')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ownerId) {
      setError('Pick an owner — the building name is "{owner} - {location}".')
      return
    }
    if (!location.trim()) {
      setError('Location is required — it forms the building name.')
      return
    }
    setSaving(true)
    const data = {
      ownerId,
      location: location.trim(),
      ratePerSqft: rate ? Number(rate) : undefined,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
      photoThumb: photo,
    }
    if (editing) {
      await updateBuilding(id!, data)
      await runAutoAdvance() // reconcile derived dates + roll-up status
      navigate(`/buildings/${id}`, { replace: true })
    } else {
      const newId = await createBuilding(data)
      navigate(`/buildings/${newId}`, { replace: true })
    }
  }

  return (
    <FormScaffold
      title={editing ? 'Edit building' : 'New building'}
      subtitle={derivedName}
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
      <PhotoPicker value={photo} onChange={setPhoto} name={derivedName} />

      <Field label="Owner" required error={error}>
        <Combobox
          options={owners.map((o) => ({ value: o.id, label: o.name, sublabel: o.phone }))}
          value={ownerId}
          onChange={(v) => {
            setOwnerId(v)
            setError('')
          }}
          onCreate={quickCreateOwner}
          placeholder="Select or add owner"
          allowClear
        />
      </Field>

      <Field label="Location" required hint="Used in the building's name">
        {(fid) => (
          <Input
            id={fid}
            value={location}
            onChange={(e) => {
              setLocation(e.target.value)
              setError('')
            }}
            placeholder="Area / street"
          />
        )}
      </Field>

      <Field label="Name" hint="Auto from owner + location">
        <div className="flex h-11 items-center rounded-lg border border-dashed border-input bg-muted/40 px-3 text-base text-muted-foreground">
          {derivedName}
        </div>
      </Field>

      <Field label="Rate / sqft">
        {(fid) => (
          <Input
            id={fid}
            type="number"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="₹"
          />
        )}
      </Field>

      <Field label="Status">
        <Select value={status} onValueChange={(v) => applyStatus(v as BuildingStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUILDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" hint="Auto from first mold to start">
          <div className="flex h-11 items-center rounded-lg border border-dashed border-input bg-muted/40 px-3 text-base text-muted-foreground">
            {formatDate(startDate)}
          </div>
        </Field>
        <Field label="End date" hint="Auto when all molds removed / Completed">
          <div className="flex h-11 items-center rounded-lg border border-dashed border-input bg-muted/40 px-3 text-base text-muted-foreground">
            {formatDate(endDate)}
          </div>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember…" />
      </Field>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this building?"
        description="Its molds and attendance entries will also be removed. This cannot be undone."
        onConfirm={async () => {
          await deleteBuilding(id!)
          navigate('/buildings', { replace: true })
        }}
      />
    </FormScaffold>
  )
}
