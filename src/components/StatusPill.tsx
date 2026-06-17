import { Badge, type BadgeProps } from './ui/badge'
import type { BuildingStatus, MoldPaymentStatus, MoldWorkStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type Variant = NonNullable<BadgeProps['variant']>

const BUILDING: Record<BuildingStatus, Variant> = {
  'Yet to Start': 'muted',
  'In Progress': 'default',
  'On Hold': 'warning',
  Completed: 'success',
  Closed: 'secondary',
}

const WORK: Record<MoldWorkStatus, Variant> = {
  'Not Started': 'muted',
  'In Progress': 'default',
  'Done/Removed': 'success',
}

const PAY: Record<MoldPaymentStatus, Variant> = {
  'Not Billed': 'muted',
  Billed: 'warning',
  'Partly Paid': 'warning',
  Paid: 'success',
}

const DOT: Record<Variant, string> = {
  default: 'bg-primary',
  secondary: 'bg-muted-foreground',
  outline: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/60',
}

export function StatusPill({
  status,
  kind,
  className,
  dot = true,
}: {
  status: BuildingStatus | MoldWorkStatus | MoldPaymentStatus
  kind: 'building' | 'work' | 'payment'
  className?: string
  dot?: boolean
}) {
  const variant: Variant =
    kind === 'building'
      ? BUILDING[status as BuildingStatus]
      : kind === 'work'
        ? WORK[status as MoldWorkStatus]
        : PAY[status as MoldPaymentStatus]
  return (
    <Badge variant={variant} className={className}>
      {dot && <span className={cn('size-1.5 rounded-full', DOT[variant])} />}
      {status}
    </Badge>
  )
}
