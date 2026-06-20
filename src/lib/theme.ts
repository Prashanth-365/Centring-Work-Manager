// Light / dark theme.
//
// Theming is the existing CSS-variable strategy: light tokens live in `:root`,
// dark tokens under `.dark` (see index.css), and Tailwind is `darkMode: 'class'`.
// So switching themes is just toggling the `dark` class on <html>.
//
// The choice is persisted in Dexie settings (the source of truth, so it travels
// with Export / Drive backup) AND mirrored to localStorage. The localStorage
// mirror lets the tiny inline script in index.html apply the theme synchronously
// BEFORE first paint — no flash — since IndexedDB can only be read async.
// Default is dark, matching the app's original look.
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cwm-theme'

/** Apply a theme to the document and mirror it to localStorage for the next boot. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  // Hint native form controls / scrollbars to render in the matching scheme.
  root.style.colorScheme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* storage unavailable (e.g. private mode) — the DOM class is still applied */
  }
}

/** The theme persisted for the synchronous boot path. Defaults to dark. */
export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}
