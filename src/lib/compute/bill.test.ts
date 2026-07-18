import { describe, expect, it } from 'vitest'
import {
  areaDisplay,
  billTotals,
  dimDisplay,
  dimEntry,
  newMoldBill,
  parseDim,
  quarterUp,
  rowTotal,
  sectionTotal,
} from './bill'
import type { BillSection } from '../types'

describe('quarterUp', () => {
  it('rounds up to the nearest quarter', () => {
    expect(quarterUp(11.31)).toBe(11.5)
    expect(quarterUp(2.01)).toBe(2.25)
    expect(quarterUp(2.25)).toBe(2.25) // exact quarter untouched
    expect(quarterUp(0)).toBe(0)
    expect(quarterUp(39.999999)).toBe(40)
  })
})

describe('parseDim', () => {
  it('decimal mode parses plain numbers', () => {
    expect(parseDim('2.25', 'dec')).toBe(2.25)
    expect(parseDim('', 'dec')).toBe('')
  })
  it('ftin mode reads dot as ft.in', () => {
    expect(parseDim('2.11', 'ftin')).toBeCloseTo(2 + 11 / 12)
    expect(parseDim('2.3', 'ftin')).toBeCloseTo(2.25)
    expect(parseDim('4', 'ftin')).toBe(4)
  })
  it('ftin caps inches at 11', () => {
    expect(parseDim('2.15', 'ftin')).toBeCloseTo(2 + 11 / 12) // "15" > 11 → capped at 11
  })
})

describe('dim entry/display round-trip', () => {
  it('dimEntry renders stored feet back to ft.in text', () => {
    expect(dimEntry(2 + 11 / 12, 'ftin')).toBe('2.11')
    expect(dimEntry(2.25, 'ftin')).toBe('2.3')
    expect(dimEntry(2.25, 'dec')).toBe('2.25')
  })
  it("dimDisplay pretty-prints 2' 11\"", () => {
    expect(dimDisplay(2 + 11 / 12, 'ftin')).toBe(`2' 11"`)
    expect(dimDisplay(3, 'ftin')).toBe(`3'`)
  })
  it('areaDisplay shows quarters as inches in ftin', () => {
    expect(areaDisplay(1245.25, 'ftin')).toBe(`1245' 3"`)
    expect(areaDisplay(40, 'dec')).toBe('40')
  })
})

describe('rowTotal / sectionTotal', () => {
  it('multiplies and rounds up per row', () => {
    expect(rowTotal({ l: 4, h: 5, no: 2 })).toBe(40)
    expect(rowTotal({ l: 1.25, h: 2, no: 2 })).toBe(5)
    // 4.583' × 2.917' × 2 = 26.74 → 26.75
    expect(rowTotal({ l: 4 + 7 / 12, h: 2 + 11 / 12, no: 2 })).toBe(26.75)
    expect(rowTotal({ l: '', h: 5, no: 2 })).toBe(0)
  })
  it('sums rounded rows', () => {
    const s: BillSection = {
      id: 's',
      name: 'Sajja Nintel',
      rows: [
        { l: 4, h: 5, no: 2 },
        { l: 1.25, h: 2, no: 2 },
      ],
    }
    expect(sectionTotal(s)).toBe(45)
  })
})

describe('billTotals', () => {
  it('computes area × rate + extras − advance', () => {
    const bill = newMoldBill({ rate: 30, advance: 10000 })
    bill.sections = [
      {
        id: 'a',
        name: 'Sajja Nintel',
        rows: [
          { l: 4, h: 5, no: 2 },
          { l: 1.25, h: 2, no: 2 },
        ],
      },
      { id: 'b', name: 'Roof Slab', rows: [{ l: 30, h: 40, no: 1 }] },
    ]
    bill.extras = [
      { name: 'Steps', qty: 21, rate: 400 },
      { name: 'Column Gabdi', qty: 21, rate: 300 },
    ]
    const t = billTotals(bill)
    expect(t.sqft).toBe(1245)
    expect(t.areaAmount).toBe(37350)
    expect(t.extrasAmount).toBe(8400 + 6300)
    expect(t.total).toBe(37350 + 14700)
    expect(t.balance).toBe(t.total - 10000)
  })
})
