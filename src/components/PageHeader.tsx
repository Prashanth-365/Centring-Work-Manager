import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  back,
  onBack,
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  back?: boolean
  onBack?: () => void
  actions?: React.ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-lg safe-top',
        className,
      )}
    >
      <div className="flex min-h-14 items-center gap-2 px-3 py-2">
        {back && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate(-1))}
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </header>
  )
}
