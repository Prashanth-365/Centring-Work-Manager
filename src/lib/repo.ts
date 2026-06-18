import { db } from './db'
import { now, uuid } from './ids'
import { todayISO } from './dates'
import { withWage } from './compute/wage'
import { runAutoAdvance } from './autoAdvance'
import type {
  Attendance,
  Building,
  CategoryMap,
  Mold,
  OtherExpenseType,
  Owner,
  Settings,
  SubCategory,
  SyncedTransaction,
  Worker,
} from './types'
import { DEFAULTS, normalizeCategoryName } from './constants'

// --- Buildings -------------------------------------------------------------
// Buildings have no stored name or code — the name is derived live from the
// owner + location (see buildingName() in select.ts).

export async function createBuilding(data: Partial<Building> = {}): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  await db.buildings.add({
    status: 'Yet to Start',
    ...data,
    id,
    createdAt: ts,
    updatedAt: ts,
  } as Building)
  return id
}

export async function updateBuilding(id: string, patch: Partial<Building>): Promise<void> {
  await db.buildings.update(id, { ...patch, updatedAt: now() })
}

export async function deleteBuilding(id: string): Promise<void> {
  await db.transaction('rw', db.buildings, db.molds, db.attendance, async () => {
    await db.molds.where('buildingId').equals(id).delete()
    await db.attendance.where('buildingId').equals(id).delete()
    await db.buildings.delete(id)
  })
}

// --- Molds -----------------------------------------------------------------

export async function nextMoldOrder(buildingId: string): Promise<number> {
  const molds = await db.molds.where('buildingId').equals(buildingId).toArray()
  return molds.reduce((m, x) => Math.max(m, x.order), 0) + 1
}

export async function createMold(
  data: Partial<Mold> & { buildingId: string; floorName: string },
): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  const order = data.order ?? (await nextMoldOrder(data.buildingId))
  await db.molds.add({
    workStatus: 'Not Started',
    paymentStatus: 'Not Billed',
    ...data,
    id,
    order,
    floorName: data.floorName.trim(),
    createdAt: ts,
    updatedAt: ts,
  } as Mold)
  await runAutoAdvance() // roll up building status + derived dates from molds
  return id
}

export async function updateMold(id: string, patch: Partial<Mold>): Promise<void> {
  await db.molds.update(id, { ...patch, updatedAt: now() })
  await runAutoAdvance() // roll up building status + derived dates from molds
}

export async function deleteMold(id: string): Promise<void> {
  await db.transaction('rw', db.molds, db.attendance, async () => {
    await db.attendance.where('moldId').equals(id).modify({ moldId: undefined })
    await db.molds.delete(id)
  })
  await runAutoAdvance() // roll up building status + derived dates from molds
}

// --- Workers ---------------------------------------------------------------

async function settingsOrDefault(): Promise<Settings> {
  const s = await db.settings.get('app')
  return (
    s ?? {
      id: 'app',
      shiftBlocks: [],
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
  )
}

/** Create a worker. Accepts an optional starting `dailyWage` (+ `effectiveFrom`,
 * defaulting to today) which seeds `wageHistory`; or pass `wageHistory` directly. */
export async function createWorker(
  data: Partial<Worker> & { name: string; dailyWage?: number; effectiveFrom?: string },
): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  const s = await settingsOrDefault()
  const { dailyWage, effectiveFrom, wageHistory, ...rest } = data
  const history =
    wageHistory && wageHistory.length
      ? [...wageHistory].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
      : [{ effectiveFrom: effectiveFrom || todayISO(), dailyWage: dailyWage ?? 0 }]
  await db.workers.add({
    type: 'Helper',
    active: true,
    foodMode: 'meal',
    foodBreakfast: s.defaultFoodBreakfast,
    foodLunch: s.defaultFoodLunch,
    foodPerDay: s.defaultFoodPerDay,
    foodPerWeek: s.defaultFoodPerWeek,
    maxDaysPerWeek: s.defaultMaxDaysPerWeek,
    ...rest,
    wageHistory: history,
    id,
    name: data.name.trim(),
    createdAt: ts,
    updatedAt: ts,
  } as Worker)
  return id
}

export async function updateWorker(id: string, patch: Partial<Worker>): Promise<void> {
  await db.workers.update(id, { ...patch, updatedAt: now() })
}

/** Append (or correct, if same date) a wage rate — never overwrites past rates (§7). */
export async function setWorkerWage(
  id: string,
  dailyWage: number,
  effectiveFrom: string = todayISO(),
): Promise<void> {
  const worker = await db.workers.get(id)
  if (!worker) return
  await db.workers.update(id, {
    wageHistory: withWage(worker, dailyWage, effectiveFrom),
    updatedAt: now(),
  })
}

/**
 * Edit a wage entry: change its effectiveFrom and/or dailyWage. The original is
 * removed and the new values are re-applied via withWage (so a moved date that
 * lands on an existing one merges cleanly). Wages are looked up live per
 * attendance date (§7), so this automatically recomputes affected attendance.
 */
export async function editWorkerWage(
  id: string,
  originalEffectiveFrom: string,
  dailyWage: number,
  effectiveFrom: string,
): Promise<void> {
  const worker = await db.workers.get(id)
  if (!worker) return
  const without = {
    ...worker,
    wageHistory: (worker.wageHistory ?? []).filter((e) => e.effectiveFrom !== originalEffectiveFrom),
  }
  await db.workers.update(id, {
    wageHistory: withWage(without, dailyWage, effectiveFrom),
    updatedAt: now(),
  })
}

/**
 * Delete a wage entry by its effectiveFrom date. Wages are looked up live per
 * attendance date (§7), so removing a rate recomputes affected attendance.
 */
export async function removeWorkerWage(id: string, effectiveFrom: string): Promise<void> {
  const worker = await db.workers.get(id)
  if (!worker) return
  await db.workers.update(id, {
    wageHistory: (worker.wageHistory ?? []).filter((e) => e.effectiveFrom !== effectiveFrom),
    updatedAt: now(),
  })
}

export async function deleteWorker(id: string): Promise<void> {
  await db.workers.delete(id)
}

export async function quickCreateWorker(name: string): Promise<string> {
  return createWorker({ name })
}

// --- Owners ----------------------------------------------------------------

export async function createOwner(data: Partial<Owner> & { name: string }): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  await db.owners.add({
    ...data,
    id,
    name: data.name.trim(),
    createdAt: ts,
    updatedAt: ts,
  } as Owner)
  return id
}

export async function updateOwner(id: string, patch: Partial<Owner>): Promise<void> {
  await db.owners.update(id, { ...patch, updatedAt: now() })
}

export async function deleteOwner(id: string): Promise<void> {
  await db.owners.delete(id)
}

export async function quickCreateOwner(name: string): Promise<string> {
  return createOwner({ name })
}

// --- Attendance ------------------------------------------------------------

/**
 * Blocks already worked by this worker on this date on OTHER lines. A worker
 * cannot have the same block twice on a day (§3), so a new/edited line's blocks
 * must not intersect these.
 */
export async function blocksTakenOnDay(
  workerId: string,
  date: string,
  excludeId?: string,
): Promise<Set<number>> {
  const sameDay = await db.attendance.where('[workerId+date]').equals([workerId, date]).toArray()
  const taken = new Set<number>()
  for (const a of sameDay) {
    if (a.id === excludeId) continue
    for (const b of a.blocks) taken.add(b)
  }
  return taken
}

async function assertNoBlockClash(
  workerId: string,
  date: string,
  blocks: number[],
  excludeId?: string,
): Promise<void> {
  const taken = await blocksTakenOnDay(workerId, date, excludeId)
  const clash = blocks.filter((b) => taken.has(b))
  if (clash.length) {
    throw new Error(
      `Block ${clash.join(', ')} already recorded for this worker on ${date}. Each block can only be worked once a day.`,
    )
  }
}

export async function createAttendance(
  data: Partial<Attendance> & { workerId: string; buildingId: string; date: string },
): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  const blocks = data.blocks ?? []
  await assertNoBlockClash(data.workerId, data.date, blocks)
  await db.attendance.add({
    blocks: [],
    dayFraction: 0,
    ...data,
    id,
    createdAt: ts,
    updatedAt: ts,
  } as Attendance)
  return id
}

export async function updateAttendance(id: string, patch: Partial<Attendance>): Promise<void> {
  if (patch.blocks) {
    const existing = await db.attendance.get(id)
    if (existing) {
      await assertNoBlockClash(
        patch.workerId ?? existing.workerId,
        patch.date ?? existing.date,
        patch.blocks,
        id,
      )
    }
  }
  await db.attendance.update(id, { ...patch, updatedAt: now() })
}

export async function deleteAttendance(id: string): Promise<void> {
  await db.attendance.delete(id)
}

// --- Other expense types ---------------------------------------------------

export async function createOtherExpenseType(name: string): Promise<string> {
  const existing = await db.otherExpenseTypes
    .filter((t) => t.name.toLowerCase() === name.trim().toLowerCase())
    .first()
  if (existing) return existing.id
  const id = uuid()
  await db.otherExpenseTypes.add({ id, name: name.trim() } as OtherExpenseType)
  return id
}

// --- Category mapping (txn sub-category name → our type, §8) ----------------

/** Persist (insert or update) a mapping for a source sub-category name. */
export async function setCategoryMap(sourceName: string, type: SubCategory): Promise<void> {
  const norm = normalizeCategoryName(sourceName)
  const existing = await db.categoryMap
    .filter((c) => normalizeCategoryName(c.sourceName) === norm)
    .first()
  if (existing) {
    await db.categoryMap.update(existing.id, { type, sourceName })
  } else {
    await db.categoryMap.add({ id: uuid(), sourceName, type } as CategoryMap)
  }
}

/** The user-saved type for a source name, if any (normalized match). */
export async function getCategoryMap(sourceName: string): Promise<SubCategory | undefined> {
  const norm = normalizeCategoryName(sourceName)
  const hit = await db.categoryMap.filter((c) => normalizeCategoryName(c.sourceName) === norm).first()
  return hit?.type
}

// --- Transaction assignment ------------------------------------------------

export async function assignTransaction(
  id: string,
  patch: Partial<SyncedTransaction>,
): Promise<void> {
  await db.syncedTransactions.update(id, {
    ...patch,
    assignmentStatus: 'assigned',
    updatedAt: now(),
  })
}

export async function unassignTransaction(id: string): Promise<void> {
  await db.syncedTransactions.update(id, {
    assignmentStatus: 'unassigned',
    buildingId: undefined,
    moldId: undefined,
    workerId: undefined,
    materialDescription: undefined,
    otherExpenseType: undefined,
    updatedAt: now(),
  })
}

// --- Settings --------------------------------------------------------------

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.update('app', { ...patch, updatedAt: now() })
}
