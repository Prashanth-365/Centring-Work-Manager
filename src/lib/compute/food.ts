// Food cost per worker, mode-aware (§6). Food is a CALCULATED cost — never a
// transaction — and is computed DAY-WISE: a worker can work different blocks in
// different buildings on the same day, so food is derived once per worker per
// day from the UNION of that day's blocks (not per attendance line). This is the
// single source for the food figure in both the weekly register and overhead.
//
// Effective-dated food: if `worker.foodHistory` is set, each date uses the
// base-amount effective on that date (mirrors wageOnDate for wages). The scalar
// fields (foodBreakfast, foodLunch, foodPerDay, foodPerWeek) are the current
// flat values; foodHistory entries override them for past dates.
import { weekKey, type WeekStart } from '../dates'
import type { FoodEntry as FoodHistEntry, Worker } from '../types'
import { dayFractionFromBlocks, mealFlags, normalizeBlocks } from './shifts'

/** Return the base food amount effective on `date` for `worker`.
 * For meal mode: returned as { breakfast, lunch } pair.
 * For fixedPerDay/fixedPerWeek: returned as the scalar amount.
 * If no foodHistory or no entry ≤ date, falls back to the flat worker fields. */
function foodBaseOnDate(
  worker: Worker,
  date: string,
): { breakfast: number; lunch: number; perDay: number; perWeek: number } {
  const hist = worker.foodHistory
  if (hist && hist.length > 0) {
    // Find the entry with greatest effectiveFrom ≤ date (like wageOnDate).
    const sorted = [...hist].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    let entry: FoodHistEntry | undefined
    for (const e of sorted) {
      if (e.effectiveFrom <= date) entry = e
    }
    if (entry) {
      // foodHistory stores a single `amount` that replaces the active flat field.
      // Which field it overrides depends on foodMode.
      if (worker.foodMode === 'meal') {
        // For meal mode amount is the combined amount; split 1:2 breakfast:lunch.
        const b = Math.round(entry.amount / 3)
        const l = entry.amount - b
        return { breakfast: b, lunch: l, perDay: 0, perWeek: 0 }
      }
      if (worker.foodMode === 'fixedPerDay') {
        return { breakfast: 0, lunch: 0, perDay: entry.amount, perWeek: 0 }
      }
      return { breakfast: 0, lunch: 0, perDay: 0, perWeek: entry.amount }
    }
  }
  return {
    breakfast: worker.foodBreakfast,
    lunch: worker.foodLunch,
    perDay: worker.foodPerDay ?? 0,
    perWeek: worker.foodPerWeek ?? 0,
  }
}

export interface FoodEntry {
  date: string
  blocks: number[]
  dayFraction: number
}

/** meal-mode food for a single day's UNION of blocks.
 * Pass `date` to use the effective-dated amount (foodHistory); omit for the flat fields. */
export function mealFoodForBlocks(worker: Worker, blocks: number[], date?: string): number {
  const { breakfast, lunch } = mealFlags(blocks)
  if (date) {
    const base = foodBaseOnDate(worker, date)
    return (breakfast ? base.breakfast : 0) + (lunch ? base.lunch : 0)
  }
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
    return days.map((d) => ({ ...d, foodAmount: mealFoodForBlocks(worker, d.blocks, d.date) }))
  }
  if (worker.foodMode === 'fixedPerDay') {
    return days.map((d) => {
      const per = foodBaseOnDate(worker, d.date).perDay
      return { ...d, foodAmount: per * d.dayFraction }
    })
  }
  // fixedPerWeek — even per-day attribution of the weekly figure.
  const maxDays = worker.maxDaysPerWeek || 10
  return days.map((d) => {
    const perWeek = foodBaseOnDate(worker, d.date).perWeek
    return { ...d, foodAmount: (perWeek / maxDays) * d.dayFraction }
  })
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
    return days.reduce((s, d) => s + mealFoodForBlocks(worker, d.blocks, d.date), 0)
  }

  if (worker.foodMode === 'fixedPerDay') {
    return days.reduce((s, d) => {
      const per = foodBaseOnDate(worker, d.date).perDay
      return s + per * d.dayFraction
    }, 0)
  }

  // fixedPerWeek
  const maxDays = worker.maxDaysPerWeek || 10
  const byWeekAmt = new Map<string, number>()
  for (const d of days) {
    const k = weekKey(d.date, weekStartsOn)
    const perWeek = foodBaseOnDate(worker, d.date).perWeek
    byWeekAmt.set(k, (byWeekAmt.get(k) ?? 0) + perWeek * (d.dayFraction / maxDays))
  }
  let total = 0
  for (const amt of byWeekAmt.values()) total += amt
  return total
}
