import type { Table } from 'dexie'
import { db } from './db'
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
import { DEFAULTS } from './constants'

function slugCode(name: string, fallback = 'X'): string {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean)
  let base: string
  if (words.length >= 2) base = words.map((w) => w[0]).join('').slice(0, 4)
  else base = (words[0] ?? '').replace(/[^A-Z0-9]/g, '').slice(0, 4)
  return base || fallback
}

async function uniqueCode(table: Table<{ code: string }, string>, base: string): Promise<string> {
  let code = base
  let i = 1
  // eslint-disable-next-line no-await-in-loop
  while ((await table.where('code').equals(code).count()) > 0) {
    i += 1
    code = `${base}${i}`
  }
  return code
}

// --- Buildings -------------------------------------------------------------

export async function createBuilding(data: Partial<Building> & { name: string }): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  const code = data.code?.trim() || (await uniqueCode(db.buildings, slugCode(data.name, 'BLDG')))
  await db.buildings.add({
    status: 'Yet to Start',
    ...data,
    id,
    code,
    name: data.name.trim(),
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

export async function quickCreateBuilding(name: string): Promise<string> {
  return createBuilding({ name, status: 'In Progress' })
}

// --- Molds -----------------------------------------------------------------

export async function nextMoldOrder(buildingId: string): Promise<number> {
  const molds = await db.molds.where('buildingId').equals(buildingId).toArray()
  return molds.reduce((m, x) => Math.max(m, x.order), 0) + 1
}

export async function createMold(data: Partial<Mold> & { buildingId: string; floorName: string }): Promise<string> {
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
  return id
}

export async function updateMold(id: string, patch: Partial<Mold>): Promise<void> {
  await db.molds.update(id, { ...patch, updatedAt: now() })
}

export async function deleteMold(id: string): Promise<void> {
  await db.transaction('rw', db.molds, db.attendance, async () => {
    await db.attendance.where('moldId').equals(id).modify({ moldId: undefined })
    await db.molds.delete(id)
  })
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

export async function createWorker(data: Partial<Worker> & { name: string }): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
  const s = await settingsOrDefault()
  const code = data.code?.trim() || (await uniqueCode(db.workers, slugCode(data.name, 'WKR')))
  await db.workers.add({
    type: 'Helper',
    dailyWage: 0,
    active: true,
    foodMode: 'meal',
    foodBreakfast: s.defaultFoodBreakfast,
    foodLunch: s.defaultFoodLunch,
    foodPerDay: s.defaultFoodPerDay,
    foodPerWeek: s.defaultFoodPerWeek,
    maxDaysPerWeek: s.defaultMaxDaysPerWeek,
    ...data,
    id,
    code,
    name: data.name.trim(),
    createdAt: ts,
    updatedAt: ts,
  } as Worker)
  return id
}

export async function updateWorker(id: string, patch: Partial<Worker>): Promise<void> {
  await db.workers.update(id, { ...patch, updatedAt: now() })
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
  const code = data.code?.trim() || (await uniqueCode(db.owners, slugCode(data.name, 'OWN')))
  await db.owners.add({
    ...data,
    id,
    code,
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

export async function createAttendance(
  data: Partial<Attendance> & { workerId: string; buildingId: string; date: string },
): Promise<string> {
  const id = data.id ?? uuid()
  const ts = now()
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
