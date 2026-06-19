// Platform-aware file saving to the user's Downloads.
//   - Web: trigger a Blob download via an <a download> (lands in the browser's
//     Downloads folder).
//   - Android (Capacitor): write to the public Downloads folder via the
//     Filesystem plugin (Directory.ExternalStorage + "Download/"), falling back
//     to the app's external files dir when scoped storage blocks the public one.
// The Capacitor Filesystem plugin is lazy-imported so the web bundle stays lean
// and nothing breaks when it's unavailable.
import { Capacitor } from '@capacitor/core'
import { base64ToBytes } from './crypto'

/** Public Downloads sub-path used with Directory.ExternalStorage on Android. */
const DOWNLOAD_SUBDIR = 'Download'

export interface SaveResult {
  /** 'download' on web, or the saved file path/URI on native. */
  location: string
  native: boolean
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Write `bytesOrText` to the public Downloads folder on native, resolving the
 * saved URI. Tries the public Downloads dir first, then the always-writable
 * app-external dir. Throws if both fail (so the caller can toast it). */
async function writeNativeDownload(
  filename: string,
  data: string,
  base64: boolean,
): Promise<string> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  try {
    await Filesystem.requestPermissions()
  } catch {
    // Some platforms/SDK levels don't gate writes behind a runtime prompt.
  }
  const encoding = base64 ? undefined : Encoding.UTF8 // omit encoding ⇒ data is base64
  // Prefer the public Downloads folder; fall back to the app-specific external
  // dir if scoped storage rejects it, so an export never hard-fails.
  const attempts = [
    { directory: Directory.ExternalStorage, path: `${DOWNLOAD_SUBDIR}/${filename}` },
    { directory: Directory.External, path: filename },
  ]
  let lastErr: unknown
  for (const { directory, path } of attempts) {
    try {
      await Filesystem.writeFile({ path, data, directory, encoding, recursive: true })
      try {
        const { uri } = await Filesystem.getUri({ path, directory })
        return uri
      } catch {
        return path
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not write the file.')
}

/** Save a text file to Downloads (web download / Android public Downloads). */
export async function saveToDownloads(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<SaveResult> {
  if (Capacitor.getPlatform() === 'web') {
    triggerDownload(filename, new Blob([text], { type: mime }))
    return { location: 'download', native: false }
  }
  return { location: await writeNativeDownload(filename, text, false), native: true }
}

/** Save a binary file (given as base64) to Downloads. Used for the weekly PDF. */
export async function saveBinaryToDownloads(
  filename: string,
  base64: string,
  mime = 'application/octet-stream',
): Promise<SaveResult> {
  if (Capacitor.getPlatform() === 'web') {
    triggerDownload(filename, new Blob([base64ToBytes(base64)], { type: mime }))
    return { location: 'download', native: false }
  }
  return { location: await writeNativeDownload(filename, base64, true), native: true }
}

/** Filename-safe local timestamp: 20260620-183000. */
export function downloadStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}
