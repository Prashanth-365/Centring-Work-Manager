// Food cost per worker, mode-aware (§6). Food is a CALCULATED cost — never a
// transaction. This is the single source for the food figure in both the
// weekly summary and the overhead bucket.
import { weekKey, type WeekStart } from '../dates'
import type { Worker } from '../types'
import { mealFlags } from './shifts'

export interface FoodEntry {
  date: string
  blocks: number[]
  dayFraction: number
}

/** meal mode, per single entry: breakfast if block 1, lunch if block 3. */
export function mealFoodForEntry(worker: Worker, blocks: number[]): number {
  const { breakfast, lunch } = mealFlags(blocks)
  return (breakfast ? worker.foodBreakfast : 0) + (lunch ? worker.foodLunch : 0)
}

/**
 * Total calculated food for a worker across a set of attendance entries.
 * - meal:        Σ (breakfast/lunch per entry)
 * - fixedPerDay: Σ (foodPerDay × dayFraction)
 * - fixedPerWeek: per ISO-week, foodPerWeek × (Σ dayFraction that week / maxDaysPerWeek)
 */
export function foodForEntries(
  worker: Worker,
  entries: FoodEntry[],
  weekStartsOn: WeekStart,
): number {
  if (entries.length === 0) return 0

  if (worker.foodMode === 'meal') {
    return entries.reduce((s, e) => s + mealFoodForEntry(worker, e.blocks), 0)
  }

  if (worker.foodMode === 'fixedPerDay') {
    const per = worker.foodPerDay ?? 0
    return entries.reduce((s, e) => s + per * e.dayFraction, 0)
  }

  // fixedPerWeek
  const perWeek = worker.foodPerWeek ?? 0
  const maxDays = worker.maxDaysPerWeek || 10
  const byWeek = new Map<string, number>()
  for (const e of entries) {
    const k = weekKey(e.date, weekStartsOn)
    byWeek.set(k, (byWeek.get(k) ?? 0) + e.dayFraction)
  }
  let total = 0
  for (const frac of byWeek.values()) total += perWeek * (frac / maxDays)
  return total
}
