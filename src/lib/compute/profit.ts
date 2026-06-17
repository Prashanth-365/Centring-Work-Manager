// Layer B — profit (accrual, cost-based, §8B).
//   building margin = revenue (OwnerReceipts) − labour (from ATTENDANCE, not wages)
//   overhead (business-wide) = calculated food + Transport + Rent + Material + OtherExpense
//   total profit = Σ building margins − overhead
import type { WeekStart } from '../dates'
import type { Attendance, Mold, SyncedTransaction, Worker } from '../types'
import { foodForEntries, type FoodEntry } from './food'
import { wageOnDate } from './wage'

const sumAmt = (txns: SyncedTransaction[]) => txns.reduce((s, t) => s + t.amount, 0)

export function receiptsForBuilding(buildingId: string, txns: SyncedTransaction[]): number {
  return sumAmt(txns.filter((t) => t.subCategory === 'OwnerReceipt' && t.buildingId === buildingId))
}

export function receiptsForMold(moldId: string, txns: SyncedTransaction[]): number {
  return sumAmt(txns.filter((t) => t.subCategory === 'OwnerReceipt' && t.moldId === moldId))
}

/** Labour cost for a building from attendance (Σ dayFraction × wage effective on
 * that attendance's date, §7 — never from wage payments). */
export function buildingLabour(
  buildingId: string,
  attendance: Attendance[],
  workersById: Map<string, Worker>,
): number {
  return attendance
    .filter((a) => a.buildingId === buildingId)
    .reduce((s, a) => {
      const worker = workersById.get(a.workerId)
      return s + a.dayFraction * (worker ? wageOnDate(worker, a.date) : 0)
    }, 0)
}

export interface BuildingMargin {
  buildingId: string
  revenue: number
  labour: number
  margin: number
}

export function buildingMargin(
  buildingId: string,
  attendance: Attendance[],
  workersById: Map<string, Worker>,
  txns: SyncedTransaction[],
): BuildingMargin {
  const revenue = receiptsForBuilding(buildingId, txns)
  const labour = buildingLabour(buildingId, attendance, workersById)
  return { buildingId, revenue, labour, margin: revenue - labour }
}

export interface Overhead {
  food: number
  transport: number
  rent: number
  material: number
  other: number
  total: number
}

/**
 * Business-wide overhead over the given attendance + txns (already filtered to
 * the period of interest). Food is the single calculated figure across workers.
 */
export function overhead(
  workers: Worker[],
  attendance: Attendance[],
  txns: SyncedTransaction[],
  weekStartsOn: WeekStart,
): Overhead {
  const byWorker = new Map<string, Attendance[]>()
  for (const a of attendance) {
    const list = byWorker.get(a.workerId)
    if (list) list.push(a)
    else byWorker.set(a.workerId, [a])
  }
  let food = 0
  for (const w of workers) {
    food += foodForEntries(w, (byWorker.get(w.id) ?? []) as FoodEntry[], weekStartsOn)
  }
  const sub = (name: string) => sumAmt(txns.filter((t) => t.subCategory === name))
  const transport = sub('Transport')
  const rent = sub('Rent')
  const material = sub('Material')
  const other = sub('OtherExpense')
  return { food, transport, rent, material, other, total: food + transport + rent + material + other }
}

export function totalProfit(margins: BuildingMargin[], oh: Overhead): number {
  return margins.reduce((s, m) => s + m.margin, 0) - oh.total
}

// --- receivables -----------------------------------------------------------

export function moldOutstanding(mold: Mold, txns: SyncedTransaction[]): number {
  const received = receiptsForMold(mold.id, txns)
  return Math.max(0, (mold.billAmount ?? 0) - received)
}

/** A mold is an active receivable once billed and not fully paid. */
export function isReceivableMold(mold: Mold): boolean {
  return mold.paymentStatus === 'Billed' || mold.paymentStatus === 'Partly Paid'
}

export function buildingReceivable(molds: Mold[], txns: SyncedTransaction[]): number {
  return molds
    .filter(isReceivableMold)
    .reduce((s, m) => s + moldOutstanding(m, txns), 0)
}
