import * as React from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Thumb } from '@/components/Thumb'
import { Fab } from '@/components/Fab'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAllMolds, useAttendance, useBuildings, useOwners, useWorkers } from '@/lib/hooks'
import { byId, buildingName, groupBy } from '@/lib/select'
import { formatDate } from '@/lib/dates'
import { days } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = '__all__'

export function AttendanceList() {
  const attendance = useAttendance()
  const workers = useWorkers()
  const buildings = useBuildings()
  const owners = useOwners()
  const molds = useAllMolds()

  // Main filters
  const [q, setQ] = React.useState('')
  const [workerId, setWorkerId] = React.useState<string>(ALL)
  const [buildingId, setBuildingId] = React.useState<string>(ALL)
  const [fromDate, setFromDate] = React.useState('')
  const [toDate, setToDate] = React.useState('')
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [moldId, setMoldId] = React.useState<string>(ALL)

  const workersById = React.useMemo(() => byId(workers), [workers])
  const buildingsById = React.useMemo(() => byId(buildings), [buildings])
  const ownersById = React.useMemo(() => byId(owners), [owners])
  const moldsById = React.useMemo(() => byId(molds), [molds])

  // Mold options follow the building filter when one is selected.
  const moldOptions = React.useMemo(
    () => (buildingId === ALL ? molds : molds.filter((m) => m.buildingId === buildingId)),
    [molds, buildingId],
  )
  // If the chosen building no longer contains the chosen mold, clear the mold.
  React.useEffect(() => {
    if (moldId !== ALL && !moldOptions.some((m) => m.id === moldId)) setMoldId(ALL)
  }, [moldOptions, moldId])

  const filtered = attendance.filter((a) => {
    if (workerId !== ALL && a.workerId !== workerId) return false
    if (buildingId !== ALL && a.buildingId !== buildingId) return false
    if (moldId !== ALL && a.moldId !== moldId) return false
    if (fromDate && a.date < fromDate) return false
    if (toDate && a.date > toDate) return false
    if (q) {
      const w = workersById.get(a.workerId)?.name ?? ''
      const b = buildingName(buildingsById.get(a.buildingId), ownersById)
      if (!`${w} ${b}`.toLowerCase().includes(q.toLowerCase())) return false
    }
    return true
  })

  const byDate = React.useMemo(() => {
    const grouped = groupBy(filtered, (a) => a.date)
    return [...grouped.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const advancedCount = moldId !== ALL ? 1 : 0

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${filtered.length} of ${attendance.length}`} back />
      <div className="space-y-3 p-4 pb-28">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search worker / building…" className="pl-9" />
        </div>

        {/* Main filter row: worker + building */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={workerId} onValueChange={setWorkerId}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Worker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All workers</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={buildingId} onValueChange={setBuildingId}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Building" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {buildingName(b, ownersById)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-10 text-sm" />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-10 text-sm" />
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-accent',
              showAdvanced && 'bg-accent',
            )}
            aria-label="Advanced filters"
          >
            <SlidersHorizontal className="size-4" />
            {advancedCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {advancedCount}
              </span>
            )}
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
            <label className="text-xs text-muted-foreground">Mold / floor</label>
            <Select value={moldId} onValueChange={setMoldId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Any mold / floor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any mold / floor</SelectItem>
                {moldOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {buildingId === ALL
                      ? `${buildingName(buildingsById.get(m.buildingId), ownersById)} · ${m.floorName}`
                      : m.floorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {byDate.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={attendance.length === 0 ? 'No attendance yet' : 'No matches'}
            description={
              attendance.length === 0
                ? 'Record who worked, where, and for how long.'
                : 'Try adjusting or clearing the filters.'
            }
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
                              {buildingName(b, ownersById)}
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
