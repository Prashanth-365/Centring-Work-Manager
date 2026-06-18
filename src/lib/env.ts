// Defensive env access.
// VITE_* values are inlined into the client bundle at build time, so these are
// NOT secrets. They're only needed for v2 Google Drive auto-fetch — v1 uses the
// file picker and must build/run fine when they're unset. Read them defensively
// so nothing crashes when they're missing.
//
// Always .trim() — CI secret stores (e.g. GitHub Actions) commonly capture a
// trailing newline when a value is pasted, and an untrimmed client id would be
// URL-encoded into the OAuth request as "...apps.googleusercontent.com%0A",
// which Google rejects with `invalid_client` ("OAuth client was not found").
// That manifests as Drive sign-in failing in the Android build while the web
// deploy (with a cleanly-entered value) works.
const env = import.meta.env as Record<string, string | undefined>

export const GOOGLE_CLIENT_ID = (env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
export const OAUTH_REDIRECT_URL = (env.VITE_OAUTH_REDIRECT_URL ?? '').trim()

/** True only when Drive integration (v2) is fully configured. */
export const isDriveConfigured = GOOGLE_CLIENT_ID !== '' && OAUTH_REDIRECT_URL !== ''
