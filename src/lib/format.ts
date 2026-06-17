const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrDec = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

/** ₹1,23,456 (Indian grouping, no paise by default). */
export function money(n: number | undefined | null, withDecimals = false): string {
  if (n == null || Number.isNaN(n)) return '—'
  return withDecimals ? inrDec.format(n) : inr.format(Math.round(n))
}

/** Signed money for balances: +₹500 / −₹500. */
export function moneySigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${money(Math.abs(n))}`
}

/** Compact for big figures: ₹1.2L, ₹3.4Cr. */
export function moneyCompact(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}k`
  return money(n)
}

export function days(n: number): string {
  if (Number.isInteger(n)) return `${n}`
  return n.toFixed(1).replace(/\.0$/, '')
}

export function num(n: number | undefined | null, unit = ''): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${new Intl.NumberFormat('en-IN').format(n)}${unit}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function pluralize(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}
