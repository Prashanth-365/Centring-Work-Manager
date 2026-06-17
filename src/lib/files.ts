// Platform-aware file saving.
//   - Web: trigger a Blob download via an <a download>.
//   - Android (Capacitor): write to Directory.External under
//     finsite-construction/<name> (recursive: true auto-creates the folder),
//     requesting storage permission first, and return the saved file URI so the
//     caller can surface it in a toast.
// The Capacitor Filesystem plugin is lazy-imported so the web bundle stays lean
// and nothing breaks when it's unavailable.
import { Capacitor } from '@capacitor/core'

/** App-specific folder for backups on external storage (per the spec). */
export const BACKUP_DIR = 'finsite-construction'

export interface SaveResult {
  /** 'download' on web, or the saved file path/URI on native. */
  location: string
  native: boolean
}

/** Trigger a browser download of `text` as `filename`. */
function downloadBlob(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save text to a file. On the web this downloads `filename`; on Android it writes
 * to External storage under finsite-construction/ and returns the saved URI.
 * Throws on a real native write failure (so the caller can toast it) — never
 * fails silently.
 */
export async function saveTextFile(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<SaveResult> {
  if (Capacitor.getPlatform() === 'web') {
    downloadBlob(filename, text, mime)
    return { location: 'download', native: false }
  }

  // Native: lazy-load the Filesystem plugin so web never bundles it.
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  try {
    await Filesystem.requestPermissions()
  } catch {
    // Some platforms/SDK levels don't gate Directory.External behind a prompt.
  }
  const path = `${BACKUP_DIR}/${filename}`
  await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.External,
    encoding: Encoding.UTF8,
    recursive: true, // auto-create finsite-construction/
  })
  // Resolve a user-meaningful path to show in the toast.
  let location = path
  try {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.External })
    location = uri
  } catch {
    /* keep the relative path */
  }
  return { location, native: true }
}

/** Timestamp safe for filenames: 2026-06-20T18-30-00. */
export function fileTimestamp(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/:/g, '-')
}
