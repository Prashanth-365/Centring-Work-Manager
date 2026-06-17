import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboOption {
  value: string
  label: string
  sublabel?: string
}

interface ComboboxProps {
  options: ComboOption[]
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** When provided, an "Add …" row appears for novel input; returns the new id. */
  onCreate?: (label: string) => Promise<string> | string
  createLabel?: (q: string) => string
  disabled?: boolean
  allowClear?: boolean
  className?: string
  invalid?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search or type…',
  emptyText = 'No matches',
  onCreate,
  createLabel,
  disabled,
  allowClear,
  className,
  invalid,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
      )
    : options
  const exact = options.some((o) => o.label.trim().toLowerCase() === q)
  const showCreate = !!onCreate && query.trim().length > 0 && !exact

  function select(v: string | undefined) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  async function create() {
    if (!onCreate) return
    const id = await onCreate(query.trim())
    select(id)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive ring-1 ring-destructive/40',
            className,
          )}
        >
          <span className={cn('line-clamp-1 text-left', !selected && 'text-muted-foreground/70')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-float data-[state=open]:animate-scale-in"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (filtered[0]) select(filtered[0].value)
                  else if (showCreate) void create()
                }
              }}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {allowClear && value && (
              <button
                type="button"
                onClick={() => select(undefined)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" /> Clear selection
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-base hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="line-clamp-1">{o.label}</span>
                  {o.sublabel && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">{o.sublabel}</span>
                  )}
                </span>
                {value === o.value && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && !showCreate && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            )}
            {showCreate && (
              <button
                type="button"
                onClick={() => void create()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-base font-medium text-primary hover:bg-accent"
              >
                <Plus className="size-4" />
                {createLabel ? createLabel(query.trim()) : `Add “${query.trim()}”`}
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
