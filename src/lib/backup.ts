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
  'categoryMap',
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
  const payload: BackupPayload = { app: 'centering-work-manager', schema: 2, exportedAt, tables }
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

// ---- plain-JSON backup ( { version, exportedAt, data:{...tables} } ) -------
// Unencrypted, portable shape — used by the Settings → Data UI and Google Drive.
// Mirrors the finance app's export layout (every table nested under `data`).

/** Current backup schema version — matches the Dexie schema (v2). */
export const BACKUP_VERSION = 2

export interface DataBackup {
  version: number
  exportedAt: number // epoch ms
  data: Record<string, Record<string, unknown>[]>
}

/** Read the whole DB into the plain-JSON backup shape (Blobs → markers). */
export async function buildDataBackup(): Promise<DataBackup> {
  const data: Record<string, Record<string, unknown>[]> = {}
  for (const name of TABLES) {
    const rows = (await db.table(name).toArray()) as Record<string, unknown>[]
    data[name] = await Promise.all(rows.map(serializeRecord))
  }
  return { version: BACKUP_VERSION, exportedAt: Date.now(), data }
}

/** Serialize the DB to a pretty JSON string for download / upload. */
export async function exportDataBackup(): Promise<string> {
  return JSON.stringify(await buildDataBackup(), null, 2)
}

/** Parse + validate a plain-JSON backup. Pure. Throws a descriptive error
 * (never silent) that says what was actually seen when the shape is wrong. */
export function validateDataBackup(fileText: string): DataBackup {
  let obj: unknown
  try {
    obj = JSON.parse(fileText)
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Backup file is empty or not a JSON object.')
  }
  const o = obj as Record<string, unknown>
  // An encrypted (cwm-backup-v1) envelope is a different format — guide the user.
  if (o.ciphertext != null && o.data == null) {
    throw new Error('This is an encrypted backup — use the encrypted restore with its passphrase.')
  }
  if (typeof o.version !== 'number') {
    throw new Error('Backup is missing a numeric "version" field — it may not be a backup file.')
  }
  if (o.version > BACKUP_VERSION) {
    throw new Error(
      `Backup version ${o.version} is newer than this app supports (${BACKUP_VERSION}). Update the app first.`,
    )
  }
  if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) {
    throw new Error('Backup is missing its "data" object of tables.')
  }
  const data = o.data as Record<string, unknown>
  const hasAnyKnownTable = TABLES.some((t) => Array.isArray(data[t]))
  if (!hasAnyKnownTable) {
    const seen = Object.keys(data)
    throw new Error(
      `Backup "data" has no known tables. Expected e.g. ${TABLES.slice(0, 3).join(', ')}…; saw: ${
        seen.length ? seen.join(', ') : '(none)'
      }.`,
    )
  }
  return {
    version: o.version,
    exportedAt: Number(o.exportedAt) || 0,
    data: data as DataBackup['data'],
  }
}

/** Restore a plain-JSON backup: validate, then replace every table. Returns a
 * summary for the success toast. Throws descriptive errors (never silent). */
export async function restoreDataBackup(fileText: string): Promise<{ tables: number; rows: number }> {
  const backup = validateDataBackup(fileText)
  let tables = 0
  let rows = 0
  await clearAllTables()
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLES) {
      const arr = backup.data[name]
      if (!Array.isArray(arr)) continue
      tables += 1
      rows += arr.length
      await db.table(name).bulkAdd(arr.map(deserializeRecord))
    }
  })
  return { tables, rows }
}
