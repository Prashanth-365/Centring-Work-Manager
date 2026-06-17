import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md bg-background shadow-sm">
      <main className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
