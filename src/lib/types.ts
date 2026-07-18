// ---------------------------------------------------------------------------
// Domain types for the Centering Manager.
// Everything is keyed on UUID `id`. Money is stored as plain numbers (rupees).
// Dates are ISO 'yyyy-MM-dd' strings; times are 'HH:mm'.
// ---------------------------------------------------------------------------

export type BuildingStatus =
  | 'Yet to Start'
  | 'In Progress'
  | 'On Hold'
  | 'Completed' // work done
  | 'Closed' // work done AND fully paid

export type MoldWorkStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Material Removed'
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

/**
 * A building has NO stored name. Its display name is DERIVED live as
 * `"{owner.name} - {location}"` (see `buildingName()` in select.ts), so editing
 * the owner's name or the location updates it everywhere automatically.
 */
export interface Building {
  id: string
  ownerId?: string
  location?: string
  /** DERIVED from molds (read-only) — min mold startDate. Recomputed by autoAdvance. */
  startDate?: string
  /** DERIVED from molds (read-only) — max mold removedDate when all molds are
   * Material Removed, or today when the building is manually Completed. */
  endDate?: string
  ratePerSqft?: number
  status: BuildingStatus
  photoThumb?: Blob
  notes?: string
  createdAt: number
  updatedAt: number
}

/** Measurement-bill units: decimal feet, or feet-inches entry (2.11 = 2' 11"). */
export type BillUnit = 'dec' | 'ftin'

/** One measurement row: L × H × No. Dimensions are ALWAYS stored as decimal feet
 * (ft-in entry is converted on input). Empty string = not yet entered. */
export interface BillRow {
  l: number | ''
  h: number | ''
  no: number | ''
}

/** A named measurement section (Plinth, Sajja Nintel, Roof Slab, …). */
export interface BillSection {
  id: string
  name: string
  rows: BillRow[]
  collapsed?: boolean
}

/** Extra line item billed as qty × rate (Steps, Column Gabdi, …). */
export interface BillExtra {
  name: string
  qty: number | ''
  rate: number | ''
}

/** The measurement bill for one mold/floor. Stored inline on the mold (not a
 * separate table) so it travels with backups automatically. Saving a bill
 * syncs `mold.billAmount` (grand total) + `mold.sqft` (total area), which the
 * auto-derived payment status and receivables already consume. */
export interface MoldBill {
  /** ₹ per sqft applied to the summed section area. */
  rate: number
  unit: BillUnit
  sections: BillSection[]
  extras: BillExtra[]
  /** Advance deducted on the printed bill. Defaults from the assigned
   * OwnerReceipt txns for the mold but is user-editable. */
  advance: number
  updatedAt: number
}

/** A mold is exactly one floor. Plinth/sump/lift/steps roll into that floor's mold. */
export interface Mold {
  id: string
  buildingId: string
  floorName: string
  order: number
  /** Work began (centering erected). Drives Not Started → In Progress. */
  startDate?: string
  /** Slab cast/poured (centering still in place). Drives In Progress → Completed. */
  completedDate?: string
  /** Centering de-shuttered — work fully finished. Drives Completed → Material Removed. */
  removedDate?: string
  sqft?: number
  billAmount?: number
  billPdfLink?: string
  /** In-app measurement bill (§bill). Optional — molds may instead only carry
   * a billAmount + billPdfLink entered manually. */
  bill?: MoldBill
  workStatus: MoldWorkStatus
  paymentStatus: MoldPaymentStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

/** A wage rate effective from a date. Editing a wage APPENDS an entry — past
 * attendance keeps costing the rate that was effective on its own date (§7). */
export interface WageEntry {
  effectiveFrom: string // 'yyyy-MM-dd'
  dailyWage: number
}

export interface Worker {
  id: string
  name: string
  type: WorkerType
  /** Rate history, sorted ascending by effectiveFrom. Use `wageOnDate()` /
   * `currentWage()` (compute/wage.ts) to read — never index [0] blindly. */
  wageHistory: WageEntry[]
  phone?: string
  active: boolean
  photoThumb?: Blob
  notes?: string
  // Food configuration
  foodMode: FoodMode
  foodBreakfast: number // counts if the day's blocks include BOTH 1 and 2 (default 50)
  foodLunch: number // counts if the day's blocks include BOTH 2 and 3 (default 100)
  foodPerDay?: number // for fixedPerDay
  foodPerWeek?: number // for fixedPerWeek
  maxDaysPerWeek: number // default 10
  createdAt: number
  updatedAt: number
}

export interface Owner {
  id: string
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
  dateTime?: number // original unix timestamp from the txn app, when available
  amount: number
  direction: TxnDirection
  txnType?: TxnDirection // raw debit/credit as read from the source
  subCategory: SubCategory | string // our mapped type
  typeName?: string // the raw source sub-category name (pre-mapping)
  importFingerprint?: string // secondary identity signal for dedupe / assignment carry-over
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

/** Maps a transaction-app sub-category NAME → our SubCategory type (§8). User
 * can fix any auto-match in Settings → Category Mapping. Keyed on normalized name. */
export interface CategoryMap {
  id: string
  sourceName: string // the sub-category name as it appears in the txn app
  type: SubCategory // what we treat it as
}

export interface ShiftBlock {
  index: number // 1,2,3
  from: string // 'HH:mm'
  to: string
}

export type AppLockMethod = 'pin' | 'biometric'

export interface AppLockConfig {
  enabled: boolean
  method?: AppLockMethod // 'pin' (default) or 'biometric' (WebAuthn / native), PIN is fallback
  pinHash?: string // base64 PBKDF2 hash
  salt?: string // base64
  webauthnCredId?: string // base64url credential id for the platform authenticator
  relockMinutes?: number // re-prompt after the app has been backgrounded this long (default 2)
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
  /** Encrypt backups with a passphrase (default true). Governs BOTH the local
   * Export file AND the Google Drive backup: when false, each is written as plain
   * JSON (with a warning). Restore/Import auto-detect encrypted vs plain. */
  encryptBackup?: boolean
  /** UI theme. Defaults to dark (the app's original look). Applied via the `dark`
   * class on <html>; mirrored to localStorage for a flash-free boot. */
  theme?: 'light' | 'dark'
  appLock: AppLockConfig
  /** @deprecated No longer used — the Drive OAuth client id now comes solely
   * from the VITE_GOOGLE_CLIENT_ID build env (no in-app field). Kept on the type
   * so existing stored settings rows still parse. */
  googleClientId?: string
  /** Email of the Google account last connected for Drive backup (status display). */
  driveEmail?: string
  /** Epoch ms of the last successful Drive backup/restore, for status display. */
  lastDriveSyncAt?: number
  updatedAt: number
}
