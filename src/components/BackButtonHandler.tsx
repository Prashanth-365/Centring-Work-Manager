import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { exitApp, onBackButton } from '@/lib/native'

// The five bottom-nav tabs — the Android back button exits the app only when at
// one of these (§11). Everywhere else it pops the router history.
const ROOT_PATHS = ['/', '/buildings', '/workers', '/payments', '/more']

/** Wires the Android hardware back button to router history. Renders nothing. */
export function BackButtonHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = React.useRef(location.pathname)
  pathRef.current = location.pathname

  React.useEffect(
    () =>
      onBackButton(() => {
        const atRoot = ROOT_PATHS.includes(pathRef.current)
        if (!atRoot && window.history.length > 1) navigate(-1)
        else exitApp()
      }),
    [navigate],
  )

  return null
}
