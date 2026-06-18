import { describe, expect, it } from 'vitest'
import {
  buildingDatesForStatusChange,
  buildingRollupStatus,
  deriveBuildingDates,
  deriveMoldPaymentStatus,
  deriveMoldWorkStatus,
  moldDatesForStatusChange,
  moldStartFromAttendance,
  nextBuildingStatus,
  shouldAutoClose,
} from './status'
import type { Mold } from '../types'

const TODAY = '2026-06-17'

function mold(p: Partial<Mold>): Mold {
  return {
    id: 'm',
    buildingId: 'b',
    floorName: 'F',
    order: 1,
    workStatus: 'Not Started',
    paymentStatus: 'Not Billed',
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

describe('deriveMoldWorkStatus (date → 4-state work status)', () => {
  it('no dates → Not Started', () => {
    expect(deriveMoldWorkStatus({}, TODAY)).toBe('Not Started')
  })
  it('future startDate → Not Started', () => {
    expect(deriveMoldWorkStatus({ startDate: '2026-12-01' }, TODAY)).toBe('Not Started')
  })
  it('startDate ≤ today, no completedDate → In Progress', () => {
    expect(deriveMoldWorkStatus({ startDate: '2026-01-01' }, TODAY)).toBe('In Progress')
  })
  it('completedDate ≤ today, no removedDate → Completed', () => {
    expect(
      deriveMoldWorkStatus({ startDate: '2026-01-01', completedDate: '2026-05-01' }, TODAY),
    ).toBe('Completed')
  })
  it('removedDate ≤ today → Material Removed', () => {
    expect(
      deriveMoldWorkStatus(
        { startDate: '2026-01-01', completedDate: '2026-05-01', removedDate: '2026-06-01' },
        TODAY,
      ),
    ).toBe('Material Removed')
  })
  it('future completedDate is ignored (still In Progress)', () => {
    expect(
      deriveMoldWorkStatus({ startDate: '2026-01-01', completedDate: '2026-12-01' }, TODAY),
    ).toBe('In Progress')
  })
})

describe('moldDatesForStatusChange (status → date)', () => {
  it('In Progress sets startDate=today when empty', () => {
    expect(moldDatesForStatusChange('In Progress', {}, TODAY)).toEqual({ startDate: TODAY })
  })
  it('In Progress leaves an existing startDate', () => {
    expect(moldDatesForStatusChange('In Progress', { startDate: '2026-01-01' }, TODAY)).toEqual({})
  })
  it('Completed sets completedDate=today when empty', () => {
    expect(moldDatesForStatusChange('Completed', {}, TODAY)).toEqual({ completedDate: TODAY })
  })
  it('Material Removed sets removedDate=today when empty', () => {
    expect(moldDatesForStatusChange('Material Removed', {}, TODAY)).toEqual({ removedDate: TODAY })
  })
  it('Not Started clears all three dates', () => {
    expect(
      moldDatesForStatusChange(
        'Not Started',
        { startDate: '2026-01-01', completedDate: '2026-05-01', removedDate: '2026-06-01' },
        TODAY,
      ),
    ).toEqual({ startDate: undefined, completedDate: undefined, removedDate: undefined })
  })
})

describe('moldStartFromAttendance (attendance → auto-start date)', () => {
  it('no attendance → null', () => {
    expect(moldStartFromAttendance({}, [])).toBeNull()
  })
  it('startDate already set → null (never overrides)', () => {
    expect(moldStartFromAttendance({ startDate: '2026-01-01' }, ['2026-02-01'])).toBeNull()
  })
  it('returns the earliest attendance date when unset', () => {
    expect(moldStartFromAttendance({}, ['2026-03-10', '2026-02-15', '2026-04-01'])).toBe('2026-02-15')
  })
  it('ignores empty/undefined dates', () => {
    expect(moldStartFromAttendance({}, ['', '2026-05-02'])).toBe('2026-05-02')
  })
})

describe('deriveMoldPaymentStatus (bill + received)', () => {
  it('no bill → Not Billed', () => {
    expect(deriveMoldPaymentStatus({}, 0)).toBe('Not Billed')
  })
  it('billed, nothing received → Billed', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 }, 0)).toBe('Billed')
  })
  it('partial → Partly Paid', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 }, 400)).toBe('Partly Paid')
  })
  it('received ≥ bill → Paid', () => {
    expect(deriveMoldPaymentStatus({ billAmount: 1000 }, 1000)).toBe('Paid')
    expect(deriveMoldPaymentStatus({ billAmount: 1000 }, 1200)).toBe('Paid')
  })
})

describe('buildingRollupStatus (molds → derived building status)', () => {
  it('no molds → Yet to Start', () => {
    expect(buildingRollupStatus([], TODAY)).toBe('Yet to Start')
  })
  it('every mold Not Started → Yet to Start', () => {
    expect(buildingRollupStatus([{}, { startDate: '2026-12-01' }], TODAY)).toBe('Yet to Start')
  })
  it('any mold In Progress → In Progress', () => {
    expect(
      buildingRollupStatus(
        [{ startDate: '2026-01-01', completedDate: '2026-05-01' }, { startDate: '2026-02-01' }],
        TODAY,
      ),
    ).toBe('In Progress')
  })
  it('started but none active (Completed/Removed/Not Started) → On Hold', () => {
    expect(
      buildingRollupStatus(
        [
          { startDate: '2026-01-01', completedDate: '2026-05-01', removedDate: '2026-06-01' },
          { startDate: '2026-02-01', completedDate: '2026-05-10' },
          {},
        ],
        TODAY,
      ),
    ).toBe('On Hold')
  })
})

describe('nextBuildingStatus (recompute rules)', () => {
  it('Completed and Closed are terminal — no change', () => {
    expect(nextBuildingStatus('Completed', [{ startDate: '2026-01-01' }], TODAY)).toBeNull()
    expect(nextBuildingStatus('Closed', [{ startDate: '2026-01-01' }], TODAY)).toBeNull()
  })
  it('manual On Hold stays unless a mold is In Progress', () => {
    expect(
      nextBuildingStatus('On Hold', [{ startDate: '2026-01-01', completedDate: '2026-05-01' }], TODAY),
    ).toBeNull()
    expect(nextBuildingStatus('On Hold', [{ startDate: '2026-01-01' }], TODAY)).toBe('In Progress')
  })
  it('rolls Yet to Start → In Progress when a mold starts', () => {
    expect(nextBuildingStatus('Yet to Start', [{ startDate: '2026-01-01' }], TODAY)).toBe('In Progress')
  })
  it('rolls In Progress → On Hold when no mold is active', () => {
    expect(
      nextBuildingStatus('In Progress', [{ startDate: '2026-01-01', completedDate: '2026-05-01' }], TODAY),
    ).toBe('On Hold')
  })
  it('returns null when the rollup matches the current status', () => {
    expect(nextBuildingStatus('In Progress', [{ startDate: '2026-01-01' }], TODAY)).toBeNull()
  })
})

describe('deriveBuildingDates (derived from molds)', () => {
  it('startDate = earliest mold startDate', () => {
    const dates = deriveBuildingDates([{ startDate: '2026-03-01' }, { startDate: '2026-01-15' }], TODAY)
    expect(dates.startDate).toBe('2026-01-15')
    expect(dates.endDate).toBeUndefined()
  })
  it('no endDate until every mold is Material Removed', () => {
    const dates = deriveBuildingDates(
      [
        { startDate: '2026-01-01', completedDate: '2026-05-01', removedDate: '2026-06-01' },
        { startDate: '2026-02-01', completedDate: '2026-05-10' },
      ],
      TODAY,
    )
    expect(dates.endDate).toBeUndefined()
  })
  it('endDate = latest removedDate once all molds Material Removed', () => {
    const dates = deriveBuildingDates(
      [
        { startDate: '2026-01-01', completedDate: '2026-05-01', removedDate: '2026-06-01' },
        { startDate: '2026-02-01', completedDate: '2026-05-10', removedDate: '2026-06-10' },
      ],
      TODAY,
    )
    expect(dates.startDate).toBe('2026-01-01')
    expect(dates.endDate).toBe('2026-06-10')
  })
  it('no molds → no dates', () => {
    expect(deriveBuildingDates([], TODAY)).toEqual({ startDate: undefined, endDate: undefined })
  })
})

describe('buildingDatesForStatusChange (manual status → date)', () => {
  it('Completed stamps endDate=today when empty', () => {
    expect(buildingDatesForStatusChange('Completed', {}, TODAY)).toEqual({ endDate: TODAY })
  })
  it('Closed stamps endDate=today when empty', () => {
    expect(buildingDatesForStatusChange('Closed', {}, TODAY)).toEqual({ endDate: TODAY })
  })
  it('keeps an existing endDate', () => {
    expect(buildingDatesForStatusChange('Completed', { endDate: '2026-05-01' }, TODAY)).toEqual({})
  })
  it('other states leave dates to the roll-up', () => {
    expect(buildingDatesForStatusChange('In Progress', {}, TODAY)).toEqual({})
    expect(buildingDatesForStatusChange('On Hold', {}, TODAY)).toEqual({})
  })
})

describe('shouldAutoClose', () => {
  const paid = mold({ paymentStatus: 'Paid' })
  const billed = mold({ paymentStatus: 'Billed' })
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
