import { addDays } from '../../execution/lib/periods'
import { WorkCalendar, type CalendarDef } from './calendar'
import type { ScheduleResult } from './schedule'
import type { SchActivity } from './types'

/** Resource loading: planned demand of each resource (units per working day while its activities run), weekly histogram against the stated limit, and actual use taken from the daily reports. */
export interface Resource { id: string; name: string; kind: 'labor' | 'equipment'; unit: string; maxUnits: number; ratePerDay: number; execMatch: string }
export interface Assignment { id: string; activityUid: string; resourceId: string; unitsPerDay: number }
export interface ExecUsage { date: string; kind: 'man' | 'equip'; name: string; qty: number }
export interface WeekRow { week: string; avg: number; peak: number; actual: number | null; over: boolean }
export interface ResourceSummary { resourceId: string; weeks: WeekRow[]; unitDays: number; cost: number; peak: number; overWeeks: number; assignedActivities: number }

const weekStart = (iso: string, wd: number) => addDays(iso, -wd)
const wdOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 1) % 7   // 0 = Saturday

export function resourceHistogram(o: { resources: Resource[]; assignments: Assignment[]; activities: SchActivity[]; forecast: ScheduleResult; calendar: CalendarDef; usage?: ExecUsage[] }): Map<string, ResourceSummary> {
  const byUid = new Map(o.activities.map((a) => [a.uid, a]))
  const out = new Map<string, ResourceSummary>()
  const dates = o.activities.flatMap((a) => { const r = o.forecast.byId.get(a.id); return [r?.start, r?.finish] }).filter((x): x is string => !!x).sort()
  if (!dates.length) return out
  const cal = new WorkCalendar(o.calendar, dates[0])
  for (const res of o.resources) {
    const daily = new Map<string, number>()
    const mine = o.assignments.filter((a) => a.resourceId === res.id)
    let assigned = 0
    for (const as of mine) {
      const act = byUid.get(as.activityUid), r = act ? o.forecast.byId.get(act.id) : undefined
      if (!act || !r?.start || !r.finish || as.unitsPerDay <= 0) continue
      assigned++
      for (let d = r.start; d <= r.finish; d = addDays(d, 1)) if (cal.isWork(d)) daily.set(d, (daily.get(d) ?? 0) + as.unitsPerDay)
    }
    const actualDaily = new Map<string, number>()
    if (res.execMatch.trim() && o.usage) {
      const key = res.execMatch.trim().toLowerCase(), kind = res.kind === 'labor' ? 'man' : 'equip'
      for (const u of o.usage) if (u.kind === kind && u.name.toLowerCase().includes(key)) actualDaily.set(u.date, (actualDaily.get(u.date) ?? 0) + u.qty)
    }
    const weeks = new Map<string, { sum: number; n: number; peak: number; aSum: number; aN: number }>()
    for (const [d, v] of daily) { const w = weekStart(d, wdOf(d)), x = weeks.get(w) ?? { sum: 0, n: 0, peak: 0, aSum: 0, aN: 0 }; x.sum += v; x.n++; x.peak = Math.max(x.peak, v); weeks.set(w, x) }
    for (const [d, v] of actualDaily) { const w = weekStart(d, wdOf(d)), x = weeks.get(w) ?? { sum: 0, n: 0, peak: 0, aSum: 0, aN: 0 }; x.aSum += v; x.aN++; weeks.set(w, x) }
    const rows: WeekRow[] = [...weeks].sort((a, b) => a[0].localeCompare(b[0])).map(([week, x]) => ({ week, avg: x.n ? x.sum / x.n : 0, peak: x.peak, actual: x.aN ? x.aSum / x.aN : null, over: res.maxUnits > 0 && x.peak > res.maxUnits }))
    const unitDays = [...daily.values()].reduce((s, v) => s + v, 0)
    out.set(res.id, { resourceId: res.id, weeks: rows, unitDays, cost: unitDays * res.ratePerDay, peak: Math.max(0, ...rows.map((r) => r.peak)), overWeeks: rows.filter((r) => r.over).length, assignedActivities: assigned })
  }
  return out
}
