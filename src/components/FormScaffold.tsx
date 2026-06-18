import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from './ui/button'

export function FormScaffold({
  title,
  subtitle,
  onSubmit,
  submitting,
  submitLabel = 'Save',
  secondaryAction,
  footerExtra,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onSubmit: (e: React.FormEvent) => void
  submitting?: boolean
  submitLabel?: string
  /** Optional second button (e.g. "Save & add another") shown beside the primary action. */
  secondaryAction?: {
    label: string
    onClick: () => void
    submitting?: boolean
  }
  footerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <form
      onSubmit={onSubmit}
      className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background"
    >
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 py-2 backdrop-blur-lg safe-top">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-1 flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-accent active:scale-95"
          aria-label="Cancel"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </header>

      <div className="flex-1 space-y-5 px-4 py-5 pb-28">{children}</div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-background/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <div className="flex gap-2">
          {footerExtra}
          {secondaryAction && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={secondaryAction.onClick}
              disabled={submitting || secondaryAction.submitting}
            >
              {secondaryAction.submitting ? 'Saving…' : secondaryAction.label}
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** A labelled photo picker that yields a resized thumbnail Blob. */
export { PhotoPicker } from './PhotoPicker'
