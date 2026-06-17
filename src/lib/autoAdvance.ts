// Status auto-advance runtime. Re-runs the pure status↔date derivation
// (compute/status.ts) and writes back any row whose real dates have moved it on
// — on app load, when the app returns to the foreground, and at local midnight.
// Idempotent: when nothing has changed it writes nothing.
import {
  deriveBuildingDates,
  deriveMoldPaymentStatus,
  deriveMoldWorkStatus,
  nextBuildingStatus,
  shouldAutoClose,
} from './compute/status'
import { receiptsForMold } from './compute/profit'
import { todayISO } from './dates'
import { db } from './db'
import { now } from './ids'
import type { Building, Mold } from './types'

/** Recompute mold work/payment status and building status + dates; persist diffs. */
export async function runAutoAdvance(today: string = todayISO()): Promise<void> {
  const [buildings, molds, receipts] = await Promise.all([
    db.buildings.toArray(),
    db.molds.toArray(),
    db.syncedTransactions.where('subCategory').equals('OwnerReceipt').toArray(),
  ])

  await db.transaction('rw', db.buildings, db.molds, async () => {
    // Molds first so building roll-up + auto-close see fresh statuses.
    for (const m of molds) {
      const received = receiptsForMold(m.id, receipts)
      const workStatus = deriveMoldWorkStatus(m, today)
      const paymentStatus = deriveMoldPaymentStatus(m, received)
      const patch: Partial<Mold> = {}
      if (workStatus !== m.workStatus) patch.workStatus = workStatus
      if (paymentStatus !== m.paymentStatus) patch.paymentStatus = paymentStatus
      if (Object.keys(patch).length) {
        await db.molds.update(m.id, { ...patch, updatedAt: now() })
        m.workStatus = workStatus // reflect locally for the roll-up below
        m.paymentStatus = paymentStatus
      }
    }

    for (const b of buildings) {
      const buildingMolds = molds.filter((m) => m.buildingId === b.id)
      const patch: Partial<Building> = {}

      // Building status roll-up (manual Completed/Closed/On-Hold handled inside).
      const rolled = nextBuildingStatus(b.status, buildingMolds, today)
      let status = rolled ?? b.status
      if (shouldAutoClose(status, buildingMolds)) status = 'Closed'
      if (status !== b.status) patch.status = status

      // Derived dates: startDate from molds always; endDate from molds once all
      // are Material Removed, except a manual Completed/Closed building keeps the
      // endDate stamped when the user marked it (today at that time).
      const { startDate, endDate } = deriveBuildingDates(buildingMolds, today)
      if (startDate !== b.startDate) patch.startDate = startDate
      const manualEnd = status === 'Completed' || status === 'Closed'
      const nextEnd = manualEnd ? (b.endDate ?? endDate ?? today) : endDate
      if (nextEnd !== b.endDate) patch.endDate = nextEnd

      if (Object.keys(patch).length) {
        await db.buildings.update(b.id, { ...patch, updatedAt: now() })
      }
    }
  })
}

function msUntilNextMidnight(): number {
  const nowDate = new Date()
  const next = new Date(nowDate)
  next.setHours(24, 0, 5, 0) // 5s past midnight to be safely on the new day
  return Math.max(1000, next.getTime() - nowDate.getTime())
}

/**
 * Run auto-advance immediately, then again at each local midnight and whenever
 * the app returns to the foreground. Returns a cleanup function.
 */
export function startDailyAutoAdvance(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false

  const run = () => {
    void runAutoAdvance()
  }

  const schedule = () => {
    if (cancelled) return
    timer = setTimeout(() => {
      run()
      schedule()
    }, msUntilNextMidnight())
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }

  run()
  schedule()
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
