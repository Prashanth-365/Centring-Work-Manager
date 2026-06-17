// Reading the transaction app's backup and upserting its `Construction`
// transactions into syncedTransactions — keyed on `id`, NEVER slNo (slNo
// re-sequences on backdated inserts).
//
// Two source shapes are handled:
//   1. The documented shape (§8) — e.g. FinSight's `dumpAll()` export:
//      { data: { categories:[{id, name, parentId}],
//      transactions:[{id, dateTime, categoryId, subCategoryId, amount, txnType,
//      importFingerprint, …}] } }. Transactions carry only NUMERIC category ids;
//      the string "Construction" lives solely in `categories`. We therefore JOIN
//      by id: find the "Construction" category by name, collect its id + every
//      child id, and keep a txn whose `categoryId` OR `subCategoryId` is in that
//      set. The leaf sub-category name → our type via the categoryMap (+ a
//      normalized auto-match).
//   2. A heuristic fallback for older/unknown exports (string category fields).
import { decryptFlexible } from './crypto'
import {
  DEFAULT_CATEGORY_MATCHES,
  OTHER_EXPENSE_NAME_HINTS,
  autoMatchSubCategory,
  normalizeCategoryName,
} from './constants'
import { db } from './db'
import { now } from './ids'
import { getCategoryMap, setCategoryMap } from './repo'
import type { SubCategory, SyncedTransaction, TxnDirection } from './types'

const ID_KEYS = ['id', 'uuid', 'uid', 'txnId', 'transactionId']
const DATE_KEYS = ['dateTime', 'date', 'txnDate', 'transactionDate', 'createdAt', 'time', 'timestamp']
const AMOUNT_KEYS = ['amount', 'amt', 'value', 'total']
const CAT_KEYS = ['category', 'cat']
const SUB_KEYS = ['subCategory', 'subcategory', 'subCat', 'sub']
const DESC_KEYS = ['description', 'note', 'notes', 'desc', 'remark', 'remarks', 'narration', 'particulars']
const DIR_KEYS = ['direction', 'txnType', 'type', 'flow', 'kind', 'drcr']
const FP_KEYS = ['importFingerprint', 'fingerprint', 'fp']

/** Membership set of normalized names that auto-match to a non-default type. */
const DEFAULT_MATCH_KEYS: Record<string, true> = Object.fromEntries(
  Object.keys(DEFAULT_CATEGORY_MATCHES).map((k) => [k, true]),
)

type AnyObj = Record<string, unknown>

function pick(o: AnyObj, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k]
  return undefined
}

function strOrUndef(v: unknown): string | undefined {
  return v != null ? String(v) : undefined
}

/** Unix timestamps may be seconds or milliseconds — detect by magnitude. */
function toMillis(v: number): number {
  return v < 1e12 ? v * 1000 : v
}

function normDate(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') return new Date(toMillis(v)).toISOString().slice(0, 10)
  const s = String(v)
  const m = s.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : s.slice(0, 10)
}

function dateTimeMs(v: unknown): number | undefined {
  if (typeof v === 'number') return toMillis(v)
  return undefined
}

function normDir(v: unknown, type: SubCategory): TxnDirection {
  const s = String(v ?? '').toLowerCase()
  if (/cred|income|receipt|received|^in$|^\+/.test(s)) return 'credit'
  if (/deb|expense|paid|payment|^out$|^-/.test(s)) return 'debit'
  // Domain fallback: only owner receipts are money IN.
  return type === 'OwnerReceipt' ? 'credit' : 'debit'
}

export interface RawTxn {
  id: string
  date: string
  dateTime?: number
  amount: number
  direction: TxnDirection
  /** Provisional mapped type — re-resolved against the persisted categoryMap in decryptAndSync. */
  subCategory: SubCategory
  /** The raw source sub-category name (pre-mapping). */
  typeName?: string
  importFingerprint?: string
  description?: string
}

// ---- documented shape (category hierarchy) --------------------------------

function parentIdOf(c: AnyObj): unknown {
  return c.parentID ?? c.parentId ?? c.parent ?? null
}

/** Names of the top-level categories (parent == null) — for diagnostics. */
function topLevelCategoryNames(cats: AnyObj[]): string[] {
  return cats
    .filter((c) => parentIdOf(c) == null)
    .map((c) => String(c.name ?? '').trim())
    .filter(Boolean)
}

const CAT_ID_KEYS = ['categoryId', 'categoryID', 'catId', 'category']
const SUBCAT_ID_KEYS = ['subCategoryId', 'subCategoryID', 'subcategoryId', 'subCatId']

/** Parse the documented {categories, transactions} shape — e.g. FinSight's
 * `dumpAll()` export. Transactions carry only NUMERIC category ids; the string
 * "Construction" lives solely in `categories`, so we JOIN by id: collect the
 * Construction category's id + every child id, then keep a txn whose `categoryId`
 * OR `subCategoryId` is in that set. Returns null if this isn't the documented
 * shape (so the caller can fall back to the heuristic). THROWS a descriptive
 * error if it IS the documented shape but has no "Construction" category. */
function extractDocumented(root: unknown): RawTxn[] | null {
  const r = (root ?? {}) as AnyObj
  const data = ((r.data as AnyObj) ?? r) as AnyObj
  const categories = data.categories
  const transactions = data.transactions
  if (!Array.isArray(categories) || !Array.isArray(transactions)) return null

  const cats = categories as AnyObj[]
  // "Construction" is a user-created category — match by name, never a hard-coded id.
  const construction =
    cats.find(
      (c) => normalizeCategoryName(String(c.name ?? '')) === 'construction' && parentIdOf(c) == null,
    ) ?? cats.find((c) => normalizeCategoryName(String(c.name ?? '')) === 'construction')
  if (!construction) {
    // The file IS a finance export, but there's no Construction category — say
    // what we saw so the user can fix it (never fail silently).
    const names = topLevelCategoryNames(cats)
    throw new Error(
      names.length
        ? `No "Construction" category was found in this export. Top-level categories seen: ${names.join(
            ', ',
          )}. Add or rename one to "Construction" in the finance app, then export again.`
        : 'No "Construction" category was found — this export has no top-level categories.',
    )
  }
  const constructionId = String(construction.id ?? '')
  if (!constructionId) return null

  // id → category name, and the set of Construction's own id + all its child ids.
  const nameById = new Map<string, string>()
  const constructionIds = new Set<string>([constructionId])
  for (const c of cats) {
    if (c.id != null) nameById.set(String(c.id), String(c.name ?? ''))
    if (String(parentIdOf(c) ?? '') === constructionId) constructionIds.add(String(c.id))
  }

  const out: RawTxn[] = []
  for (const t of transactions as AnyObj[]) {
    const catRaw = pick(t, CAT_ID_KEYS)
    const subRaw = pick(t, SUBCAT_ID_KEYS)
    const catId = catRaw != null ? String(catRaw) : ''
    const subId = subRaw != null ? String(subRaw) : ''
    // Belongs to Construction if either id resolves into the Construction subtree.
    if (!constructionIds.has(catId) && !constructionIds.has(subId)) continue

    const id = strOrUndef(pick(t, ID_KEYS))
    if (!id) continue // require a stable id; never slNo
    const amount = Math.abs(Number(t.amount ?? 0)) // amount is always positive; direction is in txnType
    if (Number.isNaN(amount)) continue

    // The classifiable name is the leaf sub-category: prefer subCategoryId's name,
    // else categoryId's name when the txn is filed on a Construction *child*.
    const rawName =
      (subId ? nameById.get(subId) : undefined) ??
      (catId && catId !== constructionId ? nameById.get(catId) : undefined) ??
      String(pick(t, SUB_KEYS) ?? '')
    const type = autoMatchSubCategory(rawName)
    const dt = pick(t, DATE_KEYS)
    out.push({
      id,
      date: normDate(dt),
      dateTime: dateTimeMs(dt),
      amount,
      direction: normDir(pick(t, DIR_KEYS), type),
      subCategory: type,
      typeName: rawName || undefined,
      importFingerprint: strOrUndef(pick(t, FP_KEYS)),
      description: strOrUndef(pick(t, DESC_KEYS)),
    })
  }
  return out
}

// ---- heuristic fallback (string category fields) --------------------------

function looksLikeTxn(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false
  const r = o as AnyObj
  const hasAmount = AMOUNT_KEYS.some((k) => r[k] != null)
  const hasCat = CAT_KEYS.some((k) => r[k] != null) || SUB_KEYS.some((k) => r[k] != null)
  return hasAmount && hasCat
}

function findTransactions(root: unknown): AnyObj[] {
  if (Array.isArray(root) && root.some(looksLikeTxn)) return root as AnyObj[]
  if (!root || typeof root !== 'object') return []
  const r = root as AnyObj
  if (Array.isArray(r.transactions) && (r.transactions as unknown[]).some(looksLikeTxn)) {
    return r.transactions as AnyObj[]
  }
  const dexieData = (r.data as AnyObj | undefined)?.data
  if (Array.isArray(dexieData)) {
    const table = (dexieData as AnyObj[]).find((t) => (t as AnyObj).tableName === 'transactions')
    if (table && Array.isArray((table as AnyObj).rows)) return (table as AnyObj).rows as AnyObj[]
  }
  const tables = r.tables as AnyObj | undefined
  if (tables && Array.isArray(tables.transactions)) return tables.transactions as AnyObj[]
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

function extractHeuristic(root: unknown): RawTxn[] {
  const arr = findTransactions(root)
  const out: RawTxn[] = []
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue
    const idVal = strOrUndef(pick(t, ID_KEYS)) // accept string OR numeric ids
    if (!idVal) continue
    const category = String(pick(t, CAT_KEYS) ?? '')
    if (normalizeCategoryName(category) !== 'construction') continue
    const amountRaw = Number(pick(t, AMOUNT_KEYS) ?? 0)
    if (Number.isNaN(amountRaw)) continue
    const rawName = String(pick(t, SUB_KEYS) ?? '')
    const type = autoMatchSubCategory(rawName)
    const dt = pick(t, DATE_KEYS)
    out.push({
      id: idVal,
      date: normDate(dt),
      dateTime: dateTimeMs(dt),
      amount: Math.abs(amountRaw),
      direction: normDir(pick(t, DIR_KEYS), type),
      subCategory: type,
      typeName: rawName || undefined,
      importFingerprint: strOrUndef(pick(t, FP_KEYS)),
      description: strOrUndef(pick(t, DESC_KEYS)),
    })
  }
  return out
}

/** Parse decrypted plaintext → the Construction transactions only. Pure.
 * Throws descriptive errors (never silent) when the file shape is unexpected or
 * the documented shape lacks a "Construction" category. */
export function extractConstruction(plaintext: string): RawTxn[] {
  let root: unknown
  try {
    root = JSON.parse(plaintext)
  } catch {
    throw new Error('Decrypted file is not valid JSON.')
  }

  // Documented shape throws on "no Construction"; otherwise returns the rows or
  // null (not the documented shape → try the heuristic).
  const documented = extractDocumented(root)
  if (documented) return documented

  const heuristic = extractHeuristic(root)
  if (heuristic.length > 0) return heuristic

  // Nothing matched — tell the user what the file actually looked like.
  throw new Error(unexpectedShapeMessage(root))
}

/** Build a helpful message describing the unrecognised file shape. */
function unexpectedShapeMessage(root: unknown): string {
  if (!root || typeof root !== 'object') {
    return 'Unexpected file shape — expected a finance export with { data: { categories, transactions } }.'
  }
  const r = root as AnyObj
  const data = (r.data as AnyObj | undefined) ?? undefined
  const topKeys = Object.keys(r)
  if (data && typeof data === 'object') {
    const dataKeys = Object.keys(data)
    const hasCats = Array.isArray(data.categories)
    const hasTxns = Array.isArray(data.transactions)
    if (!hasCats || !hasTxns) {
      return `Could not read transactions — "data" is missing ${
        !hasCats && !hasTxns ? 'categories and transactions' : !hasCats ? 'categories' : 'transactions'
      }. Keys under data: ${dataKeys.join(', ') || '(none)'}.`
    }
    return 'Found categories and transactions but no Construction transactions to import.'
  }
  return `Unexpected file shape — no "data" object. Top-level keys: ${
    topKeys.join(', ') || '(none)'
  }. Expected a finance export with { data: { categories, transactions } }.`
}

export interface SyncResult {
  totalConstruction: number
  added: number
  flagged: number
  updated: number
  carried: number
  /** Source category names not recognised by auto-match — nudge the user to map them. */
  unmatched: string[]
}

/** Upsert by UUID. New → unassigned. Amount change on an assigned txn →
 * needsReview. Assignments carry across an id change via importFingerprint. */
export async function syncConstruction(raw: RawTxn[]): Promise<Omit<SyncResult, 'unmatched'>> {
  let added = 0
  let flagged = 0
  let updated = 0
  let carried = 0
  const incomingIds = new Set(raw.map((r) => r.id))

  await db.transaction('rw', db.syncedTransactions, async () => {
    for (const r of raw) {
      const existing = await db.syncedTransactions.get(r.id)
      const ts = now()

      if (!existing) {
        const row: SyncedTransaction = {
          id: r.id,
          date: r.date,
          dateTime: r.dateTime,
          amount: r.amount,
          direction: r.direction,
          txnType: r.direction,
          subCategory: r.subCategory,
          typeName: r.typeName,
          importFingerprint: r.importFingerprint,
          description: r.description,
          lastSeenAmount: r.amount,
          assignmentStatus: 'unassigned',
          firstSeenAt: ts,
          updatedAt: ts,
        }
        // Pre-fill otherExpenseType when the source name is a known type.
        if (row.subCategory === 'OtherExpense' && r.typeName) {
          const hint = OTHER_EXPENSE_NAME_HINTS[normalizeCategoryName(r.typeName)]
          if (hint) row.otherExpenseType = hint
        }
        // Carry an assignment from a now-gone txn with the same fingerprint.
        if (r.importFingerprint) {
          const carryFrom = await db.syncedTransactions
            .where('importFingerprint')
            .equals(r.importFingerprint)
            .filter((t) => t.assignmentStatus === 'assigned' && !incomingIds.has(t.id))
            .first()
          if (carryFrom) {
            row.assignmentStatus = 'assigned'
            row.buildingId = carryFrom.buildingId
            row.moldId = carryFrom.moldId
            row.workerId = carryFrom.workerId
            row.materialDescription = carryFrom.materialDescription
            row.otherExpenseType = carryFrom.otherExpenseType ?? row.otherExpenseType
            await db.syncedTransactions.delete(carryFrom.id)
            carried += 1
          }
        }
        await db.syncedTransactions.add(row)
        added += 1
      } else {
        const amountChanged = existing.lastSeenAmount !== r.amount
        const patch: Partial<SyncedTransaction> = {
          date: r.date,
          dateTime: r.dateTime,
          amount: r.amount,
          direction: r.direction,
          txnType: r.direction,
          subCategory: r.subCategory,
          typeName: r.typeName,
          importFingerprint: r.importFingerprint,
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
  return { totalConstruction: raw.length, added, flagged, updated, carried }
}

/** Resolve each raw txn's type against the persisted categoryMap, seeding new
 * auto-matches so they appear in Settings → Category Mapping. Returns the names
 * that fell through to OtherExpense (i.e. weren't recognised). */
async function resolveTypes(raw: RawTxn[]): Promise<string[]> {
  const names = Array.from(new Set(raw.map((r) => r.typeName).filter(Boolean) as string[]))
  const resolved = new Map<string, SubCategory>()
  const unmatched: string[] = []
  for (const name of names) {
    const saved = await getCategoryMap(name)
    if (saved) {
      resolved.set(name, saved)
      continue
    }
    const auto = autoMatchSubCategory(name)
    await setCategoryMap(name, auto) // persist so the user can correct it later
    resolved.set(name, auto)
    if (!(normalizeCategoryName(name) in DEFAULT_MATCH_KEYS)) unmatched.push(name)
  }
  for (const r of raw) {
    if (r.typeName) r.subCategory = resolved.get(r.typeName) ?? r.subCategory
  }
  return unmatched
}

async function resolvePlaintext(fileText: string, passphrase: string): Promise<string> {
  const trimmed = fileText.trim()
  if (!passphrase) {
    // No passphrase: accept a plain-JSON backup; reject an obviously encrypted one.
    try {
      const obj = JSON.parse(trimmed) as AnyObj
      const looksEncrypted =
        obj &&
        typeof obj === 'object' &&
        (obj.ciphertext != null || obj.cipherText != null || obj.ct != null || obj.encrypted != null)
      if (looksEncrypted) throw new Error('This backup is encrypted — enter its passphrase.')
      return trimmed
    } catch (e) {
      if (e instanceof Error && e.message.includes('encrypted')) throw e
      throw new Error('Could not read the file. If it is encrypted, enter the passphrase.')
    }
  }
  return decryptFlexible(trimmed, passphrase)
}

/** Full flow: decrypt (or read plain) in-memory only, extract, resolve, upsert. */
export async function decryptAndSync(fileText: string, passphrase: string): Promise<SyncResult> {
  const plaintext = await resolvePlaintext(fileText, passphrase)
  const raw = extractConstruction(plaintext)
  const unmatched = await resolveTypes(raw)
  const result = await syncConstruction(raw)
  return { ...result, unmatched }
}
