import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink, Pencil, Printer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'
import {
  useBuilding,
  useMold,
  useMolds,
  useOwner,
  useTransactionsForBuilding,
} from '@/lib/hooks'
import {
  areaDisplay,
  billTotals,
  dimDisplay,
  extraAmount,
  rowTotal,
  sectionTotal,
} from '@/lib/compute/bill'
import { byId, buildingName } from '@/lib/select'
import { formatDate, todayISO } from '@/lib/dates'
import { money } from '@/lib/format'
import { isNative } from '@/lib/native'
import { toast } from '@/lib/toast'
import type { BillPdfSheet } from '@/lib/billPdf'
import type { BillSection, Building, Mold, MoldBill, Owner } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* Layout designer types                                               */
/* ------------------------------------------------------------------ */
/* Layout state — N-column array of section-id arrays                  */
/* ------------------------------------------------------------------ */

/** cols[colIndex] = ordered array of sectionIds in that column.
 *  Sections not in any col appear in the unplaced pool. */
export type LayoutState = { cols: string[][] }

function defaultLayout(sections: BillSection[]): LayoutState {
  const isSlab = (s: BillSection) => /roof\s*slab/i.test(s.name)
  const isRoof = (s: BillSection) => !isSlab(s) && /roof/i.test(s.name)
  const left = sections.filter((s) => !isSlab(s) && !isRoof(s)).map((s) => s.id)
  const right = [...sections.filter(isSlab), ...sections.filter(isRoof)].map((s) => s.id)
  return { cols: [left, right] }
}

/* ------------------------------------------------------------------ */
/* Full layout designer component                                       */
/* ------------------------------------------------------------------ */

function PrintControls({
  sections,
  layout,
  onLayout,
  fontSize,
  onFontSize,
  rowPad,
  onRowPad,
}: {
  sections: BillSection[]
  layout: LayoutState
  onLayout: (l: LayoutState) => void
  fontSize: number
  onFontSize: (v: number) => void
  rowPad: number
  onRowPad: (v: number) => void
}) {
  const placed = new Set(layout.cols.flat())
  const unplaced = sections.filter((s) => !placed.has(s.id))

  // Drag state stored in a ref so we don't re-render during drag
  const dragRef = React.useRef<{ sid: string; col: number } | null>(null)

  function patchCols(fn: (cols: string[][]) => string[][]): void {
    onLayout({ cols: fn(layout.cols.map((c) => [...c])) })
  }

  function removeFromCols(sid: string, cols: string[][]): void {
    cols.forEach((c) => { const i = c.indexOf(sid); if (i !== -1) c.splice(i, 1) })
  }

  function moveUp(sid: string, ci: number) {
    patchCols((cols) => {
      const arr = cols[ci]; const i = arr.indexOf(sid)
      if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]] }
      return cols
    })
  }

  function moveDown(sid: string, ci: number) {
    patchCols((cols) => {
      const arr = cols[ci]; const i = arr.indexOf(sid)
      if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]] }
      return cols
    })
  }

  function removeFromCol(sid: string) {
    patchCols((cols) => { removeFromCols(sid, cols); return cols })
  }

  function addCol() {
    patchCols((cols) => { cols.push([]); return cols })
  }

  function removeCol(ci: number) {
    patchCols((cols) => {
      const orphans = cols.splice(ci, 1)[0]
      if (!cols.length) cols.push([])
      cols[cols.length - 1].push(...orphans)
      return cols
    })
  }

  function resetLayout() {
    onLayout(defaultLayout(sections))
  }

  function handleDragStart(sid: string, col: number) {
    dragRef.current = { sid, col }
  }

  function handleDrop(targetCol: number) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    patchCols((cols) => {
      removeFromCols(drag.sid, cols)
      if (targetCol === -1) return cols          // drop on pool = unplace
      while (cols.length <= targetCol) cols.push([])
      cols[targetCol].push(drag.sid)
      return cols
    })
  }

  return (
    <div className="print-hide mb-4 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Print layout designer</p>

      {/* Unplaced pool */}
      {unplaced.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unplaced sections</p>
          <div
            className="flex min-h-[36px] flex-wrap gap-1.5 rounded-lg border border-dashed border-border p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(-1)}
          >
            {unplaced.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={() => handleDragStart(s.id, -1)}
                className="flex cursor-grab items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground active:cursor-grabbing"
              >
                ☰ {s.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column grid */}
      <div className="overflow-x-auto">
        <div className="flex min-w-0 gap-2" style={{ minWidth: `${layout.cols.length * 160}px` }}>
          {layout.cols.map((col, ci) => (
            <div key={ci} className="flex min-w-[140px] flex-1 flex-col rounded-lg border border-border bg-muted/30">
              {/* Column header */}
              <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Col {ci + 1}</span>
                {layout.cols.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCol(ci)}
                    className="rounded px-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                    title="Remove column (sections go to last col)"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Drop zone */}
              <div
                className="flex flex-1 flex-col gap-1 p-1.5"
                style={{ minHeight: 60 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(ci)}
              >
                {col.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-muted-foreground">Drop here</p>
                )}
                {col.map((sid) => {
                  const s = sections.find((x) => x.id === sid)
                  if (!s) return null
                  return (
                    <div
                      key={sid}
                      draggable
                      onDragStart={() => handleDragStart(sid, ci)}
                      className="flex items-center gap-1 rounded-md border border-border bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
                    >
                      <span className="cursor-grab text-primary-foreground/70">☰</span>
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <button
                        type="button"
                        onClick={() => moveUp(sid, ci)}
                        className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground"
                        title="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveDown(sid, ci)}
                        className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground"
                        title="Move down"
                      >▼</button>
                      <button
                        type="button"
                        onClick={() => removeFromCol(sid)}
                        className="shrink-0 text-primary-foreground/60 hover:text-primary-foreground"
                        title="Remove from column"
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addCol}
          className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          + Column
        </button>
        <button
          type="button"
          onClick={resetLayout}
          className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          ↺ Reset to default
        </button>
      </div>

      {/* Font size */}
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-muted-foreground">Font size: {fontSize}px</span>
        <input type="range" min={9} max={16} step={0.5} value={fontSize} onChange={(e) => onFontSize(Number(e.target.value))} className="flex-1" />
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onFontSize(13)}>reset</button>
      </div>

      {/* Row spacing */}
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-muted-foreground">Row spacing: {rowPad}px</span>
        <input type="range" min={1} max={8} step={0.5} value={rowPad} onChange={(e) => onRowPad(Number(e.target.value))} className="flex-1" />
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onRowPad(4)}>reset</button>
      </div>
    </div>
  )
}

const COMPANY = 'Sri Siddeshwara Swami Prasanna (SSP)'
const COMPANY_SUB = 'Centering · Shuttering · Scaffolding Works'
const CONTACT = 'Eshwar G S — 7899041588'

/** The global print sheet is landscape (weekly register); bills print
 * PORTRAIT — inject an overriding @page while a bill view is mounted. */
function usePortraitPrint() {
  React.useEffect(() => {
    const el = document.createElement('style')
    el.textContent = '@media print { @page { size: portrait; margin: 10mm } }'
    document.head.appendChild(el)
    return () => el.remove()
  }, [])
}

/* ------------------------------------------------------------------ */
/* Shared printable sheet pieces                                       */
/* ------------------------------------------------------------------ */

function SheetInfo({
  building,
  owner,
  mold,
}: {
  building: Building
  owner?: Owner
  mold?: Mold
}) {
  const name = buildingName(building, byId(owner ? [owner] : []))
  return (
    <div className="bill-info grid grid-cols-1 gap-x-6 gap-y-0.5 border-b-2 border-foreground pb-3 text-[13px] sm:grid-cols-2">
      <p><b>Owner:</b> {owner?.name ?? '—'}</p>
      <p><b>Location:</b> {building.location ?? '—'}</p>
      <p><b>Building:</b> {name}</p>
      <p><b>Period:</b> {formatDate(building.startDate)} → {formatDate(building.endDate)}</p>
      {mold && (
        <>
          <p><b>Floor:</b> {mold.floorName}</p>
          <p><b>Floor period:</b> {formatDate(mold.startDate)} → {formatDate(mold.removedDate ?? mold.completedDate)}</p>
        </>
      )}
      <p><b>Bill date:</b> {formatDate(todayISO())}</p>
    </div>
  )
}

/** One section's mini measurement table: `L X H X n no = total` rows. */
function SectionTable({ s, u, rowPad = 4 }: { s: BillSection; u: MoldBill['unit']; rowPad?: number }) {
  const rows = s.rows.filter((r) => r.l !== '' || r.h !== '' || r.no !== '')
  const cellStyle: React.CSSProperties = { paddingTop: rowPad, paddingBottom: rowPad }
  return (
    <table className="mb-2.5 w-full border-collapse [&_td]:border [&_td]:border-[#b8c6d2] [&_td]:px-2 [&_td]:text-center [&_td]:whitespace-nowrap">
      <tbody>
        <tr>
          <td colSpan={7} style={cellStyle} className="bg-muted/40 !text-left font-bold text-primary">{s.name}</td>
        </tr>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={cellStyle}>{dimDisplay(r.l, u)}</td>
            <td style={cellStyle} className="w-5 !border-x-0 !px-0.5 text-[11px] text-muted-foreground">X</td>
            <td style={cellStyle}>{dimDisplay(r.h, u)}</td>
            <td style={cellStyle} className="w-5 !border-x-0 !px-0.5 text-[11px] text-muted-foreground">X</td>
            <td style={cellStyle}>{r.no || 0}</td>
            <td style={cellStyle} className="w-6 !border-x-0 !px-0.5 text-[11px] text-muted-foreground">no</td>
            <td style={cellStyle} className="tabular font-bold">{areaDisplay(rowTotal(r), u)}</td>
          </tr>
        ))}
        <tr className="bg-muted/20 font-bold">
          <td colSpan={3} style={cellStyle} className="!text-right">Total</td>
          <td style={cellStyle} className="w-5 !border-x-0 !px-0.5 text-[11px] text-muted-foreground">=</td>
          <td colSpan={3} style={cellStyle}>{areaDisplay(sectionTotal(s), u)}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** Splits sections into N columns based on LayoutState; falls back to default 2-col heuristic. */
function applySplit(sections: BillSection[], layout?: LayoutState): BillSection[][] {
  if (layout) {
    return layout.cols.map((col) =>
      col.map((id) => sections.find((s) => s.id === id)).filter(Boolean) as BillSection[]
    )
  }
  const isSlab = (s: BillSection) => /roof\s*slab/i.test(s.name)
  const isRoof = (s: BillSection) => !isSlab(s) && /roof/i.test(s.name)
  const right = [...sections.filter(isSlab), ...sections.filter(isRoof)]
  const left = sections.filter((s) => !isSlab(s) && !isRoof(s))
  return [left, right]
}

/** One floor's measurement sheet (used standalone and inside the consolidated view). */
function FloorSheet({
  building,
  owner,
  mold,
  layout,
  fontSize = 13,
  rowPad = 4,
}: {
  building: Building
  owner?: Owner
  mold: Mold
  layout?: LayoutState
  fontSize?: number
  rowPad?: number
}) {
  const bill = mold.bill
  if (!bill) return null
  const t = billTotals(bill)
  const u = bill.unit
  const cols = applySplit(bill.sections, layout)
  const colFr = cols.map(() => '1fr').join(' ')
  return (
    <section className="bill-sheet space-y-3" style={{ fontSize }}>
      <h2 className="bill-title text-center text-sm font-bold uppercase tracking-[0.2em]">
        Centering Work Bill — {mold.floorName}
      </h2>
      <SheetInfo building={building} owner={owner} mold={mold} />
      <div className="bill-meas-cols items-start gap-x-4" style={{ display: 'grid', gridTemplateColumns: colFr }}>
        {cols.map((colSecs, ci) => (
          <div key={ci}>{colSecs.map((s) => <SectionTable key={s.id} s={s} u={u} rowPad={rowPad} />)}</div>
        ))}
      </div>

      <div className="border-t-2 border-foreground" />
      <div className="mx-auto max-w-[430px] rounded-md border-[1.5px] border-foreground px-3 py-1.5 text-[13.5px]">
        {bill.sections.map((s) => (
          <Row key={s.id} label={s.name} value={`= ${areaDisplay(sectionTotal(s), u)}`} />
        ))}
        <div className="mt-1 border-t border-muted-foreground pt-1">
          <Row label={<b>Total area</b>} value={<b>{areaDisplay(t.sqft, u)} sqft{u === 'ftin' ? ` (${t.sqft})` : ''}</b>} />
        </div>
      </div>

      <div className="border-t-2 border-foreground pt-1 text-[13.5px]">
        <Row label={`Area amount — ${t.sqft} sqft × ${money(bill.rate)}`} value={money(t.areaAmount, true)} />
        {bill.extras
          .filter((x) => x.name && extraAmount(x) > 0)
          .map((x, i) => (
            <Row key={i} label={`${x.name} — ${x.qty || 0} × ${money(Number(x.rate) || 0)}`} value={money(extraAmount(x), true)} />
          ))}
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t-4 border-double border-foreground px-1.5 pt-2.5 text-lg font-extrabold text-primary">
          <span>TOTAL</span>
          <span className="tabular whitespace-nowrap">{money(t.total, true)}</span>
        </div>
        {t.advance > 0 && (
          <>
            <Row label="Less: advance received" value={`− ${money(t.advance, true)}`} className="text-destructive" />
            <div className="flex items-baseline justify-between gap-3 px-1.5 py-1 text-base font-bold text-success">
              <span>BALANCE DUE</span>
              <span className="tabular whitespace-nowrap">{money(t.balance, true)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Row({ label, value, className = '' }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-1.5 py-1 ${className}`}>
      <span className="min-w-0">{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}

/** Company head shown on screen; in print it repeats per page via the
 * .bill-print-table thead (see index.css). */
function CompanyHead({ meta }: { meta: string }) {
  return (
    <div className="bill-cohead border-b-4 border-double border-primary pb-2 text-center">
      <p className="font-serif text-xl font-extrabold tracking-wide text-primary sm:text-2xl">{COMPANY}</p>
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-warning">{COMPANY_SUB}</p>
        <p className="right-0 top-0 text-right text-[11px] font-semibold sm:absolute">{CONTACT}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>
    </div>
  )
}

function SignatureFoot() {
  return (
    <div className="bill-foot border-t border-border pt-2 text-[12px]">
      <div className="flex justify-between">
        <div className="text-center">
          <div className="mx-auto mb-1 mt-8 w-40 border-t border-foreground" />
          Owner signature
        </div>
        <div className="text-center">
          <div className="mx-auto mb-1 mt-8 w-40 border-t border-foreground" />
          For {COMPANY}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] italic text-muted-foreground">Thank you for your business!</p>
    </div>
  )
}

/** Wrap sheet content in a table so the company head (thead) and signature
 * foot (tfoot) repeat on every printed page. */
function PrintWrap({ meta, children }: { meta: string; children: React.ReactNode }) {
  return (
    <table className="bill-print-table w-full border-collapse">
      <thead>
        <tr>
          <td>
            <CompanyHead meta={meta} />
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td>
            <SignatureFoot />
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="pt-3">{children}</td>
        </tr>
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/* Native print — build jspdf sheets and hand off to the share sheet   */
/* ------------------------------------------------------------------ */

function sheetInfoPairs(building: Building, owner: Owner | undefined, name: string, mold?: Mold): [string, string][] {
  const info: [string, string][] = [
    ['Owner', owner?.name ?? '—'],
    ['Location', building.location ?? '—'],
    ['Building', name],
    ['Period', `${formatDate(building.startDate)} → ${formatDate(building.endDate)}`],
  ]
  if (mold) {
    info.push(['Floor', mold.floorName])
    info.push(['Floor period', `${formatDate(mold.startDate)} → ${formatDate(mold.removedDate ?? mold.completedDate)}`])
  }
  info.push(['Bill date', formatDate(todayISO())])
  return info
}

function floorPdfSheet(building: Building, owner: Owner | undefined, name: string, mold: Mold): BillPdfSheet {
  const bill = mold.bill!
  const t = billTotals(bill)
  const u = bill.unit
  const [left, right] = applySplit(bill.sections)
  const toPdfSection = (s: BillSection) => ({
    name: s.name,
    rows: s.rows
      .filter((r) => r.l !== '' || r.h !== '' || r.no !== '')
      .map((r) => [dimDisplay(r.l, u), 'X', dimDisplay(r.h, u), 'X', String(r.no || 0), 'no', areaDisplay(rowTotal(r), u)]),
    total: areaDisplay(sectionTotal(s), u),
  })
  const summary: BillPdfSheet['summary'] = [
    { label: `Area amount — ${t.sqft} sqft × ${money(bill.rate)}`, value: money(t.areaAmount, true) },
    ...bill.extras
      .filter((x) => x.name && extraAmount(x) > 0)
      .map((x) => ({ label: `${x.name} — ${x.qty || 0} × ${money(Number(x.rate) || 0)}`, value: money(extraAmount(x), true) })),
    { label: 'TOTAL', value: money(t.total, true), strong: true, tone: 'primary' as const },
  ]
  if (t.advance > 0) {
    summary.push({ label: 'Less: advance received', value: `− ${money(t.advance, true)}`, tone: 'danger' })
    summary.push({ label: 'BALANCE DUE', value: money(t.balance, true), strong: true, tone: 'success' })
  }
  return {
    title: `Centering Work Bill — ${mold.floorName}`,
    info: sheetInfoPairs(building, owner, name, mold),
    measureCols: { left: left.map(toPdfSection), right: right.map(toPdfSection) },
    recap: {
      lines: bill.sections.map((s) => [s.name, areaDisplay(sectionTotal(s), u)] as [string, string]),
      total: ['Total area', `${areaDisplay(t.sqft, u)} sqft${u === 'ftin' ? ` (${t.sqft})` : ''}`],
    },
    summary,
  }
}

function consolidatedPdfSheet(building: Building, owner: Owner | undefined, name: string, billed: Mold[]): BillPdfSheet {
  const totals = billed.map((m) => billTotals(m.bill!))
  const grand = totals.reduce((s, t) => s + t.total, 0)
  const grandAdvance = totals.reduce((s, t) => s + t.advance, 0)
  const rows = billed.map((m) => {
    const t = billTotals(m.bill!)
    return [
      m.floorName,
      areaDisplay(t.sqft, m.bill!.unit),
      money(t.areaAmount + t.extrasAmount, true),
      t.advance > 0 ? money(t.advance, true) : '—',
      money(t.total, true),
    ]
  })
  const summary: BillPdfSheet['summary'] = [{ label: 'GRAND TOTAL (building)', value: money(grand, true), strong: true, tone: 'primary' as const }]
  if (grandAdvance > 0) {
    summary.push({ label: 'Less: total advance received', value: `− ${money(grandAdvance, true)}`, tone: 'danger' })
    summary.push({ label: 'NET BALANCE DUE', value: money(grand - grandAdvance, true), strong: true, tone: 'success' })
  }
  return {
    title: 'Consolidated Bill — Full Building',
    info: sheetInfoPairs(building, owner, name),
    table: { head: ['Floor', 'Area (sqft)', 'Amount', 'Advance', 'Total'], rows },
    summary,
  }
}

/** Web: window.print(). Native: render a portrait PDF and open the Android
 * share/print sheet (the WebView can't open the system print dialog). */
async function printBill(fileTitle: string, sheets: BillPdfSheet[]) {
  if (!isNative()) {
    // The browser uses document.title as the default “Save as PDF” file name.
    const prev = document.title
    document.title = fileTitle
    window.print()
    document.title = prev
    return
  }
  try {
    const { shareBillPdf } = await import('@/lib/billPdf')
    await shareBillPdf({ fileTitle, sheets })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not create the bill PDF')
  }
}

/* ------------------------------------------------------------------ */
/* Floor bill view — /molds/:id/bill/view                              */
/* ------------------------------------------------------------------ */

export function MoldBillView() {
  usePortraitPrint()
  const { id } = useParams()
  const mold = useMold(id)
  const building = useBuilding(mold?.buildingId)
  const owner = useOwner(building?.ownerId)

  const [layout, setLayout] = React.useState<LayoutState | null>(null)
  const [fontSize, setFontSize] = React.useState(13)
  const [rowPad, setRowPad] = React.useState(4)

  // Init layout once bill sections are available
  React.useEffect(() => {
    if (mold?.bill && layout === null) {
      setLayout(defaultLayout(mold.bill.sections))
    }
  }, [mold?.bill, layout])

  if (!mold || !building) return <PageHeader title="Bill" back />

  const name = buildingName(building, byId(owner ? [owner] : []))
  const activeSections = mold.bill?.sections ?? []
  return (
    <>
      <PageHeader
        title={`Bill — ${mold.floorName}`}
        subtitle={name}
        back
        actions={
          <>
            <Button asChild variant="ghost" size="icon" aria-label="Edit bill">
              <Link to={`/molds/${mold.id}/bill`}>
                <Pencil className="size-5" />
              </Link>
            </Button>
            {mold.bill && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  void printBill(
                    `${name} · ${mold.floorName} · Centering Work Bill · ${formatDate(todayISO())}`,
                    [floorPdfSheet(building, owner, name, mold)],
                  )
                }
                aria-label="Print"
              >
                <Printer className="size-5" />
              </Button>
            )}
          </>
        }
      />
      <div className="bill-print-area mx-auto max-w-3xl space-y-4 p-4">
        {mold.billPdfLink && (
          <Button asChild variant="outline" className="w-full print-hide">
            <a href={mold.billPdfLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              Open bill PDF (external link)
            </a>
          </Button>
        )}
        {!mold.bill ? (
          <EmptyState
            icon={FileText}
            title="No measurement bill yet"
            description="Create the bill to see it here — or use the external PDF link above."
            action={
              <Button asChild size="sm">
                <Link to={`/molds/${mold.id}/bill`}>Create bill</Link>
              </Button>
            }
          />
        ) : (
          <>
            <PrintControls
              sections={activeSections}
              layout={layout ?? defaultLayout(activeSections)}
              onLayout={setLayout}
              fontSize={fontSize}
              onFontSize={setFontSize}
              rowPad={rowPad}
              onRowPad={setRowPad}
            />
            <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
              <PrintWrap meta={`${name} · ${mold.floorName} · ${formatDate(todayISO())}`}>
                <FloorSheet
                  building={building}
                  owner={owner}
                  mold={mold}
                  layout={layout ?? undefined}
                  fontSize={fontSize}
                  rowPad={rowPad}
                />
              </PrintWrap>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Consolidated building bill — /buildings/:id/bill                    */
/* ------------------------------------------------------------------ */

export function BuildingBillView() {
  usePortraitPrint()
  const { id } = useParams()
  const building = useBuilding(id)
  const molds = useMolds(id)
  const owner = useOwner(building?.ownerId)
  const txns = useTransactionsForBuilding(id)
  void txns

  // Layout state — per-floor maps keyed by mold id
  const [layouts, setLayouts] = React.useState<Record<string, LayoutState>>({})
  const [fontSize, setFontSize] = React.useState(13)
  const [rowPad, setRowPad] = React.useState(4)

  const billed = molds.filter((m) => m.bill)

  // Init each floor's layout once
  React.useEffect(() => {
    setLayouts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const m of billed) {
        if (!next[m.id] && m.bill) {
          next[m.id] = defaultLayout(m.bill.sections)
          changed = true
        }
      }
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billed.length])

  if (!building) return <PageHeader title="Consolidated bill" back />

  const name = buildingName(building, byId(owner ? [owner] : []))
  const totals = billed.map((m) => billTotals(m.bill!))
  const grand = totals.reduce((s, t) => s + t.total, 0)
  const grandAdvance = totals.reduce((s, t) => s + t.advance, 0)

  // Flat list of all sections across all floors for the layout designer
  const allSections = billed.flatMap((m) => m.bill!.sections)
  // For the consolidated view, show a single combined layout designer using the first floor's layout
  // but apply per-floor when rendering each floor sheet
  const sharedLayout: LayoutState = layouts[billed[0]?.id] ?? defaultLayout(allSections)

  function handleLayout(newLayout: LayoutState) {
    // Apply the same column structure to all floors, matching by section name
    setLayouts((prev) => {
      const next = { ...prev }
      for (const m of billed) {
        const secs = m.bill!.sections
        // Map column structure: match section ids by position in each column using name lookup
        const floorCols = newLayout.cols.map((col) =>
          col.map((sid) => {
            // Find this section in this floor by same id (if cross-floor designer, fallback to name match)
            const direct = secs.find((s) => s.id === sid)
            return direct?.id
          }).filter(Boolean) as string[]
        )
        next[m.id] = { cols: floorCols }
      }
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="Consolidated bill"
        subtitle={name}
        back
        actions={
          billed.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                void printBill(`${name} · Consolidated Bill · ${formatDate(todayISO())}`, [
                  consolidatedPdfSheet(building, owner, name, billed),
                  ...billed.map((m) => floorPdfSheet(building, owner, name, m)),
                ])
              }
              aria-label="Print"
            >
              <Printer className="size-5" />
            </Button>
          )
        }
      />
      <div className="bill-print-area mx-auto max-w-3xl space-y-4 p-4">
        {billed.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No floor bills yet"
            description="Create a measurement bill on a floor first — it will roll up here."
          />
        ) : (
          <>
            <PrintControls
              sections={allSections}
              layout={sharedLayout}
              onLayout={handleLayout}
              fontSize={fontSize}
              onFontSize={setFontSize}
              rowPad={rowPad}
              onRowPad={setRowPad}
            />
            <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
              <PrintWrap meta={`${name} · Consolidated bill · ${formatDate(todayISO())}`}>
                <section className="space-y-3">
                  <h2 className="text-center text-sm font-bold uppercase tracking-[0.2em]">
                    Consolidated Bill — Full Building
                  </h2>
                  <SheetInfo building={building} owner={owner} />
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="[&>th]:border [&>th]:border-border [&>th]:bg-muted/50 [&>th]:px-2 [&>th]:py-1 [&>th]:text-[11px] [&>th]:uppercase">
                        <th className="text-left">Floor</th>
                        <th>Area (sqft)</th>
                        <th>Amount</th>
                        <th>Advance</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr>td]:border [&>tr>td]:border-border [&>tr>td]:px-2 [&>tr>td]:py-1 [&>tr>td]:text-center">
                      {billed.map((m) => {
                        const t = billTotals(m.bill!)
                        return (
                          <tr key={m.id}>
                            <td className="!text-left font-medium">{m.floorName}</td>
                            <td className="tabular">{areaDisplay(t.sqft, m.bill!.unit)}</td>
                            <td className="tabular">{money(t.areaAmount + t.extrasAmount, true)}</td>
                            <td className="tabular">{t.advance > 0 ? money(t.advance, true) : '—'}</td>
                            <td className="tabular font-semibold">{money(t.total, true)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="border-t-2 border-foreground pt-1">
                    <div className="mt-1 flex items-baseline justify-between gap-3 border-t-4 border-double border-foreground px-1.5 pt-2.5 text-lg font-extrabold text-primary">
                      <span>GRAND TOTAL (building)</span>
                      <span className="tabular whitespace-nowrap">{money(grand, true)}</span>
                    </div>
                    {grandAdvance > 0 && (
                      <>
                        <Row label="Less: total advance received" value={`− ${money(grandAdvance, true)}`} className="text-destructive" />
                        <div className="flex items-baseline justify-between gap-3 px-1.5 py-1 text-base font-bold text-success">
                          <span>NET BALANCE DUE</span>
                          <span className="tabular whitespace-nowrap">{money(grand - grandAdvance, true)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Per-floor detail sheets */}
                  {billed.map((m) => (
                    <div key={m.id} className="bill-page-break border-t border-dashed border-border pt-4">
                      <FloorSheet
                        building={building}
                        owner={owner}
                        mold={m}
                        layout={layouts[m.id]}
                        fontSize={fontSize}
                        rowPad={rowPad}
                      />
                    </div>
                  ))}
                </section>
              </PrintWrap>
            </div>
          </>
        )}
      </div>
    </>
  )
}
