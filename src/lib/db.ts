import Dexie, { type Table } from 'dexie'
import { DEFAULTS, DEFAULT_SHIFT_BLOCKS, SEED_OTHER_EXPENSE_TYPES } from './constants'
import { now, uuid } from './ids'
import type {
  Attendance,
  Building,
  Mold,
  OtherExpenseType,
  Owner,
  Settings,
  SyncedTransaction,
  Worker,
} from './types'

export class CwmDB extends Dexie {
  buildings!: Table<Building, string>
  molds!: Table<Mold, string>
  workers!: Table<Worker, string>
  owners!: Table<Owner, string>
  attendance!: Table<Attendance, string>
  syncedTransactions!: Table<SyncedTransaction, string>
  otherExpenseTypes!: Table<OtherExpenseType, string>
  settings!: Table<Settings, string>

  constructor() {
    super('centering-work-manager')
    this.version(1).stores({
      buildings: 'id, code, ownerId, status, name, updatedAt',
      molds: 'id, buildingId, order, workStatus, paymentStatus, [buildingId+order]',
      workers: 'id, code, active, type, name',
      owners: 'id, code, name',
      attendance:
        'id, workerId, buildingId, moldId, date, [workerId+date], [buildingId+date], [moldId+date]',
      syncedTransactions:
        'id, date, direction, subCategory, assignmentStatus, buildingId, moldId, workerId',
      otherExpenseTypes: 'id, name',
      settings: 'id',
    })

    this.on('populate', () => {
      this.settings.add(defaultSettings())
      this.otherExpenseTypes.bulkAdd(
        SEED_OTHER_EXPENSE_TYPES.map((name) => ({ id: uuid(), name })),
      )
    })
  }
}

export const db = new CwmDB()

export function defaultSettings(): Settings {
  return {
    id: 'app',
    shiftBlocks: DEFAULT_SHIFT_BLOCKS.map((b) => ({ ...b })),
    defaultFoodBreakfast: DEFAULTS.foodBreakfast,
    defaultFoodLunch: DEFAULTS.foodLunch,
    defaultFoodPerDay: DEFAULTS.foodPerDay,
    defaultFoodPerWeek: DEFAULTS.foodPerWeek,
    defaultMaxDaysPerWeek: DEFAULTS.maxDaysPerWeek,
    collectAlertDays: DEFAULTS.collectAlertDays,
    weekStartsOn: DEFAULTS.weekStartsOn,
    appLock: { enabled: false },
    updatedAt: now(),
  }
}

/**
 * Idempotent safety seed — `populate` only runs on first DB creation, so this
 * guarantees a settings row and the seed expense types exist even for an older
 * database that predates them.
 */
export async function ensureSeed(): Promise<Settings> {
  let s = await db.settings.get('app')
  if (!s) {
    s = defaultSettings()
    await db.settings.add(s)
  }
  const count = await db.otherExpenseTypes.count()
  if (count === 0) {
    await db.otherExpenseTypes.bulkAdd(
      SEED_OTHER_EXPENSE_TYPES.map((name) => ({ id: uuid(), name })),
    )
  }
  return s
}

/** Wipe every table — used before restoring a backup. */
export async function clearAllTables(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.buildings,
      db.molds,
      db.workers,
      db.owners,
      db.attendance,
      db.syncedTransactions,
      db.otherExpenseTypes,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.buildings.clear(),
        db.molds.clear(),
        db.workers.clear(),
        db.owners.clear(),
        db.attendance.clear(),
        db.syncedTransactions.clear(),
        db.otherExpenseTypes.clear(),
        db.settings.clear(),
      ])
    },
  )
}
