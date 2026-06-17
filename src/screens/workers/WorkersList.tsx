import * as React from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { MoneyText } from '@/components/MoneyText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAllAttendance, useSettings, useTransactions, useWorkers } from '@/lib/hooks'
import { groupBy } from '@/lib/select'
import { workerBalance } from '@/lib/compute/balance'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WeekStart } from '@/lib/dates'

export function WorkersList() {
  const workers = useWorkers()
  const attendance = useAllAttendance()
  const txns = useTransactions()
  const settings = useSettings()
  const [q, setQ] = React.useState('')
  const [tab, setTab] = React.useState<'active' | 'inactive'>('active')

  const attByWorker = React.useMemo(() => groupBy(attendance, (a) => a.workerId), [attendance])
  const txByWorker = React.useMemo(() => groupBy(txns, (t) => t.workerId), [txns])
  const ws = (settings.weekStartsOn ?? 1) as WeekStart

  const filtered = workers
    .filter((w) => (tab === 'active' ? w.active : !w.active))
    .filter((w) =>
      !q ? true : [w.name, w.code, w.phone, w.type].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()),
    )

  const activeCount = workers.filter((w) => w.active).length

  return (
    <>
      <PageHeader
        title="Workers"
        subtitle={`${activeCount} active`}
        actions={
          <Button asChild size="sm">
            <Link to="/workers/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workers…" className="pl-9" />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(['active', 'inactive'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg py-1.5 text-sm font-medium capitalize transition',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={workers.length === 0 ? 'No workers yet' : `No ${tab} workers`}
            action={
              workers.length === 0 ? (
                <Button asChild>
                  <Link to="/workers/new">
                    <Plus className="size-4" />
                    New worker
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((w) => {
              const bal = workerBalance(w, attByWorker.get(w.id) ?? [], txByWorker.get(w.id) ?? [], ws)
              return (
                <Link
                  key={w.id}
                  to={`/workers/${w.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition active:scale-[0.99]"
                >
                  <Thumb blob={w.photoThumb} name={w.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{w.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="muted">{w.type}</Badge>
                      {money(w.dailyWage)}/day
                    </p>
                  </div>
                  <div className="text-right">
                    <MoneyText value={bal.balance} balance className="text-sm" />
                    <p className="text-[11px] text-muted-foreground">
                      {bal.balance > 0.5 ? 'you owe' : bal.balance < -0.5 ? 'advance' : 'settled'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
