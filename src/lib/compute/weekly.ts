// Weekly payroll register (§9). Selectable Mon–Sun week with a totals row.
// The running cumulative balance is the source of truth; weekly buckets use the
// transaction date for "paid" and the attendance date for "owed".
import { BALANCE_SUBCATS } from '../constants'
import { dateInRange, parseDate, weekDays, weekRange, type WeekStart } from '../dates'
import type { Attendance, SyncedTransaction, Worker } from '../types'
import { foodForEntries } from './food'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function groupBy<T>(items: T[], key: (t: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    if (k == null) continue
    const list = m.get(k)
    if (list) list.push(it)
    else m.set(k, [it])
  }
  return m
}

export interface WeeklyRow {
  worker: Worker
  perDay: number[]
  totalDays: number
  wagePerDay: number
  totalWage: number
  food: number
  total: number
  paid: number
  current: number
  previousBalance: number
  finalBalance: number
  hasActivity: boolean
}

export interface WeeklyTotals {
  totalDays: number
  totalWage: number
  food: number
  total: number
  paid: number
  current: number
  previousBalance: number
  finalBalance: number
}

export interface WeeklySummary {
  weekStartIso: string
  days: string[]
  start: Date
  end: Date
  rows: WeeklyRow[]
  totals: WeeklyTotals
}

export function weeklySummary(
  workers: Worker[],
  attendance: Attendance[],
  txns: SyncedTransaction[],
  weekStartIso: string,
  weekStartsOn: WeekStart,
): WeeklySummary {
  const days = weekDays(weekStartIso, weekStartsOn)
  const { start, end } = weekRange(weekStartIso, weekStartsOn)

  const attByWorker = groupBy(attendance, (a) => a.workerId)
  const balanceTxns = txns.filter((t) => BALANCE_SUBCATS.has(t.subCategory) && t.workerId)
  const txByWorker = groupBy(balanceTxns, (t) => t.workerId)

  const rows: WeeklyRow[] = workers.map((worker) => {
    const allEntries = attByWorker.get(worker.id) ?? []
    const weekEntries = allEntries.filter((a) => dateInRange(a.date, start, end))
    const beforeEntries = allEntries.filter((a) => parseDate(a.date) < start)

    const perDay = days.map((d) =>
      sum(weekEntries.filter((a) => a.date === d).map((a) => a.dayFraction)),
    )
    const totalDays = sum(perDay)
    const totalWage = totalDays * worker.dailyWage
    const food = foodForEntries(worker, weekEntries, weekStartsOn)
    const total = totalWage + food

    const allTx = txByWorker.get(worker.id) ?? []
    const paid = sum(allTx.filter((t) => dateInRange(t.date, start, end)).map((t) => t.amount))
    const current = total - paid

    const wageBefore = sum(beforeEntries.map((a) => a.dayFraction)) * worker.dailyWage
    const foodBefore = foodForEntries(worker, beforeEntries, weekStartsOn)
    const paidBefore = sum(allTx.filter((t) => parseDate(t.date) < start).map((t) => t.amount))
    const previousBalance = wageBefore + foodBefore - paidBefore
    const finalBalance = previousBalance + current

    return {
      worker,
      perDay,
      totalDays,
      wagePerDay: worker.dailyWage,
      totalWage,
      food,
      total,
      paid,
      current,
      previousBalance,
      finalBalance,
      hasActivity: weekEntries.length > 0 || paid !== 0 || Math.abs(previousBalance) > 0.001,
    }
  })

  const totals = rows.reduce<WeeklyTotals>(
    (acc, r) => ({
      totalDays: acc.totalDays + r.totalDays,
      totalWage: acc.totalWage + r.totalWage,
      food: acc.food + r.food,
      total: acc.total + r.total,
      paid: acc.paid + r.paid,
      current: acc.current + r.current,
      previousBalance: acc.previousBalance + r.previousBalance,
      finalBalance: acc.finalBalance + r.finalBalance,
    }),
    {
      totalDays: 0,
      totalWage: 0,
      food: 0,
      total: 0,
      paid: 0,
      current: 0,
      previousBalance: 0,
      finalBalance: 0,
    },
  )

  return { weekStartIso, days, start, end, rows, totals }
}
