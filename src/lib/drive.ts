// Google Drive integration via Google Identity Services (GIS token client) — NOT
// the deprecated gapi.auth2. Gated by `driveConfigured()` so the app builds/runs
// fine when Drive isn't set up.
//
// Architecture (see BUILD_PROMPTS.md):
//   - One shared app Client ID identifies the APP, not the user. It comes from
//     `VITE_GOOGLE_CLIENT_ID` (or, for the owner-operator's convenience, an
//     optional per-device override via `setDriveClientId`). No client secret —
//     the public client id is safe to ship.
//   - Each user signs in with their OWN Google account and the backup is stored
//     in Drive's hidden, app-private `appDataFolder` IN THEIR OWN DRIVE. The app
//     can only see files IT created; the developer can never read user data.
//   - The payload is encrypted on-device (AES-256-GCM / PBKDF2) BEFORE upload —
//     see backup.ts (`buildBackupEnvelope` / `restoreFromText`).
//   - The OAuth access token is in-memory only and re-acquired on expiry.
//
// Scope is `drive.appdata` only, so this app cannot see (and never uploads to)
// the user's normal Drive. Importing the finance app's export stays a manual,
// local-file step on the Sync screen. Verifying end-to-end needs a real client
// id + OAuth consent, which can't be exercised headlessly.
import { GOOGLE_CLIENT_ID } from './env'
import { isNative } from './native'

const DRIVE_SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

/** Fixed filename for THIS app's encrypted Drive backup — overwritten in place. */
export const DRIVE_BACKUP_NAME = 'construction-backup.json.enc'

/** Treat the token as expired this many ms early to avoid edge-of-expiry 401s. */
const TOKEN_SKEW_MS = 5_000

// Minimal ambient typings — the SDK attaches to window at runtime.
declare global {
  interface Window {
    google?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// Runtime client id (optional per-device override); falls back to the build env.
let runtimeClientId = ''

/** Set the OAuth client id from Settings. Call on app boot + when it changes. */
export function setDriveClientId(id: string | undefined): void {
  const next = (id ?? '').trim()
  if (next !== runtimeClientId) {
    runtimeClientId = next
    accessToken = undefined // a new client id invalidates any existing token
    tokenExpiresAt = 0
  }
}

function effectiveClientId(): string {
  return runtimeClientId || GOOGLE_CLIENT_ID
}

export function driveConfigured(): boolean {
  return effectiveClientId() !== ''
}

const scriptPromises = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src)
  if (existing) return existing
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
  scriptPromises.set(src, p)
  return p
}

// ---- in-memory token + connected user ------------------------------------

let accessToken: string | undefined
let tokenExpiresAt = 0
let driveUser: DriveUser | undefined

export interface DriveUser {
  email?: string
  name?: string
  picture?: string
}

/** True while a non-expired access token is held this session. */
export function isDriveConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt - TOKEN_SKEW_MS
}

/** The Google account connected this session, if any. */
export function getDriveUser(): DriveUser | undefined {
  return driveUser
}

/** Forget + revoke the current token (sign-out within this app). */
export function disconnectDrive(): void {
  const token = accessToken
  accessToken = undefined
  tokenExpiresAt = 0
  driveUser = undefined
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {})
    } catch {
      /* best-effort revoke */
    }
  }
}

/** Obtain (or reuse) a Drive access token via the GIS token client. */
async function getToken(forcePrompt = false): Promise<string> {
  if (!forcePrompt && isDriveConnected() && accessToken) return accessToken

  if (isNative()) {
    // GIS refuses to run inside an embedded WebView. The Android Chrome
    // Custom-Tab + deep-link flow is not wired up yet — fail with a clear hint
    // rather than silently breaking. (Tracked for a later milestone.)
    throw new Error(
      'Google Drive sign-in is available in the web app for now. Use a local backup on this device.',
    )
  }

  const clientId = effectiveClientId()
  if (!clientId) throw new Error('Google Drive is not configured — set VITE_GOOGLE_CLIENT_ID.')
  await loadScript(GIS_SRC)
  const google = window.google
  if (!google?.accounts?.oauth2)
    throw new Error('Google Identity could not be loaded — check your connection.')

  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Google authorization was cancelled or failed.'))
          return
        }
        accessToken = resp.access_token
        tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000
        resolve(resp.access_token)
      },
    })
    // Silent (no consent UI) when we already have a session; prompt otherwise.
    client.requestAccessToken({ prompt: forcePrompt || !driveUser ? 'consent' : '' })
  })
}

/** Fetch the signed-in user's basic profile (email/name) for status display. */
async function fetchUserInfo(token: string): Promise<DriveUser> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return {}
    const u = (await r.json()) as { email?: string; name?: string; picture?: string }
    return { email: u.email, name: u.name, picture: u.picture }
  } catch {
    return {}
  }
}

/** Run the GIS token flow ("Connect Google Drive") and load the user profile. */
export async function connectDrive(): Promise<DriveUser> {
  const token = await getToken(true)
  driveUser = await fetchUserInfo(token)
  return driveUser
}

/** Authorized fetch that retries once after a silent re-auth on 401, and turns
 * the common Drive 403s into actionable messages. */
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token = await getToken()
  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  })
  let r = await fetch(input, withAuth(token))
  if (r.status === 401) {
    accessToken = undefined
    tokenExpiresAt = 0
    token = await getToken(true)
    r = await fetch(input, withAuth(token))
  }
  if (r.status === 403) {
    const body = await r.text().catch(() => '')
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(body)) {
      throw new Error(
        'Google Drive API is not enabled for this project — enable it in Google Cloud Console.',
      )
    }
    if (/insufficient|insufficientPermissions|scope/i.test(body)) {
      throw new Error('Missing Drive permission — disconnect and connect again to grant access.')
    }
    throw new Error('Google Drive refused the request (403).')
  }
  return r
}

export interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
}

/** Find THIS app's single backup in the user's private appDataFolder. */
async function findDriveBackup(): Promise<DriveFile | undefined> {
  const q = encodeURIComponent(`name = '${DRIVE_BACKUP_NAME}' and trashed = false`)
  const r = await authedFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
  )
  if (!r.ok) throw new Error('Could not list Drive backups.')
  const data = (await r.json()) as { files?: DriveFile[] }
  return data.files?.[0]
}

async function downloadDriveFile(fileId: string): Promise<string> {
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
  if (!r.ok) throw new Error('Could not download the Drive backup.')
  return r.text()
}

function multipartBody(
  metadata: Record<string, unknown>,
  content: string,
): { boundary: string; body: string } {
  const boundary = 'cwm' + Math.random().toString(16).slice(2)
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${content}\r\n--${boundary}--`
  return { boundary, body }
}

/** Return the existing encrypted backup's text (for pre-overwrite passphrase
 * verification), or undefined when no backup exists yet. */
export async function peekDriveBackupText(): Promise<string | undefined> {
  const existing = await findDriveBackup()
  if (!existing) return undefined
  return downloadDriveFile(existing.id)
}

/** Upload the encrypted backup to the private appDataFolder, overwriting the
 * single fixed file in place. `content` MUST already be the encrypted envelope. */
export async function backupToDrive(content: string): Promise<void> {
  const existing = await findDriveBackup()
  const metadata = existing
    ? { name: DRIVE_BACKUP_NAME }
    : { name: DRIVE_BACKUP_NAME, parents: ['appDataFolder'] }
  const { boundary, body } = multipartBody(metadata, content)
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,modifiedTime`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime'
  const r = await authedFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!r.ok) throw new Error('Drive backup failed.')
}

/** Fetch THIS app's encrypted backup text from appDataFolder. Throws if none. */
export async function restoreFromDrive(): Promise<string> {
  const existing = await findDriveBackup()
  if (!existing) {
    throw new Error('No backup found in your Google Drive yet — back up first.')
  }
  return downloadDriveFile(existing.id)
}
