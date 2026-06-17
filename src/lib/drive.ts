// Google Drive integration — BUILT BUT DORMANT until VITE_GOOGLE_CLIENT_ID /
// VITE_OAUTH_REDIRECT_URL are set (see env.ts + isDriveConfigured). Everything
// here is gated by `driveConfigured()`, so the offline file-picker path is
// completely unaffected when Drive isn't configured.
//
// Auth uses Google Identity Services (token client, scope drive.file). The
// Google Picker lets the user select the transaction-app backup (per-file
// access — no broad Drive scope). This app's own backups upload via the Drive
// REST API. Scripts are loaded on demand. Verifying this needs a real client id
// + OAuth consent, which can't be exercised in a headless build.
import { GOOGLE_CLIENT_ID, isDriveConfigured } from './env'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'

// Minimal ambient typings — the SDKs attach to window at runtime.
declare global {
  interface Window {
    google?: any // eslint-disable-line @typescript-eslint/no-explicit-any
    gapi?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export function driveConfigured(): boolean {
  return isDriveConfigured
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

/** Obtain (or reuse) a Drive access token via the GIS token client. */
async function getToken(): Promise<string> {
  if (!isDriveConfigured) throw new Error('Google Drive is not configured.')
  await loadScript(GIS_SRC)
  const google = window.google
  if (!google?.accounts?.oauth2) throw new Error('Google Identity unavailable.')
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Authorization failed.'))
          return
        }
        accessToken = resp.access_token
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: accessToken ? '' : 'consent' })
  })
}

/** Open the Google Picker and return the chosen file's text (for the txn backup). */
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

/** This app's own backups on Drive (files we created, by name). */
export async function listAppBackups(): Promise<DriveFile[]> {
  const token = await getToken()
  const q = encodeURIComponent("name contains 'centering-backup' and trashed = false")
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!r.ok) throw new Error('Could not list Drive backups.')
  const data = (await r.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

/** Upload this app's encrypted backup JSON to Drive (multipart). */
export async function uploadBackupToDrive(filename: string, content: string): Promise<void> {
  const token = await getToken()
  const metadata = { name: filename, mimeType: 'application/json' }
  const boundary = 'cwm' + Math.random().toString(16).slice(2)
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${content}\r\n--${boundary}--`
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
