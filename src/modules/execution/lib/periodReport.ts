import type { Activity, Report, ReportLine, ReportResource, Stoppage, StoppageCategory } from '../types'
import type { Period } from './periods'
import { addDays } from './periods'
import { isRegistered, lineValue } from './progress'

export interface PeriodCtx { activities: Activity[]; reports: Report[]; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[] }
const inP = (r: Report, p: Period) => r.reportDate >= p.from && r.reportDate <= p.to

export interface ActivityPeriodRow {
  activity: Activity; base: number
  /** approved cumulative at the end of the day before the period */
  prevApproved: number
  approved: number; pending: number; rejected: number; returned: number
  cumApproved: number; cumRegistered: number; pct: number; remaining: number
}

/** The rows of the weekly / monthly / any-period work report — straight from the daily reports, nothing re-entered. */
export function activityRows(c: PeriodCtx, p: Period, baseOf: (a: Activity) => number): ActivityPeriodRow[] {
  const work = c.reports.filter((r) => r.formKey === 'work' && r.status !== 'draft' && r.status !== 'incomplete')
  const byId = new Map(work.map((r) => [r.id, r]))
  const rows = new Map<string, ActivityPeriodRow>()
  const row = (a: Activity): ActivityPeriodRow => { let x = rows.get(a.id); if (!x) { const base = baseOf(a); x = { activity: a, base, prevApproved: 0, approved: 0, pending: 0, rejected: 0, returned: 0, cumApproved: 0, cumRegistered: 0, pct: 0, remaining: base }; rows.set(a.id, x) } return x }
  const acts = new Map(c.activities.map((a) => [a.id, a]))
  for (const l of c.lines) {
    if (!l.activityId) continue
    const r = byId.get(l.reportId), a = acts.get(l.activityId); if (!r || !a) continue
    const x = row(a)
    const ap = lineValue(l, 'approved'), reg = lineValue(l, 'registered')
    if (r.reportDate <= p.to && isRegistered(r)) { x.cumApproved += ap; x.cumRegistered += reg }
    if (r.reportDate < p.from && isRegistered(r)) x.prevApproved += ap
    if (inP(r, p)) {
      if (l.status === 'approved') x.approved += l.approvedQty ?? l.qty
      else if (l.status === 'pending') x.pending += l.qty
      else if (l.status === 'rejected') x.rejected += l.qty
      else if (l.status === 'returned') x.returned += l.qty
    }
  }
  const out = [...rows.values()].filter((x) => x.approved + x.pending + x.rejected + x.returned > 0)
  for (const x of out) { x.pct = x.base > 0 ? Math.min(1, x.cumApproved / x.base) : 0; x.remaining = Math.max(0, x.base - x.cumApproved) }
  return out.sort((a, b) => (a.activity.sort - b.activity.sort) || a.activity.itemNo.localeCompare(b.activity.itemNo, 'fa', { numeric: true }))
}

/** Day-by-day matrix of approved + pending quantity per activity for the period. */
export function dailyMatrix(c: PeriodCtx, p: Period): { days: string[]; rows: { activity: Activity; byDay: Record<string, number>; total: number }[] } {
  const days: string[] = []
  for (let d = p.from; d <= p.to && days.length < 40; d = addDays(d, 1)) days.push(d)
  const byId = new Map(c.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && inP(r, p)).map((r) => [r.id, r]))
  const acts = new Map(c.activities.map((a) => [a.id, a]))
  const rows = new Map<string, { activity: Activity; byDay: Record<string, number>; total: number }>()
  for (const l of c.lines) {
    const r = byId.get(l.reportId); const a = l.activityId ? acts.get(l.activityId) : undefined
    if (!r || !a) continue
    const v = lineValue(l, 'registered'); if (!v) continue
    const x = rows.get(a.id) ?? { activity: a, byDay: {}, total: 0 }
    x.byDay[r.reportDate] = (x.byDay[r.reportDate] ?? 0) + v; x.total += v; rows.set(a.id, x)
  }
  return { days, rows: [...rows.values()].sort((a, b) => a.activity.itemNo.localeCompare(b.activity.itemNo, 'fa', { numeric: true })) }
}

export type Dim = 'contractor' | 'front' | 'station' | 'km'
export interface DimRow { key: string; activity: Activity; approved: number; registered: number }
/** Quantities split by contractor / front / station / km range. Different units are never added: every row is one activity inside one value of the dimension. */
export function byDimension(c: PeriodCtx, p: Period, dim: Dim, orgName: (id: string | null) => string): DimRow[] {
  const byId = new Map(c.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && inP(r, p)).map((r) => [r.id, r]))
  const acts = new Map(c.activities.map((a) => [a.id, a]))
  const m = new Map<string, DimRow>()
  for (const l of c.lines) {
    const r = byId.get(l.reportId); const a = l.activityId ? acts.get(l.activityId) : undefined
    if (!r || !a) continue
    const key = dim === 'contractor' ? orgName(r.contractorOrgId) : dim === 'front' ? r.front || '—' : dim === 'station' ? r.station || '—' : (l.kmFrom != null ? `${l.kmFrom}${l.kmTo != null && l.kmTo !== l.kmFrom ? `–${l.kmTo}` : ''}` : '—')
    const id = `${key}|${a.id}`
    const x = m.get(id) ?? { key, activity: a, approved: 0, registered: 0 }
    x.approved += lineValue(l, 'approved'); x.registered += lineValue(l, 'registered'); m.set(id, x)
  }
  return [...m.values()].filter((x) => x.registered > 0).sort((a, b) => a.key.localeCompare(b.key, 'fa', { numeric: true }) || a.activity.itemNo.localeCompare(b.activity.itemNo, 'fa', { numeric: true }))
}

export interface ResourceRow { kind: 'man' | 'equip'; name: string; avgActive: number; avgIdle: number; hours: number; days: number }
export function resourceSummary(c: PeriodCtx, p: Period): ResourceRow[] {
  const ids = new Map(c.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && inP(r, p)).map((r) => [r.id, r]))
  const m = new Map<string, { kind: 'man' | 'equip'; name: string; active: number; idle: number; hours: number; days: Set<string> }>()
  for (const r of c.resources) {
    const rep = ids.get(r.reportId); if (!rep) continue
    const k = `${r.kind}|${r.name}`
    const x = m.get(k) ?? { kind: r.kind, name: r.name, active: 0, idle: 0, hours: 0, days: new Set<string>() }
    x.active += r.activeQty; x.idle += r.idleQty + r.leaveQty + r.stoppedQty + r.repairQty; x.hours += r.hours; x.days.add(rep.reportDate); m.set(k, x)
  }
  return [...m.values()].map((x) => ({ kind: x.kind, name: x.name, avgActive: x.days.size ? x.active / x.days.size : 0, avgIdle: x.days.size ? x.idle / x.days.size : 0, hours: x.hours, days: x.days.size }))
}

export interface StoppageRow { category: StoppageCategory; hours: number; count: number }
export function stoppageSummary(c: PeriodCtx, p: Period): StoppageRow[] {
  const ids = new Set(c.reports.filter((r) => r.formKey === 'work' && r.status !== 'draft' && inP(r, p)).map((r) => r.id))
  const m = new Map<StoppageCategory, StoppageRow>()
  for (const s of c.stoppages) { if (!ids.has(s.reportId)) continue; const x = m.get(s.category) ?? { category: s.category, hours: 0, count: 0 }; x.hours += s.hours; x.count += 1; m.set(s.category, x) }
  return [...m.values()].sort((a, b) => b.hours - a.hours)
}

export function statusSummary(c: PeriodCtx, p: Period): { reports: Record<string, number>; lines: Record<string, number> } {
  const reps = c.reports.filter((r) => r.formKey === 'work' && inP(r, p))
  const ids = new Set(reps.map((r) => r.id))
  const reports: Record<string, number> = {}, lines: Record<string, number> = {}
  for (const r of reps) reports[r.status] = (reports[r.status] ?? 0) + 1
  for (const l of c.lines) if (ids.has(l.reportId)) lines[l.status] = (lines[l.status] ?? 0) + 1
  return { reports, lines }
}
