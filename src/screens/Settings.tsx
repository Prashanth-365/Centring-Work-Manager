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
  ShieldAlert,
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
import { downloadStamp, saveToDownloads } from '@/lib/files'
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
  const importRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState('')
  const [confirmFile, setConfirmFile] = React.useState<File>()
  const [warnOff, setWarnOff] = React.useState(false)
  const [passMode, setPassMode] = React.useState<'export' | 'import'>()
  const [pendingImportText, setPendingImportText] = React.useState<string>()
  const [connected, setConnected] = React.useState(isDriveConnected())
  const [email, setEmail] = React.useState(getDriveUser()?.email ?? settings.driveEmail ?? '')
  const [driveAction, setDriveAction] = React.useState<'backup' | 'restore'>()
  const [pass, setPass] = React.useState('')
  const driveOn = driveConfigured()
  const encrypt = settings.encryptBackup ?? true

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

  // --- Encrypt toggle (controls Export / Import; Drive is always encrypted) ---
  function onToggleEncrypt(on: boolean) {
    if (on) void updateSettings({ encryptBackup: true })
    else setWarnOff(true) // warn before turning encryption OFF
  }

  // --- Export to Downloads (respects the encrypt toggle) ---
  function startExport() {
    if (encrypt) {
      setPass('')
      setPassMode('export')
    } else {
      void runExport()
    }
  }

  async function runExport(passphrase?: string) {
    await withBusy('export', async () => {
      const json = passphrase
        ? JSON.stringify(await buildBackupEnvelope(passphrase), null, 2)
        : await exportDataBackup()
      const res = await saveToDownloads(`centering-export-${downloadStamp()}.json`, json)
      toast.success(res.native ? `Saved to ${res.location}` : 'Export downloaded.')
    })
  }

  // --- Import (replaces all data; auto-detects encrypted vs plain JSON) ---
  async function proceedImport(file: File) {
    setConfirmFile(undefined)
    let text: string
    try {
      text = await file.text()
    } catch {
      toast.error('Could not read that file.')
      return
    }
    let encrypted = false
    try {
      encrypted = !!(JSON.parse(text) as { ciphertext?: unknown })?.ciphertext
    } catch {
      /* not JSON / plain backup — restoreDataBackup will validate it */
    }
    if (encrypted) {
      setPendingImportText(text)
      setPass('')
      setPassMode('import')
      return
    }
    await withBusy('import', async () => {
      const { tables, rows } = await restoreDataBackup(text)
      toast.success(`Imported ${rows} records across ${tables} tables. Reloading…`)
      setTimeout(() => window.location.reload(), 1100)
    })
  }

  function submitLocalPass() {
    const passphrase = pass
    const mode = passMode
    if (mode === 'export' && passphrase.length < 8) {
      toast.error('Passphrase must be at least 8 characters.')
      return
    }
    if (mode === 'import' && passphrase.length === 0) {
      toast.error('Enter the passphrase for this file.')
      return
    }
    setPassMode(undefined)
    if (mode === 'export') {
      void runExport(passphrase)
    } else if (mode === 'import') {
      const text = pendingImportText
      void withBusy('import', async () => {
        if (!text) throw new Error('Nothing to import.')
        await restoreFromText(text, passphrase)
        toast.success('Imported from encrypted file. Reloading…')
        setTimeout(() => window.location.reload(), 1100)
      })
    }
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
    <Section icon={Database} title="Data" hint="Export, import, and encrypted Google Drive backup">
      {/* Encrypt toggle — controls Export / Import (Drive is always encrypted). */}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Encrypt backup / export</span>
          <span className="block text-xs text-muted-foreground">
            {encrypt
              ? 'Export is protected with a passphrase.'
              : 'Export is plain JSON — anyone with the file can read it.'}
          </span>
        </span>
        <Switch checked={encrypt} onCheckedChange={onToggleEncrypt} />
      </label>

      {/* Export → Downloads · Import replaces all local data */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={startExport} disabled={busy === 'export'}>
          <DownloadCloud className="size-4" />
          {busy === 'export' ? 'Exporting…' : 'Export'}
        </Button>
        <Button variant="outline" onClick={() => importRef.current?.click()} disabled={busy === 'import'}>
          <UploadCloud className="size-4" />
          {busy === 'import' ? 'Importing…' : 'Import'}
        </Button>
        <input
          ref={importRef}
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
      <p className="text-xs text-muted-foreground">
        Export saves a timestamped file to your Downloads. Import replaces all data on this device.
      </p>

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

      {/* Import confirmation — replacing all local data is destructive. */}
      <Dialog open={!!confirmFile} onOpenChange={(o) => !o && setConfirmFile(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import &amp; replace all data?</DialogTitle>
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
                if (f) void proceedImport(f)
              }}
            >
              <HardDriveDownload className="size-4" />
              Replace &amp; import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warn before turning encryption OFF. */}
      <Dialog open={warnOff} onOpenChange={setWarnOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              Turn off encryption?
            </DialogTitle>
            <DialogDescription>
              Your exported data won’t be encrypted — anyone with the file can read it. Google Drive
              backups stay encrypted regardless of this setting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarnOff(false)}>
              Keep encryption on
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setWarnOff(false)
                void updateSettings({ encryptBackup: false })
              }}
            >
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export / import passphrase prompt (encrypted file). */}
      <Dialog open={!!passMode} onOpenChange={(o) => !o && setPassMode(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {passMode === 'import' ? 'Decrypt import' : 'Encrypt export'}
            </DialogTitle>
            <DialogDescription>
              {passMode === 'import'
                ? 'Enter the passphrase this file was exported with. It decrypts on this device.'
                : 'Choose a passphrase (min 8 characters). You’ll need the exact same one to import it again — it’s never stored or sent anywhere.'}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Passphrase"
              className="pl-9"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submitLocalPass()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassMode(undefined)}>
              Cancel
            </Button>
            <Button variant={passMode === 'import' ? 'destructive' : 'default'} onClick={submitLocalPass}>
              {passMode === 'import' ? (
                <>
                  <UploadCloud className="size-4" />
                  Decrypt &amp; import
                </>
              ) : (
                <>
                  <DownloadCloud className="size-4" />
                  Encrypt &amp; export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
