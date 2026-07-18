import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { useBuilding, useMold, useOwner, useTransactionsForBuilding } from '@/lib/hooks'
import { saveMoldBill, updateMold } from '@/lib/repo'
import {
  BILL_SECTION_SUGGESTIONS,
  areaDisplay,
  billTotals,
  dimDisplay,
  dimEntry,
  extraAmount,
  newMoldBill,
  parseDim,
  rowTotal,
  sectionTotal,
} from '@/lib/compute/bill'
import { receiptsForMold } from '@/lib/compute/profit'
import { byId, buildingName } from '@/lib/select'
import { money } from '@/lib/format'
import { uuid } from '@/lib/ids'
import { toast } from '@/lib/toast'
import type { BillSection, BillUnit, MoldBill } from '@/lib/types'

/** Create / update the measurement bill for a mold (floor). Dimensions are
 * stored as decimal feet; the ft-in toggle only changes entry & display. Only
 * row TOTALS round (up, to the quarter) — see compute/bill.ts. */
export function BillEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mold = useMold(id)
  const building = useBuilding(mold?.buildingId)
  const owner = useOwner(building?.ownerId)
  const txns = useTransactionsForBuilding(mold?.buildingId)

  const [bill, setBill] = React.useState<MoldBill | null>(null)
  const [pdfLink, setPdfLink] = React.useState('')
  const [newSection, setNewSection] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const loaded = React.useRef(false)
  const dragFrom = React.useRef<number | null>(null)

  // Tracked advance = assigned OwnerReceipt txns for this mold (reference only —
  // never printed; the deducted advance below is editable).
  const trackedAdvance = mold ? receiptsForMold(mold.id, txns) : 0

  React.useEffect(() => {
    if (mold && !loaded.current) {
      loaded.current = true
      setBill(
        mold.bill ?? newMoldBill({ rate: building?.ratePerSqft, advance: trackedAdvance }),
      )
      setPdfLink(mold.billPdfLink ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mold])

  // Late default: if the bill was created before building/receipts loaded.
  React.useEffect(() => {
    if (!mold?.bill && bill && building?.ratePerSqft != null && bill.rate === 30) {
      setBill((b) => (b ? { ...b, rate: building.ratePerSqft! } : b))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.ratePerSqft])

  if (!mold || !bill) return <PageHeader title="Bill" back />

  const totals = billTotals(bill)
  const unit = bill.unit

  const patch = (p: Partial<MoldBill>) => setBill((b) => (b ? { ...b, ...p } : b))
  const patchSection = (sid: string, f: (s: BillSection) => BillSection) =>
    patch({ sections: bill.sections.map((s) => (s.id === sid ? f(s) : s)) })

  function addSection(name: string) {
    const n = name.trim()
    if (!n || !bill) return
    const dup = bill.sections.find((s) => s.name.toLowerCase() === n.toLowerCase())
    if (dup) {
      if (window.confirm(`Section "${dup.name}" already exists.\n\nOK = combine (add a row to it)`)) {
        patchSection(dup.id, (s) => ({ ...s, collapsed: false, rows: [...s.rows, { l: '', h: '', no: '' }] }))
      }
    } else {
      patch({
        sections: [...bill.sections, { id: uuid(), name: n, rows: [{ l: '', h: '', no: '' }] }],
      })
    }
    setNewSection('')
  }

  function renameSection(sid: string, raw: string) {
    if (!bill) return
    const name = raw.trim()
    const s = bill.sections.find((x) => x.id === sid)
    if (!s || !name || name === s.name) return
    const dup = bill.sections.find((x) => x.id !== sid && x.name.toLowerCase() === name.toLowerCase())
    if (dup) {
      if (
        window.confirm(
          `Section "${dup.name}" already exists.\n\nOK = combine rows into "${dup.name}"\nCancel = keep the old name`,
        )
      ) {
        const keep = s.rows.filter((r) => r.l !== '' || r.h !== '' || r.no !== '')
        patch({
          sections: bill.sections
            .filter((x) => x.id !== sid)
            .map((x) =>
              x.id === dup.id
                ? { ...x, collapsed: false, rows: [...x.rows.filter((r) => r.l !== '' || r.h !== '' || r.no !== ''), ...keep] }
                : x,
            ),
        })
      }
    } else {
      patchSection(sid, (x) => ({ ...x, name }))
    }
  }

  function moveSection(from: number, to: number) {
    if (!bill || to < 0 || to >= bill.sections.length) return
    const arr = [...bill.sections]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    patch({ sections: arr })
  }

  /** Enter walks L → H → No → next/new row (first field). */
  function keyNav(e: React.KeyboardEvent, sid: string, idx: number, field: 'l' | 'h' | 'no') {
    if (e.key !== 'Enter' || !bill) return
    e.preventDefault()
    const s = bill.sections.find((x) => x.id === sid)
    if (!s) return
    const focus = (fid: string) => {
      // The target input may not be rendered yet (new row) — retry briefly so
      // the mobile keyboard's Next lands on it instead of the next form field.
      let tries = 0
      const attempt = () => {
        const el = document.getElementById(fid) as HTMLInputElement | null
        if (el) {
          el.focus()
          el.select?.()
        } else if (tries++ < 10) {
          requestAnimationFrame(attempt)
        }
      }
      requestAnimationFrame(attempt)
    }
    if (field === 'l') return focus(`bl-${sid}-${idx}-h`)
    if (field === 'h') return focus(`bl-${sid}-${idx}-no`)
    if (idx < s.rows.length - 1) return focus(`bl-${sid}-${idx + 1}-l`)
    patchSection(sid, (x) => ({ ...x, rows: [...x.rows, { l: '', h: '', no: '' }] }))
    focus(`bl-${sid}-${idx + 1}-l`)
  }

  async function save(goView: boolean) {
    if (!mold) return
    setSaving(true)
    try {
      await saveMoldBill(mold.id, bill!)
      const link = pdfLink.trim() || undefined
      if (link !== (mold.billPdfLink ?? undefined)) await updateMold(mold.id, { billPdfLink: link })
      toast.success('Bill saved')
      navigate(goView ? `/molds/${mold.id}/bill/view` : `/molds/${mold.id}`, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the bill')
      setSaving(false)
    }
  }

  const sectionOptions = (() => {
    const names = new Set(BILL_SECTION_SUGGESTIONS)
    if (newSection.trim()) names.add(newSection.trim())
    return [...names].map((n) => ({ value: n, label: n }))
  })()

  return (
    <>
      <PageHeader
        title={`Bill — ${mold.floorName}`}
        subtitle={buildingName(building, byId(owner ? [owner] : []))}
        back
        actions={
          <Button variant="ghost" size="icon" onClick={() => void save(true)} aria-label="Preview">
            <Eye className="size-5" />
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-32">
        {/* Unit toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-card">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{unit === 'ftin' ? 'Feet–Inches entry' : 'Decimal entry'}</p>
            <p className="text-xs text-muted-foreground">
              {unit === 'ftin' ? '2.11 = 2\u2032 11\u2033 · totals round up to 3\u2033' : '2.25 = 2.25 ft · totals round up to 0.25'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ unit: unit === 'ftin' ? 'dec' : 'ftin' })}
          >
            Switch to {unit === 'ftin' ? 'decimal' : 'ft-in'}
          </Button>
        </div>

        {/* Sections */}
        {bill.sections.map((s, si) => (
          <div
            key={s.id}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current != null && dragFrom.current !== si) moveSection(dragFrom.current, si)
              dragFrom.current = null
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-2">
              <span
                draggable
                onDragStart={() => (dragFrom.current = si)}
                className="cursor-grab touch-none text-muted-foreground"
                aria-label="Drag to reorder"
              >
                <GripVertical className="size-4" />
              </span>
              <button
                type="button"
                onClick={() => patchSection(s.id, (x) => ({ ...x, collapsed: !x.collapsed }))}
                className="text-muted-foreground"
                aria-label={s.collapsed ? 'Expand' : 'Collapse'}
              >
                {s.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              <input
                defaultValue={s.name}
                key={s.name}
                onBlur={(e) => renameSection(s.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold focus:border-ring focus:outline-none"
                aria-label="Section name"
              />
              {s.collapsed && (
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {areaDisplay(sectionTotal(s), unit)} sqft
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon" className="size-8" disabled={si === 0} onClick={() => moveSection(si, si - 1)} aria-label="Move up">
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" disabled={si === bill.sections.length - 1} onClick={() => moveSection(si, si + 1)} aria-label="Move down">
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => patch({ sections: bill.sections.filter((x) => x.id !== s.id) })}
                  aria-label="Remove section"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {!s.collapsed && (
              <div className="p-2.5">
                <div className="mb-1 grid grid-cols-[1fr_1fr_4rem_4.5rem_2rem] items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>L</span>
                  <span>H / B</span>
                  <span>No.</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                {s.rows.map((r, ri) => (
                  <div key={`${ri}-${s.rows.length}`} className="mb-1.5 grid grid-cols-[1fr_1fr_4rem_4.5rem_2rem] items-center gap-1.5">
                    <div>
                      <Input
                        id={`bl-${s.id}-${ri}-l`}
                        inputMode="decimal"
                        enterKeyHint="next"
                        className="h-9 text-center"
                        defaultValue={dimEntry(r.l, unit)}
                        key={`l-${unit}`}
                        onChange={(e) =>
                          patchSection(s.id, (x) => ({
                            ...x,
                            rows: x.rows.map((row, i) => (i === ri ? { ...row, l: parseDim(e.target.value, unit) } : row)),
                          }))
                        }
                        onKeyDown={(e) => keyNav(e, s.id, ri, 'l')}
                      />
                      {unit === 'ftin' && r.l !== '' && (
                        <p className="mt-0.5 text-center text-[10px] text-muted-foreground">{dimDisplay(r.l, unit)}</p>
                      )}
                    </div>
                    <div>
                      <Input
                        id={`bl-${s.id}-${ri}-h`}
                        inputMode="decimal"
                        enterKeyHint="next"
                        className="h-9 text-center"
                        defaultValue={dimEntry(r.h, unit)}
                        key={`h-${unit}`}
                        onChange={(e) =>
                          patchSection(s.id, (x) => ({
                            ...x,
                            rows: x.rows.map((row, i) => (i === ri ? { ...row, h: parseDim(e.target.value, unit) } : row)),
                          }))
                        }
                        onKeyDown={(e) => keyNav(e, s.id, ri, 'h')}
                      />
                      {unit === 'ftin' && r.h !== '' && (
                        <p className="mt-0.5 text-center text-[10px] text-muted-foreground">{dimDisplay(r.h, unit)}</p>
                      )}
                    </div>
                    <Input
                      id={`bl-${s.id}-${ri}-no`}
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      className="h-9 text-center"
                      value={r.no === '' ? '' : String(r.no)}
                      onChange={(e) =>
                        patchSection(s.id, (x) => ({
                          ...x,
                          rows: x.rows.map((row, i) =>
                            i === ri ? { ...row, no: e.target.value === '' ? '' : Number(e.target.value) } : row,
                          ),
                        }))
                      }
                      onKeyDown={(e) => keyNav(e, s.id, ri, 'no')}
                    />
                    <span className="tabular truncate text-right text-sm font-semibold text-primary">
                      {areaDisplay(rowTotal(r), unit)}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground transition hover:text-destructive"
                      onClick={() =>
                        patchSection(s.id, (x) => ({
                          ...x,
                          rows: x.rows.length > 1 ? x.rows.filter((_, i) => i !== ri) : [{ l: '', h: '', no: '' }],
                        }))
                      }
                      aria-label="Remove row"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patchSection(s.id, (x) => ({ ...x, rows: [...x.rows, { l: '', h: '', no: '' }] }))}
                  >
                    <Plus className="size-4" /> Row
                  </Button>
                  <span className="text-sm font-semibold">
                    {areaDisplay(sectionTotal(s), unit)} sqft
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add section */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-card">
          <Field label="Add section">
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  options={sectionOptions}
                  value={newSection || undefined}
                  onChange={(v) => v && addSection(v)}
                  onCreate={(label) => {
                    addSection(label)
                    return label
                  }}
                  createLabel={(q) => `Add “${q}”`}
                  placeholder="Plinth, Sajja Nintel, Roof Slab…"
                  searchPlaceholder="Type to search or add new"
                />
              </div>
            </div>
          </Field>
        </div>

        {/* Rate + extras */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-card">
          <Field label="Area rate (₹ / sqft)">
            {(fid) => (
              <Input
                id={fid}
                type="number"
                inputMode="decimal"
                value={bill.rate === 0 ? '' : String(bill.rate)}
                onChange={(e) => patch({ rate: Number(e.target.value) || 0 })}
                className="max-w-40"
              />
            )}
          </Field>

          <p className="text-sm font-semibold">Extra items (qty × rate)</p>
          {bill.extras.map((x, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_4rem_5rem_auto_2rem] items-center gap-1.5">
              <Input
                placeholder="Item"
                value={x.name}
                onChange={(e) =>
                  patch({ extras: bill.extras.map((e2, j) => (j === i ? { ...e2, name: e.target.value } : e2)) })
                }
                className="h-9"
              />
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Qty"
                value={x.qty === '' ? '' : String(x.qty)}
                onChange={(e) =>
                  patch({
                    extras: bill.extras.map((e2, j) =>
                      j === i ? { ...e2, qty: e.target.value === '' ? '' : Number(e.target.value) } : e2,
                    ),
                  })
                }
                className="h-9 text-center"
              />
              <Input
                type="number"
                inputMode="decimal"
                placeholder="₹"
                value={x.rate === '' ? '' : String(x.rate)}
                onChange={(e) =>
                  patch({
                    extras: bill.extras.map((e2, j) =>
                      j === i ? { ...e2, rate: e.target.value === '' ? '' : Number(e.target.value) } : e2,
                    ),
                  })
                }
                className="h-9 text-center"
              />
              <span className="tabular whitespace-nowrap text-right text-sm font-medium">{money(extraAmount(x))}</span>
              <button
                type="button"
                className="text-muted-foreground transition hover:text-destructive"
                onClick={() => patch({ extras: bill.extras.filter((_, j) => j !== i) })}
                aria-label="Remove extra"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => patch({ extras: [...bill.extras, { name: '', qty: '', rate: '' }] })}
          >
            <Plus className="size-4" /> Extra item
          </Button>
        </div>

        {/* Advance */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-card">
          <Field label="Advance deducted on the bill (₹)">
            {(fid) => (
              <div className="flex items-center gap-2">
                <Input
                  id={fid}
                  type="number"
                  inputMode="decimal"
                  value={bill.advance === 0 ? '0' : String(bill.advance)}
                  onChange={(e) => patch({ advance: Number(e.target.value) || 0 })}
                  className="max-w-40"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => patch({ advance: trackedAdvance })}>
                  Use tracked {money(trackedAdvance)}
                </Button>
              </div>
            )}
          </Field>
          <p className="text-xs text-muted-foreground">
            Tracked = assigned owner receipts for this floor ({money(trackedAdvance)}). Reference only — the
            printed bill shows just the advance amount above.
          </p>
        </div>

        {/* External PDF link (kept from the mold form) */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-card">
          <Field label="Bill PDF link (optional)" hint="e.g. a Drive/WhatsApp link to a scanned or exported bill">
            {(fid) => (
              <Input
                id={fid}
                type="url"
                value={pdfLink}
                onChange={(e) => setPdfLink(e.target.value)}
                placeholder="https://…"
              />
            )}
          </Field>
        </div>

        {/* Summary */}
        <div className="space-y-1.5 rounded-xl border border-border bg-card p-4 shadow-card text-sm">
          {bill.sections.map((s) => (
            <div key={s.id} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-muted-foreground">{s.name}</span>
              <span className="tabular whitespace-nowrap">{areaDisplay(sectionTotal(s), unit)} sqft</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-border pt-1.5">
            <span>
              Total area × {money(bill.rate)}/sqft
            </span>
            <span className="tabular whitespace-nowrap font-medium">{areaDisplay(totals.sqft, unit)} sqft</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Area amount</span>
            <span className="tabular whitespace-nowrap">{money(totals.areaAmount, true)}</span>
          </div>
          {bill.extras.filter((x) => x.name || extraAmount(x) > 0).map((x, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-muted-foreground">
                {x.name || '—'} {x.qty || 0} × {money(Number(x.rate) || 0)}
              </span>
              <span className="tabular whitespace-nowrap">{money(extraAmount(x), true)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t-2 border-primary pt-2 text-base font-bold text-primary">
            <span>TOTAL</span>
            <span className="tabular whitespace-nowrap">{money(totals.total, true)}</span>
          </div>
          {totals.advance > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-3 text-destructive">
                <span>Less: advance received</span>
                <span className="tabular whitespace-nowrap">− {money(totals.advance, true)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 font-bold text-success">
                <span>BALANCE DUE</span>
                <span className="tabular whitespace-nowrap">{money(totals.balance, true)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold">{money(totals.total)}</p>
            <p className="truncate text-xs text-muted-foreground">{areaDisplay(totals.sqft, unit)} sqft</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void save(true)} disabled={saving}>
              <Eye className="size-4" /> Preview
            </Button>
            <Button onClick={() => void save(false)} disabled={saving}>
              <Save className="size-4" /> Save
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
