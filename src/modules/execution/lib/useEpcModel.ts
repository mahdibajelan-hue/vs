import { useMemo } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { useExecutionModel } from './useExecutionModel'
import { epcSettings } from './epcSettings'
import { cumulative } from './progress'
import { productivity, resourceElasticity, type CrewLog, type ProductivityParams, type ProductivityResult } from './engine/productivity'
import { forecastActivity, type ActivityForecast } from './engine/forecast'
import { activityReadiness, type ActivityReadiness, type EngDoc, type Prereq, type SupplyState } from './engine/readiness'
import { reconcile, type Ledger } from './engine/reconcile'
import { buildAlerts, type Alert } from './engine/alerts'
import { metricTotals } from './engine/aggregate'
import { ppc } from './engine/lookahead'
import { DEFAULT_SCENARIO_PARAMS, type ActivityState, type ScenarioParams } from './engine/scenarios'
import { addDays, weekOf } from './periods'

export interface ActivityInsight { activityId: string; remaining: number; cum: number; base: number; prod: ProductivityResult; forecast: ActivityForecast; readiness: ActivityReadiness; logs: CrewLog[] }

/** All derived EPC-control figures for one project: productivity, forecast, readiness, ledger, alerts, metric totals. Everything is computed from stored data; nothing is predicted by a language model. */
export function useEpcModel(projectId: string | null) {
  const ex = useExecutionModel(projectId)
  const epc = useEpcStore()
  const mat = useMaterialModel(projectId)
  const emp = useExecutionStore((s) => s.lines) // re-run when lines change (employer fields live on lines)
  return useMemo(() => {
    const pid = projectId ?? ''
    const set = epcSettings(ex.settings as unknown as Record<string, unknown>)
    const today = ex.today
    const employer = set.employerStep === 'binding' ? 'binding' : 'off'
    const params: Partial<ProductivityParams> = { windowDays: set.productivity.windowDays, weighting: set.productivity.weighting, smaDays: set.productivity.smaDays, outlierSigma: set.productivity.outlierSigma, laborKeys: set.productivity.laborKeys }
    const cum = cumulative(ex.reports, ex.lines, { until: today, mode: 'approved', employer })
    const repById = new Map(ex.reports.map((r) => [r.id, r]))
    const logsByAct = new Map<string, CrewLog[]>()
    for (const c of epc.crewLogs) {
      const r = repById.get(c.reportId); if (!r || !c.activityId) continue
      const l: CrewLog = { date: r.reportDate, activityId: c.activityId, crew: c.crewName || 'اکیپ', composition: c.composition, usefulHours: c.usefulHours, idleHours: c.idleHours, outputQty: c.outputQty, limit: typeof c.conditions?.limit === 'string' ? c.conditions.limit : undefined, approved: r.status === 'approved' }
      const a = logsByAct.get(c.activityId); if (a) a.push(l); else logsByAct.set(c.activityId, [l])
    }
    const docs = new Map<string, EngDoc>(epc.engDocs.filter((d) => d.projectId === pid).map((d) => [d.id, { id: d.id, docNo: d.docNo, title: d.title, rev: d.rev, status: d.status, restrictionNote: d.restrictionNote, dueDate: d.dueDate }]))
    const supply = new Map<string, SupplyState>()
    for (const [id, p] of mat.positions) supply.set(id, { id, onSite: p.onHand, required: Math.max(0, p.requiredQty - p.netConsumed) })
    const prereqs: Prereq[] = epc.prereqs.filter((p) => p.projectId === pid).map((p) => ({ id: p.id, activityId: p.activityId, kind: p.kind, title: p.title, refType: p.refType, refId: p.refId, status: p.status, neededDate: p.neededDate, readyDate: p.readyDate }))
    const insights = new Map<string, ActivityInsight>()
    for (const a of ex.activities) {
      if (!a.active || a.approval !== 'approved') continue
      const base = ex.baseOf(a), c = cum.get(a.id) ?? 0, remaining = Math.max(0, base - c)
      const logs = logsByAct.get(a.id) ?? []
      const prod = productivity(logs, today, params)
      const readiness = activityReadiness(a.id, prereqs, docs, supply, today)
      const forecast = forecastActivity({ activityId: a.id, remainingQty: remaining, plannedEnd: a.plannedEnd, prod, today, workDays: ex.settings.workDays, blockers: readiness.blockers })
      insights.set(a.id, { activityId: a.id, remaining, cum: c, base, prod, forecast, readiness, logs })
    }
    // ledger
    const evidenceMissing = new Map<string, number>()
    for (const l of ex.lines) if (l.activityId && l.status === 'approved' && !(l as { detail?: Record<string, unknown> }).detail?.evidence) evidenceMissing.set(l.activityId, (evidenceMissing.get(l.activityId) ?? 0) + (l.approvedQty ?? l.qty))
    const execCum = cumulative(ex.reports, ex.lines, { until: today, mode: 'registered' })
    const employerCum = set.employerStep === 'off' ? null : (() => { const m = new Map<string, number>(); for (const l of ex.lines) if (l.activityId && l.status === 'approved' && l.employerStatus === 'approved') m.set(l.activityId, (m.get(l.activityId) ?? 0) + (l.employerQty ?? 0)); return m })()
    const meas = epc.measurements.filter((m) => m.projectId === pid)
    const ledger: Ledger[] = reconcile(ex.activities.filter((a) => a.active && a.approval === 'approved' && ((cum.get(a.id) ?? 0) > 0 || meas.some((m) => m.activityId === a.id))).map((a) => ({
      activityId: a.id, title: a.title, unit: a.unit, executed: execCum.get(a.id) ?? 0, approved: cum.get(a.id) ?? 0, employer: employerCum ? employerCum.get(a.id) ?? 0 : null,
      evidenceMissing: 0, rows: meas.filter((m) => m.activityId === a.id).map((m) => ({ activityId: a.id, periodKey: m.periodKey, measured: m.measured, billed: m.billed, paid: m.paid, certificateId: m.certificateId })),
    })))
    // look-ahead PPC (last full week with commitments)
    const look = epc.lookahead.filter((l) => l.projectId === pid)
    const thisWeek = weekOf(today, ex.settings.weekStart).from
    const lastWeek = addDays(thisWeek, -7)
    const ppcLast = look.some((l) => l.weekStart === lastWeek) ? ppc(look, lastWeek) : null
    const spi = ex.planned.overall != null && ex.planned.overall > 0 ? ex.approved.overall / ex.planned.overall : null
    const overdueReports = ex.reports.filter((r) => (r.status === 'submitted' || r.status === 'partially_approved') && r.submittedAt).map((r) => ({ id: r.id, reportNo: r.reportNo, days: Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(r.submittedAt as string).setUTCHours(0, 0, 0, 0)) / 86400000) }))
    const actTitle = new Map(ex.activities.map((a) => [a.id, a.title]))
    const alerts: Alert[] = buildAlerts({
      today, spi,
      forecasts: [...insights.values()].filter((i) => i.remaining > 0).map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '', onTimeProb: i.forecast.onTimeProb, lateRisk: i.forecast.lateRisk, unreliable: i.forecast.unreliable })),
      readiness: [...insights.values()].filter((i) => i.readiness.state !== 'unknown' && i.remaining > 0).map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '', state: i.readiness.state, blockers: i.readiness.blockers, earliestStart: i.readiness.earliestStart, plannedStart: ex.actById.get(i.activityId)?.plannedStart ?? null })),
      overdueReports, ppcLast: ppcLast ? { ppc: ppcLast.ppc, committed: ppcLast.committed } : null,
      ledger: ledger.map((l) => ({ activityId: l.activityId, title: l.title, approved: l.approved, toMeasure: l.toMeasure, mismatches: l.mismatches.filter((m) => m.kind !== 'approved_not_measured').length })),
      dataQualityLow: [...insights.values()].filter((i) => i.logs.length > 0 && (i.prod.quality.confidence === 'low' || i.prod.quality.confidence === 'none')).map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '' })),
    }, set.thresholds)
    const metrics = metricTotals(ex.activities.filter((a) => a.active && a.approval === 'approved').map((a) => ({ id: a.id, metric: a.metric, baseQty: ex.baseOf(a), unit: a.unit })), cum)
    const scenarioParams = (): ScenarioParams => ({ ...DEFAULT_SCENARIO_PARAMS(today, ex.settings.workDays), shiftHours: set.productivity.shiftHours, extraShiftEfficiency: set.productivity.extraShiftEfficiency, crewDayCost: set.productivity.crewDayCost ?? undefined })
    /** Build the scenario input of an activity from its observed rate; the caller supplies the fronts / constraints the history cannot know. */
    const stateFor = (activityId: string, o: { frontsAvailable?: number; constraints?: ActivityState['constraints'] } = {}): { state: ActivityState; basis: 'observed' | 'assumed' } | null => {
      const i = insights.get(activityId), a = ex.actById.get(activityId); if (!i || !a || !i.prod.rates.perCrewDay) return null
      const last = [...i.logs].sort((x, y) => y.date.localeCompare(x.date))[0]
      const composition = last?.composition ?? {}
      const elas: Record<string, number> = {}; let observed = 0
      for (const k of Object.keys(composition)) { const e = resourceElasticity(i.logs, k, set.productivity.assumedElasticity); elas[k] = e.elasticity; if (e.basis === 'observed') observed++ }
      return { basis: observed > 0 && observed === Object.keys(composition).length ? 'observed' : 'assumed', state: { activityId, title: a.title, unit: a.unit, remainingQty: i.remaining, plannedEnd: a.plannedEnd, rate: i.prod.rates.perCrewDay, rateSd: i.prod.rates.sd, composition, elasticity: elas, constraints: o.constraints ?? [], blockers: i.readiness.blockers, frontsAvailable: o.frontsAvailable ?? 1 } }
    }
    return { ex, set, today, insights, ledger, alerts, metrics, spi, ppcLast, scenarioParams, stateFor, docs, supply, prereqs, cum, tick: emp.length }
  }, [ex, epc.crewLogs, epc.engDocs, epc.prereqs, epc.lookahead, epc.measurements, mat.positions, projectId, emp.length])
}
export type EpcModel = ReturnType<typeof useEpcModel>
