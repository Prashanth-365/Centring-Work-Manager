// Layer A — worker balance (cash settlement, §8A).
//   owed   = Σ (dayFraction × dailyWage) + calculated food
//   paid   = Σ assigned txns with subCategory ∈ {Wage, Advance, Food}
//   balance = owed − paid   (>0 ⇒ I owe the worker; <0 ⇒ worker owes me)
// Transport & Rent assigned to a worker do NOT affect the balance (overhead).
import { BALANCE_SUBCATS } from '../constants'
import type { WeekStart } from '../dates'
import type { Attendance, SyncedTransaction, Worker } from '../types'
import { foodForEntries, type FoodEntry } from './food'
import { wageOnDate } from './wage'

export interface WorkerBalance {
  wage: number
  food: number
  owed: number
  paid: number
  balance: number
}

export function wageForEntries(worker: Worker, entries: Attendance[]): number {
  return entries.reduce((s, e) => s + e.dayFraction * wageOnDate(worker, e.date), 0)
}

/** Σ of Wage/Advance/Food transactions — the label is informational; all reduce balance. */
export function paidToWorker(txns: SyncedTransaction[]): number {
  return txns
    .filter((t) => BALANCE_SUBCATS.has(t.subCategory))
    .reduce((s, t) => s + t.amount, 0)
}

export function workerBalance(
  worker: Worker,
  entries: Attendance[],
  txns: SyncedTransaction[],
  weekStartsOn: WeekStart,
): WorkerBalance {
  const wage = wageForEntries(worker, entries)
  const food = foodForEntries(worker, entries as FoodEntry[], weekStartsOn)
  const owed = wage + food
  const paid = paidToWorker(txns)
  return { wage, food, owed, paid, balance: owed - paid }
}
