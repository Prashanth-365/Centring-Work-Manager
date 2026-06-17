// Shift blocks → day-fraction & meal flags (§5).
import { BLOCK_FRACTION, MAX_DAY_FRACTION } from '../constants'
import type { ShiftBlock } from '../types'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Map a worked from–to range onto the configured shift blocks. A block is
 * marked worked when the range overlaps at least half of that block's window
 * (the user can always fine-tune via the block toggles).
 */
export function blocksFromTimeRange(
  from: string | undefined,
  to: string | undefined,
  shiftBlocks: ShiftBlock[],
): number[] {
  if (!from || !to) return []
  const start = timeToMinutes(from)
  const end = timeToMinutes(to)
  if (end <= start) return []
  const out: number[] = []
  for (const b of shiftBlocks) {
    const bs = timeToMinutes(b.from)
    const be = timeToMinutes(b.to)
    const overlap = Math.max(0, Math.min(end, be) - Math.max(start, bs))
    const blockLen = be - bs
    if (blockLen > 0 && overlap * 2 >= blockLen) out.push(b.index)
  }
  return out
}

export function normalizeBlocks(blocks: number[]): number[] {
  return Array.from(new Set(blocks.filter((b) => b >= 1 && b <= 3))).sort((a, b) => a - b)
}

/** dayFraction = 0.5 × blocks worked, capped at 1.5. */
export function dayFractionFromBlocks(blocks: number[]): number {
  const n = normalizeBlocks(blocks).length
  return Math.min(MAX_DAY_FRACTION, n * BLOCK_FRACTION)
}

export interface MealFlags {
  breakfast: boolean
  lunch: boolean
}

/** Breakfast counts if block 1 worked; lunch counts if block 3 worked (§5). */
export function mealFlags(blocks: number[]): MealFlags {
  const set = new Set(normalizeBlocks(blocks))
  return { breakfast: set.has(1), lunch: set.has(3) }
}
