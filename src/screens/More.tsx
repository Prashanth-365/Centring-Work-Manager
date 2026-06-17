import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Contact,
  RefreshCw,
  Settings as SettingsIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

const ITEMS = [
  { to: '/owners', label: 'Owners', desc: 'Contacts & what they owe', icon: Contact },
  { to: '/attendance', label: 'Attendance', desc: 'All work entries', icon: ClipboardList },
  { to: '/weekly', label: 'Weekly summary', desc: 'Payroll register', icon: CalendarDays },
  { to: '/payments/sync', label: 'Sync transactions', desc: 'Read from transaction app', icon: RefreshCw },
  { to: '/settings', label: 'Settings', desc: 'Shifts, food, backup, lock', icon: SettingsIcon },
]

export function More() {
  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-2.5 p-4">
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {ITEMS.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="flex items-center gap-3 px-4 py-3.5 transition active:bg-accent"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
                <it.icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{it.label}</p>
                <p className="truncate text-xs text-muted-foreground">{it.desc}</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
        <p className="pt-2 text-center text-xs text-muted-foreground">Centering Work Manager v0.1</p>
      </div>
    </>
  )
}
