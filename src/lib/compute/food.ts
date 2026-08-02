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
): { breakfast: number; lunch: number; perDay: number; perWeek: number; maxDays: number; mode: Worker['foodMode'] } {
  const hist = worker.foodHistory
  if (hist && hist.length > 0) {
    // Find the entry with greatest effectiveFrom ≤ date (like wageOnDate).
    const sorted = [...hist].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    let entry: FoodHistEntry | undefined
    for (const e of sorted) {
      if (e.effectiveFrom <= date) entry = e
    }
    if (entry) {
      return {
        mode: entry.foodMode,
        breakfast: entry.foodBreakfast,
        lunch: entry.foodLunch,
        perDay: entry.foodPerDay,
        perWeek: entry.foodPerWeek,
        maxDays: entry.maxDaysPerWeek,
      }
    }
  }
  return {
    mode: worker.foodMode,
    breakfast: worker.foodBreakfast,
    lunch: worker.foodLunch,
    perDay: worker.foodPerDay ?? 0,
    perWeek: worker.foodPerWeek ?? 0,
    maxDays: worker.maxDaysPerWeek,
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
  const base = date ? foodBaseOnDate(worker, date) : {
    mode: worker.foodMode, breakfast: worker.foodBreakfast, lunch: worker.foodLunch,
    perDay: worker.foodPerDay ?? 0, perWeek: worker.foodPerWeek ?? 0, maxDays: worker.maxDaysPerWeek,
  }
  return (breakfast ? base.breakfast : 0) + (lunch ? base.lunch : 0)
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
  return days.map((d) => {
    const base = foodBaseOnDate(worker, d.date)
    if (base.mode === 'meal') {
      return { ...d, foodAmount: mealFoodForBlocks(worker, d.blocks, d.date) }
    }
    if (base.mode === 'fixedPerDay') {
      return { ...d, foodAmount: base.perDay * d.dayFraction }
    }
    // fixedPerWeek — even per-day attribution
    const maxDays = base.maxDays || 10
    return { ...d, foodAmount: (base.perWeek / maxDays) * d.dayFraction }
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

  const byWeekAmt = new Map<string, number>()
  let mealAndDayTotal = 0
  for (const d of days) {
    const base = foodBaseOnDate(worker, d.date)
    if (base.mode === 'meal') {
      mealAndDayTotal += mealFoodForBlocks(worker, d.blocks, d.date)
    } else if (base.mode === 'fixedPerDay') {
      mealAndDayTotal += base.perDay * d.dayFraction
    } else {
      // fixedPerWeek — accumulate per week
      const maxDays = base.maxDays || 10
      const k = weekKey(d.date, weekStartsOn)
      byWeekAmt.set(k, (byWeekAmt.get(k) ?? 0) + base.perWeek * (d.dayFraction / maxDays))
    }
  }
  let weekTotal = 0
  for (const amt of byWeekAmt.values()) weekTotal += amt
  return mealAndDayTotal + weekTotal
}
