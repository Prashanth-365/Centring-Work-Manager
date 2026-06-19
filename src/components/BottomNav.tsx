import { NavLink } from 'react-router-dom'
import { Building2, LayoutDashboard, Menu, Users, Wallet } from 'lucide-react'
import { useReviewCount } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/workers', label: 'Workers', icon: Users },
  { to: '/payments', label: 'Payments', icon: Wallet, badge: true },
  { to: '/more', label: 'More', icon: Menu },
] as const

export function BottomNav() {
  const reviewCount = useReviewCount()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-lg md:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <item.icon className={cn('size-[22px]', isActive && 'stroke-[2.4]')} />
                  {'badge' in item && item.badge && reviewCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {reviewCount > 9 ? '9+' : reviewCount}
                    </span>
                  )}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
