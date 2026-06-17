import * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Fab({
  to,
  onClick,
  icon: Icon,
  label,
  className,
}: {
  to?: string
  onClick?: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  className?: string
}) {
  const cls = cn(
    'fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-primary-foreground shadow-float transition active:scale-95',
    className,
  )
  const content = (
    <>
      <Icon className="size-5" />
      <span className="text-sm font-semibold">{label}</span>
    </>
  )
  if (to)
    return (
      <Link to={to} className={cls} aria-label={label}>
        {content}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {content}
    </button>
  )
}
