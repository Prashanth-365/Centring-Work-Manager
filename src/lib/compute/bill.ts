// Measurement-bill math (pure, unit-testable — no React/Dexie).
//
// Rules (owner-confirmed):
// - Dimensions are stored as DECIMAL FEET. In ft-in entry mode "2.11" means
//   2' 11" (digits after the dot are inches, max 11) — parsed by parseDim().
// - Only TOTALS are rounded, never the raw entries: every row total
//   (L × H × No) rounds UP to the nearest quarter (0.25 sqft = 3").
// - Section totals / bill area are sums of already-rounded row totals.
// - amount = area × rate + Σ extras(qty × rate); balance = amount − advance.
import type { BillExtra, BillRow, BillSection, BillUnit, MoldBill } from '../types'

/** Round UP to the nearest quarter (0.25 / 0.5 / 0.75 / 1 ⇔ 3" / 6" / 9" / 1'). */
export function quarterUp(v: number): number {
  return Math.ceil((Number(v) || 0) * 4 - 1e-9) / 4 + 0 // +0 normalizes -0
}

/** Parse a dimension entry into decimal feet.
 *  'dec':  "2.25" → 2.25.  'ftin': "2.11" → 2 + 11/12 (dot separates ft.in). */
export function parseDim(raw: string, unit: BillUnit): number | '' {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (unit !== 'ftin') {
    const n = Number(s)
    return Number.isFinite(n) ? n : ''
  }
  const neg = s.startsWith('-')
  const [fp, ip] = s.replace('-', '').split('.')
  const ft = parseInt(fp || '0', 10) || 0
  let inch = parseInt((ip || '0').slice(0, 2), 10) || 0
  if (inch > 11) inch = 11
  const d = ft + inch / 12
  return neg ? -d : d
}

/** The editable text for a stored decimal-feet value ("2.11" in ftin mode). */
export function dimEntry(dec: number | '', unit: BillUnit): string {
  if (dec === '' || dec == null) return ''
  const v = Number(dec) || 0
  if (unit !== 'ftin') return trimNum(v)
  let ft = Math.floor(v)
  let inch = Math.round((v - ft) * 12)
  if (inch === 12) {
    ft++
    inch = 0
  }
  return inch ? `${ft}.${inch}` : String(ft)
}

/** Pretty display — 2' 11" in ftin mode, plain number otherwise. */
export function dimDisplay(dec: number | '', unit: BillUnit): string {
  if (dec === '' || dec == null) return ''
  const v = Number(dec) || 0
  if (unit !== 'ftin') return trimNum(v)
  let ft = Math.floor(v)
  let inch = Math.round((v - ft) * 12)
  if (inch === 12) {
    ft++
    inch = 0
  }
  return inch ? `${ft}' ${inch}"` : `${ft}'`
}

/** Area totals (already quarter multiples) — 1245' 3" style in ftin mode. */
export function areaDisplay(v: number, unit: BillUnit): string {
  const n = Number(v) || 0
  if (unit !== 'ftin') return trimNum(n)
  const ft = Math.floor(n)
  const q = Math.round((n - ft) * 12)
  return q ? `${ft}' ${q}"` : `${ft}'`
}

function trimNum(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0$/, '')
}

/** Row total: L × H × No, rounded UP to the quarter. */
export function rowTotal(r: BillRow): number {
  return quarterUp((Number(r.l) || 0) * (Number(r.h) || 0) * (Number(r.no) || 0))
}

export function sectionTotal(s: BillSection): number {
  return s.rows.reduce((a, r) => a + rowTotal(r), 0)
}

export function extraAmount(e: BillExtra): number {
  return (Number(e.qty) || 0) * (Number(e.rate) || 0)
}

export interface BillTotals {
  sqft: number
  areaAmount: number
  extrasAmount: number
  total: number
  advance: number
  balance: number
}

export function billTotals(bill: MoldBill): BillTotals {
  const sqft = bill.sections.reduce((a, s) => a + sectionTotal(s), 0)
  const areaAmount = sqft * (Number(bill.rate) || 0)
  const extrasAmount = bill.extras.reduce((a, e) => a + extraAmount(e), 0)
  const total = areaAmount + extrasAmount
  const advance = Number(bill.advance) || 0
  return { sqft, areaAmount, extrasAmount, total, advance, balance: total - advance }
}

export const EMPTY_ROW: BillRow = { l: '', h: '', no: '' }

/** Default section names offered in the add-section combobox. */
export const BILL_SECTION_SUGGESTIONS = [
  'Plinth',
  'Sump',
  'Lift',
  'Sajja Nintel',
  'Roof Slab',
  'Roof',
  'Beam',
  'Staircase',
  'Chajja',
  'Portico',
]

/** A fresh bill: default extras Steps ₹400 / Column Gabdi ₹300 per piece. */
export function newMoldBill(opts: { rate?: number; advance?: number } = {}): MoldBill {
  return {
    rate: opts.rate ?? 30,
    unit: 'dec',
    sections: [],
    extras: [
      { name: 'Steps', qty: '', rate: 400 },
      { name: 'Column Gabdi', qty: '', rate: 300 },
    ],
    advance: opts.advance ?? 0,
    updatedAt: Date.now(),
  }
}
