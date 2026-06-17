import * as React from 'react'
import { Delete, Lock } from 'lucide-react'
import { ensureSeed } from '@/lib/db'
import { useSettings } from '@/lib/hooks'
import { verifyPin } from '@/lib/crypto'
import { cn } from '@/lib/utils'

const KEY = 'cwm-unlocked'

function PinScreen({
  pinHash,
  salt,
  onUnlock,
}: {
  pinHash: string
  salt: string
  onUnlock: () => void
}) {
  const [pin, setPin] = React.useState('')
  const [error, setError] = React.useState(false)

  async function submit(next: string) {
    const ok = await verifyPin(next, pinHash, salt)
    if (ok) onUnlock()
    else {
      setError(true)
      setTimeout(() => {
        setPin('')
        setError(false)
      }, 500)
    }
  }

  function press(d: string) {
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length >= 4) void submit(next)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-8">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="size-7" />
        </div>
        <p className="text-lg font-semibold">Enter PIN</p>
        <div className={cn('flex gap-3', error && 'animate-[shake_0.4s]')}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'size-3.5 rounded-full border-2 transition-colors',
                pin.length > i ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                error && 'border-destructive bg-destructive',
              )}
            />
          ))}
        </div>
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-16 rounded-2xl bg-secondary text-2xl font-semibold text-secondary-foreground transition active:scale-95"
          >
            {d}
          </button>
        ))}
        <span />
        <button
          onClick={() => press('0')}
          className="h-16 rounded-2xl bg-secondary text-2xl font-semibold text-secondary-foreground transition active:scale-95"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="flex h-16 items-center justify-center rounded-2xl text-muted-foreground transition active:scale-95"
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  )
}

export function LockGate({ children }: { children: React.ReactNode }) {
  const settings = useSettings()
  const [unlocked, setUnlocked] = React.useState(() => sessionStorage.getItem(KEY) === '1')

  React.useEffect(() => {
    void ensureSeed()
  }, [])

  const lock = settings?.appLock
  if (!lock?.enabled || unlocked || !lock.pinHash || !lock.salt) return <>{children}</>

  return (
    <PinScreen
      pinHash={lock.pinHash}
      salt={lock.salt}
      onUnlock={() => {
        sessionStorage.setItem(KEY, '1')
        setUnlocked(true)
      }}
    />
  )
}
