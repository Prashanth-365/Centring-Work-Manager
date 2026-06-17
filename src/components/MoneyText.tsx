import { money, moneySigned } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Colored money. For a balance, positive (you owe) shows red, negative
 * (overpaid / they owe) shows green — pass `balance` to use that semantic.
 */
export function MoneyText({
  value,
  signed,
  balance,
  className,
  muted,
}: {
  value: number
  signed?: boolean
  balance?: boolean
  className?: string
  muted?: boolean
}) {
  let tone = ''
  if (balance) {
    tone = value > 0.5 ? 'text-destructive' : value < -0.5 ? 'text-success' : 'text-muted-foreground'
  }
  return (
    <span className={cn('tabular font-semibold', muted && 'text-muted-foreground', tone, className)}>
      {signed || balance ? moneySigned(value) : money(value)}
    </span>
  )
}
