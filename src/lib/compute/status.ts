// Status ↔ date engine. Status and dates stay in sync BOTH directions and
// statuses auto-advance as real dates arrive. All dates are 'yyyy-MM-dd', so
// lexicographic string comparison against `today` gives past/today/future.
//
// Mold work is a 4-state lifecycle driven by three dates:
//   Not Started → In Progress → Completed → Material Removed
//     startDate (work began) · completedDate (cast) · removedDate (de-shuttered)
//
// Building status + dates are DERIVED (rolled up) from a building's molds, with
// manual Completed / Closed (terminal) and On Hold (pause) overrides.
//
// These are PURE functions — the runtime side (writing changed rows on edit, on
// app load, and at midnight) lives in autoAdvance.ts.
import { todayISO } from '../dates'
import type { BuildingStatus, Mold, MoldPaymentStatus, MoldWorkStatus } from '../types'

/** A patch over a mold's three lifecycle dates (undefined clears a date). */
export type MoldDatePatch = {
  startDate?: string
  completedDate?: string
  removedDate?: string
}

// ---------------------------------------------------------------------------
// Mold work status
// ---------------------------------------------------------------------------

/**
 * Date → mold work status. Checked most-advanced first:
 *   removedDate ≤ today → Material Removed
 *   completedDate ≤ today → Completed
 *   startDate ≤ today → In Progress
 *   otherwise → Not Started
 */
export function deriveMoldWorkStatus(
  mold: Pick<Mold, 'startDate' | 'completedDate' | 'removedDate'>,
  today: string = todayISO(),
): MoldWorkStatus {
  const { startDate, completedDate, removedDate } = mold
  if (removedDate && removedDate <= today) return 'Material Removed'
  if (completedDate && completedDate <= today) return 'Completed'
  if (startDate && startDate <= today) return 'In Progress'
  return 'Not Started'
}

/**
 * Status → mold dates (when the USER picks a status). Sets the matching date to
 * today if empty; Not Started clears all three. Other dates are left untouched.
 */
export function moldDatesForStatusChange(
  next: MoldWorkStatus,
  current: MoldDatePatch,
  today: string = todayISO(),
): MoldDatePatch {
  switch (next) {
    case 'In Progress':
      return current.startDate ? {} : { startDate: today }
    case 'Completed':
      return current.completedDate ? {} : { completedDate: today }
    case 'Material Removed':
      return current.removedDate ? {} : { removedDate: today }
    case 'Not Started':
      return { startDate: undefined, completedDate: undefined, removedDate: undefined }
    default:
      return {}
  }
}

/**
 * Attendance-driven auto-start. When a mold has attendance recorded but no
 * `startDate` yet, work began on the EARLIEST attendance date — return it so the
 * caller can stamp `startDate` and the mold flips Not Started → In Progress
 * (the building roll-up + derived building start date then follow). Returns null
 * when nothing should change (a `startDate` is already set, or no attendance).
 */
export function moldStartFromAttendance(
  mold: Pick<Mold, 'startDate'>,
  attendanceDates: readonly string[],
): string | null {
  if (mold.startDate) return null
  const dates = attendanceDates.filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest))
}

/**
 * Bill + received → mold payment status (independent of work status):
 *   no billAmount → Not Billed; received 0 → Billed; received < bill → Partly
 *   Paid; received ≥ bill → Paid.
 */
export function deriveMoldPaymentStatus(
  mold: Pick<Mold, 'billAmount'>,
  received: number,
): MoldPaymentStatus {
  const bill = mold.billAmount ?? 0
  if (!bill) return 'Not Billed'
  if (received <= 0) return 'Billed'
  if (received < bill) return 'Partly Paid'
  return 'Paid'
}

// ---------------------------------------------------------------------------
// Building status + dates (derived from molds)
// ---------------------------------------------------------------------------

/**
 * Pure roll-up of a building's molds into one of the three derived states:
 *   no molds / all Not Started → Yet to Start
 *   any mold In Progress → In Progress
 *   at least one started but none In Progress → On Hold
 */
export function buildingRollupStatus(
  molds: Pick<Mold, 'startDate' | 'completedDate' | 'removedDate'>[],
  today: string = todayISO(),
): Extract<BuildingStatus, 'Yet to Start' | 'In Progress' | 'On Hold'> {
  const work = molds.map((m) => deriveMoldWorkStatus(m, today))
  if (work.length === 0 || work.every((w) => w === 'Not Started')) return 'Yet to Start'
  if (work.some((w) => w === 'In Progress')) return 'In Progress'
  return 'On Hold'
}

/**
 * The building status after a roll-up recompute, or null when nothing should
 * change. Completed / Closed are terminal (manual) and never auto-changed. A
 * manual On Hold pause is preserved unless a mold is now In Progress.
 */
export function nextBuildingStatus(
  current: BuildingStatus,
  molds: Pick<Mold, 'startDate' | 'completedDate' | 'removedDate'>[],
  today: string = todayISO(),
): BuildingStatus | null {
  if (current === 'Completed' || current === 'Closed') return null
  const roll = buildingRollupStatus(molds, today)
  if (current === 'On Hold') return roll === 'In Progress' ? 'In Progress' : null
  return roll === current ? null : roll
}

/**
 * Derived building dates (read-only) from its molds:
 *   startDate = the earliest mold startDate (first mold to start).
 *   endDate   = the latest mold removedDate, only once EVERY mold is Material
 *               Removed; otherwise undefined. (A manual Completed building's
 *               endDate is set to today separately — see buildingDatesForStatusChange.)
 */
export function deriveBuildingDates(
  molds: Pick<Mold, 'startDate' | 'completedDate' | 'removedDate'>[],
  today: string = todayISO(),
): { startDate?: string; endDate?: string } {
  const starts = molds.map((m) => m.startDate).filter((d): d is string => !!d)
  const startDate = starts.length ? starts.reduce((a, b) => (b < a ? b : a)) : undefined

  const allRemoved =
    molds.length > 0 && molds.every((m) => deriveMoldWorkStatus(m, today) === 'Material Removed')
  let endDate: string | undefined
  if (allRemoved) {
    const removed = molds.map((m) => m.removedDate).filter((d): d is string => !!d)
    endDate = removed.length ? removed.reduce((a, b) => (b > a ? b : a)) : undefined
  }
  return { startDate, endDate }
}

/**
 * Status → building dates (when the USER picks a status). Manually marking a
 * building Completed/Closed stamps endDate = today if not already set; the
 * other states leave dates to the mold roll-up.
 */
export function buildingDatesForStatusChange(
  next: BuildingStatus,
  current: { endDate?: string },
  today: string = todayISO(),
): { endDate?: string } {
  switch (next) {
    case 'Completed':
    case 'Closed':
      return current.endDate ? {} : { endDate: today }
    default:
      return {}
  }
}

/** A building auto-Closes when work is Completed AND every mold is Paid. */
export function shouldAutoClose(
  buildingStatus: BuildingStatus,
  molds: Pick<Mold, 'paymentStatus'>[],
): boolean {
  return (
    buildingStatus === 'Completed' &&
    molds.length > 0 &&
    molds.every((m) => m.paymentStatus === 'Paid')
  )
}

