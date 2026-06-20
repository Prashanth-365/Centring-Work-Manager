import { NavLink } from 'react-router-dom'
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Contact,
  HardHat,
  LayoutDashboard,
  Settings as SettingsIcon,
  Users,
  Wallet,
} from 'lucide-react'
import { useReviewCount } from '@/lib/hooks'
import { cn } from '@/lib/utils'

// Desktop / tablet (md+) left sidebar. The phone build keeps the bottom tab bar
// (BottomNav); this is hidden below md. Rendered as <nav> so the print stylesheet
// (which hides `nav`) drops it on paper.
const ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/workers', label: 'Workers', icon: Users },
  { to: '/owners', label: 'Owners', icon: Contact },
  { to: '/attendance', label: 'Attendance', icon: ClipboardList },
  { to: '/payments', label: 'Payments', icon: Wallet, badge: true },
  { to: '/weekly', label: 'Weekly', icon: CalendarDays },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

export function SideNav() {
  const reviewCount = useReviewCount()
  return (
    <nav className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-4 safe-top md:flex">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HardHat className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">Centering</p>
          <p className="truncate text-[11px] text-muted-foreground">Manager</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <span className="relative">
              <item.icon className="size-5" />
              {'badge' in item && item.badge && reviewCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {reviewCount > 9 ? '9+' : reviewCount}
                </span>
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
