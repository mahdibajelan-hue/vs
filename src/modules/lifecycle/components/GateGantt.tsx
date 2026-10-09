import type { Activity } from '../types'
import { diffDaysIso } from '../lib/cpm'
import { rollupProgress } from '../lib/planTree'
import { EmptyState, fa, faNum } from './ui'

/** Gate-scoped Gantt: same bar renderer idea as the plan tree, read-only, limited to one gate. */
export function GateGantt({ activities, windowStart, windowEnd }: { activities: Activity[]; windowStart: string | null; windowEnd: string | null }) {
  const dated = activities.filter((a) => a.forecastStart && a.forecastFinish)
  if (dated.length === 0) return <EmptyState message="برای این گیت هنوز فعالیتی ثبت نشده است" />
  const start = windowStart ?? dated.reduce((m, a) => (a.forecastStart! < m ? a.forecastStart! : m), dated[0].forecastStart!)
  const end = windowEnd ?? dated.reduce((m, a) => (a.forecastFinish! > m ? a.forecastFinish! : m), dated[0].forecastFinish!)
  const span = Math.max(1, diffDaysIso(start, end))
  const pos = (iso: string) => Math.min(100, Math.max(0, (diffDaysIso(start, iso) / span) * 100))
  const progress = rollupProgress(activities.map((a) => ({ id: a.id, parentId: a.parentId, name: a.name, weight: a.weight, manualPct: a.manualPct, start: a.forecastStart, finish: a.forecastFinish })))
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted"><span>{fa(start)}</span><span>{fa(end)}</span></div>
      {dated.map((a) => {
        const pct = progress.get(a.id) ?? 0
        const depth = (() => { let d = 0, p = a.parentId; while (p && d < 8) { d++; p = activities.find((x) => x.id === p)?.parentId ?? null } return d })()
        return (
          <div key={a.id} className="flex items-center gap-2 text-[11px]">
            <span className="w-44 shrink-0 truncate" style={{ paddingInlineStart: depth * 10 }}>{a.name}</span>
            <div className="relative h-4 flex-1 rounded bg-white/[0.04]">
              <div className="absolute top-0 h-4 overflow-hidden rounded" style={{ right: `${100 - pos(a.forecastFinish!)}%`, left: `${pos(a.forecastStart!)}%`, background: '#0ea5e955', border: '1px solid #38bdf8aa' }}>
                <div className="h-full" style={{ width: `${pct}%`, background: '#38bdf8' }} />
              </div>
              {today >= start && today <= end && <div className="absolute top-0 h-4 w-px bg-red-400" style={{ right: `${100 - pos(today)}%` }} />}
            </div>
            <span className="w-9 shrink-0 text-center font-bold">{faNum(Math.round(pct))}٪</span>
          </div>
        )
      })}
    </div>
  )
}
