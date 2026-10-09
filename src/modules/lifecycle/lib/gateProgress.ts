import type { ChecklistItem, GateStatus, ProjectGate, ProjectStage, ProgressLogEntry } from '../types'
import { GATE_LIFECYCLE_LABEL_FA, gateProgressFromLog, gateReadiness, type GateEngine, type GateLifecycleStatus } from './gateModel'

/** Planned completion-by-today, linearly interpolated between the stage's own planned dates. */
export function plannedPct(stage: { plannedStart: string | null; plannedFinish: string | null; status: string }, today: string): number {
  if (!stage.plannedStart || !stage.plannedFinish) return stage.status === 'completed' ? 100 : 0
  const start = Date.parse(stage.plannedStart), finish = Date.parse(stage.plannedFinish), now = Date.parse(today)
  if (finish <= start) return now >= finish ? 100 : 0
  return Math.max(0, Math.min(100, ((now - start) / (finish - start)) * 100))
}

export interface StageProgressInfo {
  actual: number
  planned: number
  weight: number
  gateId: string | null
  remainingCriteria: number
}

/** Actual progress per stage: the gate engine when the stage has a gate with items/logs, else the stage's own number. */
export function stageProgressMap(
  stages: ProjectStage[], gates: ProjectGate[], checklist: ChecklistItem[], log: ProgressLogEntry[], today: string,
): Map<string, StageProgressInfo> {
  const out = new Map<string, StageProgressInfo>()
  for (const s of stages) {
    const gate = gates.find((g) => g.stageKey === s.stageKey)
    const items = checklist.filter((c) => c.stageKey === s.stageKey)
    let actual = s.progress
    let remaining = 0
    if (gate && (items.length > 0 || log.some((l) => l.gateId === gate.id))) {
      actual = gateProgressFromLog(gate.engine as GateEngine, items, log.filter((l) => l.gateId === gate.id))
      remaining = gateReadiness(items, actual, gate.readinessThreshold).remaining
    }
    out.set(s.stageKey, {
      actual: s.status === 'completed' ? 100 : actual,
      planned: plannedPct(s, today),
      weight: s.standardDays > 0 ? s.standardDays : 1,
      gateId: gate?.id ?? null,
      remainingCriteria: remaining,
    })
  }
  return out
}

export interface ExecutiveSummary {
  actual: number
  planned: number
  deviation: number
  phaseName: string
  gateStatusLabel: string
  remainingCriteria: number
}

export function executiveSummary(
  stages: ProjectStage[], info: Map<string, StageProgressInfo>, gateStatuses: Map<string, GateStatus>, currentStageKey: string,
): ExecutiveSummary {
  const ordered = stages.slice().sort((a, b) => a.sequence - b.sequence)
  const tw = ordered.reduce((s, x) => s + (info.get(x.stageKey)?.weight ?? 1), 0)
  const mean = (f: (i: StageProgressInfo) => number) =>
    tw === 0 ? 0 : Math.round(ordered.reduce((s, x) => { const i = info.get(x.stageKey); return s + (i ? f(i) * i.weight : 0) }, 0) / tw)
  const actual = mean((i) => i.actual), planned = mean((i) => i.planned)
  const cur = ordered.find((s) => s.stageKey === currentStageKey)
  const gs = gateStatuses.get(currentStageKey)
  const life: GateLifecycleStatus = gs === 'approved' ? 'passed' : gs === 'conditional' ? 'conditional' : gs === 'ready' ? 'ready_for_review' : gs === 'blocked' || gs === 'rejected' ? 'blocked' : 'not_ready'
  return {
    actual, planned, deviation: actual - planned, phaseName: cur?.nameFa ?? '—',
    gateStatusLabel: GATE_LIFECYCLE_LABEL_FA[life], remainingCriteria: info.get(currentStageKey)?.remainingCriteria ?? 0,
  }
}
