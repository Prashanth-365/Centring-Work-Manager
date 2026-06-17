// Reading the transaction app's encrypted backup and upserting the
// `Construction` transactions into syncedTransactions — keyed on UUID `id`,
// NEVER slNo (slNo re-sequences on backdated inserts).
import { decryptFlexible } from './crypto'
import { db } from './db'
import { now } from './ids'
import type { SyncedTransaction, TxnDirection } from './types'

const ID_KEYS = ['id', 'uuid', 'uid', 'txnId', 'transactionId']
const DATE_KEYS = ['date', 'txnDate', 'transactionDate', 'createdAt', 'time', 'timestamp']
const AMOUNT_KEYS = ['amount', 'amt', 'value', 'total']
const CAT_KEYS = ['category', 'cat']
const SUB_KEYS = ['subCategory', 'subcategory', 'subCat', 'sub']
const DESC_KEYS = ['description', 'note', 'notes', 'desc', 'remark', 'remarks', 'narration', 'particulars']
const DIR_KEYS = ['direction', 'type', 'txnType', 'flow', 'kind', 'drcr']

type AnyObj = Record<string, unknown>

function pick(o: AnyObj, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k]
  return undefined
}

function normDate(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  const s = String(v)
  // 'yyyy-MM-dd' or full ISO — take the date part.
  const m = s.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : s.slice(0, 10)
}

function normDir(v: unknown, subCategory: string): TxnDirection {
  const s = String(v ?? '').toLowerCase()
  if (/cred|income|receipt|received|^in$|^\+/.test(s)) return 'credit'
  if (/deb|expense|paid|payment|^out$|^-/.test(s)) return 'debit'
  // Domain fallback: only owner receipts are money IN.
  return subCategory === 'OwnerReceipt' ? 'credit' : 'debit'
}

function looksLikeTxn(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false
  const r = o as AnyObj
  const hasAmount = AMOUNT_KEYS.some((k) => r[k] != null)
  const hasCat = CAT_KEYS.some((k) => r[k] != null) || SUB_KEYS.some((k) => r[k] != null)
  return hasAmount && hasCat
}

/** Locate the transactions array within an arbitrary decrypted backup object. */
function findTransactions(root: unknown): AnyObj[] {
  if (Array.isArray(root) && root.some(looksLikeTxn)) return root as AnyObj[]
  if (!root || typeof root !== 'object') return []
  const r = root as AnyObj

  // Direct property
  if (Array.isArray(r.transactions) && (r.transactions as unknown[]).some(looksLikeTxn)) {
    return r.transactions as AnyObj[]
  }

  // dexie-export-import: { data: { data: [ { tableName, rows } ] } }
  const dexieData = (r.data as AnyObj | undefined)?.data
  if (Array.isArray(dexieData)) {
    const table = (dexieData as AnyObj[]).find((t) => (t as AnyObj).tableName === 'transactions')
    if (table && Array.isArray((table as AnyObj).rows)) return (table as AnyObj).rows as AnyObj[]
  }

  // tables.transactions
  const tables = r.tables as AnyObj | undefined
  if (tables && Array.isArray(tables.transactions)) return tables.transactions as AnyObj[]

  // Deep search: the largest array whose elements look like transactions.
  let best: AnyObj[] = []
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node == null || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      if (node.length && node.filter(looksLikeTxn).length >= Math.max(1, node.length * 0.5)) {
        if (node.length > best.length) best = node as AnyObj[]
      }
      node.forEach((c) => walk(c, depth + 1))
      return
    }
    for (const v of Object.values(node as AnyObj)) walk(v, depth + 1)
  }
  walk(root, 0)
  return best
}

export interface RawTxn {
  id: string
  date: string
  amount: number
  direction: TxnDirection
  subCategory: string
  description?: string
}

/** Parse decrypted plaintext → the Construction transactions only. */
export function extractConstruction(plaintext: string): RawTxn[] {
  let root: unknown
  try {
    root = JSON.parse(plaintext)
  } catch {
    throw new Error('Decrypted file is not valid JSON.')
  }
  const arr = findTransactions(root)
  const out: RawTxn[] = []
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue
    const idVal = pick(t, ID_KEYS)
    if (typeof idVal !== 'string' || !idVal) continue // require a stable UUID; never slNo
    const category = String(pick(t, CAT_KEYS) ?? '')
    if (category.toLowerCase() !== 'construction') continue
    const amountRaw = Number(pick(t, AMOUNT_KEYS) ?? 0)
    if (Number.isNaN(amountRaw)) continue
    const subCategory = String(pick(t, SUB_KEYS) ?? 'OtherExpense')
    const descVal = pick(t, DESC_KEYS)
    out.push({
      id: idVal,
      date: normDate(pick(t, DATE_KEYS)),
      amount: Math.abs(amountRaw),
      direction: normDir(pick(t, DIR_KEYS), subCategory),
      subCategory,
      description: descVal != null ? String(descVal) : undefined,
    })
  }
  return out
}

export interface SyncResult {
  totalConstruction: number
  added: number
  flagged: number
  updated: number
}

/** Upsert by UUID. New → unassigned. Amount change on an assigned txn → needsReview. */
export async function syncConstruction(raw: RawTxn[]): Promise<SyncResult> {
  let added = 0
  let flagged = 0
  let updated = 0
  await db.transaction('rw', db.syncedTransactions, async () => {
    for (const r of raw) {
      const existing = await db.syncedTransactions.get(r.id)
      const ts = now()
      if (!existing) {
        await db.syncedTransactions.add({
          id: r.id,
          date: r.date,
          amount: r.amount,
          direction: r.direction,
          subCategory: r.subCategory,
          description: r.description,
          lastSeenAmount: r.amount,
          assignmentStatus: 'unassigned',
          firstSeenAt: ts,
          updatedAt: ts,
        })
        added += 1
      } else {
        const amountChanged = existing.lastSeenAmount !== r.amount
        const patch: Partial<SyncedTransaction> = {
          date: r.date,
          amount: r.amount,
          direction: r.direction,
          subCategory: r.subCategory,
          description: r.description,
          lastSeenAmount: r.amount,
          updatedAt: ts,
        }
        if (amountChanged && existing.assignmentStatus === 'assigned') {
          patch.assignmentStatus = 'needsReview' // keep prior assignment, flag it
          flagged += 1
        }
        await db.syncedTransactions.update(r.id, patch)
        updated += 1
      }
    }
  })
  return { totalConstruction: raw.length, added, flagged, updated }
}

/** Full flow: decrypt in-memory only, extract Construction, upsert. */
export async function decryptAndSync(fileText: string, passphrase: string): Promise<SyncResult> {
  const plaintext = await decryptFlexible(fileText, passphrase)
  const raw = extractConstruction(plaintext)
  return syncConstruction(raw)
}
