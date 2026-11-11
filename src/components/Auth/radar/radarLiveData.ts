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
import { formatJalali, formatJalaliFa } from '../../../lib/jalali'
import { fetchProjectIntelligence } from '../../../modules/reporting/lib/dataAdapter'
import { currentState, riskLevel } from '../../../modules/risk/lib/riskScore'
import type { RmRisk, RmRiskAssessment } from '../../../modules/risk/types'
import type { ImIssue } from '../../../modules/issues/types'
import { loadScheduleSummary } from '../../../modules/scheduling/lib/summaryLoader'
import { loadStageGateRadar } from './stageGateRadar'
import { loadEpcProgress } from '../../../modules/epc/epcProgressLoader'
import { spRadarOf } from '../../../modules/stationpiping/spEpc'
import { DISC_FA } from '../../../modules/stationpiping/lib/spCore'
import { todayTehran } from '../../../lib/today'
import { loadPssrSummary } from '../../../modules/pssr/lib/pssrSummary'
import { loadProjectMetrics, type ProjectHealth } from '../../../modules/projectMetrics/projectMetricsLoader'
import { fetchCenterHealth } from '../../../modules/projectMetrics/centerHealth'
import { statusFromScore, type DerivedHealth } from '../../../modules/lifecycle/lib/health'
import type { EpcProgress } from '../../../modules/epc/epcProgress'
import { loadStageGateBundle } from '../../../modules/lifecycle/lib/stageGateBundleLoader'
import type { ScheduleSummary } from '../../../modules/scheduling/lib/summary'

import {
  actionFromRow, activityFromRow, gateFromRow, healthFromRow, lifecycleFromRow, milestoneFromRow,
  stageFromRow,
  type PlcActivityRow, type PlcGateRow, type PlcHealthRow, type PlcLifecycleRow, type PlcMilestoneRow,
  type PlcStageRow, type RastaActionRow,
} from '../../../modules/lifecycle/lib/lifecycleData'
import { analyseProject, type ProjectAnalysis } from '../../../modules/lifecycle/lib/useProjectAnalysis'
import type { ProjectLifecycleBundle } from '../../../modules/lifecycle/store/useLifecycleStore'
import { STAGE_LABEL_EN, type StageKey, type HealthStatus, type HealthDimension } from '../../../modules/lifecycle/types'

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
    title: issue.title, subject: issue.deadlineDate ? `مهلت ${formatJalaliFa(issue.deadlineDate)}` : '', detail: issue.status,
    impact: issue.description || '—', rootCause: '—', recommendedAction: '—',
    titleEn: issue.title, subjectEn: issue.deadlineDate, detailEn: issue.status,
    impactEn: issue.description || '—', rootCauseEn: '—', recommendedActionEn: '—',
    angle: Math.round((index / Math.max(1, total)) * 360) + 15,
    radius: spreadRadius(rMin, rMax, index),
    due: issue.deadlineDate || null,
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
    decisions: [],
    progressLog: [],
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

/** The radar's EPC bars: each discipline's actual progress from its own module (never a health score). */
function epcDimensions(e: EpcProgress): EpcDimension[] | null {
  const rows = ([['engineering', 'مهندسی', 'Engineering', e.eng], ['procurement', 'تدارکات', 'Procurement', e.proc], ['construction', 'ساخت', 'Construction', e.cons]] as const)
    .filter(([, , , d]) => d)
  if (!rows.length) return null
  return rows.map(([key, label, labelEn, d]) => ({ key, label, labelEn, pct: Math.round(d!.actual), plannedPct: d!.planned == null ? null : Math.round(d!.planned) }))
}

const faPct = (v: number) => `${String(Math.round(v)).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])}٪`

const STATUS_OF_HEALTH: Record<'green' | 'yellow' | 'red' | 'black', ProjectRadarStatus> = { green: 'nominal', yellow: 'attention', red: 'at_risk', black: 'critical' }

// One health number everywhere: the Health Centre's stored snapshot (see projectMetrics/centerHealth.ts).

/** A project with no Stage-Gate link has no gate to show. */
const NO_GATE: RadarGate = { name: 'بدون گیت ثبت‌شده', nameEn: 'NO GATE RECORDED', prerequisites: 0, passed: 0, pending: 0, failed: 0, readinessPct: 0 }

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
  const approvedChangesTotal = amendments.filter((a) => !a.voidedAt).reduce((sum, a) => sum + a.amount, 0)
  const paidTotal = certificates.reduce((sum, c) => sum + certificatePaidTotal(c), 0)
  const claimsTotal = claimsExposureTotal(claims)
  const retentionTotal = retentionLiability(certificates, releases)
  const paidPct = contractValueTotal > 0 ? Math.round((paidTotal / contractValueTotal) * 100) : 0

  return {
    title: contract.title, number: contract.contractNumber,
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
      : []
    const issueSignals = issueMapped
      ? issues.map((iss, i) => issueToSignal(iss, i, issues.length))
      : []
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

/** Replaces the mock «delay» signals with the real schedule picture: slip against the baseline and the contract, overdue critical work, lost delay notices, liquidated damages. */
function applyScheduleSection(base: RadarData, s: ScheduleSummary): RadarData {
  const fmt = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n))
  type Draft = { severity: SignalSeverity; title: string; titleEn: string; subject: string; detail: string; impact: string; rootCause: string; action: string }
  const drafts: Draft[] = []
  if (s.contractorDelay != null && s.contractorDelay > 0) drafts.push({ severity: s.contractorDelay > 30 ? 'critical' : 'high', title: 'پایان پیش‌بینی بعد از تاریخ قرارداد', titleEn: 'Forecast finish past contract date', subject: `${fmt(s.contractorDelay)} روز پس از تاریخ اصلاح‌شده`, detail: `+${fmt(s.contractorDelay)} روز`, impact: s.ldAmount > 0 ? `جریمهٔ تأخیر برآوردی ${fmt(s.ldAmount)} ریال` : 'احتمال جریمهٔ تأخیر قراردادی', rootCause: 'پیشرفت کمتر از برنامه و یا تأخیر غیرقابل‌تمدید', action: 'بازنگری برنامهٔ بازیابی و بررسی ادعاهای تمدید در «برنامه‌ریزی ← تحلیل تاخیرات»' })
  else if (s.baselineSlip != null && s.baselineSlip > 7) drafts.push({ severity: s.baselineSlip > 45 ? 'high' : 'medium', title: 'انحراف پایان از خط مبنا', titleEn: 'Finish slipped vs baseline', subject: `${fmt(s.baselineSlip)} روز تقویمی`, detail: `+${fmt(s.baselineSlip)} روز`, impact: 'تمدیدهای مصوب این انحراف را پوشش می‌دهد یا باید تعیین تکلیف شود', rootCause: 'مقایسهٔ پیش‌بینی با خط مبنای تأییدشده', action: 'بررسی مسیر بحرانی و فعالیت‌های عقب‌افتاده' })
  if (s.criticalOverdue > 0) drafts.push({ severity: s.criticalOverdue > 5 ? 'critical' : 'high', title: 'فعالیت بحرانی عقب‌افتاده', titleEn: 'Critical activities overdue', subject: `${fmt(s.criticalOverdue)} فعالیت بحرانی`, detail: `${fmt(s.criticalOverdue)} مورد`, impact: 'هر روز تأخیر روی مسیر بحرانی مستقیم به پایان پروژه منتقل می‌شود', rootCause: 'فعالیت‌هایی که طبق برنامه باید تمام می‌شدند', action: 'اولویت منابع و رفع موانع این فعالیت‌ها' })
  if (s.noticesLost > 0) drafts.push({ severity: 'high', title: 'مهلت اخطار تأخیر از دست رفته', titleEn: 'Delay-notice deadline missed', subject: `${fmt(s.noticesLost)} رویداد`, detail: `${fmt(s.noticesLost)} رویداد`, impact: 'حق ادعای تمدید زمان یا هزینه در خطر است', rootCause: 'اخطار کتبی در مهلت قراردادی ارسال نشده', action: 'ثبت اخطار یا ارزیابی اثر حقوقی در ماژول اجرا و برنامه‌ریزی' })
  if (s.pendingEvents > 0) drafts.push({ severity: 'low', title: 'رویدادهای تأخیر ارزیابی‌نشده', titleEn: 'Delay events not yet assessed', subject: `${fmt(s.pendingEvents)} رویداد`, detail: `${fmt(s.pendingEvents)} مورد`, impact: 'اثر زمانی هنوز اندازه‌گیری نشده است', rootCause: 'رویدادها بدون فعالیت متأثر ثبت شده‌اند', action: 'انتخاب فعالیت‌های متأثر و اندازه‌گیری اثر' })
  const others = base.signals.filter((x) => x.category !== 'delay')
  if (!drafts.length) return { ...base, signals: others }
  const bands: Record<SignalSeverity, [number, number]> = SEVERITY_RADIUS_RANGE
  const signals: RadarSignal[] = drafts.map((d, i) => ({
    id: `sch-${i}`, category: 'delay', severity: d.severity, title: d.title, subject: d.subject, detail: d.detail, impact: d.impact, rootCause: d.rootCause, recommendedAction: d.action,
    titleEn: d.titleEn, subjectEn: d.subject, detailEn: d.detail, impactEn: d.impact, rootCauseEn: d.rootCause, recommendedActionEn: d.action,
    angle: Math.round((i / drafts.length) * 360) + 40, radius: bands[d.severity][0] + (bands[d.severity][1] - bands[d.severity][0]) * ((i * 0.618) % 1),
  }))
  return { ...base, status: escalateStatus(base.status, signals), signals: [...others, ...signals] }
}

/**
 * Builds the Radar picture for a master project: starts from the deterministic mock (so nothing
 * flashes blank while the live fetches are in flight or a section has no data yet), then replaces
 * each section — Risk/Issue signals & KPIs, Lifecycle/Gate/EPC, Contract summary — with live data
 * wherever the project actually has it. Falls back to the pure mock on any fetch error so a live-
 * data problem never blanks the page.
 */
/** the radar with nothing in it yet: what is shown while the modules are read, and the start of the live picture */
export function blankRadarData(from: RadarData): RadarData {
  return {
    ...from, live: false, status: 'nominal', signals: [], lifecycle: [], lifecycleOverallPct: 0, currentStageLabel: '—', nextGate: NO_GATE, epc: null, contract: null, schedule: null, healthDetail: null,
    kpi: { health: 0, progressPlanned: 0, progressActual: 0, cpi: 0, spi: 0, qualityPct: 0, costPerformancePct: 0, costVariancePct: 0, activeRisks: 0, activeRisksHigh: 0, openIssues: 0, openIssuesHigh: 0, delayedActivities: 0, pendingChanges: 0, upcomingMilestones: 0 },
  }
}

export async function buildRadarData(masterProjectId: string, projectName: string, projectIdCode: string): Promise<RadarData> {
  const mock = buildMockRadarData(masterProjectId, projectName, projectIdCode)
  if (!isSupabaseConfigured) return { ...mock, live: true }
  // every figure below comes from a module; anything a module does not report stays empty / zero, never the mock's
  const base: RadarData = blankRadarData(mock)
  // the report is as of now (when the live data is read), not the mock's fixed date
  const now = new Date()
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const stamp = `${formatJalali(iso)} - ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  base.reportDateEn = stamp
  base.reportDateFa = stamp.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
  // the status starts neutral (never the mock's random one); live health / signals set it below
  base.status = 'nominal'

  // every module is read at once; the sections below then fold the answers in, in order
  type Settled<T> = { ok: true; v: T } | { ok: false; e: unknown }
  const settle = <T,>(p: Promise<T>): Promise<Settled<T>> => p.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }))
  const val = async <T,>(p: Promise<Settled<T>>): Promise<T> => { const r = await p; if (!r.ok) throw r.e; return r.v }
  const pPlc = settle((async () => (await loadStageGateBundle(masterProjectId)) ?? (await fetchLifecycleBundle(masterProjectId)))())
  const pSg = settle(loadStageGateRadar(masterProjectId))
  const pEpc = settle(loadEpcProgress(masterProjectId))
  const pSnap = settle(loadProjectMetrics(masterProjectId))
  const pHc = settle(fetchCenterHealth(masterProjectId))
  const pPssr = settle(loadPssrSummary(masterProjectId))
  const pContract = settle(fetchContractSummary(masterProjectId))
  const pSched = settle(loadScheduleSummary(masterProjectId))
  const pSp = settle(spRadarOf(masterProjectId, todayTehran()))
  const pCr = settle(Promise.resolve(supabase.from('chg_change_requests').select('id, cr_number, title, status, priority, proposed_schedule_impact_days, proposed_change_amount').eq('master_project_id', masterProjectId).in('status', ['submitted', 'evaluating', 'awaiting_approval', 'returned'])))

  const { data: afterRiskIssue, criticalCounts } = await applyRiskIssueSection(base, masterProjectId)
  let result = afterRiskIssue

  // --- Lifecycle / Gate / EPC ------------------------------------------------
  let plcLive = false
  try {
    // the control tower's engines run on Stage-Gate (G1…G9) for linked projects; the former lifecycle rows only otherwise
    const plcBundle = await val(pPlc)
    if (plcBundle && plcBundle.lifecycle) {
      plcLive = true
      const analysis = analyseProject(plcBundle, {
        openCriticalRisks: criticalCounts.openCriticalRisks,
        criticalRisksWithoutMitigation: criticalCounts.openCriticalRisks,
        openCriticalIssues: criticalCounts.openCriticalIssues,
      })
      const currentStageKey = plcBundle.lifecycle.currentStageKey
      const lifecycle = buildLifecycleStages(plcBundle)
      const currentStage = plcBundle.stages.find((s) => s.stageKey === currentStageKey)
      const nextGate = buildGate(plcBundle, analysis, currentStageKey)

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
      }
    }
  } catch (err) {
    console.warn('[radar] live lifecycle fetch failed, showing mock lifecycle/gate/EPC instead', err)
  }

  // --- Lifecycle / next gate of record: Stage-Gate (G1…G9) -----------------------
  // Health comes from the control tower engines above; the lifecycle strip and the next gate from Stage-Gate's own
  // readiness; its EPC phase from the engineering / material / execution modules (the same figures they show).
  let epc: EpcProgress | null = null
  let lifecycleLive = false
  try {
    const sg = await val(pSg)
    if (sg) {
      epc = sg.epc
      lifecycleLive = true
      result = { ...result, lifecycle: sg.lifecycle, lifecycleOverallPct: sg.overallPct, currentStageLabel: sg.currentStageLabel, nextGate: sg.nextGate ?? result.nextGate }
      // time performance = the lifecycle's actual vs planned progress
      if (sg.overallPct != null && sg.overallPlannedPct != null) result = { ...result, kpi: { ...result.kpi, progressActual: sg.overallPct, progressPlanned: sg.overallPlannedPct } }
    }
  } catch (err) {
    console.warn('[radar] Stage-Gate fetch failed, keeping the previous lifecycle picture', err)
  }

  // --- EPC (engineering / procurement / construction modules) -------------------
  try {
    epc ??= await val(pEpc)
    const dims = epcDimensions(epc)
    if (dims) result = { ...result, epc: dims }
    // a project outside Stage-Gate: its lifecycle picture is the EPC modules' own progress, never the mock
    if (!lifecycleLive && epc.overall) {
      const o = epc.overall
      result = {
        ...result,
        lifecycle: (dims ?? []).map((d) => ({
          key: d.key, label: d.label, labelEn: d.labelEn, state: d.pct >= 100 ? 'done' as const : 'current' as const,
          dateFa: `واقعی ${faPct(d.pct)} · برنامه ${d.plannedPct == null ? '—' : faPct(d.plannedPct)}`, progressPct: d.pct,
        })),
        lifecycleOverallPct: Math.round(o.actual),
        currentStageLabel: 'EPC',
        nextGate: NO_GATE,
        kpi: { ...result.kpi, progressActual: Math.round(o.actual), progressPlanned: Math.round(o.planned ?? o.actual) },
      }
      lifecycleLive = true
    }
  } catch (err) {
    console.warn('[radar] EPC modules fetch failed', err)
  }
  // nothing recorded for this project anywhere: show empty, not the mock picture
  if (!lifecycleLive && !plcLive) {
    result = { ...result, lifecycle: [], lifecycleOverallPct: 0, currentStageLabel: '—', nextGate: NO_GATE, epc: null, kpi: { ...result.kpi, progressActual: 0, progressPlanned: 0 } }
  }

  // --- One snapshot: health, lifecycle progress, EPC — exactly what the project dashboard shows -------------
  try {
    const snap = await val(pSnap)
    if (snap) {
      // cost variance = the EPC contract's CPI − 1 (0 when nothing has been certified yet), never the mock figure
      result = { ...result, kpi: { ...result.kpi, progressActual: Math.round(snap.lifecycle.actual), progressPlanned: Math.round(snap.lifecycle.planned), cpi: snap.evm.cpi ?? 0, spi: snap.evm.spi ?? 0, costVariancePct: snap.evm.cpi == null ? 0 : Math.round((snap.evm.cpi - 1) * 100) } }
      const dims = epcDimensions(snap.epc)
      if (dims) result = { ...result, epc: dims }
      if (snap.health) {
        result = {
          ...result, healthDetail: snap.health,
          // the verdict, not the averaged score, sets the status (see HealthGuide)
          status: STATUS_OF_HEALTH[snap.health.status],
          kpi: {
            ...result.kpi, health: snap.health.score,
            qualityPct: snap.health.dims.find((d) => d.dimension === 'quality')?.score ?? result.kpi.qualityPct,
            costPerformancePct: snap.health.dims.find((d) => d.dimension === 'cost')?.score ?? result.kpi.costPerformancePct,
          },
        }
      }
    }
  } catch (err) {
    console.warn('[radar] project snapshot failed', err)
  }

  // The Health Centre is the single source of truth for the headline health number — override the
  // dashboard health with its index/verdict when a snapshot exists (so radar and مرکز سلامت agree).
  try {
    const hc = await val(pHc)
    if (hc) result = { ...result, healthDetail: hc, status: STATUS_OF_HEALTH[hc.status], kpi: { ...result.kpi, health: hc.score } }
  } catch (err) {
    console.warn('[radar] health-centre snapshot failed', err)
  }

  // --- PSSR: every open category-A punch blocks a system's start-up — a critical gate signal --------------
  try {
    const ps = await val(pPssr)
    if (ps && ps.openA.length) {
      const [rMin, rMax] = SEVERITY_RADIUS_RANGE.critical
      const pssrSignals: RadarSignal[] = ps.openA.slice(0, 12).map((p, i, arr) => ({
        id: `pssr-${i}`, category: 'gate', severity: 'critical',
        title: `پانچ A باز PSSR — ${p.system}`, subject: p.system, detail: p.title,
        impact: 'تا بسته و تأیید نشود گواهی RFSU و تزریق گاز این سیستم ممکن نیست', rootCause: '—', recommendedAction: 'بستن و تأیید پانچ در ماژول آمادگی راه‌اندازی (PSSR)',
        titleEn: `Open PSSR punch A — ${p.system}`, subjectEn: p.system, detailEn: p.title, impactEn: 'Blocks RFSU / gas-in', rootCauseEn: '—', recommendedActionEn: 'Close and verify in PSSR',
        angle: Math.round(200 + (i / Math.max(1, arr.length)) * 60), radius: spreadRadius(rMin, rMax, i),
      }))
      result = { ...result, signals: [...result.signals.filter((x) => !x.id.startsWith('pssr-')), ...pssrSignals] }
    }
  } catch (err) {
    console.warn('[radar] PSSR summary failed', err)
  }

  // --- Contract ---------------------------------------------------------------
  try {
    const contract = await val(pContract)
    if (contract) result = { ...result, contract }
  } catch (err) {
    console.warn('[radar] live contract fetch failed, showing mock contract instead', err)
  }

  // --- Schedule (time control) -----------------------------------------------
  try {
    const sum = await val(pSched)
    if (sum) {
      result = applyScheduleSection(result, sum)
      const [rMin, rMax] = SEVERITY_RADIUS_RANGE.low
      const ms: RadarSignal[] = sum.milestones.slice(0, 8).map((m, i, arr) => ({
        id: `ms-${i}`, category: 'milestone', severity: m.critical ? 'medium' : 'low', title: m.name, subject: `سررسید ${formatJalaliFa(m.date)}`, detail: m.code,
        impact: m.critical ? 'روی مسیر بحرانی است؛ تأخیر آن پایان پروژه را جابه‌جا می‌کند' : 'نقطهٔ عطف برنامهٔ زمان‌بندی', rootCause: '—', recommendedAction: 'پیگیری پیش‌نیازها در «برنامه‌ریزی و کنترل زمان»',
        titleEn: m.name, subjectEn: m.date, detailEn: m.code, impactEn: '', rootCauseEn: '—', recommendedActionEn: '',
        angle: Math.round(300 + (i / Math.max(1, arr.length)) * 50), radius: spreadRadius(rMin, rMax, i), due: m.date,
      }))
      result = { ...result, schedule: sum, signals: [...result.signals.filter((x) => x.category !== 'milestone'), ...ms], kpi: { ...result.kpi, delayedActivities: sum.overdue, upcomingMilestones: sum.milestones.length } }
    }
  } catch (err) {
    console.warn('[radar] live schedule fetch failed', err)
  }

  // --- Change requests awaiting a decision (the change-management module) ------------------------------
  try {
    const { data: crs } = await val(pCr)
    const open = (crs ?? []) as { id: string; cr_number: string; title: string | null; status: string; priority: string | null; proposed_schedule_impact_days: number | null }[]
    const sevOf = (p: string | null): SignalSeverity => (p === 'critical' ? 'critical' : p === 'high' ? 'high' : p === 'low' ? 'low' : 'medium')
    const STATUS: Record<string, string> = { submitted: 'ثبت‌شده', evaluating: 'در ارزیابی', awaiting_approval: 'در انتظار تصویب', returned: 'برگشت‌خورده' }
    const sig: RadarSignal[] = open.slice(0, 12).map((c, i, arr) => {
      const sev = sevOf(c.priority), [rMin, rMax] = SEVERITY_RADIUS_RANGE[sev]
      return {
        id: `cr-${c.id}`, category: 'change', severity: sev, title: c.title || c.cr_number, subject: `${c.cr_number} · ${STATUS[c.status] ?? c.status}`,
        detail: c.proposed_schedule_impact_days ? `اثر زمانی پیشنهادی ${new Intl.NumberFormat('fa-IR').format(c.proposed_schedule_impact_days)} روز` : 'اثر زمانی ثبت نشده',
        impact: 'تا تصمیم‌گیری، دامنه، هزینه یا زمان مربوط باز می‌ماند', rootCause: '—', recommendedAction: 'تصمیم‌گیری در «مدیریت تغییرات»',
        titleEn: c.cr_number, subjectEn: c.status, detailEn: '', impactEn: '', rootCauseEn: '—', recommendedActionEn: '',
        angle: Math.round(120 + (i / Math.max(1, arr.length)) * 60), radius: spreadRadius(rMin, rMax, i),
      }
    })
    result = { ...result, signals: [...result.signals.filter((x) => x.category !== 'change'), ...sig], kpi: { ...result.kpi, pendingChanges: open.length } }
  } catch (err) {
    console.warn('[radar] change requests failed', err)
  }

  // --- Stations (piping & welding module): stations behind their plan, the weld repair rate --------------------------
  try {
    const sp = await val(pSp)
    if (sp) {
      const nf = (v: number, d = 0) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d }).format(v)
      const late = sp.stations.filter((p) => p.planned != null && (p.planned as number) - p.actual >= 10).sort((a, b) => ((b.planned as number) - b.actual) - ((a.planned as number) - a.actual))
      const sig: RadarSignal[] = late.slice(0, 6).map((p, i, arr) => {
        const gap = (p.planned as number) - p.actual
        const sev: SignalSeverity = gap >= 25 ? 'high' : 'medium', [rMin, rMax] = SEVERITY_RADIUS_RANGE[sev]
        const worst = [...p.disciplines].filter((x) => x.hasScope && x.planned != null).sort((a, b) => ((b.planned as number) - b.actual) - ((a.planned as number) - a.actual))[0]
        return {
          id: `sp-late-${p.station.id}`, category: 'delay', severity: sev, title: `عقب‌ماندگی ایستگاه ${p.station.code}`, subject: `واقعی ${nf(p.actual, 1)}٪ در برابر برنامه ${nf(p.planned as number, 1)}٪`,
          detail: worst ? `بیشترین فاصله در ${DISC_FA[worst.discipline]}: ${nf(worst.actual, 0)}٪ در برابر ${nf(worst.planned as number, 0)}٪` : '', impact: 'تأخیر در آماده‌سازی ایستگاه برای تست و راه‌اندازی',
          rootCause: '—', recommendedAction: 'بررسی کارکرد روزانه در «ایستگاه‌ها (پایپینگ و جوشکاری)»',
          titleEn: `Station ${p.station.code} behind plan`, subjectEn: '', detailEn: '', impactEn: '', rootCauseEn: '—', recommendedActionEn: '',
          angle: Math.round(200 + (i / Math.max(1, arr.length)) * 50), radius: spreadRadius(rMin, rMax, i),
        }
      })
      const rr = sp.welds.repairRate
      if (rr != null && sp.welds.tested >= 10 && rr > 0.05) {
        const sev: SignalSeverity = rr > 0.1 ? 'high' : 'medium', [rMin, rMax] = SEVERITY_RADIUS_RANGE[sev]
        sig.push({
          id: 'sp-repair', category: 'issue', severity: sev, title: 'نرخ تعمیر جوش ایستگاه‌ها', subject: `${nf(rr * 100, 1)}٪ از ${nf(sp.welds.tested)} جوش آزمایش‌شده`,
          detail: 'بالاتر از حد معمول ۵٪', impact: 'دوباره‌کاری، مصرف بیشتر فیلم و تأخیر در تکمیل پایپینگ', rootCause: '—', recommendedAction: 'بررسی جوشکاران در تب «جوشکاران و NDT»',
          titleEn: 'Station weld repair rate', subjectEn: '', detailEn: '', impactEn: '', rootCauseEn: '—', recommendedActionEn: '', angle: 250, radius: (rMin + rMax) / 2,
        })
      }
      if (sig.length) result = { ...result, status: escalateStatus(result.status, sig), signals: [...result.signals.filter((x) => !x.id.startsWith('sp-')), ...sig] }
    }
  } catch (err) {
    console.warn('[radar] stations failed', err)
  }

  // --- Contract claims open in the finance module --------------------------------------------------------
  if (result.contract && result.contract.claims > 0) {
    const [rMin, rMax] = SEVERITY_RADIUS_RANGE.medium
    result = { ...result, signals: [...result.signals.filter((x) => x.category !== 'contract'), {
      id: 'contract-claims', category: 'contract', severity: 'medium', title: 'ادعاهای باز قراردادی', subject: `${new Intl.NumberFormat('fa-IR').format(result.contract.claims)} میلیون ریال`,
      detail: result.contract.eotClaimsDays ? `${new Intl.NumberFormat('fa-IR').format(result.contract.eotClaimsDays)} ادعای تمدید زمان` : '', impact: 'ریسک افزایش هزینه یا زمان قرارداد', rootCause: '—', recommendedAction: 'بررسی و تعیین تکلیف در «قراردادها و مالی»',
      titleEn: 'Open claims', subjectEn: '', detailEn: '', impactEn: '', rootCauseEn: '—', recommendedActionEn: '', angle: 160, radius: (rMin + rMax) / 2,
    }] }
  }

  // the status follows the health verdict when known, otherwise the signals
  result = { ...result, live: true, status: result.healthDetail ? result.status : escalateStatus('nominal', result.signals) }
  return result
}
