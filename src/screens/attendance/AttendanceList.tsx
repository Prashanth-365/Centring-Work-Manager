import * as React from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { Fab } from '@/components/Fab'
import { Input } from '@/components/ui/input'
import { useAllMolds, useAttendance, useBuildings, useWorkers } from '@/lib/hooks'
import { byId, groupBy } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { days } from '@/lib/format'

export function AttendanceList() {
  const attendance = useAttendance()
  const workers = useWorkers()
  const buildings = useBuildings()
  const molds = useAllMolds()
  const [q, setQ] = React.useState('')

  const workersById = React.useMemo(() => byId(workers), [workers])
  const buildingsById = React.useMemo(() => byId(buildings), [buildings])
  const moldsById = React.useMemo(() => byId(molds), [molds])

  const filtered = attendance.filter((a) => {
    if (!q) return true
    const w = workersById.get(a.workerId)?.name ?? ''
    const b = buildingsById.get(a.buildingId)?.name ?? ''
    return `${w} ${b}`.toLowerCase().includes(q.toLowerCase())
  })

  const byDate = React.useMemo(() => {
    const grouped = groupBy(filtered, (a) => a.date)
    return [...grouped.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${attendance.length} entries`} back />
      <div className="space-y-3 p-4 pb-28">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search worker / building…" className="pl-9" />
        </div>

        {byDate.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No attendance yet"
            description="Record who worked, where, and for how long."
          />
        ) : (
          <div className="space-y-4">
            {byDate.map(([date, entries]) => {
              const total = entries.reduce((s, e) => s + e.dayFraction, 0)
              return (
                <div key={date} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-semibold">{formatDate(date)}</p>
                    <p className="tabular text-xs text-muted-foreground">{days(total)} days</p>
                  </div>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {entries.map((a) => {
                      const w = workersById.get(a.workerId)
                      const b = buildingsById.get(a.buildingId)
                      const m = a.moldId ? moldsById.get(a.moldId) : undefined
                      return (
                        <Link
                          key={a.id}
                          to={`/attendance/${a.id}/edit`}
                          className="flex items-center gap-3 px-3 py-2.5 transition active:bg-accent"
                        >
                          <Thumb blob={w?.photoThumb} name={w?.name ?? '?'} className="size-9 text-xs" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{w?.name ?? 'Worker'}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {b?.name ?? 'Building'}
                              {m ? ` · ${m.floorName}` : ''}
                            </p>
                          </div>
                          <span className="tabular text-sm font-semibold">{days(a.dayFraction)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <Fab to="/attendance/new" icon={Plus} label="Attendance" />
    </>
  )
}
