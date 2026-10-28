import { supabase } from '../../../lib/supabaseClient'
import { batchedRows, shared } from '../../../lib/batchedQuery'
import { loadProjectMetrics } from '../../projectMetrics/projectMetricsLoader'
import { HEALTH_DIMENSION_LABEL_FA } from '../../lifecycle/types'
import { currentState, riskLevel } from '../../risk/lib/riskScore'
import { fetchProjectIntelligence } from './dataAdapter'
import { decisionFromRow, rastaActionFromRow, type DecisionRow, type RastaActionRow } from './reportingData'
import { buildEvidenceReport, DEFAULT_THRESHOLDS, type EvidenceInput, type EvidenceReport, type Facts, type Thresholds } from './evidenceReport'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { STOPPAGE_CATEGORY_FA } from '../../execution/lib/formCatalog'

/** The materiality thresholds in force for a project: the global row, overridden field by field by the project's row. */
export async function loadThresholds(masterProjectId: string | null): Promise<{ thresholds: Thresholds; version: string; global: { id: string; thresholds: Thresholds; version: number } | null; project: { id: string; thresholds: Partial<Thresholds>; version: number } | null }> {
  // one read serves every project loaded in the same moment (portfolio pages load all projects together)
  const { data } = await shared('rp_thresholds', () => supabase.from('rp_thresholds').select('id, master_project_id, thresholds, version'))
  const rows = (data ?? []) as Row[]
  const g = rows.find((r) => r.master_project_id == null)
  const p = masterProjectId ? rows.find((r) => r.master_project_id === masterProjectId) : undefined
  const global = g ? { id: String(g.id), thresholds: { ...DEFAULT_THRESHOLDS, ...(g.thresholds as Partial<Thresholds>) }, version: Number(g.version) } : null
  const project = p ? { id: String(p.id), thresholds: p.thresholds as Partial<Thresholds>, version: Number(p.version) } : null
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(global?.thresholds ?? {}), ...(project?.thresholds ?? {}) }
  const version = [global ? `سراسری نسخهٔ ${global.version}` : 'پیش‌فرض', project ? `پروژه نسخهٔ ${project.version}` : ''].filter(Boolean).join(' + ')
  return { thresholds, version, global, project }
}

/** widget id under which an evidence report is frozen in rasta_report_snapshots */
export const EVIDENCE_WIDGET = 'evidence-report'

type Row = Record<string, unknown>
const maxDate = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort().pop() ?? null

/**
 * Gathers one project's rows from the modules that own them — the project dashboard's metrics engine (progress, EVM,
 * health, stoppages), the risk register, issues, management actions and decisions, the portfolio decision and the last
 * issued evidence report — and hands them to the pure report builder.
 */
export async function loadEvidenceReport(masterProjectId: string, projectName: string): Promise<{ report: EvidenceReport; input: EvidenceInput; metrics: Awaited<ReturnType<typeof loadProjectMetrics>>; bundle: Awaited<ReturnType<typeof fetchProjectIntelligence>> | null; names: Map<string, string> }> {
  const [metrics, bundle, dec, act, pf, prev, people] = await Promise.all([
    loadProjectMetrics(masterProjectId).catch(() => null),
    fetchProjectIntelligence(masterProjectId).catch(() => null),
    batchedRows({ table: 'rasta_decisions', column: 'master_project_id', select: '*' }, [masterProjectId]).then((data) => ({ data })),
    batchedRows({ table: 'rasta_actions', column: 'master_project_id', select: '*' }, [masterProjectId]).then((data) => ({ data })),
    supabase.from('pf_decisions').select('decision, review_by, decided_at').eq('master_project_id', masterProjectId).eq('voided', false).order('decided_at', { ascending: false }).limit(1),
    supabase.from('rasta_report_snapshots').select('report_number, issued_at, approved_at, created_at, payload, status, widget_ids').eq('master_project_id', masterProjectId).in('status', ['approved', 'issued']).contains('widget_ids', [EVIDENCE_WIDGET]).order('created_at', { ascending: false }).limit(1),
    shared('profiles:names', () => supabase.from('profiles').select('id, full_name, email')),
  ])
  const th = await loadThresholds(masterProjectId)
  const names = new Map(((people.data ?? []) as Row[]).map((r) => [String(r.id), String(r.full_name || r.email || '')]))
  const who = (id: string | null | undefined) => (id ? names.get(id) ?? null : null)

  const assessByRisk = new Map<string, { date: string; score: number; postAction: boolean; actionIds: string[] }[]>()
  for (const a of bundle?.risk?.assessments ?? []) assessByRisk.set(a.riskId, [...(assessByRisk.get(a.riskId) ?? []), { date: a.reviewDate.slice(0, 10), score: a.currentScore, postAction: a.kind === 'post_action', actionIds: a.relatedActionIds ?? [] }])
  const risks = bundle?.risk ? bundle.risk.risks.map((r) => {
    const s = currentState(r, (bundle.risk!.assessments).filter((a) => a.riskId === r.id)).score
    return { id: r.id, title: r.title, status: r.status, score: s, level: riskLevel(s) as 'critical' | 'high' | 'medium' | 'low', owner: who(r.ownerId), identifiedDate: r.identifiedDate.slice(0, 10), assessments: assessByRisk.get(r.id) ?? [] }
  }) : null
  const riskActions = (bundle?.risk?.actions ?? []).map((a) => ({ id: a.id, riskId: a.riskId, title: a.description, status: a.status, dueDate: a.dueDate, completedAt: a.completedAt, owner: who(a.ownerId), effectStatus: a.effectStatus, createdAt: a.createdAt }))
  const issues = bundle?.issues ? bundle.issues.issues.map((i) => ({ id: i.id, title: i.title, status: i.status, priority: i.priority, deadline: i.resolveDueDate ?? i.deadlineDate ?? null, createdAt: i.createdAt, closedAt: i.closedAt, owner: who(i.ownerId ?? i.pursuerId) })) : null
  const actions = ((act.data ?? []) as RastaActionRow[]).map(rastaActionFromRow).map((a) => ({ id: a.id, title: a.title, status: a.status, priority: a.priority, dueDate: a.dueDate, owner: who(a.ownerId), relatedRiskId: a.relatedRiskId, relatedIssueId: a.relatedIssueId, createdAt: a.createdAt, updatedAt: a.updatedAt, sourceDecisionId: a.sourceDecisionId }))
  const decisions = ((dec.data ?? []) as DecisionRow[]).map(decisionFromRow).map((d) => ({ id: d.id, title: d.title, status: d.status, requiredBy: d.requiredBy, owner: who(d.decisionOwnerId), createdAt: d.createdAt }))
  const pfRow = ((pf.data ?? []) as Row[])[0]
  const prevRow = ((prev.data ?? []) as Row[])[0]
  const prevPayload = prevRow ? ((prevRow.payload as Record<string, unknown>)?.[EVIDENCE_WIDGET] as EvidenceReport | undefined) : undefined

  const curve = metrics ? metrics.curve.map((p) => ({ date: p.date, planned: p.planned, earned: p.earned })) : []
  const input: EvidenceInput = {
    today: new Date().toISOString().slice(0, 10),
    project: projectName,
    metrics: metrics ? {
      asOf: metrics.asOf,
      lifecycle: metrics.lifecycle,
      evm: metrics.evm.bac > 0 ? { bac: metrics.evm.bac, spi: metrics.evm.spi, cpi: metrics.evm.cpi, eac: metrics.evm.eac, vac: metrics.evm.vac } : null,
      curve,
      planFinish: metrics.epcWindow?.finish ?? null,
      health: metrics.health ? {
        status: metrics.health.status, drivenBy: metrics.health.drivenBy ? HEALTH_DIMENSION_LABEL_FA[metrics.health.drivenBy] : null, blockers: metrics.health.blockers,
        dims: metrics.health.dims.map((d) => ({ key: d.dimension, label: HEALTH_DIMENSION_LABEL_FA[d.dimension], status: d.status, explanation: d.explanation, assessed: d.assessed !== false })),
      } : null,
      delays: metrics.delays.map((d) => ({ label: d.label, value: d.value })),
    } : null,
    risks, riskActions, issues, actions, decisions,
    portfolio: pfRow ? { decision: String(pfRow.decision), reviewBy: (pfRow.review_by as string) ?? null } : null,
    sourceDates: [
      { source: 'پیشرفت (منحنی EPC)', available: !!metrics && curve.some((p) => p.earned != null), date: maxDate(curve.filter((p) => p.earned != null && p.date <= new Date().toISOString().slice(0, 10)).map((p) => p.date)) },
      { source: 'ثبت ریسک', available: !!risks?.length, date: maxDate([...(risks ?? []).flatMap((r) => [r.identifiedDate, ...r.assessments.map((a) => a.date)])]) },
      { source: 'مدیریت مسائل', available: !!issues?.length, date: maxDate((bundle?.issues?.issues ?? []).map((i) => i.updatedAt)) },
      { source: 'اقدامات و تصمیم‌ها', available: actions.length + decisions.length > 0, date: maxDate([...actions.map((a) => a.updatedAt), ...decisions.map((d) => d.createdAt)]) },
    ],
    thresholds: th.thresholds,
    thresholdsVersion: th.version,
    periodDelays: periodDelays(masterProjectId, prevRow ? String(prevRow.issued_at ?? prevRow.approved_at ?? prevRow.created_at ?? '').slice(0, 10) : null),
    previous: prevPayload?.facts ? { reportNumber: String(prevRow.report_number ?? ''), issuedAt: String(prevRow.issued_at ?? prevRow.approved_at ?? prevRow.created_at ?? ''), facts: prevPayload.facts as Facts } : null,
  }
  return { report: buildEvidenceReport(input), input, metrics, bundle, names }
}

/** stoppages of the project's daily reports dated inside the report period: since the previous report, else 30 days */
function periodDelays(masterProjectId: string, since: string | null): EvidenceInput['periodDelays'] {
  const ex = useExecutionStore.getState()
  if (!ex.reports.length) return null
  const to = new Date().toISOString().slice(0, 10)
  const from = since && since < to ? since : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const reps = new Map(ex.reports.filter((r) => r.projectId === masterProjectId && r.status !== 'draft' && r.reportDate >= from && r.reportDate <= to).map((r) => [r.id, r.reportDate]))
  const items = ex.stoppages.filter((s) => reps.has(s.reportId) && s.hours > 0).map((s) => ({ date: reps.get(s.reportId) as string, label: STOPPAGE_CATEGORY_FA[s.category] ?? s.category, hours: s.hours, responsibility: s.responsibility, critical: s.critical }))
  return { from, to, items }
}
