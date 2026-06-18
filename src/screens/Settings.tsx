import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Clock,
  CloudDownload,
  CloudUpload,
  Database,
  DatabaseBackup,
  DownloadCloud,
  HardDriveDownload,
  Link2,
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
import {
  buildBackupEnvelope,
  exportDataBackup,
  restoreDataBackup,
  restoreFromText,
  verifyEnvelopePassphrase,
} from '@/lib/backup'
import { fileTimestamp, saveTextFile } from '@/lib/files'
import {
  backupToDrive,
  connectDrive,
  disconnectDrive,
  driveConfigured,
  getDriveUser,
  isDriveConnected,
  peekDriveBackupText,
  restoreFromDrive,
} from '@/lib/drive'
import { toast } from '@/lib/toast'
import { CategoryMapping } from '@/screens/settings/CategoryMapping'
import type { AppLockConfig, Settings as SettingsType, ShiftBlock } from '@/lib/types'

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
        <DataSection settings={settingsRow} />

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Centering Work Manager · v{__APP_VERSION__} · all data stays on this device
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

function DataSection({ settings }: { settings: SettingsType }) {
  const restoreRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState('')
  const [confirmFile, setConfirmFile] = React.useState<File>()
  const [connected, setConnected] = React.useState(isDriveConnected())
  const [email, setEmail] = React.useState(getDriveUser()?.email ?? settings.driveEmail ?? '')
  const [driveAction, setDriveAction] = React.useState<'backup' | 'restore'>()
  const [pass, setPass] = React.useState('')
  const driveOn = driveConfigured()

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      // Never fail silently — always surface what went wrong.
      toast.error((e as Error).message || 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  async function markDriveSync() {
    const em = getDriveUser()?.email
    await updateSettings({ lastDriveSyncAt: Date.now(), ...(em ? { driveEmail: em } : {}) })
  }

  // --- Local backup / restore (plain JSON, on-device) ---
  async function localBackup() {
    await withBusy('local-backup', async () => {
      const json = await exportDataBackup()
      const res = await saveTextFile(`backup-${fileTimestamp()}.json`, json)
      toast.success(res.native ? `Saved to ${res.location}` : 'Backup downloaded.')
    })
  }

  async function doRestore(file: File) {
    await withBusy('local-restore', async () => {
      const { tables, rows } = await restoreDataBackup(await file.text())
      toast.success(`Restored ${rows} records across ${tables} tables. Reloading…`)
      setTimeout(() => window.location.reload(), 1100)
    })
  }

  // --- Google Drive (encrypted backup in the user's private appDataFolder) ---
  async function connect() {
    await withBusy('connect', async () => {
      const user = await connectDrive()
      setConnected(true)
      setEmail(user.email ?? '')
      if (user.email) await updateSettings({ driveEmail: user.email })
      toast.success(user.email ? `Connected as ${user.email}.` : 'Connected to Google Drive.')
    })
  }

  function disconnect() {
    disconnectDrive()
    setConnected(false)
    toast.info('Disconnected from Google Drive.')
  }

  // Drive backup/restore are encrypted on-device — collect a passphrase first.
  function startDrive(action: 'backup' | 'restore') {
    setPass('')
    setDriveAction(action)
  }

  async function runDriveBackup(passphrase: string) {
    await withBusy('drive-backup', async () => {
      // Pre-overwrite safety: if a backup already exists, the passphrase MUST
      // decrypt it — otherwise a typo would lock the next restore.
      const existing = await peekDriveBackupText()
      if (existing && !(await verifyEnvelopePassphrase(existing, passphrase))) {
        throw new Error(
          'That passphrase does not match your existing Drive backup. Use the same one, or disconnect to start fresh.',
        )
      }
      const envelope = await buildBackupEnvelope(passphrase)
      await backupToDrive(JSON.stringify(envelope))
      setConnected(true)
      await markDriveSync()
      toast.success('Encrypted backup saved to Google Drive.')
    })
  }

  async function runDriveRestore(passphrase: string) {
    await withBusy('drive-restore', async () => {
      const text = await restoreFromDrive()
      await restoreFromText(text, passphrase)
      setConnected(true)
      await markDriveSync()
      toast.success('Restored from Google Drive. Reloading…')
      setTimeout(() => window.location.reload(), 1100)
    })
  }

  function submitDrive() {
    const action = driveAction
    const passphrase = pass
    if (passphrase.length < 8) {
      toast.error('Passphrase must be at least 8 characters.')
      return
    }
    setDriveAction(undefined)
    if (action === 'backup') void runDriveBackup(passphrase)
    else if (action === 'restore') void runDriveRestore(passphrase)
  }

  const lastSync = settings.lastDriveSyncAt
    ? new Date(settings.lastDriveSyncAt).toLocaleString()
    : null

  return (
    <Section icon={Database} title="Data" hint="Back up and restore everything on this device">
      {/* Local backup / restore */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={localBackup} disabled={busy === 'local-backup'}>
          <DownloadCloud className="size-4" />
          {busy === 'local-backup' ? 'Saving…' : 'Back up'}
        </Button>
        <Button
          variant="outline"
          onClick={() => restoreRef.current?.click()}
          disabled={busy === 'local-restore'}
        >
          <UploadCloud className="size-4" />
          {busy === 'local-restore' ? 'Restoring…' : 'Restore'}
        </Button>
        <input
          ref={restoreRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setConfirmFile(f)
            e.target.value = '' // allow re-picking the same file
          }}
        />
      </div>

      {/* Google Drive — encrypted backup in your private app folder */}
      <div className="space-y-3 rounded-lg border border-border bg-accent/30 p-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <DatabaseBackup className="size-4 text-muted-foreground" />
            Google Drive
          </h3>
          <span
            className={
              'text-xs font-medium ' + (connected ? 'text-success' : 'text-muted-foreground')
            }
          >
            {connected ? 'Connected' : driveOn ? 'Not connected' : 'Not set up'}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Backs up this app’s data, <span className="font-medium text-foreground">encrypted</span>{' '}
          with your passphrase, to a private folder in your own Google Drive. Only this app can see
          it; no one else — not even the developer — can read it.
        </p>

        {!driveOn && (
          <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
            Google Drive isn’t configured in this build. Set{' '}
            <span className="font-medium text-foreground">VITE_GOOGLE_CLIENT_ID</span> and{' '}
            <span className="font-medium text-foreground">VITE_OAUTH_REDIRECT_URL</span> in the
            deployment, then reinstall this build.
          </p>
        )}

        {driveOn ? (
          <>
            {connected && email && (
              <p className="truncate text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {connected ? (
                <Button variant="outline" onClick={disconnect}>
                  <Link2 className="size-4" />
                  Disconnect
                </Button>
              ) : (
                <Button variant="outline" onClick={connect} disabled={busy === 'connect'}>
                  <Link2 className="size-4" />
                  {busy === 'connect' ? 'Connecting…' : 'Connect'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => startDrive('backup')}
                disabled={busy === 'drive-backup'}
              >
                <CloudUpload className="size-4" />
                {busy === 'drive-backup' ? 'Backing up…' : 'Back up to Drive'}
              </Button>
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => startDrive('restore')}
                disabled={busy === 'drive-restore'}
              >
                <CloudDownload className="size-4" />
                {busy === 'drive-restore' ? 'Restoring…' : 'Restore from Drive'}
              </Button>
            </div>
            {lastSync && (
              <p className="text-xs text-muted-foreground">Last Drive sync: {lastSync}</p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add an OAuth client id above to enable encrypted Google Drive backup and restore.
          </p>
        )}
      </div>

      {/* Drive passphrase prompt — the payload is encrypted on-device. */}
      <Dialog open={!!driveAction} onOpenChange={(o) => !o && setDriveAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {driveAction === 'restore' ? 'Restore from Google Drive' : 'Back up to Google Drive'}
            </DialogTitle>
            <DialogDescription>
              {driveAction === 'restore'
                ? 'Enter the passphrase you used for this Drive backup. It decrypts on this device, then replaces ALL current data.'
                : 'Choose a passphrase (min 8 characters). You’ll need the exact same one to restore — it’s never stored or sent anywhere.'}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Backup passphrase"
              className="pl-9"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submitDrive()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDriveAction(undefined)}>
              Cancel
            </Button>
            <Button
              variant={driveAction === 'restore' ? 'destructive' : 'default'}
              onClick={submitDrive}
            >
              {driveAction === 'restore' ? (
                <>
                  <CloudDownload className="size-4" />
                  Decrypt &amp; restore
                </>
              ) : (
                <>
                  <CloudUpload className="size-4" />
                  Encrypt &amp; back up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation — replacing all local data is destructive. */}
      <Dialog open={!!confirmFile} onOpenChange={(o) => !o && setConfirmFile(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from backup?</DialogTitle>
            <DialogDescription>
              This replaces ALL current data in this app with the contents of
              {confirmFile ? ` “${confirmFile.name}”` : ' the chosen file'}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFile(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const f = confirmFile
                setConfirmFile(undefined)
                if (f) void doRestore(f)
              }}
            >
              <HardDriveDownload className="size-4" />
              Replace &amp; restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
