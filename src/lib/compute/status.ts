// Status ↔ date engine (§4). Status and dates stay in sync BOTH directions and
// statuses auto-advance as real dates arrive. All dates are 'yyyy-MM-dd', so
// lexicographic string comparison against `today` gives past/today/future.
//
// These are PURE functions — the runtime side (writing changed rows on app load
// and at midnight) lives in autoAdvance.ts.
import { todayISO } from '../dates'
import type {
  Building,
  BuildingStatus,
  Mold,
  MoldPaymentStatus,
  MoldWorkStatus,
} from '../types'

type DatePair = { startDate?: string; endDate?: string }

/**
 * Date → building status. Returns null when the building is in a MANUAL state
 * (On Hold / Closed) that should win over date derivation.
 */
export function deriveBuildingStatus(
  building: Pick<Building, 'status' | 'startDate' | 'endDate'>,
  today: string = todayISO(),
): BuildingStatus | null {
  if (building.status === 'On Hold' || building.status === 'Closed') return null
  const { startDate, endDate } = building
  if (endDate && endDate <= today) return 'Completed'
  if (startDate && startDate <= today && (!endDate || endDate > today)) return 'In Progress'
  return 'Yet to Start'
}

/**
 * Date → mold work status (same logic, mold's own dates). Done/Removed and the
 * other states are all date-derived; there is no manual freeze for molds.
 */
export function deriveMoldWorkStatus(
  mold: Pick<Mold, 'startDate' | 'endDate'>,
  today: string = todayISO(),
): MoldWorkStatus {
  const { startDate, endDate } = mold
  if (endDate && endDate <= today) return 'Done/Removed'
  if (startDate && startDate <= today && (!endDate || endDate > today)) return 'In Progress'
  return 'Not Started'
}

/**
 * Bill + received → mold payment status (NOT date-driven, §4):
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

/** A building auto-Closes when work is Completed AND every mold is Paid (§4). */
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

/**
 * Status → date (§4). When the USER picks a status, return the date patch to
 * apply. On Hold keeps dates untouched (freeze); the caller writes the status.
 */
export function datesForStatusChange(
  next: BuildingStatus,
  current: DatePair,
  today: string = todayISO(),
): DatePair {
  switch (next) {
    case 'In Progress': {
      const patch: DatePair = {}
      if (!current.startDate) patch.startDate = today
      if (current.endDate && current.endDate <= today) patch.endDate = undefined // re-open
      return patch
    }
    case 'Completed':
      return current.endDate ? {} : { endDate: today }
    case 'Closed':
      return current.endDate ? {} : { endDate: today }
    case 'Yet to Start':
      return { startDate: undefined }
    case 'On Hold':
    default:
      return {}
  }
}

/** Status → date for a mold work-status change (mirror of the building rules). */
export function moldDatesForStatusChange(
  next: MoldWorkStatus,
  current: DatePair,
  today: string = todayISO(),
): DatePair {
  switch (next) {
    case 'In Progress': {
      const patch: DatePair = {}
      if (!current.startDate) patch.startDate = today
      if (current.endDate && current.endDate <= today) patch.endDate = undefined
      return patch
    }
    case 'Done/Removed':
      return current.endDate ? {} : { endDate: today }
    case 'Not Started':
      return { startDate: undefined, endDate: undefined }
    default:
      return {}
  }
}
