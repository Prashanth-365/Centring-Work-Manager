import {
  addWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
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
