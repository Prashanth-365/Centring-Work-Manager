import { describe, expect, it } from 'vitest'
import { foodForEntries, unionByDay, type FoodEntry } from './food'
import type { FoodMode, Worker } from '../types'

function worker(mode: FoodMode, extra: Partial<Worker> = {}): Worker {
  return {
    id: 'w1',
    name: 'Test',
    type: 'Helper',
    wageHistory: [{ effectiveFrom: '2026-01-01', dailyWage: 500 }],
    active: true,
    foodMode: mode,
    foodBreakfast: 50,
    foodLunch: 100,
    foodPerDay: 150,
    foodPerWeek: 1000,
    maxDaysPerWeek: 10,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

const e = (date: string, blocks: number[]): FoodEntry => ({
  date,
  blocks,
  dayFraction: 0.5 * blocks.length,
})

describe('unionByDay', () => {
  it('unions blocks worked across buildings on the same day', () => {
    const days = unionByDay([e('2026-01-01', [1]), e('2026-01-01', [2])])
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ date: '2026-01-01', blocks: [1, 2], dayFraction: 1 })
  })
})

describe('foodForEntries — meal mode is DAY-WISE on the union (§6)', () => {
  it('two half-day lines that union to {1,2} earn ONE breakfast (50), not 0+0', () => {
    const w = worker('meal')
    expect(foodForEntries(w, [e('2026-01-01', [1]), e('2026-01-01', [2])], 1)).toBe(50)
  })
  it('{1,2} → 50, {2,3} → 100, {1,2,3} → 150, {1,3} → 0', () => {
    const w = worker('meal')
    expect(foodForEntries(w, [e('2026-01-01', [1, 2])], 1)).toBe(50)
    expect(foodForEntries(w, [e('2026-01-02', [2, 3])], 1)).toBe(100)
    expect(foodForEntries(w, [e('2026-01-03', [1, 2, 3])], 1)).toBe(150)
    expect(foodForEntries(w, [e('2026-01-04', [1, 3])], 1)).toBe(0)
  })
  it('sums across days', () => {
    const w = worker('meal')
    expect(foodForEntries(w, [e('2026-01-01', [1, 2]), e('2026-01-02', [2, 3])], 1)).toBe(150)
  })
})

describe('foodForEntries — fixed modes use the day union fraction', () => {
  it('fixedPerDay: foodPerDay × union day-fraction', () => {
    const w = worker('fixedPerDay') // 150/day
    expect(foodForEntries(w, [e('2026-01-01', [1]), e('2026-01-01', [2])], 1)).toBe(150) // union = full day
    expect(foodForEntries(w, [e('2026-01-01', [1])], 1)).toBe(75) // half day
  })
  it('fixedPerWeek: perWeek × (Σ day-fractions / maxDays)', () => {
    const w = worker('fixedPerWeek') // 1000/week, maxDays 10
    // Two full days in one week → 2 / 10 × 1000 = 200
    expect(foodForEntries(w, [e('2026-01-05', [1, 2]), e('2026-01-06', [1, 2])], 1)).toBe(200)
  })
})
