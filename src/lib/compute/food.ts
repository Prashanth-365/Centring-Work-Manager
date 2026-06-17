// Food cost per worker, mode-aware (§6). Food is a CALCULATED cost — never a
// transaction — and is computed DAY-WISE: a worker can work different blocks in
// different buildings on the same day, so food is derived once per worker per
// day from the UNION of that day's blocks (not per attendance line). This is the
// single source for the food figure in both the weekly register and overhead.
import { weekKey, type WeekStart } from '../dates'
import type { Worker } from '../types'
import { dayFractionFromBlocks, mealFlags, normalizeBlocks } from './shifts'

export interface FoodEntry {
  date: string
  blocks: number[]
  dayFraction: number
}

/** meal-mode food for a single day's UNION of blocks. */
export function mealFoodForBlocks(worker: Worker, blocks: number[]): number {
  const { breakfast, lunch } = mealFlags(blocks)
  return (breakfast ? worker.foodBreakfast : 0) + (lunch ? worker.foodLunch : 0)
}

/** Back-compat alias — meal food is computed from a set of blocks. */
export const mealFoodForEntry = mealFoodForBlocks

export interface DayUnion {
  date: string
  blocks: number[] // union of distinct blocks worked that day
  dayFraction: number // 0.5 × distinct blocks, capped at 1.5
}

/** Collapse attendance lines into one row per day: union of blocks + day fraction. */
export function unionByDay(entries: FoodEntry[]): DayUnion[] {
  const sets = new Map<string, Set<number>>()
  for (const e of entries) {
    let s = sets.get(e.date)
    if (!s) {
      s = new Set<number>()
      sets.set(e.date, s)
    }
    for (const b of normalizeBlocks(e.blocks)) s.add(b)
  }
  const out: DayUnion[] = []
  for (const [date, set] of sets) {
    const blocks = [...set].sort((a, b) => a - b)
    out.push({ date, blocks, dayFraction: dayFractionFromBlocks(blocks) })
  }
  return out
}

export interface DailyFood extends DayUnion {
  foodAmount: number
}

/**
 * Per-day food rows for a worker (the conceptual "dailyFood" — computed, not
 * stored). Used for the weekly register's Food column and any day-level UI.
 * For fixedPerWeek, the weekly amount is attributed evenly across the week's
 * worked days (perWeek / maxDays × dayFraction), which sums to the §6 formula.
 */
export function dailyFoodBreakdown(
  worker: Worker,
  entries: FoodEntry[],
): DailyFood[] {
  const days = unionByDay(entries)
  if (worker.foodMode === 'meal') {
    return days.map((d) => ({ ...d, foodAmount: mealFoodForBlocks(worker, d.blocks) }))
  }
  if (worker.foodMode === 'fixedPerDay') {
    const per = worker.foodPerDay ?? 0
    return days.map((d) => ({ ...d, foodAmount: per * d.dayFraction }))
  }
  // fixedPerWeek — even per-day attribution of the weekly figure.
  const perWeek = worker.foodPerWeek ?? 0
  const maxDays = worker.maxDaysPerWeek || 10
  return days.map((d) => ({ ...d, foodAmount: (perWeek / maxDays) * d.dayFraction }))
}

/**
 * Total calculated food for a worker across a set of attendance entries.
 * - meal:        Σ over DAYS of (breakfast/lunch for the day's union of blocks)
 * - fixedPerDay: Σ over DAYS of (foodPerDay × the day's union fraction)
 * - fixedPerWeek: per ISO-week, foodPerWeek × (Σ day-fractions that week / maxDaysPerWeek)
 */
export function foodForEntries(
  worker: Worker,
  entries: FoodEntry[],
  weekStartsOn: WeekStart,
): number {
  if (entries.length === 0) return 0
  const days = unionByDay(entries)

  if (worker.foodMode === 'meal') {
    return days.reduce((s, d) => s + mealFoodForBlocks(worker, d.blocks), 0)
  }

  if (worker.foodMode === 'fixedPerDay') {
    const per = worker.foodPerDay ?? 0
    return days.reduce((s, d) => s + per * d.dayFraction, 0)
  }

  // fixedPerWeek
  const perWeek = worker.foodPerWeek ?? 0
  const maxDays = worker.maxDaysPerWeek || 10
  const byWeek = new Map<string, number>()
  for (const d of days) {
    const k = weekKey(d.date, weekStartsOn)
    byWeek.set(k, (byWeek.get(k) ?? 0) + d.dayFraction)
  }
  let total = 0
  for (const frac of byWeek.values()) total += perWeek * (frac / maxDays)
  return total
}
