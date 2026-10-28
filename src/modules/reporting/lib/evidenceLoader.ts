import { supabase } from '../../../lib/supabaseClient'
import { loadProjectMetrics } from '../../projectMetrics/projectMetricsLoader'
import { HEALTH_DIMENSION_LABEL_FA } from '../../lifecycle/types'
import { currentState, riskLevel } from '../../risk/lib/riskScore'
import { fetchProjectIntelligence } from './dataAdapter'
import { decisionFromRow, rastaActionFromRow, type DecisionRow, type RastaActionRow } from './reportingData'
import { buildEvidenceReport, type EvidenceInput, type EvidenceReport, type Facts } from './evidenceReport'

/** widget id under which an evidence report is frozen in rasta_report_snapshots */
export const EVIDENCE_WIDGET = 'evidence-report'

type Row = Record<string, unknown>
const maxDate = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort().pop() ?? null

/**
 * Gathers one project's rows from the modules that own them — the project dashboard's metrics engine (progress, EVM,
 * health, stoppages), the risk register, issues, management actions and decisions, the portfolio decision and the last
 * issued evidence report — and hands them to the pure report builder.
 */
export async function loadEvidenceReport(masterProjectId: string, projectName: string): Promise<{ report: EvidenceReport; input: EvidenceInput }> {
  const [metrics, bundle, dec, act, pf, prev, people] = await Promise.all([
    loadProjectMetrics(masterProjectId).catch(() => null),
    fetchProjectIntelligence(masterProjectId).catch(() => null),
    supabase.from('rasta_decisions').select('*').eq('master_project_id', masterProjectId),
    supabase.from('rasta_actions').select('*').eq('master_project_id', masterProjectId),
    supabase.from('pf_decisions').select('decision, review_by, decided_at').eq('master_project_id', masterProjectId).eq('voided', false).order('decided_at', { ascending: false }).limit(1),
    supabase.from('rasta_report_snapshots').select('report_number, issued_at, approved_at, created_at, payload, status, widget_ids').eq('master_project_id', masterProjectId).in('status', ['approved', 'issued']).contains('widget_ids', [EVIDENCE_WIDGET]).order('created_at', { ascending: false }).limit(1),
    supabase.from('profiles').select('id, full_name, email'),
  ])
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
  const actions = ((act.data ?? []) as RastaActionRow[]).map(rastaActionFromRow).map((a) => ({ id: a.id, title: a.title, status: a.status, priority: a.priority, dueDate: a.dueDate, owner: who(a.ownerId), relatedRiskId: a.relatedRiskId, relatedIssueId: a.relatedIssueId, createdAt: a.createdAt, updatedAt: a.updatedAt }))
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
    previous: prevPayload?.facts ? { reportNumber: String(prevRow.report_number ?? ''), issuedAt: String(prevRow.issued_at ?? prevRow.approved_at ?? prevRow.created_at ?? ''), facts: prevPayload.facts as Facts } : null,
  }
  return { report: buildEvidenceReport(input), input }
}
