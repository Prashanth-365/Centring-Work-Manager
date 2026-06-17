import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { PhotoPicker } from '@/components/PhotoPicker'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings, useWorker } from '@/lib/hooks'
import { createWorker, deleteWorker, setWorkerWage, updateWorker } from '@/lib/repo'
import { currentWage } from '@/lib/compute/wage'
import { FOOD_MODES, WORKER_TYPES } from '@/lib/constants'
import { formatDate, todayISO } from '@/lib/dates'
import { money } from '@/lib/format'
import type { FoodMode, WorkerType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function WorkerForm() {
  const { id } = useParams()
  const editing = !!id
  const existing = useWorker(id)
  const settings = useSettings()
  const navigate = useNavigate()

  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<WorkerType>('Helper')
  const [wage, setWage] = React.useState('')
  const [wageEffective, setWageEffective] = React.useState(todayISO())
  const [phone, setPhone] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [photo, setPhoto] = React.useState<Blob>()
  const [notes, setNotes] = React.useState('')
  const [foodMode, setFoodMode] = React.useState<FoodMode>('meal')
  const [breakfast, setBreakfast] = React.useState('')
  const [lunch, setLunch] = React.useState('')
  const [perDay, setPerDay] = React.useState('')
  const [perWeek, setPerWeek] = React.useState('')
  const [maxDays, setMaxDays] = React.useState('')
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const loaded = React.useRef(false)
  const seeded = React.useRef(false)

  // Seed food defaults for a NEW worker once settings load.
  React.useEffect(() => {
    if (!editing && !seeded.current && settings) {
      seeded.current = true
      setBreakfast(String(settings.defaultFoodBreakfast))
      setLunch(String(settings.defaultFoodLunch))
      setPerDay(String(settings.defaultFoodPerDay))
      setPerWeek(String(settings.defaultFoodPerWeek))
      setMaxDays(String(settings.defaultMaxDaysPerWeek))
    }
  }, [editing, settings])

  React.useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      setName(existing.name)
      setType(existing.type)
      setWage(String(currentWage(existing)))
      // A new edit defaults to taking effect today (past work keeps its old rate).
      setWageEffective(todayISO())
      setPhone(existing.phone ?? '')
      setActive(existing.active)
      setPhoto(existing.photoThumb)
      setNotes(existing.notes ?? '')
      setFoodMode(existing.foodMode)
      setBreakfast(String(existing.foodBreakfast))
      setLunch(String(existing.foodLunch))
      setPerDay(String(existing.foodPerDay ?? ''))
      setPerWeek(String(existing.foodPerWeek ?? ''))
      setMaxDays(String(existing.maxDaysPerWeek))
    }
  }, [existing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    const wageNum = wage ? Number(wage) : 0
    const common = {
      name: name.trim(),
      type,
      phone: phone.trim() || undefined,
      active,
      photoThumb: photo,
      notes: notes.trim() || undefined,
      foodMode,
      foodBreakfast: breakfast ? Number(breakfast) : 0,
      foodLunch: lunch ? Number(lunch) : 0,
      foodPerDay: perDay ? Number(perDay) : undefined,
      foodPerWeek: perWeek ? Number(perWeek) : undefined,
      maxDaysPerWeek: maxDays ? Number(maxDays) : 10,
    }
    if (editing && existing) {
      await updateWorker(id!, common)
      // Changing the displayed rate appends a new effective-dated entry (§7).
      if (wageNum !== currentWage(existing)) {
        await setWorkerWage(id!, wageNum, wageEffective || todayISO())
      }
      navigate(`/workers/${id}`, { replace: true })
    } else {
      const newId = await createWorker({
        ...common,
        dailyWage: wageNum,
        effectiveFrom: wageEffective || todayISO(),
      })
      navigate(`/workers/${newId}`, { replace: true })
    }
  }

  return (
    <FormScaffold
      title={editing ? 'Edit worker' : 'New worker'}
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
      <PhotoPicker value={photo} onChange={setPhoto} name={name || 'Worker'} />

      <Field label="Name" required error={error}>
        {(fid) => (
          <Input
            id={fid}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder="Worker name"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as WorkerType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Phone">
          {(fid) => (
            <Input id={fid} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile" />
          )}
        </Field>
      </div>

      {/* Daily wage — effective-dated history (§7). */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
        <p className="text-sm font-semibold">Daily wage</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required>
            {(fid) => (
              <Input
                id={fid}
                type="number"
                inputMode="decimal"
                value={wage}
                onChange={(e) => setWage(e.target.value)}
                placeholder="₹"
              />
            )}
          </Field>
          <Field label="Effective from" hint="Past work keeps its old rate">
            {(fid) => (
              <Input id={fid} type="date" value={wageEffective} onChange={(e) => setWageEffective(e.target.value)} />
            )}
          </Field>
        </div>
        {editing && existing && existing.wageHistory.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground">Rate history</p>
            {[...existing.wageHistory]
              .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
              .map((w) => (
                <div key={w.effectiveFrom} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">from {formatDate(w.effectiveFrom)}</span>
                  <span className="font-medium">{money(w.dailyWage)}/day</span>
                </div>
              ))}
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-sm font-medium">Active</span>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>

      {/* Food configuration */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
        <p className="text-sm font-semibold">Food</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {FOOD_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setFoodMode(m.value)}
              className={cn(
                'rounded-lg py-1.5 text-xs font-medium transition',
                foodMode === m.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{FOOD_MODES.find((m) => m.value === foodMode)?.hint}</p>

        {foodMode === 'meal' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breakfast (blocks 1 & 2)">
              {(fid) => (
                <Input id={fid} type="number" inputMode="decimal" value={breakfast} onChange={(e) => setBreakfast(e.target.value)} />
              )}
            </Field>
            <Field label="Lunch (blocks 2 & 3)">
              {(fid) => (
                <Input id={fid} type="number" inputMode="decimal" value={lunch} onChange={(e) => setLunch(e.target.value)} />
              )}
            </Field>
          </div>
        )}
        {foodMode === 'fixedPerDay' && (
          <Field label="Food per full day">
            {(fid) => (
              <Input id={fid} type="number" inputMode="decimal" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
            )}
          </Field>
        )}
        {foodMode === 'fixedPerWeek' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Food per week">
              {(fid) => (
                <Input id={fid} type="number" inputMode="decimal" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
              )}
            </Field>
            <Field label="Max days / week">
              {(fid) => (
                <Input id={fid} type="number" inputMode="decimal" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
              )}
            </Field>
          </div>
        )}
      </div>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this worker?"
        description="Their attendance entries will remain but reference a missing worker. Consider marking inactive instead."
        onConfirm={async () => {
          await deleteWorker(id!)
          navigate('/workers', { replace: true })
        }}
      />
    </FormScaffold>
  )
}
