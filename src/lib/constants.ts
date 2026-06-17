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

export const MOLD_WORK_STATUSES: MoldWorkStatus[] = ['Not Started', 'In Progress', 'Done/Removed']
export const MOLD_PAYMENT_STATUSES: MoldPaymentStatus[] = [
  'Not Billed',
  'Billed',
  'Partly Paid',
  'Paid',
]

export const WORKER_TYPES: WorkerType[] = ['Helper', 'Carpenter', 'Outsider']

export const FOOD_MODES: { value: FoodMode; label: string; hint: string }[] = [
  { value: 'meal', label: 'Per meal', hint: 'Breakfast if block 1, lunch if block 3' },
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

/** Each shift block is half a day; total day-fraction is capped here. */
export const BLOCK_FRACTION = 0.5
export const MAX_DAY_FRACTION = 1.5
