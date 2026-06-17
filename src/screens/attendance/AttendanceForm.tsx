import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Coffee, Trash2, UtensilsCrossed } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAttendance, useBuildings, useMolds, useSettings, useWorkers } from '@/lib/hooks'
import {
  createAttendance,
  deleteAttendance,
  quickCreateBuilding,
  quickCreateWorker,
  updateAttendance,
} from '@/lib/repo'
import { blocksFromTimeRange, dayFractionFromBlocks, mealFlags, normalizeBlocks } from '@/lib/compute/shifts'
import { mealFoodForEntry } from '@/lib/compute/food'
import { todayISO } from '@/lib/dates'
import { days, money } from '@/lib/format'
import { cn } from '@/lib/utils'

const PRESETS: { label: string; blocks: number[] }[] = [
  { label: '½ day', blocks: [1] },
  { label: '1 day', blocks: [1, 2] },
  { label: '1½ day', blocks: [1, 2, 3] },
]

export function AttendanceForm() {
  const { id } = useParams()
  const editing = !!id
  const [search] = useSearchParams()
  const navigate = useNavigate()

  const workers = useWorkers()
  const buildings = useBuildings()
  const settings = useSettings()
  const allAttendance = useAttendance()
  const existing = editing ? allAttendance.find((a) => a.id === id) : undefined

  const [workerId, setWorkerId] = React.useState<string>()
  const [buildingId, setBuildingId] = React.useState<string | undefined>(search.get('building') ?? undefined)
  const [moldId, setMoldId] = React.useState<string | undefined>(search.get('mold') ?? undefined)
  const [date, setDate] = React.useState(search.get('date') ?? todayISO())
  const [blocks, setBlocks] = React.useState<number[]>([])
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const loaded = React.useRef(false)

  const molds = useMolds(buildingId)
  const worker = workers.find((w) => w.id === workerId)

  React.useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      setWorkerId(existing.workerId)
      setBuildingId(existing.buildingId)
      setMoldId(existing.moldId)
      setDate(existing.date)
      setBlocks(existing.blocks ?? [])
      setFrom(existing.shiftFrom ?? '')
      setTo(existing.shiftTo ?? '')
      setNotes(existing.notes ?? '')
    }
  }, [existing])

  function toggleBlock(b: number) {
    setBlocks((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : normalizeBlocks([...prev, b])))
  }

  function applyTimes(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom && nextTo) {
      const mapped = blocksFromTimeRange(nextFrom, nextTo, settings.shiftBlocks)
      if (mapped.length) setBlocks(mapped)
    }
  }

  const dayFraction = dayFractionFromBlocks(blocks)
  const meals = mealFlags(blocks)
  const wage = worker ? dayFraction * worker.dailyWage : 0
  const foodPreview =
    worker?.foodMode === 'meal'
      ? mealFoodForEntry(worker, blocks)
      : worker?.foodMode === 'fixedPerDay'
        ? (worker.foodPerDay ?? 0) * dayFraction
        : undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!workerId) return setError('Pick a worker')
    if (!buildingId) return setError('Pick a building')
    if (blocks.length === 0) return setError('Select at least one shift block')
    setError('')
    setSaving(true)
    const data = {
      workerId,
      buildingId,
      moldId,
      date,
      blocks: normalizeBlocks(blocks),
      dayFraction: dayFractionFromBlocks(blocks),
      shiftFrom: from || undefined,
      shiftTo: to || undefined,
      notes: notes.trim() || undefined,
    }
    if (editing) await updateAttendance(id!, data)
    else await createAttendance(data)
    navigate(-1)
  }

  return (
    <FormScaffold
      title={editing ? 'Edit attendance' : 'Add attendance'}
      onSubmit={submit}
      submitting={saving}
      submitLabel={editing ? 'Save' : 'Add'}
      footerExtra={
        editing ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-4" />
          </Button>
        ) : undefined
      }
    >
      <Field label="Worker" required>
        <Combobox
          options={workers.filter((w) => w.active || w.id === workerId).map((w) => ({ value: w.id, label: w.name, sublabel: `${w.type} · ${money(w.dailyWage)}/day` }))}
          value={workerId}
          onChange={setWorkerId}
          onCreate={quickCreateWorker}
          placeholder="Pick worker"
        />
      </Field>

      <Field label="Building" required>
        <Combobox
          options={buildings.filter((b) => b.status !== 'Closed' || b.id === buildingId).map((b) => ({ value: b.id, label: b.name, sublabel: b.code }))}
          value={buildingId}
          onChange={(v) => {
            setBuildingId(v)
            setMoldId(undefined)
          }}
          onCreate={quickCreateBuilding}
          placeholder="Pick building"
        />
      </Field>

      <Field label="Floor / mold" hint={buildingId ? undefined : 'Pick a building first'}>
        <Combobox
          options={molds.map((m) => ({ value: m.id, label: m.floorName }))}
          value={moldId}
          onChange={setMoldId}
          placeholder={buildingId ? 'Pick floor (optional)' : '—'}
          disabled={!buildingId}
          allowClear
        />
      </Field>

      <Field label="Date" required>
        {(fid) => <Input id={fid} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>

      {/* Shift blocks */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Shift blocks</span>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setBlocks(p.blocks)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {settings.shiftBlocks.map((b) => {
            const on = blocks.includes(b.index)
            return (
              <button
                key={b.index}
                type="button"
                onClick={() => toggleBlock(b.index)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition',
                  on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground',
                )}
              >
                <span className="text-xs font-semibold">Block {b.index}</span>
                <span className="text-[11px]">{b.from}–{b.to}</span>
                <span className="flex h-4 items-center gap-1 text-[10px]">
                  {b.index === 1 && <Coffee className="size-3" />}
                  {b.index === 3 && <UtensilsCrossed className="size-3" />}
                </span>
              </button>
            )
          })}
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>

      {/* Live preview */}
      <div className="grid grid-cols-3 gap-2.5 rounded-xl border border-border bg-card p-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Day</p>
          <p className="tabular text-lg font-bold">{days(dayFraction)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wage</p>
          <p className="tabular text-lg font-bold">{money(wage)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Food</p>
          <p className="tabular text-lg font-bold">{foodPreview != null ? money(foodPreview) : '—'}</p>
        </div>
        <div className="col-span-3 flex items-center justify-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
          <span className={cn('flex items-center gap-1', meals.breakfast && 'text-foreground')}>
            <Coffee className="size-3.5" /> {meals.breakfast ? 'Breakfast' : 'No breakfast'}
          </span>
          <span className={cn('flex items-center gap-1', meals.lunch && 'text-foreground')}>
            <UtensilsCrossed className="size-3.5" /> {meals.lunch ? 'Lunch' : 'No lunch'}
          </span>
        </div>
      </div>

      {/* Exact times (optional) */}
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-muted-foreground">
          Set exact times (optional)
        </summary>
        <div className="grid grid-cols-2 gap-3 p-3.5 pt-0">
          <Field label="From">
            {(fid) => <Input id={fid} type="time" value={from} onChange={(e) => applyTimes(e.target.value, to)} />}
          </Field>
          <Field label="To">
            {(fid) => <Input id={fid} type="time" value={to} onChange={(e) => applyTimes(from, e.target.value)} />}
          </Field>
        </div>
      </details>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this attendance entry?"
        onConfirm={async () => {
          await deleteAttendance(id!)
          navigate('/attendance', { replace: true })
        }}
      />
    </FormScaffold>
  )
}
