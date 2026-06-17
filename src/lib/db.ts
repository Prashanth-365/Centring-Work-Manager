import Dexie, { type Table } from 'dexie'
import { DEFAULTS, DEFAULT_SHIFT_BLOCKS, SEED_OTHER_EXPENSE_TYPES } from './constants'
import { toISODate, todayISO } from './dates'
import { now, uuid } from './ids'
import type {
  Attendance,
  Building,
  CategoryMap,
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
  categoryMap!: Table<CategoryMap, string>
  settings!: Table<Settings, string>

  constructor() {
    super('centering-work-manager')

    // v1 — the original schema (kept so existing installs upgrade cleanly).
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

    // v2 — derived building names (drop name/code), effective-dated wages
    // (dailyWage → wageHistory), no codes on workers/owners, a categoryMap
    // table, and an importFingerprint index on synced transactions.
    this.version(2)
      .stores({
        buildings: 'id, ownerId, status, updatedAt',
        molds: 'id, buildingId, order, workStatus, paymentStatus, [buildingId+order]',
        workers: 'id, active, type, name',
        owners: 'id, name',
        attendance:
          'id, workerId, buildingId, moldId, date, [workerId+date], [buildingId+date], [moldId+date]',
        syncedTransactions:
          'id, date, direction, subCategory, assignmentStatus, buildingId, moldId, workerId, importFingerprint',
        otherExpenseTypes: 'id, name',
        categoryMap: 'id, sourceName',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('workers')
          .toCollection()
          .modify((w: Record<string, unknown>) => {
            if (!Array.isArray(w.wageHistory)) {
              const dailyWage = typeof w.dailyWage === 'number' ? (w.dailyWage as number) : 0
              const created = typeof w.createdAt === 'number' ? (w.createdAt as number) : undefined
              const effectiveFrom = created ? toISODate(new Date(created)) : todayISO()
              w.wageHistory = [{ effectiveFrom, dailyWage }]
            }
            delete w.dailyWage
            delete w.code
          })
        await tx
          .table('buildings')
          .toCollection()
          .modify((b: Record<string, unknown>) => {
            delete b.code
            delete b.name
          })
        await tx
          .table('owners')
          .toCollection()
          .modify((o: Record<string, unknown>) => {
            delete o.code
          })
      })

    // v3 — mold work lifecycle split into 4 states with three dates. The old
    // single `endDate` (which meant "Done/Removed") becomes `removedDate`, and
    // the old `Done/Removed` work status becomes `Material Removed`. Building
    // dates are now DERIVED from molds (autoAdvance recomputes on load), so the
    // stored building start/end are left as-is and reconciled at runtime.
    this.version(3)
      .stores({
        buildings: 'id, ownerId, status, updatedAt',
        molds: 'id, buildingId, order, workStatus, paymentStatus, [buildingId+order]',
        workers: 'id, active, type, name',
        owners: 'id, name',
        attendance:
          'id, workerId, buildingId, moldId, date, [workerId+date], [buildingId+date], [moldId+date]',
        syncedTransactions:
          'id, date, direction, subCategory, assignmentStatus, buildingId, moldId, workerId, importFingerprint',
        otherExpenseTypes: 'id, name',
        categoryMap: 'id, sourceName',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('molds')
          .toCollection()
          .modify((m: Record<string, unknown>) => {
            const endDate = typeof m.endDate === 'string' ? (m.endDate as string) : undefined
            if (m.workStatus === 'Done/Removed') {
              m.workStatus = 'Material Removed'
              if (endDate && m.removedDate == null) m.removedDate = endDate
            } else if (endDate && m.removedDate == null) {
              // Defensive: any other row carrying an endDate keeps it as removed.
              m.removedDate = endDate
            }
            delete m.endDate
          })
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
      db.categoryMap,
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
        db.categoryMap.clear(),
        db.settings.clear(),
      ])
    },
  )
}
