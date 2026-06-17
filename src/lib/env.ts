// Defensive env access.
// VITE_* values are inlined into the client bundle at build time, so these are
// NOT secrets. They're only needed for v2 Google Drive auto-fetch — v1 uses the
// file picker and must build/run fine when they're unset. Read them defensively
// so nothing crashes when they're missing.
const env = import.meta.env as Record<string, string | undefined>

export const GOOGLE_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID ?? ''
export const OAUTH_REDIRECT_URL = env.VITE_OAUTH_REDIRECT_URL ?? ''

/** True only when Drive integration (v2) is fully configured. */
export const isDriveConfigured = GOOGLE_CLIENT_ID !== '' && OAUTH_REDIRECT_URL !== ''
