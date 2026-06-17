import {
  buildingLabour,
  buildingReceivable,
  isReceivableMold,
  moldOutstanding,
  receiptsForBuilding,
} from './compute/profit'
import type { Mold, SyncedTransaction, Worker } from './types'

export function byId<T extends { id: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const x of arr) m.set(x.id, x)
  return m
}

export function groupBy<T>(arr: T[], key: (t: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of arr) {
    const k = key(x)
    if (k == null) continue
    const list = m.get(k)
    if (list) list.push(x)
    else m.set(k, [x])
  }
  return m
}

/** The mold the meistri is "on": in-progress, else next not-started, else the last one. */
export function currentMold(molds: Mold[]): Mold | undefined {
  const sorted = [...molds].sort((a, b) => a.order - b.order)
  return (
    sorted.find((m) => m.workStatus === 'In Progress') ??
    sorted.find((m) => m.workStatus === 'Not Started') ??
    sorted[sorted.length - 1]
  )
}

export interface BuildingComputed {
  revenue: number
  labour: number
  margin: number
  receivable: number
  current?: Mold
  unpaidDoneAmount: number
}

export function computeBuilding(
  buildingId: string,
  molds: Mold[],
  attendance: Parameters<typeof buildingLabour>[1],
  workersById: Map<string, Worker>,
  txns: SyncedTransaction[],
): BuildingComputed {
  const revenue = receiptsForBuilding(buildingId, txns)
  const labour = buildingLabour(buildingId, attendance, workersById)
  const receivable = buildingReceivable(molds, txns)
  const unpaidDoneAmount = molds
    .filter((m) => m.workStatus === 'Done/Removed' && m.paymentStatus !== 'Paid')
    .reduce((s, m) => s + moldOutstanding(m, txns), 0)
  return { revenue, labour, margin: revenue - labour, receivable, current: currentMold(molds), unpaidDoneAmount }
}

export { isReceivableMold, moldOutstanding }
