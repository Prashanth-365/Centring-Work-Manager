// ---------------------------------------------------------------------------
// Domain types for the Centering Work Manager.
// Everything is keyed on UUID `id`. Money is stored as plain numbers (rupees).
// Dates are ISO 'yyyy-MM-dd' strings; times are 'HH:mm'.
// ---------------------------------------------------------------------------

export type BuildingStatus =
  | 'Yet to Start'
  | 'In Progress'
  | 'On Hold'
  | 'Completed' // work done
  | 'Closed' // work done AND fully paid

export type MoldWorkStatus = 'Not Started' | 'In Progress' | 'Done/Removed'
export type MoldPaymentStatus = 'Not Billed' | 'Billed' | 'Partly Paid' | 'Paid'

export type WorkerType = 'Helper' | 'Carpenter' | 'Outsider'
export type FoodMode = 'meal' | 'fixedPerDay' | 'fixedPerWeek'

export type TxnDirection = 'credit' | 'debit'
export type AssignmentStatus = 'unassigned' | 'assigned' | 'needsReview'

/** Predefined subCategories from the transaction app (category === "Construction"). */
export type SubCategory =
  | 'OwnerReceipt'
  | 'Wage'
  | 'Advance'
  | 'Food'
  | 'Transport'
  | 'Rent'
  | 'Material'
  | 'OtherExpense'

export interface Building {
  id: string
  code: string
  name: string
  ownerId?: string
  location?: string
  startDate?: string
  endDate?: string
  ratePerSqft?: number
  status: BuildingStatus
  photoThumb?: Blob
  notes?: string
  createdAt: number
  updatedAt: number
}

/** A mold is exactly one floor. Plinth/sump/lift/steps roll into that floor's mold. */
export interface Mold {
  id: string
  buildingId: string
  floorName: string
  order: number
  startDate?: string
  endDate?: string
  sqft?: number
  billAmount?: number
  billPdfLink?: string
  workStatus: MoldWorkStatus
  paymentStatus: MoldPaymentStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface Worker {
  id: string
  code: string
  name: string
  type: WorkerType
  dailyWage: number
  phone?: string
  active: boolean
  photoThumb?: Blob
  notes?: string
  // Food configuration
  foodMode: FoodMode
  foodBreakfast: number // counts if block 1 worked (default 50)
  foodLunch: number // counts if block 3 worked (default 100)
  foodPerDay?: number // for fixedPerDay
  foodPerWeek?: number // for fixedPerWeek
  maxDaysPerWeek: number // default 10
  createdAt: number
  updatedAt: number
}

export interface Owner {
  id: string
  code: string
  name: string
  phone?: string
  location?: string
  photoThumb?: Blob
  notes?: string
  createdAt: number
  updatedAt: number
}

/** "Work done" — one attendance entry per worker per (part of a) day. */
export interface Attendance {
  id: string
  workerId: string
  buildingId: string
  moldId?: string
  date: string
  shiftFrom?: string
  shiftTo?: string
  blocks: number[] // subset of [1,2,3]
  dayFraction: number // 0.5 * blocks.length, capped at 1.5
  notes?: string
  createdAt: number
  updatedAt: number
}

/** Snapshot + assignment of a Construction transaction read from the txn app backup. */
export interface SyncedTransaction {
  id: string // the txn's UUID — primary key here too. NEVER slNo.
  date: string
  amount: number
  direction: TxnDirection
  subCategory: SubCategory | string
  description?: string
  lastSeenAmount: number
  assignmentStatus: AssignmentStatus
  // assignment fields (depend on subCategory)
  buildingId?: string
  moldId?: string
  workerId?: string
  materialDescription?: string
  otherExpenseType?: string
  firstSeenAt: number
  updatedAt: number
}

export interface OtherExpenseType {
  id: string
  name: string
}

export interface ShiftBlock {
  index: number // 1,2,3
  from: string // 'HH:mm'
  to: string
}

export interface AppLockConfig {
  enabled: boolean
  pinHash?: string // base64 PBKDF2 hash
  salt?: string // base64
}

export interface Settings {
  id: 'app'
  shiftBlocks: ShiftBlock[]
  defaultFoodBreakfast: number
  defaultFoodLunch: number
  defaultFoodPerDay: number
  defaultFoodPerWeek: number
  defaultMaxDaysPerWeek: number
  collectAlertDays: number // default 18
  weekStartsOn: number // 1 = Monday
  appLock: AppLockConfig
  updatedAt: number
}
