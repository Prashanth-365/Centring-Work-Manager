import * as React from 'react'
import { Delete, Fingerprint, Lock } from 'lucide-react'
import { ensureSeed } from '@/lib/db'
import { startDailyAutoAdvance } from '@/lib/autoAdvance'
import { useSettings } from '@/lib/hooks'
import { verifyPin } from '@/lib/crypto'
import { verifyBiometric } from '@/lib/biometric'
import { onAppStateChange } from '@/lib/native'
import { applyTheme } from '@/lib/theme'
import type { AppLockConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

const KEY = 'cwm-unlocked'
const HIDDEN_AT = 'cwm-hidden-at'

function LockScreen({ lock, onUnlock }: { lock: AppLockConfig; onUnlock: () => void }) {
  const [pin, setPin] = React.useState('')
  const [error, setError] = React.useState(false)
  const [bioTried, setBioTried] = React.useState(false)
  const canBiometric = lock.method === 'biometric' && (!!lock.webauthnCredId || true)

  const tryBiometric = React.useCallback(async () => {
    setBioTried(true)
    const ok = await verifyBiometric(lock.webauthnCredId)
    if (ok) onUnlock()
  }, [lock.webauthnCredId, onUnlock])

  // Auto-prompt biometrics once when that's the chosen method.
  React.useEffect(() => {
    if (canBiometric && !bioTried) void tryBiometric()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(next: string) {
    if (!lock.pinHash || !lock.salt) return
    const ok = await verifyPin(next, lock.pinHash, lock.salt)
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
          aria-label="Delete"
        >
          <Delete className="size-6" />
        </button>
      </div>
      {canBiometric && (
        <button
          onClick={() => void tryBiometric()}
          className="flex items-center gap-2 text-sm font-medium text-primary transition active:scale-95"
        >
          <Fingerprint className="size-5" />
          Use biometrics
        </button>
      )}
    </div>
  )
}

export function LockGate({ children }: { children: React.ReactNode }) {
  const settings = useSettings()
  const [unlocked, setUnlocked] = React.useState(() => sessionStorage.getItem(KEY) === '1')

  React.useEffect(() => {
    let stop = () => {}
    void ensureSeed().then(() => {
      stop = startDailyAutoAdvance() // run now + at each midnight / foreground (§4)
    })
    return () => stop()
  }, [])

  // Reconcile the theme from the persisted setting (Dexie is the source of truth;
  // the pre-paint script in index.html applied the localStorage mirror already).
  React.useEffect(() => {
    applyTheme(settings?.theme ?? 'dark')
  }, [settings?.theme])

  const lock = settings?.appLock
  const enabled = !!lock?.enabled
  const relockMs = (lock?.relockMinutes ?? 2) * 60_000

  // Re-lock after the app has been backgrounded longer than relockMinutes (§14).
  React.useEffect(() => {
    if (!enabled) return
    const relockIfStale = () => {
      const at = Number(sessionStorage.getItem(HIDDEN_AT) || 0)
      if (at && Date.now() - at > relockMs) {
        sessionStorage.removeItem(KEY)
        setUnlocked(false)
      }
      sessionStorage.removeItem(HIDDEN_AT)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sessionStorage.setItem(HIDDEN_AT, String(Date.now()))
      else relockIfStale()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const offNative = onAppStateChange((active) => {
      if (!active) sessionStorage.setItem(HIDDEN_AT, String(Date.now()))
      else relockIfStale()
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      offNative()
    }
  }, [enabled, relockMs])

  if (!enabled || unlocked || !lock?.pinHash || !lock?.salt) return <>{children}</>

  return (
    <LockScreen
      lock={lock}
      onUnlock={() => {
        sessionStorage.setItem(KEY, '1')
        sessionStorage.removeItem(HIDDEN_AT)
        setUnlocked(true)
      }}
    />
  )
}
