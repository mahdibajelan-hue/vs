/**
 * برج کنترل روی Stage-Gate — builds the control tower's project bundle from the Stage-Gate model (G1…G9), so every
 * engine of this module (readiness, gate status, health, early warning, milestone KPIs) runs on the lifecycle of record:
 *  - stages      ← sg phases + the project's phase rows (dates, manual progress); current phase = after the last passed gate
 *  - gates       ← each phase's gate (name, threshold) + Stage-Gate decisions / gate status
 *  - checklist   ← each phase's objectives (steps), outputs (deliverables) and criteria, with the project's statuses
 *  - activities  ← the Stage-Gate Master Schedule items
 *  - decisions / progress log ← Stage-Gate decisions / progress history
 *  - milestones, health scores, warnings, actions ← keep living on the master project (their stage key is a G code)
 * Pure: no I/O here, the loader passes the rows in.
 */
import { buildPipeline, type SgDecision, type SgItem, type SgPhaseRow } from '../../executive/lib/lifecyclePipeline'
import type { ProjectLifecycleBundle } from '../store/useLifecycleStore'
import type {
  Activity, ChecklistItem, ChecklistStatus, EarlyWarning, GateDecision, GateStatus, HealthScore, LifecycleAction,
  Milestone, MilestoneForecastPoint, ProgressLogEntry, ProjectGate, ProjectLifecycle, ProjectStage, StageStatus,
} from '../types'
import type { GateEngine, GateItemKind, PhaseGroup } from './gateModel'
import { sgProgress } from '../../stagegate/sgProgress'

export interface SgPhaseDef { code: string; sort: number; title: string; gateName: string; threshold: number | null; group: string; engine: string; icon: string; responsible: string; standardDays: number | null }
export interface SgItemDef { id: number; phase: string; kind: GateItemKind; seq: number; title: string; description: string; mandatory: boolean }
export interface SgProjectItem extends SgItem { owner: string | null; dueDate: string | null; completionDate: string | null; evidence: string; evidenceUrl: string; comment: string; submittedBy: string | null; verifiedBy: string | null; verificationDate: string | null }
export interface SgPhaseRowFull extends SgPhaseRow { plannedStart: string | null; plannedFinish: string | null; actualFinish: string | null; manualPct: number | null; weightPct?: number | null }
export interface SgScheduleItem { id: number; phase: string; parentId: number | null; seq: number; title: string; plannedStart: string | null; plannedFinish: string | null; weight: number | null; manualPct: number | null }
export interface SgProgressPoint { id: number; phase: string; newPct: number; comment: string; recordedBy: string | null; recordedAt: string }

export interface SgBundleInput {
  masterProjectId: string
  project: string
  phases: SgPhaseDef[]
  defs: SgItemDef[]
  items: SgProjectItem[]
  decisions: (SgDecision & { reason: string; conditionText: string; conditionDue: string | null })[]
  phaseRows: SgPhaseRowFull[]
  schedule: SgScheduleItem[]
  progress: SgProgressPoint[]
  /** kept on the master project */
  milestones: Milestone[]
  forecastHistory: MilestoneForecastPoint[]
  health: HealthScore[]
  warnings: EarlyWarning[]
  actions: LifecycleAction[]
  /** the latest Stage-Gate client report (feeds the EPC-engine phase) */
  clientReport?: Record<string, unknown> | null
  /** a hand-set overall health verdict, if one exists for the master project */
  healthOverride?: Pick<ProjectLifecycle, 'healthOverride' | 'healthOverrideReason' | 'healthOverrideBy' | 'healthOverrideAt'> | null
}

/** Stage keys of the Stage-Gate model the health engine reads its stage-bound dimensions from. */
export const SG_DIMENSION_STAGES = { engineering: ['G4'], procurement: ['G3', 'G5'], construction: ['G6', 'G7'] }
export const isStageGateKey = (key: string) => /^G\d+$/.test(key)
/** The former module's 11 stage keys → Stage-Gate phases (used once to move milestones over; kept for reading old rows). */
export const PLC_TO_SG: Record<string, string> = { idea: 'G1', pre_project: 'G1', initiation: 'G2', planning: 'G3', engineering: 'G4', procurement: 'G5', execution: 'G6', commissioning: 'G7', handover: 'G8', close_out: 'G9', lessons_learned: 'G9' }

const ITEM_STATUSES = new Set<ChecklistStatus>(['not_started', 'in_progress', 'completed', 'pending', 'submitted', 'verified', 'rejected', 'failed', 'waived'])
const PHASE_GROUPS = new Set<PhaseGroup>(['fel', 'execution', 'commissioning'])
const ENGINES = new Set<GateEngine>(['step', 'basic_design', 'epc'])

export function buildStageGateBundle(input: SgBundleInput, today = new Date()): ProjectLifecycleBundle {
  const pid = input.masterProjectId
  const phases = [...input.phases].sort((a, b) => a.sort - b.sort)
  const [line] = buildPipeline({
    projects: [input.project], phases, titles: new Map(), items: input.items, decisions: input.decisions, phaseRows: input.phaseRows,
    steps: input.defs.filter((d) => d.kind === 'objective').map((d) => ({ id: d.id, phase: d.phase, seq: d.seq, title: d.title })),
  }, today)
  const curIdx = !line || line.phase === 'nodata' ? 0 : line.phase === 'done' ? phases.length : phases.findIndex((p) => p.code === line.phase)
  const currentStageKey = phases[Math.min(curIdx, phases.length - 1)]?.code ?? ''
  const rows = new Map(input.phaseRows.map((r) => [r.phase, r]))
  const decisionsDesc = [...input.decisions].sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))

  const itemOf = (d: SgItemDef) => input.items.find((i) => i.phase === d.phase && i.kind === d.kind && i.itemId === d.id)
  const checklist: ChecklistItem[] = input.defs.map((d) => {
    const it = itemOf(d)
    const status = (it && ITEM_STATUSES.has(it.status as ChecklistStatus) ? it.status : 'not_started') as ChecklistStatus
    return {
      id: `sg-${d.kind}-${d.id}`, projectId: pid, stageKey: d.phase, category: 'general', title: d.title,
      // the gate's deliverables and its mandatory criteria decide readiness; steps are tracked but do not block
      isMandatory: d.kind === 'output' || (d.kind === 'criterion' && d.mandatory),
      requiresDocument: d.kind === 'output', requiresApproval: d.kind === 'criterion',
      responsibleId: null, dueDate: it?.dueDate ?? null, status, completionDate: it?.completionDate ?? null,
      evidenceUrl: it?.evidenceUrl ?? '', evidenceLabel: it?.evidence ?? '', comment: it?.comment ?? '', guidance: d.description,
      sequence: d.seq, kind: d.kind, submittedBy: it?.submittedBy ?? null, verifiedBy: it?.verifiedBy ?? null, verificationDate: it?.verificationDate ?? null,
    }
  })

  // the Stage-Gate module's own progress engine — same numbers as its orbit
  const prog = sgProgress({
    phases: phases.map((p) => ({ code: p.code, engine: p.engine })),
    phaseRows: input.phaseRows.map((r) => ({ phase: r.phase, plannedStart: r.plannedStart, plannedFinish: r.plannedFinish, manualPct: r.manualPct, weightPct: r.weightPct ?? null })),
    schedule: input.schedule.map((x) => ({ id: x.id, phase: x.phase, parentId: x.parentId, weightPct: x.weight, manualPct: x.manualPct })),
    clientReport: input.clientReport ?? null,
  }, today)
  const n = phases.length || 1
  const sgProg: Record<string, { actual: number; planned: number; weight: number }> = {}
  for (const p of phases) {
    const v = prog.phases.get(p.code)!
    const w = rows.get(p.code)?.weightPct
    sgProg[p.code] = { actual: v.actual, planned: v.planned, weight: typeof w === 'number' ? w : 100 / n }
  }
  const stages: ProjectStage[] = phases.map((p, i) => {
    const r = rows.get(p.code)
    const status: StageStatus = i < curIdx ? 'completed' : i === curIdx ? 'in_progress' : 'not_started'
    return {
      id: `sg-stage-${p.code}`, projectId: pid, stageKey: p.code, nameFa: p.title, sequence: i, status, // 0-based like the former stages (the orbit shows sequence + 1)
      plannedStart: r?.plannedStart ?? null, plannedFinish: r?.plannedFinish ?? null, actualStart: r?.actualStart ?? null, actualFinish: r?.actualFinish ?? null,
      forecastFinish: r?.actualFinish ?? r?.plannedFinish ?? null,
      progress: Math.round(sgProg[p.code].actual),
      standardDays: p.standardDays ?? 0,
    }
  })

  const gates: ProjectGate[] = phases.map((p, i) => {
    const latest = decisionsDesc.find((d) => d.phase === p.code)
    const row = rows.get(p.code)
    const status: GateStatus = latest
      ? latest.decision === 'pass' ? 'approved' : latest.decision === 'conditional' ? 'conditional' : i === curIdx ? 'in_progress' : 'not_started'
      : row?.gateStatus === 'passed' ? 'approved' : row?.gateStatus === 'conditional' ? 'conditional' : i === curIdx ? 'in_progress' : i < curIdx ? 'approved' : 'not_started'
    const passing = decisionsDesc.find((d) => d.phase === p.code && (d.decision === 'pass' || d.decision === 'conditional'))
    const cond = latest?.decision === 'conditional' ? latest : null
    return {
      id: `sg-gate-${p.code}`, projectId: pid, stageKey: p.code, name: p.gateName || `گیت ${p.code}`, gateOwnerId: null,
      readinessThreshold: p.threshold ?? 100, status, approvalDate: passing?.decidedAt?.slice(0, 10) ?? null, approvedBy: null,
      comments: latest?.reason ?? '', overrideBy: null, overrideReason: '', overrideAt: null,
      phaseGroup: PHASE_GROUPS.has(p.group as PhaseGroup) ? (p.group as PhaseGroup) : 'fel',
      engine: ENGINES.has(p.engine as GateEngine) ? (p.engine as GateEngine) : 'step',
      icon: p.icon, approvalDoc: '', ownerRole: p.responsible,
      conditionText: cond?.conditionText ?? '', conditionOwnerId: null, conditionDeadline: cond?.conditionDue ?? null,
    }
  })

  const activities: Activity[] = input.schedule.map((s) => {
    const pct = Math.max(0, Math.min(100, s.manualPct ?? 0))
    return {
      id: `sg-act-${s.id}`, projectId: pid, wbsCode: '', name: s.title, stageKey: s.phase,
      baselineStart: s.plannedStart, baselineFinish: s.plannedFinish, forecastStart: s.plannedStart, forecastFinish: s.plannedFinish,
      actualStart: null, actualFinish: null, progress: pct, ownerId: null, isCritical: false, dependsOnId: null,
      status: pct >= 100 ? 'completed' : pct > 0 ? 'in_progress' : 'not_started', sequence: s.seq,
      parentId: s.parentId != null ? `sg-act-${s.parentId}` : null, weight: s.weight ?? 0, manualPct: pct,
    }
  })

  const decisions: GateDecision[] = decisionsDesc.map((d, i) => ({
    id: `sg-dec-${i}`, projectId: pid, gateId: `sg-gate-${d.phase}`,
    decision: d.decision === 'pass' ? 'pass' : d.decision === 'conditional' ? 'conditional' : 'cancel',
    reason: d.reason, conditionText: d.conditionText, conditionOwnerId: null, conditionDeadline: d.conditionDue, decidedBy: null, decidedAt: d.decidedAt,
  }))
  const progressLog: ProgressLogEntry[] = input.progress.map((p) => ({ id: `sg-prog-${p.id}`, projectId: pid, gateId: `sg-gate-${p.phase}`, series: 'overall', pct: p.newPct, note: p.comment, recordedBy: null, recordedAt: p.recordedAt }))

  const lifecycle: ProjectLifecycle | null = !phases.length ? null : {
    projectId: pid, templateId: null, currentStageKey, stageEnteredAt: line?.enteredAt?.slice(0, 10) ?? null,
    healthOverride: input.healthOverride?.healthOverride ?? null, healthOverrideReason: input.healthOverride?.healthOverrideReason ?? '',
    healthOverrideBy: input.healthOverride?.healthOverrideBy ?? null, healthOverrideAt: input.healthOverride?.healthOverrideAt ?? null,
  }

  return {
    lifecycle, stages, gates, checklist, activities, decisions, progressLog,
    milestones: input.milestones.map((m) => (isStageGateKey(m.stageKey) ? m : { ...m, stageKey: PLC_TO_SG[m.stageKey] ?? m.stageKey })),
    forecastHistory: input.forecastHistory, health: input.health, warnings: input.warnings, actions: input.actions,
    sgProgress: sgProg,
  }
}
