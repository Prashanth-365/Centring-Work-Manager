import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, FileUp, Lock, ShieldCheck, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { decryptAndSync, type SyncResult } from '@/lib/sync'
import { cn } from '@/lib/utils'

export function SyncScreen() {
  const [file, setFile] = React.useState<File>()
  const [pass, setPass] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<SyncResult>()
  const [error, setError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function run() {
    if (!file) {
      setError('Choose the transaction app backup file first.')
      return
    }
    setBusy(true)
    setError('')
    setResult(undefined)
    try {
      const text = await file.text()
      const res = await decryptAndSync(text, pass)
      setResult(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
      <PageHeader title="Sync transactions" subtitle="Read from your transaction app" back />
      <div className="space-y-4 p-4">
        <div className="flex gap-2.5 rounded-xl border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="size-5 shrink-0 text-primary" />
          <p>
            Pick your transaction app’s encrypted backup and enter its passphrase. It’s decrypted
            <span className="font-medium text-foreground"> on this device only</span>; just the
            <span className="font-medium text-foreground"> Construction</span> transactions are saved here.
          </p>
        </div>

        <Field label="Backup file">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0])
              setResult(undefined)
              setError('')
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border border-dashed border-input bg-card px-3 py-3 text-left transition hover:bg-accent',
              file && 'border-solid border-primary/40',
            )}
          >
            <FileUp className="size-5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {file ? file.name : 'Choose backup .json'}
            </span>
          </button>
        </Field>

        <Field label="Passphrase">
          {(fid) => (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={fid}
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Backup passphrase"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          )}
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="size-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <Button onClick={run} size="lg" className="w-full" disabled={busy}>
          {busy ? 'Decrypting…' : 'Sync now'}
        </Button>

        {result && (
          <div className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-4">
            <div className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="size-5" />
              Sync complete
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="tabular text-2xl font-bold">{result.added}</p>
                <p className="text-xs text-muted-foreground">new</p>
              </div>
              <div>
                <p className="tabular text-2xl font-bold">{result.flagged}</p>
                <p className="text-xs text-muted-foreground">re-flagged</p>
              </div>
              <div>
                <p className="tabular text-2xl font-bold">{result.totalConstruction}</p>
                <p className="text-xs text-muted-foreground">construction</p>
              </div>
            </div>
            <Button asChild className="w-full" variant="secondary">
              <Link to="/payments">Go to review queue</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
