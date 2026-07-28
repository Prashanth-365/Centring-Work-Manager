import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  label?: string
  /** Render as a small icon-only button (default) or a full-width danger button */
  variant?: 'icon' | 'full'
  className?: string
}

/**
 * Two-tap confirmation pattern:
 *  1st tap → turns red, shows "Tap again to confirm"
 *  2nd tap (within 3 s) → calls onDelete
 *  If not tapped again within 3 s → resets
 */
export function DeleteButton({ onDelete, label = 'Delete', variant = 'icon', className }: DeleteButtonProps) {
  const [confirming, setConfirming] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function reset() {
    setConfirming(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirming) {
      setConfirming(true)
      timerRef.current = setTimeout(reset, 3000)
    } else {
      reset()
      void onDelete()
    }
  }

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (variant === 'full') {
    return (
      <Button
        type="button"
        variant={confirming ? 'destructive' : 'outline'}
        className={cn('w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground', confirming && 'animate-pulse', className)}
        onClick={handleClick}
      >
        <Trash2 className="size-4" />
        {confirming ? 'Tap again to confirm delete' : label}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={confirming ? 'Tap again to confirm delete' : label}
      title={confirming ? 'Tap again to confirm delete' : label}
      className={cn(
        'transition-colors',
        confirming ? 'animate-pulse text-destructive' : 'text-muted-foreground hover:text-destructive',
        className,
      )}
      onClick={handleClick}
    >
      <Trash2 className="size-5" />
    </Button>
  )
}
