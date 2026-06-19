import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

// Responsive shell:
//  - Phone (< md): a single centered max-w-md column with the bottom tab bar.
//  - Tablet / desktop (md+): a left sidebar + a wider, centered content column,
//    so the app uses the screen instead of a narrow phone strip.
export function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      <SideNav />
      <div className="relative mx-auto min-h-dvh w-full max-w-md bg-background shadow-sm md:max-w-none md:flex-1 md:shadow-none">
        <main className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:mx-auto md:max-w-4xl md:pb-12">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
