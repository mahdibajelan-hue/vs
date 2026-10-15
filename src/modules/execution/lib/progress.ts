import type { Activity, Baseline, BaselineLine, ExSettings, Report, ReportLine } from '../types'
import { addDays, daysBetween, periodsBetween } from './periods'

export type CumMode = 'approved' | 'registered'
/** reports whose lines count as «ثبت‌شده» (sent to the supervision) */
const REGISTERED = new Set(['submitted', 'partially_approved', 'approved'])
export const isRegistered = (r: Pick<Report, 'status'>): boolean => REGISTERED.has(r.status)

export interface Cum { approved: number; pending: number }
/** Quantity of one work-report line under the mode: approved = the supervision's approved quantity; registered = approved + still waiting (rejected / returned lines never count). */
export type EmployerMode = 'off' | 'advisory' | 'binding'
export function lineValue(l: ReportLine, mode: CumMode, employer: EmployerMode = 'off'): number {
  if (l.status === 'approved') {
    // binding employer step: only the employer-confirmed quantity counts (nothing until he decides)
    if (employer === 'binding') return l.employerStatus === 'approved' ? l.employerQty ?? 0 : 0
    return l.approvedQty ?? l.qty
  }
  if (mode === 'registered' && l.status === 'pending') return l.qty
  return 0
}

export interface CumOpts { before?: string; until?: string; excludeReportId?: string; mode: CumMode; employer?: EmployerMode }
/** Running total per activity from the work reports — the single source of every «تجمعی» figure; nothing is stored. */
export function cumulative(reports: Report[], lines: ReportLine[], o: CumOpts): Map<string, number> {
  const rep = new Map(reports.filter((r) => r.formKey === 'work' && isRegistered(r)).map((r) => [r.id, r]))
  const out = new Map<string, number>()
  for (const l of lines) {
    if (!l.activityId) continue
    const r = rep.get(l.reportId); if (!r || r.id === o.excludeReportId) continue
    if (o.before && r.reportDate >= o.before) continue
    if (o.until && r.reportDate > o.until) continue
    const v = lineValue(l, o.mode, o.employer); if (v) out.set(l.activityId, (out.get(l.activityId) ?? 0) + v)
  }
  return out
}

export interface EffBase { baseQty: number; weight: number; unitPrice: number; active: boolean; version: number }
/** Base quantity and weight as they stood on the date: the latest approved baseline version in force, else the live row (version 0). */
export function effectiveBase(a: Activity, baselines: Baseline[], blines: BaselineLine[], asOf: string): EffBase {
  const live: EffBase = { baseQty: a.baseQty, weight: a.weight, unitPrice: a.unitPrice, active: a.active, version: 0 }
  const approved = baselines.filter((b) => b.status === 'approved' && b.effectiveDate <= asOf).sort((x, y) => y.version - x.version)
  for (const b of approved) { const l = blines.find((x) => x.baselineId === b.id && x.activityId === a.id); if (l) return { baseQty: l.baseQty, weight: l.weight, unitPrice: l.unitPrice, active: l.active, version: b.version } }
  return live
}

export interface ProgressRow { activity: Activity; base: EffBase; cum: number; pct: number; remaining: number; over: boolean; contribution: number }
export interface GroupProgress { group: string; weightSum: number; pct: number; ok: boolean }
export interface Progress { rows: ProgressRow[]; groups: GroupProgress[]; overall: number; weightsOk: boolean }

/** Physical progress: per activity cumulative ÷ base, weighted inside each weighting basis (which must total 100%), then the bases averaged by their configured weight. Quantities of different units are never added. */
export function physicalProgress(a: { activities: Activity[]; baselines: Baseline[]; blines: BaselineLine[]; reports: Report[]; lines: ReportLine[]; asOf: string; mode: CumMode; groupWeights?: Record<string, number>; employer?: EmployerMode }): Progress {
  const cum = cumulative(a.reports, a.lines, { until: a.asOf, mode: a.mode, employer: a.employer })
  const rows: ProgressRow[] = a.activities.filter((x) => x.approval === 'approved').map((act) => {
    const base = effectiveBase(act, a.baselines, a.blines, a.asOf)
    const c = cum.get(act.id) ?? 0
    const pct = base.baseQty > 0 ? Math.min(1, c / base.baseQty) : 0
    return { activity: act, base, cum: c, pct, remaining: Math.max(0, base.baseQty - c), over: base.baseQty > 0 && c > base.baseQty + 1e-9, contribution: 0 }
  }).filter((r) => r.base.active)
  const gmap = new Map<string, ProgressRow[]>()
  for (const r of rows) { const g = r.activity.weightGroup; const l = gmap.get(g); if (l) l.push(r); else gmap.set(g, [r]) }
  const groups: GroupProgress[] = []
  for (const [group, rs] of gmap) {
    const ws = rs.reduce((s, r) => s + r.base.weight, 0)
    const pct = ws > 0 ? rs.reduce((s, r) => s + r.base.weight * r.pct, 0) / ws : 0
    for (const r of rs) r.contribution = ws > 0 ? (r.base.weight / ws) * r.pct : 0
    groups.push({ group, weightSum: ws, pct, ok: Math.abs(ws - 100) < 0.01 })
  }
  const gw = (g: string) => a.groupWeights?.[g] ?? 1
  const tw = groups.reduce((s, g) => s + gw(g.group), 0)
  const overall = tw > 0 ? groups.reduce((s, g) => s + gw(g.group) * g.pct, 0) / tw : 0
  return { rows, groups, overall, weightsOk: groups.length > 0 && groups.every((g) => g.ok) }
}

/** Planned fraction of an activity on the date, linear between its planned start and end; null without dates. */
export function plannedFraction(act: Pick<Activity, 'plannedStart' | 'plannedEnd'>, date: string): number | null {
  if (!act.plannedStart || !act.plannedEnd) return null
  if (date <= act.plannedStart) return 0
  if (date >= act.plannedEnd) return 1
  const span = daysBetween(act.plannedStart, act.plannedEnd)
  return span <= 0 ? 1 : daysBetween(act.plannedStart, date) / span
}
export function plannedOverall(a: { activities: Activity[]; baselines: Baseline[]; blines: BaselineLine[]; asOf: string; groupWeights?: Record<string, number> }): { overall: number | null; withDates: number; total: number } {
  const acts = a.activities.filter((x) => x.approval === 'approved' && x.active)
  const gmap = new Map<string, { w: number; wp: number }>()
  let withDates = 0
  for (const act of acts) {
    const p = plannedFraction(act, a.asOf); if (p == null) continue
    withDates++
    const w = effectiveBase(act, a.baselines, a.blines, a.asOf).weight
    const g = gmap.get(act.weightGroup) ?? { w: 0, wp: 0 }; g.w += w; g.wp += w * p; gmap.set(act.weightGroup, g)
  }
  if (!withDates) return { overall: null, withDates, total: acts.length }
  let num = 0, den = 0
  for (const [group, g] of gmap) { const gw = a.groupWeights?.[group] ?? 1; if (g.w > 0) { num += gw * (g.wp / g.w); den += gw } }
  return { overall: den > 0 ? num / den : 0, withDates, total: acts.length }
}

export interface CurvePoint { date: string; planned: number | null; actual: number; registered: number }
/** Weekly planned-versus-actual series from the first work report (or the project start) to the date. */
export function progressCurve(a: { activities: Activity[]; baselines: Baseline[]; blines: BaselineLine[]; reports: Report[]; lines: ReportLine[]; from: string; to: string; settings: ExSettings }): CurvePoint[] {
  if (!a.from || a.from > a.to) return []
  const weeks = periodsBetween('week', a.from, a.to, a.settings.weekStart)
  return weeks.map((w) => {
    const d = w.to > a.to ? a.to : w.to
    const base = { activities: a.activities, baselines: a.baselines, blines: a.blines, reports: a.reports, lines: a.lines, asOf: d }
    return { date: d, planned: plannedOverall(base).overall, actual: physicalProgress({ ...base, mode: 'approved' }).overall, registered: physicalProgress({ ...base, mode: 'registered' }).overall }
  })
}

/** Sum of weights per weighting basis, for the 100% check before a baseline is approved. */
export function weightSums(activities: Pick<Activity, 'weight' | 'weightGroup' | 'active' | 'approval'>[]): { group: string; sum: number; ok: boolean }[] {
  const m = new Map<string, number>()
  for (const x of activities) if (x.active && x.approval === 'approved') m.set(x.weightGroup, (m.get(x.weightGroup) ?? 0) + x.weight)
  return [...m].map(([group, sum]) => ({ group, sum, ok: Math.abs(sum - 100) < 0.01 }))
}
export { addDays }
