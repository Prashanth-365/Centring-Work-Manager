import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Parse a 'yyyy-MM-dd' string as local midnight. */
export function parseDate(iso: string): Date {
  return parseISO(iso)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function weekStartDate(dateIso: string, weekStartsOn: WeekStart): Date {
  return startOfWeek(parseISO(dateIso), { weekStartsOn })
}

export function weekRange(dateIso: string, weekStartsOn: WeekStart): { start: Date; end: Date } {
  const d = parseISO(dateIso)
  return { start: startOfWeek(d, { weekStartsOn }), end: endOfWeek(d, { weekStartsOn }) }
}

/** Stable key for the week containing dateIso (the week-start ISO date). */
export function weekKey(dateIso: string, weekStartsOn: WeekStart): string {
  return toISODate(startOfWeek(parseISO(dateIso), { weekStartsOn }))
}

export function weekDays(dateIso: string, weekStartsOn: WeekStart): string[] {
  const { start, end } = weekRange(dateIso, weekStartsOn)
  return eachDayOfInterval({ start, end }).map(toISODate)
}

export function dateInRange(dateIso: string, start: Date, end: Date): boolean {
  const d = parseISO(dateIso)
  return !isBefore(d, start) && !isAfter(d, end)
}

export function dateBefore(dateIso: string, ref: Date): boolean {
  return isBefore(parseISO(dateIso), ref)
}

export function daysSince(dateIso: string, ref: Date = new Date()): number {
  return differenceInCalendarDays(ref, parseISO(dateIso))
}

export function monthRange(dateIso: string): { start: Date; end: Date } {
  const d = parseISO(dateIso)
  return { start: startOfMonth(d), end: endOfMonth(d) }
}

export function shiftWeek(dateIso: string, by: number, weekStartsOn: WeekStart): string {
  return toISODate(startOfWeek(addWeeks(parseISO(dateIso), by), { weekStartsOn }))
}

export function formatDate(iso?: string, fmt = 'd MMM yyyy'): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), fmt)
  } catch {
    return iso
  }
}

export function formatRange(startIso: Date, endIso: Date): string {
  const sameMonth = format(startIso, 'MMM yyyy') === format(endIso, 'MMM yyyy')
  return sameMonth
    ? `${format(startIso, 'd')} – ${format(endIso, 'd MMM yyyy')}`
    : `${format(startIso, 'd MMM')} – ${format(endIso, 'd MMM yyyy')}`
}

// --- Period selector (week / month / year) ---------------------------------

export type PeriodType = 'week' | 'month' | 'year'

/** A selected reporting period — `anchor` is any ISO date inside it. */
export interface Period {
  type: PeriodType
  anchor: string
}

export function periodNow(type: PeriodType): Period {
  return { type, anchor: todayISO() }
}

/** The inclusive [start, end] date range for a period. */
export function periodRange(period: Period, weekStartsOn: WeekStart): { start: Date; end: Date } {
  const d = parseISO(period.anchor)
  switch (period.type) {
    case 'week':
      return { start: startOfWeek(d, { weekStartsOn }), end: endOfWeek(d, { weekStartsOn }) }
    case 'month':
      return { start: startOfMonth(d), end: endOfMonth(d) }
    case 'year':
      return { start: startOfYear(d), end: endOfYear(d) }
  }
}

/** Move the period forward/back by `by` units of its own type. */
export function shiftPeriod(period: Period, by: number, weekStartsOn: WeekStart): Period {
  const d = parseISO(period.anchor)
  let next: Date
  switch (period.type) {
    case 'week':
      next = startOfWeek(addWeeks(d, by), { weekStartsOn })
      break
    case 'month':
      next = startOfMonth(addMonths(d, by))
      break
    case 'year':
      next = startOfYear(addYears(d, by))
      break
  }
  return { type: period.type, anchor: toISODate(next) }
}

/** A short human label for the period (e.g. "12–18 May 2025", "May 2025", "2025"). */
export function periodLabel(period: Period, weekStartsOn: WeekStart): string {
  const { start, end } = periodRange(period, weekStartsOn)
  switch (period.type) {
    case 'week':
      return formatRange(start, end)
    case 'month':
      return format(start, 'MMMM yyyy')
    case 'year':
      return format(start, 'yyyy')
  }
}

/** True when the period contains today. */
export function periodIsCurrent(period: Period, weekStartsOn: WeekStart): boolean {
  const { start, end } = periodRange(period, weekStartsOn)
  return dateInRange(todayISO(), start, end)
}

/** True when the ISO date falls within the period. */
export function dateInPeriod(dateIso: string, period: Period, weekStartsOn: WeekStart): boolean {
  const { start, end } = periodRange(period, weekStartsOn)
  return dateInRange(dateIso, start, end)
}
