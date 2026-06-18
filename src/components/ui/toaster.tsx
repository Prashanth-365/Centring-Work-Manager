import * as React from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { dismissToast, useToasts, type ToastVariant } from '@/lib/toast'
import { cn } from '@/lib/utils'

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-border bg-card text-foreground',
}

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

/**
 * Bottom-center toast stack. Mount once near the app root.
 *
 * Offset above the fixed bottom nav (~4rem tall) so toast text isn't hidden
 * behind it; the safe-area inset keeps it clear of the home indicator.
 */
export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="toaster-root pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = VARIANT_ICON[t.variant]
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-card',
              VARIANT_STYLES[t.variant],
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="-mr-1 flex size-5 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
