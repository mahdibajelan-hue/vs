/**
 * Real-data bridge for Project Radar's Risk/Issue picture. Radar started as a Phase-1 mock-only
 * screen (see radarTypes.ts) — this reuses the Reporting module's existing cross-module adapter
 * (fetchProjectIntelligence, resolved via rasta_project_mappings) instead of re-implementing that
 * lookup, and overrides only the risk- and issue-derived parts of the mock picture. Any module the
 * selected master project has no confirmed mapping for simply keeps its mock numbers — same
 * "unmapped state" convention the Reporting widgets already use, so an unmapped project never
 * looks broken, just not-yet-connected.
 */
import { fetchProjectIntelligence } from '../../../modules/reporting/lib/dataAdapter'
import { currentState, riskLevel } from '../../../modules/risk/lib/riskScore'
import type { RmRisk, RmRiskAssessment } from '../../../modules/risk/types'
import type { ImIssue } from '../../../modules/issues/types'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import {
  buildMockRadarData, SEVERITY_RADIUS_RANGE,
  type ProjectRadarStatus, type RadarData, type RadarSignal, type SignalSeverity,
} from './radarTypes'

const ACTIVE_RISK_STATUSES = new Set(['open', 'monitoring', 'escalated'])
const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress', 'pending_approval'])
const HIGH_SEVERITY: Set<SignalSeverity> = new Set(['high', 'critical'])

/** Spreads same-severity signals across their radius band without clustering — golden-ratio
 * increments avoid the periodic repeats a plain modulo would produce for small counts. */
function spreadRadius(rMin: number, rMax: number, index: number): number {
  return rMin + ((index * 0.61803398875) % 1) * (rMax - rMin)
}

function groupAssessmentsByRisk(assessments: RmRiskAssessment[]): Map<string, RmRiskAssessment[]> {
  const map = new Map<string, RmRiskAssessment[]>()
  for (const a of assessments) {
    const list = map.get(a.riskId)
    if (list) list.push(a)
    else map.set(a.riskId, [a])
  }
  return map
}

function riskToSignal(risk: RmRisk, assessments: RmRiskAssessment[], index: number, total: number): RadarSignal {
  const { score } = currentState(risk, assessments)
  const severity = riskLevel(score) as SignalSeverity
  const [rMin, rMax] = SEVERITY_RADIUS_RANGE[severity]
  return {
    id: `risk-${risk.id}`,
    category: 'risk',
    severity,
    title: risk.title, subject: risk.code, detail: `امتیاز ${score}`,
    impact: risk.description || '—', rootCause: '—', recommendedAction: '—',
    titleEn: risk.title, subjectEn: risk.code, detailEn: `Score ${score}`,
    impactEn: risk.description || '—', rootCauseEn: '—', recommendedActionEn: '—',
    angle: Math.round((index / Math.max(1, total)) * 360),
    radius: spreadRadius(rMin, rMax, index),
  }
}

function issueToSignal(issue: ImIssue, index: number, total: number): RadarSignal {
  // ImIssuePriority ('low'|'medium'|'high'|'critical') is the exact same value set as SignalSeverity.
  const severity = issue.priority as SignalSeverity
  const [rMin, rMax] = SEVERITY_RADIUS_RANGE[severity]
  return {
    id: `issue-${issue.id}`,
    category: 'issue',
    severity,
    title: issue.title, subject: issue.deadlineDate, detail: issue.status,
    impact: issue.description || '—', rootCause: '—', recommendedAction: '—',
    titleEn: issue.title, subjectEn: issue.deadlineDate, detailEn: issue.status,
    impactEn: issue.description || '—', rootCauseEn: '—', recommendedActionEn: '—',
    angle: Math.round((index / Math.max(1, total)) * 360) + 15,
    radius: spreadRadius(rMin, rMax, index),
  }
}

const STATUS_RANK: Record<ProjectRadarStatus, number> = { nominal: 0, attention: 1, at_risk: 2, critical: 3 }

/** Never soften the mock status, but let real critical/high risk or issue signals push it up. */
function escalateStatus(base: ProjectRadarStatus, liveSignals: RadarSignal[]): ProjectRadarStatus {
  const worst: ProjectRadarStatus = liveSignals.some((s) => s.severity === 'critical')
    ? 'critical'
    : liveSignals.some((s) => s.severity === 'high')
      ? 'at_risk'
      : 'nominal'
  return STATUS_RANK[worst] > STATUS_RANK[base] ? worst : base
}

/**
 * Builds the Radar picture for a master project: starts from the deterministic mock (so lifecycle/
 * gate/contract/EPC — not yet wired to a real module — still render something plausible), then
 * replaces the risk- and issue-derived signals/KPIs with live data wherever a confirmed module
 * mapping exists. Falls back to the pure mock on any fetch error so a live-data problem never
 * blanks the page.
 */
export async function buildRadarData(masterProjectId: string, projectName: string, projectIdCode: string): Promise<RadarData> {
  const base = buildMockRadarData(masterProjectId, projectName, projectIdCode)
  if (!isSupabaseConfigured) return base

  try {
    const bundle = await fetchProjectIntelligence(masterProjectId)
    const riskMapped = bundle.risk !== null
    const issueMapped = bundle.issues !== null
    if (!riskMapped && !issueMapped) return base

    const risks = bundle.risk?.risks ?? []
    const assessmentsByRisk = groupAssessmentsByRisk(bundle.risk?.assessments ?? [])
    const issues = bundle.issues?.issues ?? []

    const riskSignals = riskMapped
      ? risks.map((r, i) => riskToSignal(r, assessmentsByRisk.get(r.id) ?? [], i, risks.length))
      : base.signals.filter((s) => s.category === 'risk')
    const issueSignals = issueMapped
      ? issues.map((iss, i) => issueToSignal(iss, i, issues.length))
      : base.signals.filter((s) => s.category === 'issue')
    const otherMockSignals = base.signals.filter((s) => s.category !== 'risk' && s.category !== 'issue')

    const activeRisks = riskMapped ? risks.filter((r) => ACTIVE_RISK_STATUSES.has(r.status)).length : base.kpi.activeRisks
    const activeRisksHigh = riskMapped
      ? risks.filter((r) => ACTIVE_RISK_STATUSES.has(r.status) && HIGH_SEVERITY.has(riskLevel(currentState(r, assessmentsByRisk.get(r.id) ?? []).score) as SignalSeverity)).length
      : base.kpi.activeRisksHigh
    const openIssues = issueMapped ? issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)).length : base.kpi.openIssues
    const openIssuesHigh = issueMapped
      ? issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status) && HIGH_SEVERITY.has(i.priority as SignalSeverity)).length
      : base.kpi.openIssuesHigh

    return {
      ...base,
      status: escalateStatus(base.status, [...riskSignals, ...issueSignals]),
      kpi: { ...base.kpi, activeRisks, activeRisksHigh, openIssues, openIssuesHigh },
      signals: [...riskSignals, ...issueSignals, ...otherMockSignals],
    }
  } catch (err) {
    console.warn('[radar] live risk/issue fetch failed, showing mock data instead', err)
    return base
  }
}
