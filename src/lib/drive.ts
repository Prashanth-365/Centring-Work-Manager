// Google Drive integration via Google Identity Services (GIS token client) — NOT
// the deprecated gapi.auth2. Gated by `driveConfigured()` so the offline
// file-picker path is unaffected when Drive isn't set up.
//
// The OAuth Web client id comes from Settings at runtime (`setDriveClientId`)
// or the VITE_GOOGLE_CLIENT_ID build env as a fallback. Scope is `drive.file`
// (per-file access). Two flows:
//   A) Backup/restore THIS app's own data — upload (create/overwrite the fixed
//      file `construction-backup.json`) + restore (list by name, download newest).
//   B) Import the finance app's export — the Google Picker grants access to the
//      specific file the user selects, even under drive.file (`pickFileText`).
// Scripts load on demand. Verifying end-to-end needs a real client id + OAuth
// consent, which can't be exercised headlessly.
import { GOOGLE_CLIENT_ID } from './env'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'

/** Fixed filename for THIS app's own Drive backup (flow A) — overwritten in place. */
export const DRIVE_BACKUP_NAME = 'construction-backup.json'

// Minimal ambient typings — the SDKs attach to window at runtime.
declare global {
  interface Window {
    google?: any // eslint-disable-line @typescript-eslint/no-explicit-any
    gapi?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// Runtime client id (set from Settings); falls back to the build-time env var.
let runtimeClientId = ''

/** Set the OAuth client id from Settings. Call on app boot + when it changes. */
export function setDriveClientId(id: string | undefined): void {
  const next = (id ?? '').trim()
  if (next !== runtimeClientId) {
    runtimeClientId = next
    accessToken = undefined // a new client id invalidates any existing token
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

let accessToken: string | undefined

/** True once an access token has been obtained this session. */
export function isDriveConnected(): boolean {
  return !!accessToken
}

/** Forget the current token (sign-out within this app). */
export function disconnectDrive(): void {
  accessToken = undefined
}

/** Obtain (or reuse) a Drive access token via the GIS token client. */
async function getToken(): Promise<string> {
  const clientId = effectiveClientId()
  if (!clientId) throw new Error('Google Drive is not configured — add an OAuth client id in Settings.')
  await loadScript(GIS_SRC)
  const google = window.google
  if (!google?.accounts?.oauth2) throw new Error('Google Identity could not be loaded — check your connection.')
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Google authorization was cancelled or failed.'))
          return
        }
        accessToken = resp.access_token
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: accessToken ? '' : 'consent' })
  })
}

/** Run the GIS token flow ("Connect Google Drive"). Throws on cancel/failure. */
export async function connectDrive(): Promise<void> {
  await getToken()
}

/** Open the Google Picker and return the chosen file's text (flow B — the
 * finance export, created by a different app, so the Picker grants access). */
export async function pickFileText(): Promise<string | undefined> {
  const token = await getToken()
  await loadScript(GAPI_SRC)
  await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
  const google = window.google
  return new Promise<string | undefined>((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(
      'application/json,text/plain',
    )
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .addView(view)
      .setCallback(async (data: { action: string; docs?: { id: string }[] }) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
          try {
            resolve(await downloadDriveFile(data.docs[0].id))
          } catch (e) {
            reject(e)
          }
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(undefined)
        }
      })
      .build()
    picker.setVisible(true)
  })
}

export async function downloadDriveFile(fileId: string): Promise<string> {
  const token = accessToken ?? (await getToken())
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error('Could not download the Drive file.')
  return r.text()
}

export interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
}

/** This app's own backups on Drive (files we created, newest first). */
export async function listAppBackups(): Promise<DriveFile[]> {
  const token = await getToken()
  const q = encodeURIComponent(
    `(name = '${DRIVE_BACKUP_NAME}' or name contains 'construction-backup' or name contains 'centering-backup') and trashed = false`,
  )
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!r.ok) throw new Error('Could not list Drive backups.')
  const data = (await r.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

function multipartBody(filename: string, content: string): { boundary: string; body: string } {
  const boundary = 'cwm' + Math.random().toString(16).slice(2)
  const metadata = { name: filename, mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${content}\r\n--${boundary}--`
  return { boundary, body }
}

/** Upload arbitrary backup JSON under `filename` (always creates a new file). */
export async function uploadBackupToDrive(filename: string, content: string): Promise<void> {
  const token = await getToken()
  const { boundary, body } = multipartBody(filename, content)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!r.ok) throw new Error('Drive upload failed.')
}

/** Flow A — back up THIS app's data to the fixed file, overwriting it in place. */
export async function backupToDrive(content: string): Promise<void> {
  const token = await getToken()
  const existing = (await listAppBackups()).find((f) => f.name === DRIVE_BACKUP_NAME)
  const { boundary, body } = multipartBody(DRIVE_BACKUP_NAME, content)
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
  const r = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!r.ok) throw new Error('Drive backup failed.')
}

/** Flow A — fetch the newest of THIS app's Drive backups and return its text. */
export async function restoreFromDrive(): Promise<string> {
  const files = await listAppBackups()
  if (files.length === 0) {
    throw new Error('No backup found on Google Drive yet — back up first.')
  }
  return downloadDriveFile(files[0].id) // listAppBackups is ordered newest-first
}
