import { addDays, daysBetween } from '../../execution/lib/periods'
import { WorkCalendar, type CalendarDef } from './calendar'
import type { ScheduleResult } from './schedule'
import type { SchActivity } from './types'

/** Where an activity's actual % comes from — kept apart because only the supervision-approved figure is a settled fact. */
export interface ActualPct { approved: number | null; reported: number | null; file: number | null }

/** planned % of one activity on a date: linear in working days between its baseline start and finish (0 before, 100 after) */
export function plannedPct(a: Pick<SchActivity, 'plannedStart' | 'plannedFinish' | 'type'>, date: string, cal: WorkCalendar): number | null {
  if (!a.plannedStart || !a.plannedFinish) return null
  if (date < a.plannedStart) return 0
  if (date >= a.plannedFinish) return 100
  const s = cal.idxOnOrAfter(a.plannedStart), f = cal.idxOnOrBefore(a.plannedFinish), d = cal.idxOnOrBefore(date)
  const total = f - s + 1
  return total <= 0 ? 100 : Math.min(100, Math.max(0, ((d - s + 1) / total) * 100))
}

/** weight of an activity in the overall %: its budget when every activity has one, else its original duration (milestones and summaries weigh nothing) */
export function weightsOf(acts: SchActivity[]): Map<string, number> {
  const tasks = acts.filter((a) => a.type === 'task')
  const byCost = tasks.length > 0 && tasks.every((a) => a.budgetCost > 0)
  return new Map(tasks.map((a) => [a.id, byCost ? a.budgetCost : Math.max(a.origDuration, 0)]))
}

export interface ProgressRow { id: string; code: string; planned: number | null; approved: number | null; reported: number | null; fileValue: number | null; /** best figure: approved, else file */ actual: number | null; variance: number | null }
export interface ProgressSummary {
  dataDate: string
  planned: number | null
  /** weighted overall of the figures that are settled: approved (ماژول اجرا) when linked, else the %-in-file */
  actual: number | null
  /** same with the supervision-pending (reported) quantities counted */
  reportedOverall: number | null
  /** share of the overall weight whose actual comes from a settled source */
  settledShare: number
  spi: number | null
  rows: ProgressRow[]
}

/** Planned (baseline) vs actual % at the data date, overall and per activity. `acts` = baseline activities matched with the actual figures by id (same list for both is fine for a single version). */
export function progressAt(baseline: SchActivity[], dataDate: string, calendar: CalendarDef, actual: Map<string, ActualPct>): ProgressSummary {
  const cal = new WorkCalendar(calendar, baseline.map((a) => a.plannedStart).filter((x): x is string => !!x).sort()[0] ?? dataDate)
  const w = weightsOf(baseline)
  const rows: ProgressRow[] = []
  let wp = 0, wa = 0, wr = 0, wt = 0, settled = 0
  for (const a of baseline) {
    if (a.type !== 'task') continue
    const wt1 = w.get(a.id) ?? 0
    const p = plannedPct(a, dataDate, cal)
    const x = actual.get(a.id) ?? { approved: null, reported: null, file: null }
    const best = x.approved ?? x.file
    const rep = x.reported ?? best
    rows.push({ id: a.id, code: a.code, planned: p, approved: x.approved, reported: x.reported, fileValue: x.file, actual: best, variance: p != null && best != null ? best - p : null })
    if (wt1 > 0 && p != null) { wt += wt1; wp += wt1 * p; wa += wt1 * (best ?? 0); wr += wt1 * (rep ?? 0); if (best != null) settled += wt1 }
  }
  return { dataDate, planned: wt ? wp / wt : null, actual: wt ? wa / wt : null, reportedOverall: wt ? wr / wt : null, settledShare: wt ? settled / wt : 0, spi: wt && wp > 0 ? wa / wp : null, rows }
}

export interface FinishVariance { baselineFinish: string | null; forecastFinish: string | null; slipDays: number | null }
export const finishVariance = (baseline: ScheduleResult, forecast: ScheduleResult): FinishVariance => ({
  baselineFinish: baseline.projectFinish, forecastFinish: forecast.projectFinish,
  slipDays: baseline.projectFinish && forecast.projectFinish ? daysBetween(baseline.projectFinish, forecast.projectFinish) : null,
})

export interface ActivitySlip { id: string; code: string; baselineFinish: string | null; forecastFinish: string | null; finishSlip: number | null; startSlip: number | null; critical: boolean }
/** per-activity slip of the forecast against the baseline, matched by uid */
export function activitySlips(baselineActs: SchActivity[], currentActs: SchActivity[], forecast: ScheduleResult): ActivitySlip[] {
  const base = new Map(baselineActs.map((a) => [a.uid, a]))
  const out: ActivitySlip[] = []
  for (const a of currentActs) {
    const b = base.get(a.uid); const f = forecast.byId.get(a.id)
    if (!b || !f) continue
    out.push({
      id: a.id, code: a.code, baselineFinish: b.plannedFinish, forecastFinish: f.finish,
      finishSlip: b.plannedFinish && f.finish ? daysBetween(b.plannedFinish, f.finish) : null, startSlip: b.plannedStart && f.start ? daysBetween(b.plannedStart, f.start) : null, critical: f.critical,
    })
  }
  return out
}

export interface OverdueRow { id: string; code: string; name: string; kind: 'late_finish' | 'late_start'; days: number; critical: boolean }
/** activities past their baseline dates at the data date: unfinished after the planned finish, or not started after the planned start */
export function overdueActivities(acts: SchActivity[], dataDate: string, critical: Set<string> = new Set()): OverdueRow[] {
  const out: OverdueRow[] = []
  for (const a of acts) {
    if (a.type !== 'task' && a.type !== 'milestone') continue
    const done = !!a.actualFinish || (a.pctComplete ?? 0) >= 100
    if (done) continue
    if (a.plannedFinish && a.plannedFinish < dataDate) out.push({ id: a.id, code: a.code, name: a.name, kind: 'late_finish', days: daysBetween(a.plannedFinish, dataDate), critical: critical.has(a.id) })
    else if (!a.actualStart && a.plannedStart && a.plannedStart < dataDate) out.push({ id: a.id, code: a.code, name: a.name, kind: 'late_start', days: daysBetween(a.plannedStart, dataDate), critical: critical.has(a.id) })
  }
  return out.sort((x, y) => Number(y.critical) - Number(x.critical) || y.days - x.days)
}

export interface LookaheadRow { id: string; code: string; name: string; start: string | null; finish: string | null; status: 'complete' | 'in_progress' | 'not_started'; critical: boolean; float: number | null }
/** the 3-week look-ahead: unfinished activities whose forecast dates touch [data date, data date + weeks × 7) */
export function lookahead(acts: SchActivity[], forecast: ScheduleResult, dataDate: string, weeks = 3): LookaheadRow[] {
  const end = addDays(dataDate, weeks * 7 - 1)
  const out: LookaheadRow[] = []
  for (const a of acts) {
    const f = forecast.byId.get(a.id); if (!f || f.status === 'complete' || !f.start || !f.finish) continue
    if (f.start <= end && f.finish >= dataDate) out.push({ id: a.id, code: a.code, name: a.name, start: f.start, finish: f.finish, status: f.status, critical: f.critical, float: f.totalFloat })
  }
  return out.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.code.localeCompare(b.code))
}
