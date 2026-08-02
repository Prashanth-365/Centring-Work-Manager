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
/* Layout designer types                                               */
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

/* Persist layout + fontSize + rowPad in localStorage keyed per mold/building */
interface PrintPrefs { layout: LayoutState; fontSize: number; rowPad: number }

function loadPrefs(key: string): PrintPrefs | null {
  try {
    const raw = localStorage.getItem(`bill-layout-${key}`)
    return raw ? (JSON.parse(raw) as PrintPrefs) : null
  } catch { return null }
}

function savePrefs(key: string, prefs: PrintPrefs) {
  try { localStorage.setItem(`bill-layout-${key}`, JSON.stringify(prefs)) } catch { /* ignore */ }
}

function usePrintPrefs(key: string | undefined, sections: BillSection[]) {
  /** Validate a saved layout — if any saved ID no longer exists in sections,
   * return defaultLayout. New sections are appended to col 0. Never resets
   * a valid in-memory layout that the user just arranged. */
  function sanitize(saved: LayoutState, secs: BillSection[]): LayoutState {
    const ids = new Set(secs.map((s) => s.id))
    // Drop saved IDs that no longer exist.
    const cleanCols = saved.cols.map((c) => c.filter((id) => ids.has(id)))
    // Append any brand-new sections (not in any column) to col 0.
    const placed = new Set(cleanCols.flat())
    const newIds = secs.filter((s) => !placed.has(s.id)).map((s) => s.id)
    if (newIds.length) cleanCols[0] = [...(cleanCols[0] ?? []), ...newIds]
    return { cols: cleanCols }
  }

  const [layout, setLayoutRaw] = React.useState<LayoutState>(() => {
    if (!key) return defaultLayout(sections)
    const saved = loadPrefs(key)
    return saved ? sanitize(saved.layout, sections) : defaultLayout(sections)
  })
  const [fontSize, setFontSizeRaw] = React.useState<number>(() => key ? (loadPrefs(key)?.fontSize ?? 13) : 13)
  const [rowPad, setRowPadRaw] = React.useState<number>(() => key ? (loadPrefs(key)?.rowPad ?? 4) : 4)

  // When key changes (navigating between bills), load that bill's prefs.
  const prevKey = React.useRef(key)
  React.useEffect(() => {
    if (!key || key === prevKey.current) return
    prevKey.current = key
    const saved = loadPrefs(key)
    if (saved) {
      setLayoutRaw(sanitize(saved.layout, sections))
      setFontSizeRaw(saved.fontSize)
      setRowPadRaw(saved.rowPad)
    } else {
      setLayoutRaw(defaultLayout(sections))
      setFontSizeRaw(13)
      setRowPadRaw(4)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Save immediately on every change — use the new values directly (not stale closure).
  function setLayout(l: LayoutState) {
    setLayoutRaw(l)
    if (key) savePrefs(key, { layout: l, fontSize, rowPad })
  }
  function setFontSize(v: number) {
    setFontSizeRaw(v)
    if (key) savePrefs(key, { layout, fontSize: v, rowPad })
  }
  function setRowPad(v: number) {
    setRowPadRaw(v)
    if (key) savePrefs(key, { layout, fontSize, rowPad: v })
  }

  return { layout, setLayout, fontSize, setFontSize, rowPad, setRowPad }
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

/** Compact bill header: bill date left, contact right, title centred below. */
function BillHeader({
  title,
  billDate,
}: {
  title: string
  billDate?: string
}) {
  const date = billDate || todayISO()
  return (
    <div className="bill-header mb-3 border-b-2 border-foreground pb-2">
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>{formatDate(date)}</span>
        <span>{CONTACT}</span>
      </div>
      <h2 className="bill-title mt-1 text-center text-sm font-bold uppercase tracking-[0.15em]">
        {title}
      </h2>
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
  const bName = buildingName(building, byId(owner ? [owner] : []))
  const title = `${bName} — ${mold.floorName}`
  return (
    <section className="bill-sheet space-y-3" style={{ fontSize }}>
      <BillHeader title={title} billDate={bill.billDate} />
      <div className="bill-meas-cols items-start gap-x-4 overflow-hidden" style={{ display: 'grid', gridTemplateColumns: colFr }}>
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

/** Zoom + one-finger drag-to-pan (mirrors the Weekly maximize pattern). */
function useBillZoomPan() {
  const [zoom, setZoom] = React.useState(1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<{ id: number; startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const pinchRef = React.useRef<{ dist: number; zoom: number } | null>(null)

  function clampZoom(v: number) { return Math.min(3, Math.max(0.5, v)) }

  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom((z) => clampZoom(z - e.deltaY * 0.005))
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') return // handled by onTouchStart/onTouchMove
    const el = containerRef.current
    if (!el) return
    dragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
    el.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = containerRef.current
    if (!drag || !el || drag.id !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      el.scrollLeft = drag.scrollX - dx
      el.scrollTop = drag.scrollY - dy
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null
  }

  // Two-finger pinch zoom via Touch Events (non-passive so we can preventDefault).
  // Attached imperatively in useEffect so we can pass { passive: false }.
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function getTouchDist(touches: TouchList) {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.hypot(dx, dy)
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchRef.current = { dist: getTouchDist(e.touches), zoom: 0 }
        // Read current zoom from state — use a ref-based snapshot
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const newDist = getTouchDist(e.touches)
        const scale = newDist / pinchRef.current.dist
        setZoom((z) => {
          const next = clampZoom(z * scale)
          pinchRef.current!.dist = newDist
          return next
        })
      }
    }

    function handleTouchEnd() {
      if (pinchRef.current) pinchRef.current = null
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  return { zoom, setZoom: (v: number) => setZoom(clampZoom(v)), containerRef, onWheel, onPointerDown, onPointerMove, onPointerUp }
}


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

function floorPdfSheet(building: Building, owner: Owner | undefined, name: string, mold: Mold, layout?: LayoutState, fontSize = 13, rowPad = 4): BillPdfSheet {
  const bill = mold.bill!
  const t = billTotals(bill)
  const u = bill.unit
  const cols = applySplit(bill.sections, layout)
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
    title: `${name} — ${mold.floorName}`,
    billDate: bill.billDate,
    measureCols: { cols: cols.map((colSecs) => colSecs.map(toPdfSection)) },
    recap: {
      lines: bill.sections.map((s) => [s.name, areaDisplay(sectionTotal(s), u)] as [string, string]),
      total: ['Total area', `${areaDisplay(t.sqft, u)} sqft${u === 'ftin' ? ` (${t.sqft})` : ''}`],
    },
    summary,
    fontSize,
    rowPad,
  }
}

function consolidatedPdfSheet(name: string, billed: Mold[], fontSize = 13, rowPad = 4): BillPdfSheet {
  const totals = billed.map((m) => billTotals(m.bill!))
  const grand = totals.reduce((s, t) => s + t.total, 0)
  const grandAdvance = totals.reduce((s, t) => s + t.advance, 0)
  const rows = billed.map((m, i) => {
    const t = totals[i]
    return [
      m.floorName,
      areaDisplay(t.sqft, m.bill!.unit),
      money(t.areaAmount, true),
      money(t.extrasAmount, true),
      t.advance > 0 ? money(t.advance, true) : '—',
      money(t.total, true),
    ]
  })
  const summary: BillPdfSheet['summary'] = [
    { label: `${name} — Grand Total`, value: money(grand, true), strong: true, tone: 'primary' as const },
  ]
  if (grandAdvance > 0) {
    summary.push({ label: 'Less: total advance received', value: `− ${money(grandAdvance, true)}`, tone: 'danger' })
    summary.push({ label: 'Net Balance Due', value: money(grand - grandAdvance, true), strong: true, tone: 'success' })
  }
  return {
    title: `${name} — Bill Summary`,
    table: { head: ['Floor', 'Area', 'Amount', 'Extras', 'Advance', 'Total'], rows },
    summary,
    fontSize,
    rowPad,
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

  const sections = mold?.bill?.sections ?? []
  const { layout, setLayout, fontSize, setFontSize, rowPad, setRowPad } = usePrintPrefs(id, sections)
  const zp = useBillZoomPan()

  if (!mold || !building) return <PageHeader title="Bill" back />

  const name = buildingName(building, byId(owner ? [owner] : []))
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
                      [floorPdfSheet(building, owner, name, mold, layout, fontSize, rowPad)],
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
              sections={sections}
              layout={layout}
              onLayout={setLayout}
              fontSize={fontSize}
              onFontSize={setFontSize}
              rowPad={rowPad}
              onRowPad={setRowPad}
            />
            {/* zoom controls */}
            <div className="mb-2 flex items-center gap-2 print:hidden">
              <Button variant="outline" size="icon" className="h-7 w-7 text-lg" onClick={() => zp.setZoom(zp.zoom - 0.1)}>−</Button>
              <span className="min-w-[3rem] text-center text-xs text-muted-foreground">{Math.round(zp.zoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-7 w-7 text-lg" onClick={() => zp.setZoom(zp.zoom + 0.1)}>+</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => zp.setZoom(1)}>Reset</Button>
            </div>
            <div
              ref={zp.containerRef}
              className="overflow-auto rounded-xl border border-border bg-muted/20 p-4 shadow-card print:overflow-visible print:p-0"
              onWheel={zp.onWheel}
              onPointerDown={zp.onPointerDown}
              onPointerMove={zp.onPointerMove}
              onPointerUp={zp.onPointerUp}
              style={{ cursor: 'grab' }}
            >
              <div style={{ transform: `scale(${zp.zoom})`, transformOrigin: 'top left', width: `${100 / zp.zoom}%` }}>
                <PrintWrap meta={`${name} · ${mold.floorName} · ${formatDate(todayISO())}`}>
                  <FloorSheet
                    building={building}
                    owner={owner}
                    mold={mold}
                    layout={layout}
                    fontSize={fontSize}
                    rowPad={rowPad}
                  />
                </PrintWrap>
              </div>
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

  const billed = molds.filter((m) => m.bill).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const allSections = billed.flatMap((m) => m.bill!.sections)

  // Shared prefs persisted under the building id (consolidated view)
  const { layout: sharedLayout, setLayout: setSharedLayout, fontSize, setFontSize, rowPad, setRowPad } =
    usePrintPrefs(id ? `building-${id}` : undefined, allSections)
  const zp = useBillZoomPan()

  // Per-floor layout — each floor loads/saves independently (keyed by mold id)
  const [floorLayouts, setFloorLayouts] = React.useState<Record<string, LayoutState>>({})
  React.useEffect(() => {
    setFloorLayouts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const m of billed) {
        if (!next[m.id] && m.bill) {
          next[m.id] = loadPrefs(m.id)?.layout ?? defaultLayout(m.bill.sections)
          changed = true
        }
      }
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billed.length])

  function handleFloorLayout(moldId: string, newLayout: LayoutState) {
    setFloorLayouts((prev) => ({ ...prev, [moldId]: newLayout }))
    const m = billed.find((b) => b.id === moldId)
    if (m) savePrefs(moldId, { layout: newLayout, fontSize, rowPad })
  }

  if (!building) return <PageHeader title="Consolidated bill" back />

  const name = buildingName(building, byId(owner ? [owner] : []))
  const totals = billed.map((m) => billTotals(m.bill!))
  const grand = totals.reduce((s, t) => s + t.total, 0)
  const grandAdvance = totals.reduce((s, t) => s + t.advance, 0)

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
                  ...billed.map((m) => floorPdfSheet(building, owner, name, m, floorLayouts[m.id], fontSize, rowPad)),
                  consolidatedPdfSheet(name, billed, fontSize, rowPad),
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
            {/* Font/row size controls only — no layout designer for consolidated */}
            <div className="print-hide space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Print settings</p>
              <div className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground">Font size: {fontSize}px</span>
                <input type="range" min={9} max={16} step={0.5} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="flex-1" />
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setFontSize(13)}>reset</button>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground">Row spacing: {rowPad}px</span>
                <input type="range" min={1} max={8} step={0.5} value={rowPad} onChange={(e) => setRowPad(Number(e.target.value))} className="flex-1" />
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setRowPad(4)}>reset</button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6" style={{ fontSize }}>
            {/* zoom controls */}
            <div className="mb-2 flex items-center gap-2 print:hidden">
              <Button variant="outline" size="icon" className="h-7 w-7 text-lg" onClick={() => zp.setZoom(zp.zoom - 0.1)}>−</Button>
              <span className="min-w-[3rem] text-center text-xs text-muted-foreground">{Math.round(zp.zoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-7 w-7 text-lg" onClick={() => zp.setZoom(zp.zoom + 0.1)}>+</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => zp.setZoom(1)}>Reset</Button>
            </div>
            <div
              ref={zp.containerRef}
              className="overflow-auto rounded-xl border border-border bg-muted/20 p-4 shadow-card print:overflow-visible print:p-0"
              onWheel={zp.onWheel}
              onPointerDown={zp.onPointerDown}
              onPointerMove={zp.onPointerMove}
              onPointerUp={zp.onPointerUp}
              style={{ cursor: 'grab' }}
            >
              <div style={{ transform: `scale(${zp.zoom})`, transformOrigin: 'top left', width: `${100 / zp.zoom}%`, fontSize }}>
              <PrintWrap meta={`${name} · Consolidated bill · ${formatDate(todayISO())}`}>
                <section className="space-y-3">
                  {/* Per-floor detail sheets first */}
                  {billed.map((m) => (
                    <div key={m.id} className="bill-page-break border-t border-dashed border-border pt-4 first:border-0 first:pt-0">
                      <div className="print-hide mb-2">
                        <PrintControls
                          sections={m.bill!.sections}
                          layout={floorLayouts[m.id] ?? defaultLayout(m.bill!.sections)}
                          onLayout={(l) => handleFloorLayout(m.id, l)}
                          fontSize={fontSize}
                          onFontSize={setFontSize}
                          rowPad={rowPad}
                          onRowPad={setRowPad}
                        />
                      </div>
                      <FloorSheet
                        building={building}
                        owner={owner}
                        mold={m}
                        layout={floorLayouts[m.id]}
                        fontSize={fontSize}
                        rowPad={rowPad}
                      />
                    </div>
                  ))}

                  {/* Summary table on last page */}
                  <div className="bill-page-break border-t-2 border-foreground pt-4">
                    <BillHeader title={`${name} — Bill Summary`} />
                    <table className="w-full border-collapse text-[13px]" style={{ fontSize }}>
                      <thead>
                        <tr className="[&>th]:border [&>th]:border-border [&>th]:bg-muted/50 [&>th]:px-2 [&>th]:py-1 [&>th]:text-[11px] [&>th]:uppercase">
                          <th className="text-left">Floor</th>
                          <th>Area</th>
                          <th>Amount</th>
                          <th>Extras</th>
                          <th>Advance</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr>td]:border [&>tr>td]:border-border [&>tr>td]:px-2 [&>tr>td]:py-1 [&>tr>td]:text-center">
                        {billed.map((m, i) => {
                          const t = totals[i]
                          return (
                            <tr key={m.id}>
                              <td className="!text-left font-medium">{m.floorName}</td>
                              <td className="tabular">{areaDisplay(t.sqft, m.bill!.unit)}</td>
                              <td className="tabular">{money(t.areaAmount, true)}</td>
                              <td className="tabular">{money(t.extrasAmount, true)}</td>
                              <td className="tabular">{t.advance > 0 ? money(t.advance, true) : '—'}</td>
                              <td className="tabular font-semibold">{money(t.total, true)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="mt-4 border-t-4 border-double border-foreground pt-3 text-[13.5px]">
                      <div className="flex items-baseline justify-between gap-3 px-1.5 py-2 text-lg font-extrabold text-primary">
                        <span>Grand Total</span>
                        <span className="tabular whitespace-nowrap">{money(grand, true)}</span>
                      </div>
                      {grandAdvance > 0 && (
                        <>
                          <div className="flex items-baseline justify-between gap-3 px-1.5 py-2 text-destructive">
                            <span>Less: Total Advance</span>
                            <span className="tabular whitespace-nowrap">− {money(grandAdvance, true)}</span>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-foreground px-1.5 py-2 text-base font-bold text-success">
                            <span>Net Balance Due</span>
                            <span className="tabular whitespace-nowrap">{money(grand - grandAdvance, true)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              </PrintWrap>
              </div>
            </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
