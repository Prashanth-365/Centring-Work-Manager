import type {
  BuildingStatus,
  FoodMode,
  MoldPaymentStatus,
  MoldWorkStatus,
  ShiftBlock,
  SubCategory,
  WorkerType,
} from './types'

export const BUILDING_STATUSES: BuildingStatus[] = [
  'Yet to Start',
  'In Progress',
  'On Hold',
  'Completed',
  'Closed',
]

export const MOLD_WORK_STATUSES: MoldWorkStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'Material Removed',
]
export const MOLD_PAYMENT_STATUSES: MoldPaymentStatus[] = [
  'Not Billed',
  'Billed',
  'Partly Paid',
  'Paid',
]

export const WORKER_TYPES: WorkerType[] = ['Helper', 'Carpenter', 'Outsider']

export const FOOD_MODES: { value: FoodMode; label: string; hint: string }[] = [
  { value: 'meal', label: 'Per meal', hint: 'Breakfast if blocks 1 & 2, lunch if blocks 2 & 3' },
  { value: 'fixedPerDay', label: 'Fixed / day', hint: 'Amount × day-fraction' },
  { value: 'fixedPerWeek', label: 'Fixed / week', hint: 'Weekly amount pro-rated by days worked' },
]

export const SUBCATEGORIES: SubCategory[] = [
  'OwnerReceipt',
  'Wage',
  'Advance',
  'Food',
  'Transport',
  'Rent',
  'Material',
  'OtherExpense',
]

/** Which assignment fields each subCategory needs in the Review queue. */
export type AssignField = 'building' | 'mold' | 'worker' | 'materialDescription' | 'otherExpenseType'

export const SUBCATEGORY_FIELDS: Record<string, AssignField[]> = {
  OwnerReceipt: ['building', 'mold'],
  Wage: ['worker'],
  Advance: ['worker'],
  Food: ['worker'],
  Transport: ['worker'],
  Rent: ['worker'],
  Material: ['materialDescription'],
  OtherExpense: ['otherExpenseType'],
}

// --- Cost / profit / balance classification (see §8 of the spec) ---------

/** Money IN from owners — building revenue. */
export const REVENUE_SUBCATS = new Set<string>(['OwnerReceipt'])

/** Cash given to a worker that simply reduces their running balance. */
export const BALANCE_SUBCATS = new Set<string>(['Wage', 'Advance', 'Food'])

/**
 * Provisions that go to the business-wide overhead bucket (NOT per-building,
 * NOT worker balance). Food is added to overhead as a *calculated* cost, never
 * from a transaction.
 */
export const OVERHEAD_SUBCATS = new Set<string>(['Transport', 'Rent', 'Material', 'OtherExpense'])

export const DEFAULT_SHIFT_BLOCKS: ShiftBlock[] = [
  { index: 1, from: '06:00', to: '09:00' },
  { index: 2, from: '09:30', to: '13:00' },
  { index: 3, from: '14:00', to: '18:00' },
]

export const DEFAULTS = {
  foodBreakfast: 50,
  foodLunch: 100,
  foodPerDay: 150,
  foodPerWeek: 1000,
  maxDaysPerWeek: 10,
  collectAlertDays: 18,
  weekStartsOn: 1, // Monday
} as const

export const SEED_OTHER_EXPENSE_TYPES = ['FinanceCost', 'Theft']

// --- Transaction sync: category-name → our SubCategory auto-matching (§8) ----

/** The top-level transaction-app category we read from. */
export const CONSTRUCTION_CATEGORY_NAME = 'Construction'

/** Normalize a category/sub-category name for matching: lowercase, strip all
 * non-alphanumerics, and drop a trailing plural 's' (so "Owner Receipts",
 * "owner_receipt" and "OwnerReceipt" all collapse to the same key). */
export function normalizeCategoryName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return base.endsWith('s') && base.length > 1 ? base.slice(0, -1) : base
}

/** Default name → type matches, keyed by normalizeCategoryName(). FinanceCost
 * and Theft collapse to OtherExpense (they're otherExpenseTypes in our model). */
export const DEFAULT_CATEGORY_MATCHES: Record<string, SubCategory> = {
  ownerreceipt: 'OwnerReceipt',
  receipt: 'OwnerReceipt',
  ownerpayment: 'OwnerReceipt',
  wage: 'Wage',
  salary: 'Wage',
  advance: 'Advance',
  food: 'Food',
  meal: 'Food',
  transport: 'Transport',
  travel: 'Transport',
  rent: 'Rent',
  material: 'Material',
  financecost: 'OtherExpense',
  theft: 'OtherExpense',
  otherexpense: 'OtherExpense',
  other: 'OtherExpense',
}

/** Source names that, while typed as OtherExpense, also name a known
 * otherExpenseType — used to pre-fill the assignment in Review. */
export const OTHER_EXPENSE_NAME_HINTS: Record<string, string> = {
  financecost: 'FinanceCost',
  theft: 'Theft',
}

/** Auto-match a raw sub-category name to our type; OtherExpense when unknown. */
export function autoMatchSubCategory(name: string): SubCategory {
  return DEFAULT_CATEGORY_MATCHES[normalizeCategoryName(name)] ?? 'OtherExpense'
}

/** Each shift block is half a day; total day-fraction is capped here. */
export const BLOCK_FRACTION = 0.5
export const MAX_DAY_FRACTION = 1.5
