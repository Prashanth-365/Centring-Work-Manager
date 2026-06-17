// Tiny toast store — hand-rolled (no new dependency), framework-agnostic so
// non-React modules (e.g. drive.ts) can fire toasts too. The <Toaster /> mounts
// `useToasts()` to render them. Errors must never be silent (see the spec), so
// `toast.error` is the standard way to surface a caught failure.
import * as React from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
  /** Auto-dismiss after this many ms (0 = sticky). */
  duration: number
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  for (const l of listeners) l(toasts)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(message: string, variant: ToastVariant, duration: number): number {
  const id = nextId++
  toasts = [...toasts, { id, message, variant, duration }]
  emit()
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}

export const toast = {
  success: (message: string, duration = 3500) => push(message, 'success', duration),
  error: (message: string, duration = 6000) => push(message, 'error', duration),
  info: (message: string, duration = 3500) => push(message, 'info', duration),
}

/** Subscribe to the live toast list (used by <Toaster />). */
export function useToasts(): Toast[] {
  const [list, setList] = React.useState<Toast[]>(toasts)
  React.useEffect(() => {
    listeners.add(setList)
    setList(toasts)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  return list
}
