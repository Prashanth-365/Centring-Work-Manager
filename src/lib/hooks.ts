import { useLiveQuery } from 'dexie-react-hooks'
import { db, defaultSettings } from './db'
import type { SubCategory } from './types'

export function useSettings() {
  return useLiveQuery(
    async () => (await db.settings.get('app')) ?? defaultSettings(),
    [],
    defaultSettings(),
  )
}

// Buildings have no stored name to sort on (it's derived) — order by recent
// activity; screens that need name order sort in-memory via buildingName().
export function useBuildings() {
  return useLiveQuery(() => db.buildings.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useBuilding(id?: string) {
  return useLiveQuery(() => (id ? db.buildings.get(id) : undefined), [id])
}

export function useMolds(buildingId?: string) {
  return useLiveQuery(
    () =>
      buildingId
        ? db.molds.where('buildingId').equals(buildingId).sortBy('order')
        : db.molds.orderBy('order').toArray(),
    [buildingId],
    [],
  )
}

export function useAllMolds() {
  return useLiveQuery(() => db.molds.toArray(), [], [])
}

export function useMold(id?: string) {
  return useLiveQuery(() => (id ? db.molds.get(id) : undefined), [id])
}

export function useWorkers(activeOnly = false) {
  return useLiveQuery(
    async () => {
      const all = await db.workers.orderBy('name').toArray()
      return activeOnly ? all.filter((w) => w.active) : all
    },
    [activeOnly],
    [],
  )
}

export function useWorker(id?: string) {
  return useLiveQuery(() => (id ? db.workers.get(id) : undefined), [id])
}

export function useOwners() {
  return useLiveQuery(() => db.owners.orderBy('name').toArray(), [], [])
}

export function useOwner(id?: string) {
  return useLiveQuery(() => (id ? db.owners.get(id) : undefined), [id])
}

export function useAttendance() {
  return useLiveQuery(() => db.attendance.orderBy('date').reverse().toArray(), [], [])
}

export function useAttendanceForBuilding(buildingId?: string) {
  return useLiveQuery(
    () => (buildingId ? db.attendance.where('buildingId').equals(buildingId).toArray() : []),
    [buildingId],
    [],
  )
}

export function useAttendanceForWorker(workerId?: string) {
  return useLiveQuery(
    () => (workerId ? db.attendance.where('workerId').equals(workerId).reverse().sortBy('date') : []),
    [workerId],
    [],
  )
}

export function useAllAttendance() {
  return useLiveQuery(() => db.attendance.toArray(), [], [])
}

export function useTransactions() {
  return useLiveQuery(() => db.syncedTransactions.orderBy('date').reverse().toArray(), [], [])
}

export function useReviewQueue() {
  return useLiveQuery(
    () =>
      db.syncedTransactions
        .where('assignmentStatus')
        .anyOf('unassigned', 'needsReview')
        .toArray(),
    [],
    [],
  )
}

export function useTransactionsForWorker(workerId?: string) {
  return useLiveQuery(
    () => (workerId ? db.syncedTransactions.where('workerId').equals(workerId).toArray() : []),
    [workerId],
    [],
  )
}

export function useTransactionsForBuilding(buildingId?: string) {
  return useLiveQuery(
    () => (buildingId ? db.syncedTransactions.where('buildingId').equals(buildingId).toArray() : []),
    [buildingId],
    [],
  )
}

export function useOtherExpenseTypes() {
  return useLiveQuery(() => db.otherExpenseTypes.orderBy('name').toArray(), [], [])
}

export function useCategoryMap() {
  return useLiveQuery(() => db.categoryMap.orderBy('sourceName').toArray(), [], [])
}

export function useReviewCount() {
  return useLiveQuery(
    () => db.syncedTransactions.where('assignmentStatus').anyOf('unassigned', 'needsReview').count(),
    [],
    0,
  )
}

/** All transactions of a given subCategory (assigned). */
export function useAssignedBySubcategory(sub: SubCategory) {
  return useLiveQuery(
    () => db.syncedTransactions.where('subCategory').equals(sub).toArray(),
    [sub],
    [],
  )
}
