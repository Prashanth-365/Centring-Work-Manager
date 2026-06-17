import { describe, expect, it } from 'vitest'
import { weeklySummary } from './weekly'
import { weekDays } from '../dates'
import type { Attendance, Worker } from '../types'

const WEEK = '2026-01-07'
const WS = 1 as const
const days = weekDays(WEEK, WS) // Mon..Sun ISO dates

function worker(): Worker {
  return {
    id: 'w1',
    name: 'Test',
    type: 'Helper',
    // 500/day until days[3], then 600/day — a mid-week raise.
    wageHistory: [
      { effectiveFrom: days[0], dailyWage: 500 },
      { effectiveFrom: days[3], dailyWage: 600 },
    ],
    active: true,
    foodMode: 'meal',
    foodBreakfast: 50,
    foodLunch: 100,
    maxDaysPerWeek: 10,
    createdAt: 0,
    updatedAt: 0,
  }
}

function att(date: string, blocks: number[]): Attendance {
  return {
    id: `a-${date}`,
    workerId: 'w1',
    buildingId: 'b1',
    date,
    blocks,
    dayFraction: 0.5 * blocks.length,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('weeklySummary — wage effective-dating within a week (§10)', () => {
  const w = worker()
  // One full day before the raise (rate 500) and one after (rate 600).
  const attendance = [att(days[1], [1, 2]), att(days[4], [1, 2])]
  const summary = weeklySummary([w], attendance, [], WEEK, WS)
  const row = summary.rows[0]

  it('charges each day at the rate effective on its own date', () => {
    expect(row.totalWage).toBe(500 + 600)
  })
  it('flags that the rate changed mid-week', () => {
    expect(row.wageChangedMidWeek).toBe(true)
  })
  it('computes day-wise food (two days of breakfast = 100)', () => {
    expect(row.food).toBe(100)
    expect(row.total).toBe(1100 + 100)
  })
  it('totals two worked days', () => {
    expect(row.totalDays).toBe(2)
  })
})
