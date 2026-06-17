import { describe, expect, it } from 'vitest'
import { dayFractionFromBlocks, mealFlags, normalizeBlocks } from './shifts'

describe('mealFlags (§6 — block 2 required for any meal)', () => {
  it('breakfast needs both blocks 1 and 2', () => {
    expect(mealFlags([1, 2])).toEqual({ breakfast: true, lunch: false })
  })
  it('lunch needs both blocks 2 and 3', () => {
    expect(mealFlags([2, 3])).toEqual({ breakfast: false, lunch: true })
  })
  it('{1,3} (no middle block) gives no meal', () => {
    expect(mealFlags([1, 3])).toEqual({ breakfast: false, lunch: false })
  })
  it('{1,2,3} gives both meals', () => {
    expect(mealFlags([1, 2, 3])).toEqual({ breakfast: true, lunch: true })
  })
  it('a single block gives nothing', () => {
    expect(mealFlags([1])).toEqual({ breakfast: false, lunch: false })
    expect(mealFlags([2])).toEqual({ breakfast: false, lunch: false })
  })
})

describe('dayFractionFromBlocks', () => {
  it('is 0.5 per distinct block, capped at 1.5', () => {
    expect(dayFractionFromBlocks([1])).toBe(0.5)
    expect(dayFractionFromBlocks([1, 2])).toBe(1)
    expect(dayFractionFromBlocks([1, 2, 3])).toBe(1.5)
  })
  it('dedupes repeated blocks', () => {
    expect(dayFractionFromBlocks([1, 1, 2])).toBe(1)
    expect(normalizeBlocks([3, 1, 2, 2])).toEqual([1, 2, 3])
  })
})
