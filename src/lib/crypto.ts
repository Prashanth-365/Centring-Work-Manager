// ---------------------------------------------------------------------------
// Crypto: AES-256-GCM + PBKDF2(SHA-256, 200k). Two uses:
//   1. Encrypted backup/restore of THIS app's own database (we own both ends —
//      see `encryptToEnvelope` / `decryptEnvelope`, format "cwm-backup-v1").
//   2. Reading the transaction app's exported backup during Sync — decrypted
//      in-memory only (see `decryptFlexible`).
//
// ⚠️ TRANSACTION-APP INTEROP POINT ⚠️
// `decryptFlexible` is the ONE place that must agree with how the transaction
// app wrote its export. It auto-detects the common shapes (JSON envelope with
// salt/iv/ciphertext fields, or a packed base64 blob of salt|iv|ciphertext),
// base64 or hex, and an optional separate GCM auth tag. If a real export does
// not decrypt, adjust `CRYPTO_FIELD_NAMES` / `PACKED_LAYOUT` below to match.
// ---------------------------------------------------------------------------

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Coerce any Uint8Array to a real ArrayBuffer-backed BufferSource (TS 5.7+ strictness). */
function toBuf(u: Uint8Array): ArrayBuffer {
  if (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength && u.buffer instanceof ArrayBuffer) {
    return u.buffer
  }
  const out = new ArrayBuffer(u.byteLength)
  new Uint8Array(out).set(u)
  return out
}

export const PBKDF2_ITERATIONS = 200_000
export const PBKDF2_HASH = 'SHA-256'
export const SALT_BYTES = 16
export const IV_BYTES = 12
export const GCM_TAG_BYTES = 16

// ---- byte <-> string helpers ---------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const norm = b64.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = norm + '==='.slice((norm.length + 3) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim().replace(/^0x/, '')
  const out = new Uint8Array(clean.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

/** Decode a string that may be base64 or hex (heuristic; base64 is assumed unless clearly hex). */
function decodeMaybe(s: string): Uint8Array {
  const t = s.trim()
  const isHex = /^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0 && !/[g-z]/i.test(t)
  // base64 of random binary almost always contains non-hex chars; treat pure long
  // hex strings as hex, everything else as base64.
  if (isHex && t.length >= 24) return hexToBytes(t)
  return base64ToBytes(t)
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

// ---- key derivation -------------------------------------------------------

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
  hash: string = PBKDF2_HASH,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', toBuf(enc.encode(passphrase)), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBuf(salt), iterations, hash },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function decryptRaw(
  salt: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  iterations: number,
  hash: string,
  passphrase: string,
): Promise<string> {
  const key = await deriveKey(passphrase, salt, iterations, hash)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBuf(iv) }, key, toBuf(ciphertext))
    return dec.decode(pt)
  } catch {
    throw new Error('Decryption failed — wrong passphrase or unsupported backup format.')
  }
}

// ---- this app's own backup envelope (cwm-backup-v1) -----------------------

export interface BackupEnvelope {
  app: string
  format: string
  createdAt: string
  kdf: { name: 'PBKDF2'; hash: string; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  ciphertext: string
}

export async function encryptToEnvelope(
  plaintext: string,
  passphrase: string,
  createdAt: string,
): Promise<BackupEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBuf(iv) }, key, toBuf(enc.encode(plaintext))),
  )
  return {
    app: 'centering-work-manager',
    format: 'cwm-backup-v1',
    createdAt,
    kdf: { name: 'PBKDF2', hash: PBKDF2_HASH, iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(ct),
  }
}

export async function decryptEnvelope(env: BackupEnvelope, passphrase: string): Promise<string> {
  return decryptRaw(
    base64ToBytes(env.kdf.salt),
    base64ToBytes(env.cipher.iv),
    base64ToBytes(env.ciphertext),
    env.kdf.iterations ?? PBKDF2_ITERATIONS,
    env.kdf.hash ?? PBKDF2_HASH,
    passphrase,
  )
}

// ---- flexible decryptor for the transaction app's export ------------------

const CRYPTO_FIELD_NAMES = {
  salt: ['salt', 'kdfSalt', 'pbkdf2Salt', 's'],
  iv: ['iv', 'nonce', 'cipherIv', 'n'],
  ciphertext: ['ciphertext', 'cipherText', 'data', 'ct', 'encrypted', 'payload', 'content', 'cipher'],
  tag: ['tag', 'authTag', 'mac'],
  iterations: ['iterations', 'iter', 'rounds', 'c'],
}

const PACKED_LAYOUT = { salt: SALT_BYTES, iv: IV_BYTES }

function findString(obj: Record<string, unknown>, names: string[]): string | undefined {
  for (const n of names) if (typeof obj[n] === 'string') return obj[n] as string
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const n of names) {
        const nested = (v as Record<string, unknown>)[n]
        if (typeof nested === 'string') return nested
      }
    }
  }
  return undefined
}

function findNumber(obj: Record<string, unknown>, names: string[]): number | undefined {
  for (const n of names) if (typeof obj[n] === 'number') return obj[n] as number
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const n of names) {
        const nested = (v as Record<string, unknown>)[n]
        if (typeof nested === 'number') return nested
      }
    }
  }
  return undefined
}

/**
 * Decrypt a transaction-app backup file (text) to its plaintext JSON string.
 * Auto-detects the envelope shape. In-memory only — nothing is persisted here.
 */
export async function decryptFlexible(fileText: string, passphrase: string): Promise<string> {
  const trimmed = fileText.trim()

  // Case A — JSON envelope with named fields.
  if (trimmed.startsWith('{')) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(trimmed)
    } catch {
      throw new Error('Backup file is not valid JSON.')
    }
    const saltStr = findString(obj, CRYPTO_FIELD_NAMES.salt)
    const ivStr = findString(obj, CRYPTO_FIELD_NAMES.iv)
    const ctStr = findString(obj, CRYPTO_FIELD_NAMES.ciphertext)
    const tagStr = findString(obj, CRYPTO_FIELD_NAMES.tag)
    const iterations = findNumber(obj, CRYPTO_FIELD_NAMES.iterations) ?? PBKDF2_ITERATIONS

    if (saltStr && ivStr && ctStr) {
      let ct = decodeMaybe(ctStr)
      if (tagStr) ct = concatBytes(ct, decodeMaybe(tagStr)) // some libs store the GCM tag separately
      return decryptRaw(decodeMaybe(saltStr), decodeMaybe(ivStr), ct, iterations, PBKDF2_HASH, passphrase)
    }
    throw new Error('Could not locate salt / iv / ciphertext in the backup file.')
  }

  // Case B — packed base64: [salt][iv][ciphertext+tag].
  try {
    const packed = base64ToBytes(trimmed)
    const min = PACKED_LAYOUT.salt + PACKED_LAYOUT.iv + GCM_TAG_BYTES
    if (packed.length > min) {
      const salt = packed.slice(0, PACKED_LAYOUT.salt)
      const iv = packed.slice(PACKED_LAYOUT.salt, PACKED_LAYOUT.salt + PACKED_LAYOUT.iv)
      const ct = packed.slice(PACKED_LAYOUT.salt + PACKED_LAYOUT.iv)
      return decryptRaw(salt, iv, ct, PBKDF2_ITERATIONS, PBKDF2_HASH, passphrase)
    }
  } catch {
    /* fall through */
  }

  throw new Error('Unrecognised backup format — expected JSON or a base64 blob.')
}

// ---- app-lock PIN hashing -------------------------------------------------

export async function derivePinHash(
  pin: string,
  saltB64?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const baseKey = await crypto.subtle.importKey('raw', toBuf(enc.encode(pin)), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toBuf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  )
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) }
}

export async function verifyPin(pin: string, hash: string, saltB64: string): Promise<boolean> {
  const { hash: candidate } = await derivePinHash(pin, saltB64)
  return candidate === hash
}
