import * as React from 'react'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

const TONES = [
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
]

function toneFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

export function Thumb({
  blob,
  name,
  className,
  square,
}: {
  blob?: Blob
  name: string
  className?: string
  square?: boolean
}) {
  const [url, setUrl] = React.useState<string>()
  React.useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-semibold',
        square ? 'rounded-lg' : 'rounded-full',
        !url && toneFor(name),
        'size-10 text-sm',
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name} className="size-full object-cover" />
      ) : (
        <span>{initials(name || '?')}</span>
      )}
    </div>
  )
}
