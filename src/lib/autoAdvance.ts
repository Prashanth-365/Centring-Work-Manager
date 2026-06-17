// Status auto-advance runtime (§4). Re-runs the pure status↔date derivation
// (compute/status.ts) and writes back any row whose real dates have moved it on
// — on app load, when the app returns to the foreground, and at local midnight.
// Idempotent: when nothing has changed it writes nothing.
import {
  deriveBuildingStatus,
  deriveMoldPaymentStatus,
  deriveMoldWorkStatus,
  shouldAutoClose,
} from './compute/status'
import { receiptsForMold } from './compute/profit'
import { todayISO } from './dates'
import { db } from './db'
import { now } from './ids'
import type { BuildingStatus, Mold } from './types'

/** Recompute mold work/payment status and building status; persist diffs. */
export async function runAutoAdvance(today: string = todayISO()): Promise<void> {
  const [buildings, molds, receipts] = await Promise.all([
    db.buildings.toArray(),
    db.molds.toArray(),
    db.syncedTransactions.where('subCategory').equals('OwnerReceipt').toArray(),
  ])

  await db.transaction('rw', db.buildings, db.molds, async () => {
    // Molds first so building auto-close sees fresh payment statuses.
    for (const m of molds) {
      const received = receiptsForMold(m.id, receipts)
      const workStatus = deriveMoldWorkStatus(m, today)
      const paymentStatus = deriveMoldPaymentStatus(m, received)
      const patch: Partial<Mold> = {}
      if (workStatus !== m.workStatus) patch.workStatus = workStatus
      if (paymentStatus !== m.paymentStatus) patch.paymentStatus = paymentStatus
      if (Object.keys(patch).length) {
        await db.molds.update(m.id, { ...patch, updatedAt: now() })
        m.workStatus = workStatus // reflect locally for the auto-close check below
        m.paymentStatus = paymentStatus
      }
    }

    for (const b of buildings) {
      const derived = deriveBuildingStatus(b, today)
      if (derived == null) continue // On Hold / Closed are manual — they win.
      const buildingMolds = molds.filter((m) => m.buildingId === b.id)
      const next: BuildingStatus = shouldAutoClose(derived, buildingMolds) ? 'Closed' : derived
      if (next !== b.status) await db.buildings.update(b.id, { status: next, updatedAt: now() })
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
