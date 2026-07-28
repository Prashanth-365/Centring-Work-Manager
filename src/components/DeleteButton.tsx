import * as React from "react"
import * as ReactDOM from "react-dom"
import { Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  label?: string
  variant?: "icon" | "full"
  className?: string
}

function Portal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body)
}

function ConfirmDialog({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])
  return (
    <Portal>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      >
        <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="mb-1 flex items-center gap-2">
            <Trash2 className="size-5 shrink-0 text-destructive" />
            <p className="font-semibold">Delete {label}?</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">This action can be undone right after.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={onConfirm}>Delete</Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

const UNDO_MS = 5000

function UndoToast({ label, onUndo, onExpire }: { label: string; onUndo: () => void; onExpire: () => void }) {
  const [pct, setPct] = React.useState(100)
  const startRef = React.useRef(Date.now())
  const rafRef = React.useRef<number | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    timerRef.current = setTimeout(onExpire, UNDO_MS)
    function tick() {
      const elapsed = Date.now() - startRef.current
      setPct(Math.max(0, 100 - (elapsed / UNDO_MS) * 100))
      if (elapsed < UNDO_MS) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (timerRef.current) clearTimeout(timerRef.current); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    onUndo()
  }
  return (
    <Portal>
      <div style={{ position: "fixed", bottom: "5rem", left: "50%", transform: "translateX(-50%)", zIndex: 9999, width: "calc(100% - 2rem)", maxWidth: "24rem" }} className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <Trash2 className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 text-sm font-medium">{label} deleted</span>
          <button type="button" onClick={handleUndo} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Undo2 className="size-3.5" />Undo
          </button>
        </div>
        <div className="h-1 bg-primary" style={{ width: pct + "%", transition: "none" }} />
      </div>
    </Portal>
  )
}

type Phase = "idle" | "confirming" | "undoing"

export function DeleteButton({ onDelete, label = "Delete", variant = "icon", className }: DeleteButtonProps) {
  const [phase, setPhase] = React.useState<Phase>("idle")
  const undidRef = React.useRef(false)
  function handleClick(e: React.MouseEvent) { e.preventDefault(); e.stopPropagation(); setPhase("confirming") }
  function handleConfirm() { undidRef.current = false; setPhase("undoing") }
  function handleUndo() { undidRef.current = true; setPhase("idle") }
  async function handleExpire() { setPhase("idle"); if (!undidRef.current) await onDelete() }
  const overlays = (
    <>
      {phase === "confirming" && <ConfirmDialog label={label} onConfirm={handleConfirm} onCancel={() => setPhase("idle")} />}
      {phase === "undoing" && <UndoToast label={label} onUndo={handleUndo} onExpire={handleExpire} />}
    </>
  )
  if (variant === "full") {
    return (
      <>
        {overlays}
        <Button type="button" variant="outline" className={cn("w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground", className)} onClick={handleClick}>
          <Trash2 className="size-4" />{label}
        </Button>
      </>
    )
  }
  return (
    <>
      {overlays}
      <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} className={cn("size-8 text-muted-foreground hover:text-destructive", className)} onClick={handleClick}>
        <Trash2 className="size-4" />
      </Button>
    </>
  )
}
