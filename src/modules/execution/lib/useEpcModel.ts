import { useMemo } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { useExecutionModel } from './useExecutionModel'
import { epcSettings } from './epcSettings'
import { cumulative } from './progress'
import { productivity, resourceElasticity, type CrewLog, type ProductivityParams, type ProductivityResult } from './engine/productivity'
import { forecastActivity, type ActivityForecast } from './engine/forecast'
import { engProgress, engProgressBy, forecastDoc, forecastCompletion, docImpact, execReadiness, totalFloat, DEFAULT_ENG_RULES, type Doc, type DocLink, type DocForecast, type Impact, type ReadyOut } from './engine/engineering'
import { activityReadiness, type ActivityReadiness, type EngDoc, type Prereq, type SupplyState } from './engine/readiness'
import { reconcile, type Ledger } from './engine/reconcile'
import { buildAlerts, type Alert } from './engine/alerts'
import { metricTotals } from './engine/aggregate'
import { ppc } from './engine/lookahead'
import { DEFAULT_SCENARIO_PARAMS, type ActivityState, type ScenarioParams } from './engine/scenarios'
import { addDays, weekOf } from './periods'

export interface ActivityInsight { activityId: string; remaining: number; cum: number; base: number; prod: ProductivityResult; forecast: ActivityForecast; readiness: ActivityReadiness; logs: CrewLog[]; exec: ReadyOut; impacts: Impact[]; /** reasons that stop the execution engine from proposing more capacity */ capBlockers: string[] }

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
    const rules = DEFAULT_ENG_RULES
    const docRows = epc.engDocs.filter((d) => d.projectId === pid)
    const engDocs: Doc[] = docRows.map((d) => ({ id: d.id, code: d.docNo, title: d.title, discipline: d.discipline, contract: d.contract, weight: d.weight, critical: d.critical, plannedPrepared: d.plannedPrepared, plannedApproved: d.plannedApproved, actualPrepared: d.actualPrepared, actualApproved: d.actualApproved, status: d.status }))
    const docById = new Map(engDocs.map((d) => [d.id, d]))
    const docFc = new Map<string, DocForecast>(engDocs.map((d) => [d.id, forecastDoc(d, engDocs, today, rules)]))
    const dlinks: DocLink[] = epc.docLinks.filter((l) => l.projectId === pid).map((l) => ({ id: l.id, docId: l.docId, activityId: l.activityId, front: l.front, needKind: l.needKind, needDate: l.needDate, minStatus: l.minStatus, allowRestricted: l.allowRestricted, altActivityId: l.altActivityId }))
    const floats = totalFloat(ex.activities.map((a) => ({ id: a.id, plannedStart: a.plannedStart, plannedEnd: a.plannedEnd })), epc.deps.filter((d) => d.projectId === pid).map((d) => ({ predId: d.predId, succId: d.succId, type: d.type, lag: d.lag })))
    const impacts: Impact[] = []
    for (const l of dlinks) { const d = docById.get(l.docId), a = ex.actById.get(l.activityId); if (!d || !a) continue; impacts.push(docImpact({ link: l, doc: d, forecast: docFc.get(d.id)!, activity: { id: a.id, title: a.title, plannedStart: a.plannedStart, plannedEnd: a.plannedEnd }, float: floats.get(a.id), today })) }
    const insights = new Map<string, ActivityInsight>()
    for (const a of ex.activities) {
      if (!a.active || a.approval !== 'approved') continue
      const base = ex.baseOf(a), c = cum.get(a.id) ?? 0, remaining = Math.max(0, base - c)
      const logs = logsByAct.get(a.id) ?? []
      const prod = productivity(logs, today, params)
      const readiness = activityReadiness(a.id, prereqs, docs, supply, today)
      const myImp = impacts.filter((x) => x.activityId === a.id)
      const others = readiness.items.filter((it) => prereqs.find((p) => p.id === it.prereqId)?.refType !== 'eng_doc').map((it) => ({ title: it.title, state: it.state }))
      const exec = execReadiness({ docs: myImp.map((x) => ({ impact: x, docCode: docById.get(x.docId)?.code ?? '—', needDate: x.needDate })), others, today })
      const hasAny = myImp.length > 0 || readiness.items.length > 0
      const merged: ActivityReadiness = hasAny ? { ...readiness, state: exec.state === 'not_ready' ? 'blocked' : exec.state === 'ready_with_restrictions' ? 'at_risk' : 'ready', blockers: exec.state === 'not_ready' ? exec.reasons : [] } : readiness
      const capBlockers = [...merged.blockers, ...myImp.filter((x) => x.state !== 'ok' && x.state !== 'restricted' && (!x.needDate || x.needDate <= addDays(today, 14))).map((x) => `مدرک ${docById.get(x.docId)?.code ?? ''} هنوز آماده نیست`)]
      const forecast = forecastActivity({ activityId: a.id, remainingQty: remaining, plannedEnd: a.plannedEnd, prod, today, workDays: ex.settings.workDays, blockers: capBlockers })
      insights.set(a.id, { activityId: a.id, remaining, cum: c, base, prod, forecast, readiness: merged, logs, exec, impacts: myImp, capBlockers })
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
    const eng = {
      progress: engProgress(engDocs, today, rules), byDiscipline: engProgressBy(engDocs, today, 'discipline', rules), byContract: engProgressBy(engDocs, today, 'contract', rules),
      completion: forecastCompletion(engDocs, today, rules),
      criticalOpen: engDocs.filter((d) => d.critical && d.status !== 'approved' && d.status !== 'superseded').map((d) => ({ doc: d, fc: docFc.get(d.id)! })),
      slipMax: impacts.reduce<number | null>((m, x) => (x.projectSlipDays == null ? m : Math.max(m ?? 0, x.projectSlipDays)), null),
      notReady: [...insights.values()].filter((i) => i.remaining > 0 && i.exec.state === 'not_ready' && i.impacts.length > 0),
    }
    const alerts: Alert[] = buildAlerts({
      today, spi,
      forecasts: [...insights.values()].filter((i) => i.remaining > 0).map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '', onTimeProb: i.forecast.onTimeProb, lateRisk: i.forecast.lateRisk, unreliable: i.forecast.unreliable })),
      readiness: [...insights.values()].filter((i) => i.readiness.state !== 'unknown' && i.remaining > 0).map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '', state: i.readiness.state, blockers: i.readiness.blockers, earliestStart: i.readiness.earliestStart, plannedStart: ex.actById.get(i.activityId)?.plannedStart ?? null })),
      overdueReports, ppcLast: ppcLast ? { ppc: ppcLast.ppc, committed: ppcLast.committed } : null,
      ledger: ledger.map((l) => ({ activityId: l.activityId, title: l.title, approved: l.approved, toMeasure: l.toMeasure, mismatches: l.mismatches.filter((m) => m.kind !== 'approved_not_measured').length })),
      engineering: { criticalOverdue: eng.criticalOpen.filter((c) => c.fc.overdue).map((c) => ({ id: c.doc.id, code: c.doc.code, days: c.fc.overdueDays })), notReady: eng.notReady.map((i) => ({ activityId: i.activityId, title: actTitle.get(i.activityId) ?? '', reason: i.exec.reasons.join('؛ ') })), projectSlipDays: eng.slipMax },
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
      return { basis: observed > 0 && observed === Object.keys(composition).length ? 'observed' : 'assumed', state: { activityId, title: a.title, unit: a.unit, remainingQty: i.remaining, plannedEnd: a.plannedEnd, rate: i.prod.rates.perCrewDay, rateSd: i.prod.rates.sd, composition, elasticity: elas, constraints: o.constraints ?? [], blockers: i.capBlockers, frontsAvailable: o.frontsAvailable ?? 1 } }
    }
    return { ex, set, today, eng, engDocs, docById, docFc, dlinks, impacts, floats, insights, ledger, alerts, metrics, spi, ppcLast, scenarioParams, stateFor, docs, supply, prereqs, cum, tick: emp.length }
  }, [ex, epc.crewLogs, epc.engDocs, epc.docLinks, epc.deps, epc.prereqs, epc.lookahead, epc.measurements, mat.positions, projectId, emp.length])
}
export type EpcModel = ReturnType<typeof useEpcModel>
