import { describe, expect, it } from 'vitest'
import { currentWage, wageOnDate, withWage } from './wage'
import type { Worker } from '../types'

function worker(history: { effectiveFrom: string; dailyWage: number }[]): Worker {
  return {
    id: 'w1',
    name: 'Test',
    type: 'Helper',
    wageHistory: history,
    active: true,
    foodMode: 'meal',
    foodBreakfast: 50,
    foodLunch: 100,
    maxDaysPerWeek: 10,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('wageOnDate (§7 — effective-dated wages)', () => {
  const w = worker([
    { effectiveFrom: '2026-01-01', dailyWage: 500 },
    { effectiveFrom: '2026-03-01', dailyWage: 600 },
  ])

  it('uses the rate effective on the date', () => {
    expect(wageOnDate(w, '2026-02-15')).toBe(500)
    expect(wageOnDate(w, '2026-03-15')).toBe(600)
  })
  it('is inclusive of the effectiveFrom boundary', () => {
    expect(wageOnDate(w, '2026-03-01')).toBe(600)
    expect(wageOnDate(w, '2026-02-28')).toBe(500)
  })
  it('falls back to the earliest rate before any entry', () => {
    expect(wageOnDate(w, '2025-12-01')).toBe(500)
  })
  it('returns 0 for empty history', () => {
    expect(wageOnDate(worker([]), '2026-01-01')).toBe(0)
    expect(currentWage(worker([]))).toBe(0)
  })
  it('currentWage is the latest entry', () => {
    expect(currentWage(w)).toBe(600)
  })
})

describe('withWage (append / correct)', () => {
  it('appends a new dated entry', () => {
    const w = worker([{ effectiveFrom: '2026-01-01', dailyWage: 500 }])
    expect(withWage(w, 600, '2026-04-01')).toEqual([
      { effectiveFrom: '2026-01-01', dailyWage: 500 },
      { effectiveFrom: '2026-04-01', dailyWage: 600 },
    ])
  })
  it('overwrites an entry on the same date', () => {
    const w = worker([{ effectiveFrom: '2026-01-01', dailyWage: 500 }])
    expect(withWage(w, 550, '2026-01-01')).toEqual([{ effectiveFrom: '2026-01-01', dailyWage: 550 }])
  })
})
