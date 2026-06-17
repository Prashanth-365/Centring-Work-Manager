import { describe, expect, it } from 'vitest'
import {
  deriveBuildingStatus,
  deriveMoldPaymentStatus,
  deriveMoldWorkStatus,
  shouldAutoClose,
} from './status'
import type { Building, Mold } from '../types'

const TODAY = '2026-06-17'

function building(p: Partial<Building>): Building {
  return { id: 'b1', status: 'Yet to Start', createdAt: 0, updatedAt: 0, ...p }
}

describe('deriveBuildingStatus (§4 — date → status)', () => {
  it('no dates → Yet to Start', () => {
    expect(deriveBuildingStatus(building({}), TODAY)).toBe('Yet to Start')
  })
  it('future start → Yet to Start', () => {
    expect(deriveBuildingStatus(building({ startDate: '2026-12-01' }), TODAY)).toBe('Yet to Start')
  })
  it('started, no end → In Progress', () => {
    expect(deriveBuildingStatus(building({ startDate: '2026-01-01' }), TODAY)).toBe('In Progress')
  })
  it('end date passed → Completed', () => {
    expect(deriveBuildingStatus(building({ startDate: '2026-01-01', endDate: '2026-05-01' }), TODAY)).toBe(
      'Completed',
    )
  })
  it('On Hold / Closed are manual — derivation returns null', () => {
    expect(deriveBuildingStatus(building({ status: 'On Hold', startDate: '2026-01-01' }), TODAY)).toBeNull()
    expect(deriveBuildingStatus(building({ status: 'Closed', endDate: '2026-05-01' }), TODAY)).toBeNull()
  })
})

describe('deriveMoldWorkStatus', () => {
  it('mirrors the building date logic on the mold dates', () => {
    expect(deriveMoldWorkStatus({} as Mold, TODAY)).toBe('Not Started')
    expect(deriveMoldWorkStatus({ startDate: '2026-01-01' } as Mold, TODAY)).toBe('In Progress')
    expect(deriveMoldWorkStatus({ startDate: '2026-01-01', endDate: '2026-05-01' } as Mold, TODAY)).toBe(
      'Done/Removed',
    )
  })
})

describe('deriveMoldPaymentStatus (bill + received)', () => {
  it('no bill → Not Billed', () => {
    expect(deriveMoldPaymentStatus({} as Mold, 0)).toBe('Not Billed')
  })
  it('billed, nothing received → Billed', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 } as Mold, 0)).toBe('Billed')
  })
  it('partial → Partly Paid', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 } as Mold, 400)).toBe('Partly Paid')
  })
  it('received ≥ bill → Paid', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 } as Mold, 1000)).toBe('Paid')
    expect(deriveMoldPaymentStatus({ billAmount: 1000 } as Mold, 1200)).toBe('Paid')
  })
})

describe('shouldAutoClose', () => {
  const paid = { paymentStatus: 'Paid' } as Mold
  const billed = { paymentStatus: 'Billed' } as Mold
  it('Completed + all molds Paid → close', () => {
    expect(shouldAutoClose('Completed', [paid, paid])).toBe(true)
  })
  it('does not close with an unpaid mold', () => {
    expect(shouldAutoClose('Completed', [paid, billed])).toBe(false)
  })
  it('does not close when not Completed, or with no molds', () => {
    expect(shouldAutoClose('In Progress', [paid])).toBe(false)
    expect(shouldAutoClose('Completed', [])).toBe(false)
  })
})
