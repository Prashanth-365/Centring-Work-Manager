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
import { BUILDING_STATUSES } from '@/lib/constants'
import type { BuildingStatus } from '@/lib/types'

export function BuildingForm() {
  const { id } = useParams()
  const editing = !!id
  const existing = useBuilding(id)
  const owners = useOwners()
  const navigate = useNavigate()

  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')
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
      setName(existing.name)
      setCode(existing.code)
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    const data = {
      name: name.trim(),
      code: code.trim() || undefined,
      ownerId,
      location: location.trim() || undefined,
      ratePerSqft: rate ? Number(rate) : undefined,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
      photoThumb: photo,
    }
    if (editing) {
      await updateBuilding(id!, data)
      navigate(`/buildings/${id}`, { replace: true })
    } else {
      const newId = await createBuilding(data)
      navigate(`/buildings/${newId}`, { replace: true })
    }
  }

  return (
    <FormScaffold
      title={editing ? 'Edit building' : 'New building'}
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
      <PhotoPicker value={photo} onChange={setPhoto} name={name || 'Building'} />

      <Field label="Name" required error={error}>
        {(fid) => (
          <Input
            id={fid}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder="e.g. Ramesh Residence"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" hint="Auto if blank">
          {(fid) => (
            <Input id={fid} value={code} onChange={(e) => setCode(e.target.value)} placeholder="RAMRES" />
          )}
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
      </div>

      <Field label="Owner">
        <Combobox
          options={owners.map((o) => ({ value: o.id, label: o.name, sublabel: o.phone }))}
          value={ownerId}
          onChange={setOwnerId}
          onCreate={quickCreateOwner}
          placeholder="Select or add owner"
          allowClear
        />
      </Field>

      <Field label="Location">
        {(fid) => (
          <Input
            id={fid}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Area / street"
          />
        )}
      </Field>

      <Field label="Status">
        <Select value={status} onValueChange={(v) => setStatus(v as BuildingStatus)}>
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
        <Field label="Start date">
          {(fid) => (
            <Input id={fid} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          )}
        </Field>
        <Field label="End date">
          {(fid) => (
            <Input id={fid} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          )}
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
