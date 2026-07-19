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
    <div className="bill-info grid grid-cols-1 gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
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
function SectionTable({ s, u }: { s: BillSection; u: MoldBill['unit'] }) {
  const rows = s.rows.filter((r) => r.l !== '' || r.h !== '' || r.no !== '')
  return (
    <table className="mb-2.5 w-full border-collapse text-[13px] [&_td]:border-b [&_td]:border-border [&_td]:px-1 [&_td]:py-1 [&_td]:text-center">
      <tbody>
        <tr>
          <td colSpan={7} className="!text-left font-semibold text-primary">{s.name}</td>
        </tr>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{dimDisplay(r.l, u)}</td>
            <td className="w-5 text-[11px] text-muted-foreground">X</td>
            <td>{dimDisplay(r.h, u)}</td>
            <td className="w-5 text-[11px] text-muted-foreground">X</td>
            <td>{r.no || 0}</td>
            <td className="w-6 text-[11px] text-muted-foreground">no</td>
            <td className="tabular font-semibold">{areaDisplay(rowTotal(r), u)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td colSpan={3} className="!text-right">Total</td>
          <td className="w-5 text-[11px] text-muted-foreground">=</td>
          <td colSpan={3}>{areaDisplay(sectionTotal(s), u)}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** Column rule from the old paper bills: Roof Slab always tops the RIGHT
 * column, Roof / Roof beam right below it; everything else fills the LEFT
 * column in order. Leftovers keep their order after the roof group. */
function splitSections(sections: BillSection[]): { left: BillSection[]; right: BillSection[] } {
  const isSlab = (s: BillSection) => /roof\s*slab/i.test(s.name)
  const isRoof = (s: BillSection) => !isSlab(s) && /roof/i.test(s.name)
  const right = [...sections.filter(isSlab), ...sections.filter(isRoof)]
  const left = sections.filter((s) => !isSlab(s) && !isRoof(s))
  return { left, right }
}

/** One floor's measurement sheet (used standalone and inside the consolidated view). */
function FloorSheet({ building, owner, mold }: { building: Building; owner?: Owner; mold: Mold }) {
  const bill = mold.bill
  if (!bill) return null
  const t = billTotals(bill)
  const u = bill.unit
  const { left, right } = splitSections(bill.sections)
  return (
    <section className="bill-sheet space-y-3">
      <h2 className="bill-title text-center text-sm font-bold uppercase tracking-[0.2em]">
        Centering Work Bill — {mold.floorName}
      </h2>
      <SheetInfo building={building} owner={owner} mold={mold} />
      <div className="bill-meas-cols grid grid-cols-2 items-start gap-x-4">
        <div>{left.map((s) => <SectionTable key={s.id} s={s} u={u} />)}</div>
        <div>{right.map((s) => <SectionTable key={s.id} s={s} u={u} />)}</div>
      </div>

      <div className="mx-auto max-w-[430px] rounded-md border-[1.5px] border-foreground px-3 py-1.5 text-[13.5px]">
        {bill.sections.map((s) => (
          <Row key={s.id} label={s.name} value={`= ${areaDisplay(sectionTotal(s), u)}`} />
        ))}
        <div className="mt-1 border-t border-muted-foreground pt-1.5">
          <Row label={<b>Total area</b>} value={<b>{areaDisplay(t.sqft, u)} sqft{u === 'ftin' ? ` (${t.sqft})` : ''}</b>} />
        </div>
      </div>

      <div className="space-y-1 border-t-2 border-foreground pt-2 text-[13.5px]">
        <Row label={`Area amount — ${t.sqft} sqft × ${money(bill.rate)}`} value={money(t.areaAmount, true)} />
        {bill.extras
          .filter((x) => x.name && extraAmount(x) > 0)
          .map((x, i) => (
            <Row key={i} label={`${x.name} — ${x.qty || 0} × ${money(Number(x.rate) || 0)}`} value={money(extraAmount(x), true)} />
          ))}
        <div className="flex items-baseline justify-between gap-3 border-t-4 border-double border-foreground pt-1.5 text-base font-extrabold text-primary">
          <span>TOTAL</span>
          <span className="tabular whitespace-nowrap">{money(t.total, true)}</span>
        </div>
        {t.advance > 0 && (
          <>
            <Row label="Less: advance received" value={`− ${money(t.advance, true)}`} className="text-destructive" />
            <div className="flex items-baseline justify-between gap-3 font-bold text-success">
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
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
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
  const { left, right } = splitSections(bill.sections)
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
          <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
            <PrintWrap meta={`${name} · ${mold.floorName} · ${formatDate(todayISO())}`}>
              <FloorSheet building={building} owner={owner} mold={mold} />
            </PrintWrap>
          </div>
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

  if (!building) return <PageHeader title="Consolidated bill" back />

  const name = buildingName(building, byId(owner ? [owner] : []))
  const billed = molds.filter((m) => m.bill)
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
                <div className="space-y-1 border-t-2 border-foreground pt-2">
                  <div className="flex items-baseline justify-between gap-3 text-base font-extrabold text-primary">
                    <span>GRAND TOTAL (building)</span>
                    <span className="tabular whitespace-nowrap">{money(grand, true)}</span>
                  </div>
                  {grandAdvance > 0 && (
                    <>
                      <Row label="Less: total advance received" value={`− ${money(grandAdvance, true)}`} className="text-destructive" />
                      <div className="flex items-baseline justify-between gap-3 font-bold text-success">
                        <span>NET BALANCE DUE</span>
                        <span className="tabular whitespace-nowrap">{money(grand - grandAdvance, true)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Per-floor detail sheets, each starting a new printed page */}
                {billed.map((m) => (
                  <div key={m.id} className="bill-page-break border-t border-dashed border-border pt-4">
                    <FloorSheet building={building} owner={owner} mold={m} />
                  </div>
                ))}
              </section>
            </PrintWrap>
          </div>
        )}
      </div>
    </>
  )
}
