// Effective-dated wage lookup (§7). A worker's pay is a history of
// { effectiveFrom, dailyWage } entries; the rate for a given date is the entry
// with the greatest effectiveFrom <= that date. Raising the wage appends a new
// entry, so the cost of past attendance never changes.
import type { WageEntry, Worker } from '../types'

/** Entries sorted ascending by effectiveFrom (defensive — callers may not sort). */
function sortedHistory(worker: Worker): WageEntry[] {
  return [...(worker.wageHistory ?? [])].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  )
}

/**
 * The daily wage effective on `dateIso`. If the date precedes the first entry
 * we fall back to that earliest rate (work logged before any explicit rate
 * still costs *something* sensible rather than 0). No history ⇒ 0.
 */
export function wageOnDate(worker: Worker, dateIso: string): number {
  const hist = sortedHistory(worker)
  if (hist.length === 0) return 0
  let rate = hist[0].dailyWage
  for (const entry of hist) {
    if (entry.effectiveFrom <= dateIso) rate = entry.dailyWage
    else break
  }
  return rate
}

/** The current (latest) daily wage — what the profile shows. */
export function currentWage(worker: Worker): number {
  const hist = sortedHistory(worker)
  return hist.length ? hist[hist.length - 1].dailyWage : 0
}

/** Append/replace a wage entry, returning a fresh sorted history. An entry on
 * the same effectiveFrom date overwrites (you can correct a mistyped rate). */
export function withWage(worker: Worker, dailyWage: number, effectiveFrom: string): WageEntry[] {
  const rest = (worker.wageHistory ?? []).filter((e) => e.effectiveFrom !== effectiveFrom)
  return [...rest, { effectiveFrom, dailyWage }].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  )
}
