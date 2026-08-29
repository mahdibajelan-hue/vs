/**
 * Real-data bridge for Project Radar. Radar started as a Phase-1 mock-only screen (see
 * radarTypes.ts) — this reuses each module's own existing data layer instead of re-implementing
 * any of it:
 *  - Risk/Issue: the Reporting module's cross-module adapter (fetchProjectIntelligence), resolved
 *    via rasta_project_mappings (Risk/Issue live in their own per-module project space).
 *  - Lifecycle/Gate/EPC: the PLC module's own row mappers + analyseProject engine (health,
 *    readiness, gate status) — plc_* tables reference master_projects.id directly, no mapping row
 *    needed.
 *  - Contract: the Finance module's own row mappers + financeCalc helpers — fin_contracts also
 *    references master_projects.id directly.
 * Any section with no data yet for the selected project simply keeps its mock picture — same
 * "unmapped/not-yet-connected" convention the Reporting widgets already use, so an unconfigured
 * project never looks broken, just not-yet-connected.
 */
import { supabase, isSupabaseConfigured } from '../../../lib/supabaseClient'
import { fetchProjectIntelligence } from '../../../modules/reporting/lib/dataAdapter'
import { currentState, riskLevel } from '../../../modules/risk/lib/riskScore'
import type { RmRisk, RmRiskAssessment } from '../../../modules/risk/types'
import type { ImIssue } from '../../../modules/issues/types'

import {
  actionFromRow, activityFromRow, gateFromRow, healthFromRow, lifecycleFromRow, milestoneFromRow,
  stageFromRow,
  type PlcActivityRow, type PlcGateRow, type PlcHealthRow, type PlcLifecycleRow, type PlcMilestoneRow,
  type PlcStageRow, type RastaActionRow,
} from '../../../modules/lifecycle/lib/lifecycleData'
import { analyseProject, type ProjectAnalysis } from '../../../modules/lifecycle/lib/useProjectAnalysis'
import type { ProjectLifecycleBundle } from '../../../modules/lifecycle/store/useLifecycleStore'
import { STAGE_LABEL_EN, type StageKey } from '../../../modules/lifecycle/types'

import {
  finClaimFromRow, finContractAmendmentFromRow, finContractFromRow, finPaymentCertificateFromRow,
  finRetentionReleaseFromRow,
} from '../../../modules/finance/lib/financeData'
import {
  certificatePaidTotal, claimsExposureTotal, currentContractValue, retentionLiability,
} from '../../../modules/finance/lib/financeCalc'
import type { FinClaim, FinContract, FinContractAmendment, FinPaymentCertificate, FinRetentionRelease } from '../../../modules/finance/types'

import {
  buildMockRadarData, SEVERITY_RADIUS_RANGE, toFa,
  type ContractSummary, type EpcDimension, type ProjectRadarStatus, type RadarData,
  type RadarGate, type RadarLifecycleStage, type RadarSignal, type SignalSeverity, type StageState,
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

// ---------------------------------------------------------------------------
// Lifecycle / Gate / EPC — from the PLC module (plc_* tables key on
// master_projects.id directly, no mapping row involved).
// ---------------------------------------------------------------------------

/** Same per-project fetch as useLifecycleStore's `selectProject`, but standalone (reads only,
 * never touches that store's own currently-open-project state) and reusing its exact row mappers. */
async function fetchLifecycleBundle(masterProjectId: string): Promise<ProjectLifecycleBundle | null> {
  const [lc, st, gt, ms, act, hl, ac] = await Promise.all([
    supabase.from('plc_project_lifecycle').select('*').eq('project_id', masterProjectId).maybeSingle(),
    supabase.from('plc_project_stages').select('*').eq('project_id', masterProjectId).order('sequence'),
    supabase.from('plc_project_gates').select('*').eq('project_id', masterProjectId),
    supabase.from('plc_milestones').select('*').eq('project_id', masterProjectId),
    supabase.from('plc_activities').select('*').eq('project_id', masterProjectId).order('sequence'),
    supabase.from('plc_health_scores').select('*').eq('project_id', masterProjectId),
    supabase.from('rasta_actions').select('*').eq('master_project_id', masterProjectId),
  ])
  if (!lc.data) return null

  return {
    lifecycle: lifecycleFromRow(lc.data as PlcLifecycleRow),
    stages: ((st.data ?? []) as PlcStageRow[]).map(stageFromRow),
    gates: ((gt.data ?? []) as PlcGateRow[]).map(gateFromRow),
    checklist: [],
    milestones: ((ms.data ?? []) as PlcMilestoneRow[]).map(milestoneFromRow),
    forecastHistory: [],
    activities: ((act.data ?? []) as PlcActivityRow[]).map(activityFromRow),
    health: ((hl.data ?? []) as PlcHealthRow[]).map(healthFromRow),
    warnings: [],
    actions: ((ac.data ?? []) as RastaActionRow[]).map(actionFromRow),
  }
}

const STAGE_STATE: Record<string, StageState> = {
  completed: 'done', skipped: 'done', in_progress: 'current', not_started: 'upcoming',
}

function stageDateLabel(stage: ProjectLifecycleBundle['stages'][number]): string {
  const raw = stage.actualFinish ?? stage.forecastFinish ?? stage.plannedFinish
  return raw ? toFa(raw) : '—'
}

function buildLifecycleStages(bundle: ProjectLifecycleBundle): RadarLifecycleStage[] {
  return [...bundle.stages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      key: s.stageKey,
      label: s.nameFa,
      labelEn: STAGE_LABEL_EN[s.stageKey as StageKey] ?? s.nameFa,
      state: STAGE_STATE[s.status] ?? 'upcoming',
      dateFa: stageDateLabel(s),
      progressPct: s.progress,
    }))
}

/** The gate for the project's current stage, falling back to the nearest later stage that has
 * one (some stages — e.g. lessons_learned — never get a gate row of their own). */
function findRelevantGate(bundle: ProjectLifecycleBundle, currentStageKey: string): PlcGateRowLike | null {
  const direct = bundle.gates.find((g) => g.stageKey === currentStageKey)
  if (direct) return direct
  const currentSeq = bundle.stages.find((s) => s.stageKey === currentStageKey)?.sequence ?? -1
  const later = bundle.stages
    .filter((s) => s.sequence >= currentSeq)
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => bundle.gates.find((g) => g.stageKey === s.stageKey))
    .find((g): g is PlcGateRowLike => !!g)
  return later ?? null
}
type PlcGateRowLike = ProjectLifecycleBundle['gates'][number]

function buildGate(bundle: ProjectLifecycleBundle, analysis: ProjectAnalysis, currentStageKey: string): RadarGate | null {
  const gate = findRelevantGate(bundle, currentStageKey)
  if (!gate) return null
  const readiness = analysis.readiness.find((r) => r.stageKey === gate.stageKey)
  const prerequisites = readiness?.mandatoryTotal ?? 0
  const passed = readiness?.mandatoryDone ?? 0
  const failed = readiness?.overdueCount ?? 0
  const pending = Math.max(0, prerequisites - passed - failed)
  return {
    name: gate.name,
    nameEn: gate.name,
    prerequisites,
    passed,
    pending,
    failed,
    readinessPct: readiness?.percent ?? 0,
  }
}

const EPC_RELEVANT_STAGES = new Set(['procurement', 'execution', 'commissioning'])

function buildEpc(analysis: ProjectAnalysis, currentStageKey: string): EpcDimension[] | null {
  if (!EPC_RELEVANT_STAGES.has(currentStageKey)) return null
  const dim = (key: 'engineering' | 'procurement' | 'construction') =>
    analysis.health.find((h) => h.dimension === key)?.score ?? 0
  return [
    { key: 'engineering', label: 'مهندسی', labelEn: 'Engineering', pct: dim('engineering') },
    { key: 'procurement', label: 'تدارکات', labelEn: 'Procurement', pct: dim('procurement') },
    { key: 'construction', label: 'ساخت', labelEn: 'Construction', pct: dim('construction') },
  ]
}

// ---------------------------------------------------------------------------
// Contract summary — from the Finance module (fin_contracts references
// master_projects.id directly, no mapping row involved).
// ---------------------------------------------------------------------------

/** Real contract amounts run into the trillions of Rial — dividing to millions keeps the existing
 * "…M" suffix already hardcoded in RadarPanels.tsx numerically honest without touching that UI. */
const RIAL_TO_DISPLAY_UNIT = 1_000_000

async function fetchContractSummary(masterProjectId: string): Promise<ContractSummary | null> {
  const { data: contractRows } = await supabase
    .from('fin_contracts').select('*').eq('master_project_id', masterProjectId)
  const contracts = ((contractRows ?? []) as any[]).map(finContractFromRow) as FinContract[]
  if (contracts.length === 0) return null

  // "The" contract for this summary — the main EPC contract if one is mapped, else the largest.
  const contract = contracts.find((c) => c.contractRole === 'main_epc')
    ?? [...contracts].sort((a, b) => b.contractValue - a.contractValue)[0]

  const [{ data: amendRows }, { data: certRows }, { data: claimRows }, { data: releaseRows }] = await Promise.all([
    supabase.from('fin_contract_amendments').select('*').eq('contract_id', contract.id),
    supabase.from('fin_payment_certificates').select('*').eq('contract_id', contract.id),
    supabase.from('fin_claims').select('*').eq('contract_id', contract.id),
    supabase.from('fin_retention_releases').select('*').eq('contract_id', contract.id),
  ])
  const amendments = ((amendRows ?? []) as any[]).map(finContractAmendmentFromRow) as FinContractAmendment[]
  const certificates = ((certRows ?? []) as any[]).map(finPaymentCertificateFromRow) as FinPaymentCertificate[]
  const claims = ((claimRows ?? []) as any[]).map(finClaimFromRow) as FinClaim[]
  const releases = ((releaseRows ?? []) as any[]).map(finRetentionReleaseFromRow) as FinRetentionRelease[]

  const contractValueTotal = currentContractValue(contract, amendments)
  const approvedChangesTotal = amendments.reduce((sum, a) => sum + a.amount, 0)
  const paidTotal = certificates.reduce((sum, c) => sum + certificatePaidTotal(c), 0)
  const claimsTotal = claimsExposureTotal(claims)
  const retentionTotal = retentionLiability(certificates, releases)
  const paidPct = contractValueTotal > 0 ? Math.round((paidTotal / contractValueTotal) * 100) : 0

  return {
    currency: contract.currency === 'IRR' ? 'ریال ' : `${contract.currency} `,
    contractValue: Math.round(contractValueTotal / RIAL_TO_DISPLAY_UNIT),
    approvedChanges: Math.round(approvedChangesTotal / RIAL_TO_DISPLAY_UNIT),
    claims: Math.round(claimsTotal / RIAL_TO_DISPLAY_UNIT),
    eotClaimsDays: claims.filter((c) => c.claimType === 'time_extension').length,
    paid: Math.round(paidTotal / RIAL_TO_DISPLAY_UNIT),
    paidPct,
    retention: Math.round(retentionTotal / RIAL_TO_DISPLAY_UNIT),
  }
}

// ---------------------------------------------------------------------------
// Master assembly
// ---------------------------------------------------------------------------

interface CriticalCounts {
  openCriticalRisks: number
  openCriticalIssues: number
}

/** Risk/Issue section: signals, KPI counts, and the "critical & active" counts the Lifecycle
 * readiness engine needs — returned alongside rather than smuggled through the RadarData shape. */
async function applyRiskIssueSection(base: RadarData, masterProjectId: string): Promise<{ data: RadarData; criticalCounts: CriticalCounts }> {
  const noCritical: CriticalCounts = { openCriticalRisks: 0, openCriticalIssues: 0 }
  try {
    const bundle = await fetchProjectIntelligence(masterProjectId)
    const riskMapped = bundle.risk !== null
    const issueMapped = bundle.issues !== null
    if (!riskMapped && !issueMapped) return { data: base, criticalCounts: noCritical }

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
    const criticalCounts: CriticalCounts = {
      openCriticalRisks: riskMapped
        ? risks.filter((r) => ACTIVE_RISK_STATUSES.has(r.status) && riskLevel(currentState(r, assessmentsByRisk.get(r.id) ?? []).score) === 'critical').length
        : 0,
      openCriticalIssues: issueMapped
        ? issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status) && i.priority === 'critical').length
        : 0,
    }

    const data: RadarData = {
      ...base,
      status: escalateStatus(base.status, [...riskSignals, ...issueSignals]),
      kpi: { ...base.kpi, activeRisks, activeRisksHigh, openIssues, openIssuesHigh },
      signals: [...riskSignals, ...issueSignals, ...otherMockSignals],
    }
    return { data, criticalCounts }
  } catch (err) {
    console.warn('[radar] live risk/issue fetch failed, showing mock data instead', err)
    return { data: base, criticalCounts: noCritical }
  }
}

/**
 * Builds the Radar picture for a master project: starts from the deterministic mock (so nothing
 * flashes blank while the live fetches are in flight or a section has no data yet), then replaces
 * each section — Risk/Issue signals & KPIs, Lifecycle/Gate/EPC, Contract summary — with live data
 * wherever the project actually has it. Falls back to the pure mock on any fetch error so a live-
 * data problem never blanks the page.
 */
export async function buildRadarData(masterProjectId: string, projectName: string, projectIdCode: string): Promise<RadarData> {
  const base = buildMockRadarData(masterProjectId, projectName, projectIdCode)
  if (!isSupabaseConfigured) return base

  const { data: afterRiskIssue, criticalCounts } = await applyRiskIssueSection(base, masterProjectId)
  let result = afterRiskIssue

  // --- Lifecycle / Gate / EPC ------------------------------------------------
  try {
    const plcBundle = await fetchLifecycleBundle(masterProjectId)
    if (plcBundle && plcBundle.lifecycle) {
      const analysis = analyseProject(plcBundle, {
        openCriticalRisks: criticalCounts.openCriticalRisks,
        criticalRisksWithoutMitigation: criticalCounts.openCriticalRisks,
        openCriticalIssues: criticalCounts.openCriticalIssues,
      })
      const currentStageKey = plcBundle.lifecycle.currentStageKey
      const lifecycle = buildLifecycleStages(plcBundle)
      const currentStage = plcBundle.stages.find((s) => s.stageKey === currentStageKey)
      const nextGate = buildGate(plcBundle, analysis, currentStageKey)
      const epc = buildEpc(analysis, currentStageKey)

      result = {
        ...result,
        kpi: {
          ...result.kpi,
          health: analysis.overall.score,
          qualityPct: analysis.health.find((h) => h.dimension === 'quality')?.score ?? result.kpi.qualityPct,
          costPerformancePct: analysis.health.find((h) => h.dimension === 'cost')?.score ?? result.kpi.costPerformancePct,
        },
        lifecycle: lifecycle.length > 0 ? lifecycle : result.lifecycle,
        currentStageLabel: currentStage?.nameFa ?? result.currentStageLabel,
        nextGate: nextGate ?? result.nextGate,
        epc: epc !== null ? epc : result.epc,
      }
    }
  } catch (err) {
    console.warn('[radar] live lifecycle fetch failed, showing mock lifecycle/gate/EPC instead', err)
  }

  // --- Contract ---------------------------------------------------------------
  try {
    const contract = await fetchContractSummary(masterProjectId)
    if (contract) result = { ...result, contract }
  } catch (err) {
    console.warn('[radar] live contract fetch failed, showing mock contract instead', err)
  }

  return result
}
