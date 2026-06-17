// Encrypted backup/restore of THIS app's own database (cwm-backup-v1).
// Same scheme as the transaction app: AES-256-GCM / PBKDF2-SHA256 / 200k.
import {
  base64ToBytes,
  bytesToBase64,
  decryptEnvelope,
  encryptToEnvelope,
  type BackupEnvelope,
} from './crypto'
import { clearAllTables, db } from './db'

const TABLES = [
  'buildings',
  'molds',
  'workers',
  'owners',
  'attendance',
  'syncedTransactions',
  'otherExpenseTypes',
  'settings',
] as const

interface BlobMarker {
  __blob: true
  type: string
  data: string
}

function isBlobMarker(v: unknown): v is BlobMarker {
  return !!v && typeof v === 'object' && (v as BlobMarker).__blob === true
}

async function serializeRecord(rec: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...rec }
  for (const [k, v] of Object.entries(rec)) {
    if (v instanceof Blob) {
      const buf = new Uint8Array(await v.arrayBuffer())
      out[k] = { __blob: true, type: v.type, data: bytesToBase64(buf) } satisfies BlobMarker
    }
  }
  return out
}

function deserializeRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rec }
  for (const [k, v] of Object.entries(rec)) {
    if (isBlobMarker(v)) out[k] = new Blob([base64ToBytes(v.data)], { type: v.type })
  }
  return out
}

export interface BackupPayload {
  app: string
  schema: number
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

export async function buildBackupEnvelope(passphrase: string): Promise<BackupEnvelope> {
  const exportedAt = new Date().toISOString()
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const name of TABLES) {
    const rows = (await db.table(name).toArray()) as Record<string, unknown>[]
    tables[name] = await Promise.all(rows.map(serializeRecord))
  }
  const payload: BackupPayload = { app: 'centering-work-manager', schema: 1, exportedAt, tables }
  return encryptToEnvelope(JSON.stringify(payload), passphrase, exportedAt)
}

/** Build the envelope and trigger a file download. */
export async function downloadBackup(passphrase: string): Promise<void> {
  const env = await buildBackupEnvelope(passphrase)
  const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = env.createdAt.slice(0, 10)
  a.href = url
  a.download = `centering-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function restoreFromText(fileText: string, passphrase: string): Promise<void> {
  let env: BackupEnvelope
  try {
    env = JSON.parse(fileText)
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }
  if (env.app !== 'centering-work-manager') {
    throw new Error('This is not a Centering Work Manager backup.')
  }
  const plaintext = await decryptEnvelope(env, passphrase)
  let payload: BackupPayload
  try {
    payload = JSON.parse(plaintext)
  } catch {
    throw new Error('Decryption failed — wrong passphrase.')
  }

  await clearAllTables()
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLES) {
      const rows = payload.tables[name] ?? []
      await db.table(name).bulkAdd(rows.map(deserializeRecord))
    }
  })
}
