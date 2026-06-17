import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Clock,
  DatabaseBackup,
  DownloadCloud,
  Lock,
  Plus,
  Tags,
  UploadCloud,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { db } from '@/lib/db'
import { updateSettings, createOtherExpenseType } from '@/lib/repo'
import { useOtherExpenseTypes } from '@/lib/hooks'
import { derivePinHash } from '@/lib/crypto'
import { enrollBiometric, isBiometricAvailable } from '@/lib/biometric'
import { buildBackupEnvelope, downloadBackup, restoreFromText } from '@/lib/backup'
import { driveConfigured, pickFileText, uploadBackupToDrive } from '@/lib/drive'
import { CategoryMapping } from '@/screens/settings/CategoryMapping'
import type { AppLockConfig, ShiftBlock } from '@/lib/types'

export function Settings() {
  const settingsRow = useLiveQuery(() => db.settings.get('app'), [])
  const otherTypes = useOtherExpenseTypes()

  const [shiftBlocks, setShiftBlocks] = React.useState<ShiftBlock[]>([])
  const [breakfast, setBreakfast] = React.useState('')
  const [lunch, setLunch] = React.useState('')
  const [perDay, setPerDay] = React.useState('')
  const [perWeek, setPerWeek] = React.useState('')
  const [maxDays, setMaxDays] = React.useState('')
  const [threshold, setThreshold] = React.useState('')
  const [weekStartsOn, setWeekStartsOn] = React.useState(1)
  const [saved, setSaved] = React.useState(false)
  const [newType, setNewType] = React.useState('')
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (settingsRow && !loaded.current) {
      loaded.current = true
      setShiftBlocks(settingsRow.shiftBlocks)
      setBreakfast(String(settingsRow.defaultFoodBreakfast))
      setLunch(String(settingsRow.defaultFoodLunch))
      setPerDay(String(settingsRow.defaultFoodPerDay))
      setPerWeek(String(settingsRow.defaultFoodPerWeek))
      setMaxDays(String(settingsRow.defaultMaxDaysPerWeek))
      setThreshold(String(settingsRow.collectAlertDays))
      setWeekStartsOn(settingsRow.weekStartsOn)
    }
  }, [settingsRow])

  async function save() {
    await updateSettings({
      shiftBlocks,
      defaultFoodBreakfast: Number(breakfast) || 0,
      defaultFoodLunch: Number(lunch) || 0,
      defaultFoodPerDay: Number(perDay) || 0,
      defaultFoodPerWeek: Number(perWeek) || 0,
      defaultMaxDaysPerWeek: Number(maxDays) || 10,
      collectAlertDays: Number(threshold) || 18,
      weekStartsOn,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function setBlock(i: number, key: 'from' | 'to', value: string) {
    setShiftBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)))
  }

  if (!settingsRow) return <PageHeader title="Settings" back />

  return (
    <>
      <PageHeader title="Settings" back />
      <div className="space-y-5 p-4">
        {/* Shift blocks */}
        <Section icon={Clock} title="Shift blocks" hint="Each block is half a day">
          <div className="space-y-2">
            {shiftBlocks.map((b, i) => (
              <div key={b.index} className="flex items-center gap-2">
                <span className="w-16 text-sm font-medium text-muted-foreground">Block {b.index}</span>
                <Input type="time" value={b.from} onChange={(e) => setBlock(i, 'from', e.target.value)} />
                <span className="text-muted-foreground">–</span>
                <Input type="time" value={b.to} onChange={(e) => setBlock(i, 'to', e.target.value)} />
              </div>
            ))}
          </div>
        </Section>

        {/* Default food */}
        <Section icon={UtensilsCrossed} title="Default food amounts" hint="Applied to new workers">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breakfast (blocks 1 & 2)">
              {(id) => <Input id={id} type="number" value={breakfast} onChange={(e) => setBreakfast(e.target.value)} />}
            </Field>
            <Field label="Lunch (blocks 2 & 3)">
              {(id) => <Input id={id} type="number" value={lunch} onChange={(e) => setLunch(e.target.value)} />}
            </Field>
            <Field label="Fixed / day">
              {(id) => <Input id={id} type="number" value={perDay} onChange={(e) => setPerDay(e.target.value)} />}
            </Field>
            <Field label="Fixed / week">
              {(id) => <Input id={id} type="number" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />}
            </Field>
            <Field label="Max days / week">
              {(id) => <Input id={id} type="number" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />}
            </Field>
          </div>
        </Section>

        {/* Alerts & week */}
        <Section title="Alerts & week">
          <Field label="Collect alert after (days)" hint="Done floors unpaid for longer show in “Go collect”">
            {(id) => <Input id={id} type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />}
          </Field>
          <Field label="Week starts on" className="mt-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {[
                { v: 1, l: 'Monday' },
                { v: 0, l: 'Sunday' },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setWeekStartsOn(o.v)}
                  className={
                    'rounded-lg py-1.5 text-sm font-medium transition ' +
                    (weekStartsOn === o.v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')
                  }
                >
                  {o.l}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Button onClick={save} size="lg" className="w-full">
          {saved ? (
            <>
              <Check className="size-4" /> Saved
            </>
          ) : (
            'Save settings'
          )}
        </Button>

        {/* Other expense types */}
        <Section title="Other expense types">
          <div className="flex flex-wrap gap-1.5">
            {otherTypes.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm"
              >
                {t.name}
                <button
                  onClick={() => db.otherExpenseTypes.delete(t.id)}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                  aria-label={`Remove ${t.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Add type…" />
            <Button
              variant="secondary"
              onClick={async () => {
                if (newType.trim()) {
                  await createOtherExpenseType(newType.trim())
                  setNewType('')
                }
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </Section>

        {/* Category mapping (txn sub-category name → our type) */}
        <Section icon={Tags} title="Category mapping" hint="How synced sub-categories map to our types">
          <CategoryMapping />
        </Section>

        <AppLockSection lock={settingsRow.appLock} />
        <BackupSection />

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Centering Work Manager · all data stays on this device
        </p>
      </div>
    </>
  )
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div>
        <h2 className="flex items-center gap-1.5 font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function AppLockSection({ lock }: { lock: AppLockConfig }) {
  const [pinDialog, setPinDialog] = React.useState(false)
  const [pin, setPin] = React.useState('')
  const [err, setErr] = React.useState('')
  const [bioAvailable, setBioAvailable] = React.useState(false)
  const [bioBusy, setBioBusy] = React.useState(false)

  React.useEffect(() => {
    void isBiometricAvailable().then(setBioAvailable)
  }, [])

  async function enable() {
    if (pin.length < 4) {
      setErr('Use at least 4 digits')
      return
    }
    const { hash, salt } = await derivePinHash(pin)
    await updateSettings({ appLock: { enabled: true, method: 'pin', pinHash: hash, salt } })
    sessionStorage.setItem('cwm-unlocked', '1')
    setPin('')
    setPinDialog(false)
  }

  async function disable() {
    await updateSettings({ appLock: { enabled: false } })
  }

  // Biometrics are layered ON TOP of the PIN, which stays as the fallback.
  async function toggleBiometric(on: boolean) {
    setErr('')
    if (on) {
      setBioBusy(true)
      const credId = await enrollBiometric()
      setBioBusy(false)
      if (!credId) {
        setErr('Could not enroll biometrics on this device.')
        return
      }
      await updateSettings({
        appLock: {
          ...lock,
          method: 'biometric',
          webauthnCredId: credId === 'native' ? undefined : credId,
        },
      })
    } else {
      await updateSettings({ appLock: { ...lock, method: 'pin' } })
    }
  }

  return (
    <Section icon={Lock} title="App lock" hint="Require a PIN — and optionally biometrics — to open the app">
      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-sm font-medium">PIN lock</span>
        <Switch
          checked={lock.enabled}
          onCheckedChange={(c) => {
            if (c) setPinDialog(true)
            else void disable()
          }}
        />
      </label>

      {lock.enabled && bioAvailable && (
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-sm font-medium">
            Biometric unlock
            {bioBusy && <span className="ml-2 text-xs text-muted-foreground">enrolling…</span>}
          </span>
          <Switch
            checked={lock.method === 'biometric'}
            disabled={bioBusy}
            onCheckedChange={(c) => void toggleBiometric(c)}
          />
        </label>
      )}
      {err && <p className="text-xs font-medium text-destructive">{err}</p>}

      <Dialog open={pinDialog} onOpenChange={setPinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set a PIN</DialogTitle>
            <DialogDescription>4–6 digits. You’ll enter this each time you open the app.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''))
              setErr('')
            }}
            placeholder="••••"
            className="text-center text-2xl tracking-widest"
            autoFocus
          />
          {err && <p className="text-xs font-medium text-destructive">{err}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialog(false)}>
              Cancel
            </Button>
            <Button onClick={enable}>Enable lock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}

type BackupMode = 'backup' | 'restore' | 'drive-backup' | 'drive-restore' | null

function BackupSection() {
  const [mode, setMode] = React.useState<BackupMode>(null)
  const [pass, setPass] = React.useState('')
  const [file, setFile] = React.useState<File>()
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [err, setErr] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  const isBackup = mode === 'backup' || mode === 'drive-backup'
  const isRestore = mode === 'restore' || mode === 'drive-restore'

  function reset() {
    setPass('')
    setFile(undefined)
    setErr('')
    setMsg('')
  }

  async function run() {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      if (isBackup && pass.length < 4) throw new Error('Use a passphrase of at least 4 characters.')
      if (mode === 'backup') {
        await downloadBackup(pass)
        setMsg('Backup downloaded.')
        setTimeout(() => setMode(null), 1200)
        reset()
      } else if (mode === 'drive-backup') {
        const env = await buildBackupEnvelope(pass)
        await uploadBackupToDrive(`centering-backup-${env.createdAt.slice(0, 10)}.json`, JSON.stringify(env))
        setMsg('Backed up to Google Drive.')
        setTimeout(() => setMode(null), 1200)
        reset()
      } else if (mode === 'restore') {
        if (!file) throw new Error('Choose a backup file.')
        await restoreFromText(await file.text(), pass)
        setMsg('Restored. Reloading…')
        setTimeout(() => window.location.reload(), 900)
      } else if (mode === 'drive-restore') {
        const text = await pickFileText()
        if (!text) {
          setBusy(false)
          return
        }
        await restoreFromText(text, pass)
        setMsg('Restored. Reloading…')
        setTimeout(() => window.location.reload(), 900)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={DatabaseBackup} title="Backup & restore" hint="Encrypted with your passphrase (AES-256-GCM)">
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={() => { reset(); setMode('backup') }}>
          <DownloadCloud className="size-4" />
          Backup
        </Button>
        <Button variant="outline" onClick={() => { reset(); setMode('restore') }}>
          <UploadCloud className="size-4" />
          Restore
        </Button>
      </div>

      {driveConfigured() && (
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="outline" onClick={() => { reset(); setMode('drive-backup') }}>
            <DownloadCloud className="size-4" />
            To Drive
          </Button>
          <Button variant="outline" onClick={() => { reset(); setMode('drive-restore') }}>
            <UploadCloud className="size-4" />
            From Drive
          </Button>
        </div>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isBackup ? 'Encrypted backup' : 'Restore from backup'}</DialogTitle>
            <DialogDescription>
              {isBackup
                ? 'Choose a passphrase to encrypt your data. Keep it safe — it cannot be recovered.'
                : 'Restoring replaces all current data in this app.'}
            </DialogDescription>
          </DialogHeader>

          {mode === 'restore' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0])}
              />
              <Button variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                <UploadCloud className="size-4" />
                <span className="truncate">{file ? file.name : 'Choose backup file'}</span>
              </Button>
            </>
          )}
          {mode === 'drive-restore' && (
            <p className="text-xs text-muted-foreground">
              You’ll pick the backup file from Google Drive after tapping Restore.
            </p>
          )}

          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Passphrase"
            autoComplete="off"
          />
          {err && <p className="text-xs font-medium text-destructive">{err}</p>}
          {msg && <p className="text-xs font-medium text-success">{msg}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy} variant={isRestore ? 'destructive' : 'default'}>
              {busy ? 'Working…' : mode === 'backup' ? 'Download' : mode === 'drive-backup' ? 'Upload' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
