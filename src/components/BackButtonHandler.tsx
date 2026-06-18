import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { exitApp, onBackButton } from '@/lib/native'
import { toast } from '@/lib/toast'

// The five bottom-nav tabs. Back only ever EXITS from Home ('/'); from any other
// top-level tab it funnels to Home, and from nested pages it pops history (§11).
const HOME_PATH = '/'
const ROOT_PATHS = ['/', '/buildings', '/workers', '/payments', '/more']
const EXIT_WINDOW_MS = 2000

/** React Router v6 stores the in-app history index in `history.state.idx`. */
function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

/**
 * Wires the Android hardware back button so it always funnels to Home and never
 * leaves the app except from Home (§11):
 *   • nested/detail page → pop to the previous page;
 *   • top-level tab (not Home) or exhausted history → redirect to Home;
 *   • Home → first press shows a toast, a second press within ~2s exits.
 * Renders nothing.
 */
export function BackButtonHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = React.useRef(location.pathname)
  pathRef.current = location.pathname
  const lastBackRef = React.useRef(0)

  React.useEffect(
    () =>
      onBackButton(() => {
        const path = pathRef.current

        if (path === HOME_PATH) {
          // Home is the only exit point — require a confirming second press.
          const ts = Date.now()
          if (ts - lastBackRef.current < EXIT_WINDOW_MS) {
            exitApp()
          } else {
            lastBackRef.current = ts
            toast.info('Press back again to exit', EXIT_WINDOW_MS)
          }
          return
        }

        const isTopLevel = ROOT_PATHS.includes(path)
        if (!isTopLevel && historyIndex() > 0) {
          navigate(-1) // nested page with history → pop
        } else {
          navigate(HOME_PATH) // top-level non-Home, or no history → funnel Home
        }
      }),
    [navigate],
  )

  return null
}
