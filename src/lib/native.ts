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
