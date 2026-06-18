// Thin Capacitor wrappers. All are safe to call on the web (they no-op or use a
// web fallback), so screens can call them unconditionally.
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** Register a hardware back-button handler (Android). No-op on web. Returns cleanup. */
export function onBackButton(handler: () => void): () => void {
  if (!isNative()) return () => {}
  const sub = App.addListener('backButton', handler)
  return () => {
    void sub.then((h) => h.remove())
  }
}

/** Notify when the native app moves to background/foreground (used for re-lock).
 * Web callers should use `visibilitychange` instead — this no-ops off-native. */
export function onAppStateChange(handler: (active: boolean) => void): () => void {
  if (!isNative()) return () => {}
  const sub = App.addListener('appStateChange', ({ isActive }) => handler(isActive))
  return () => {
    void sub.then((h) => h.remove())
  }
}

export function exitApp(): void {
  if (isNative()) void App.exitApp()
}

// --- Screen orientation (best-effort) --------------------------------------
// The Weekly summary is a wide table that reads best in landscape. We use the
// web Screen Orientation API (available inside the Android WebView) to nudge the
// device into landscape for the full-screen view, falling back silently when the
// platform doesn't allow programmatic locking. The responsive layout still works
// if the user rotates manually, so a failed lock is non-fatal.
type OrientationLock = (orientation: 'landscape' | 'portrait' | 'any') => Promise<void>

function orientationApi(): (ScreenOrientation & { lock?: OrientationLock }) | undefined {
  if (typeof screen === 'undefined') return undefined
  return screen.orientation as (ScreenOrientation & { lock?: OrientationLock }) | undefined
}

/** Try to lock the screen to landscape. Returns true if the lock was accepted. */
export async function lockLandscape(): Promise<boolean> {
  const o = orientationApi()
  if (!o?.lock) return false
  try {
    await o.lock('landscape')
    return true
  } catch {
    return false
  }
}

/** Release any orientation lock so the app returns to its default. No-op if unsupported. */
export function unlockOrientation(): void {
  const o = orientationApi()
  try {
    o?.unlock?.()
  } catch {
    /* ignore — some platforms reject unlock when no lock is held */
  }
}
