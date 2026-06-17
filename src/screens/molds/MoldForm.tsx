import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBuilding, useMold } from '@/lib/hooks'
import { createMold, deleteMold, updateMold } from '@/lib/repo'
import { MOLD_PAYMENT_STATUSES, MOLD_WORK_STATUSES } from '@/lib/constants'
import type { MoldPaymentStatus, MoldWorkStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

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
  const navigate = useNavigate()

  const [floorName, setFloorName] = React.useState('')
  const [sqft, setSqft] = React.useState('')
  const [billAmount, setBillAmount] = React.useState('')
  const [billPdfLink, setBillPdfLink] = React.useState('')
  const [workStatus, setWorkStatus] = React.useState<MoldWorkStatus>('Not Started')
  const [paymentStatus, setPaymentStatus] = React.useState<MoldPaymentStatus>('Not Billed')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
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
      setPaymentStatus(existing.paymentStatus)
      setStartDate(existing.startDate ?? '')
      setEndDate(existing.endDate ?? '')
      setNotes(existing.notes ?? '')
    }
  }, [existing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!floorName.trim()) {
      setError('Floor name is required')
      return
    }
    if (!buildingId) return
    setSaving(true)
    const data = {
      floorName: floorName.trim(),
      sqft: sqft ? Number(sqft) : undefined,
      billAmount: billAmount ? Number(billAmount) : undefined,
      billPdfLink: billPdfLink.trim() || undefined,
      workStatus,
      paymentStatus,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
    }
    if (editing) {
      await updateMold(params.id!, data)
      navigate(`/molds/${params.id}`, { replace: true })
    } else {
      await createMold({ buildingId, ...data })
      navigate(`/buildings/${buildingId}`, { replace: true })
    }
  }

  return (
    <FormScaffold
      title={editing ? 'Edit floor' : 'New floor / mold'}
      subtitle={building?.name}
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
      <Field label="Floor name" required error={error}>
        {(fid) => (
          <Input
            id={fid}
            value={floorName}
            onChange={(e) => {
              setFloorName(e.target.value)
              setError('')
            }}
            placeholder="e.g. Ground Floor"
          />
        )}
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5">
        {FLOOR_SUGGESTIONS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFloorName(f)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition',
              floorName === f
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sqft">
          {(fid) => (
            <Input id={fid} type="number" inputMode="decimal" value={sqft} onChange={(e) => setSqft(e.target.value)} />
          )}
        </Field>
        <Field label="Bill amount">
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Work status">
          <Select value={workStatus} onValueChange={(v) => setWorkStatus(v as MoldWorkStatus)}>
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
        <Field label="Payment status">
          <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as MoldPaymentStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOLD_PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          {(fid) => (
            <Input id={fid} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          )}
        </Field>
        <Field label="Removed / end date">
          {(fid) => (
            <Input id={fid} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
