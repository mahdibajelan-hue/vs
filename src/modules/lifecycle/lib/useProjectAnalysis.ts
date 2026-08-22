import { useMemo } from 'react'
import type { ProjectLifecycleBundle } from '../store/useLifecycleStore'
import { computeStageReadiness, deriveGateStatus, averageReadiness, type StageReadiness } from './readiness'
import { computeHealth, computeOverallHealth, type DerivedHealth, type OverallHealth } from './health'
import { computeMilestoneKpis, computeScheduleVariance, baselineCompletion, forecastCompletion, daysBetween, type MilestoneKpis, type ScheduleVariance } from './milestones'
import { computeWarnings, computeManagementAttention, type AttentionItem, type ComputedWarning } from './earlyWarning'
import { isActionOverdue, type GateStatus } from '../types'

/** One place that runs every engine over a project bundle, so the Control Tower, the dashboards
 * and the reports can never disagree about a project's numbers. */

export interface ProjectAnalysis {
  readiness: StageReadiness[]
  currentReadiness: StageReadiness | null
  averageReadiness: number
  gateStatuses: Map<string, GateStatus>
  blockedGateCount: number
  health: DerivedHealth[]
  overall: OverallHealth
  milestoneKpis: MilestoneKpis
  scheduleVariance: ScheduleVariance
  warnings: ComputedWarning[]
  attention: AttentionItem[]
  baselineFinish: string | null
  forecastFinish: string | null
  forecastVarianceDays: number | null
  openActions: number
  overdueActions: number
  criticalOverdueActions: number
  actionCompletionRate: number
}

export interface ExternalCounts {
  openCriticalRisks?: number
  criticalRisksWithoutMitigation?: number
  openCriticalIssues?: number
}

export function analyseProject(
  bundle: ProjectLifecycleBundle,
  external: ExternalCounts = {},
  today = new Date().toISOString().slice(0, 10),
): ProjectAnalysis {
  const currentStageKey = bundle.lifecycle?.currentStageKey ?? ''
  const openCriticalRisks = external.openCriticalRisks ?? 0
  const openCriticalIssues = external.openCriticalIssues ?? 0

  const stageKeys = [...new Set([...bundle.stages.map((s) => s.stageKey), ...bundle.checklist.map((c) => c.stageKey)])]

  const readiness = stageKeys.map((stageKey) => {
    const gate = bundle.gates.find((g) => g.stageKey === stageKey)
    return computeStageReadiness(stageKey, bundle.checklist, {
      threshold: gate?.readinessThreshold ?? 100,
      // Critical risks/issues only block the stage the project is actually in — an old stage's
      // gate should not re-open because a new risk appeared later.
      openCriticalIssues: stageKey === currentStageKey ? openCriticalIssues : 0,
      openCriticalRisks: stageKey === currentStageKey ? (external.criticalRisksWithoutMitigation ?? 0) : 0,
      stageMilestones: bundle.milestones.filter((m) => m.stageKey === stageKey && m.isCritical),
    }, today)
  })

  const gateStatuses = new Map<string, GateStatus>()
  for (const gate of bundle.gates) {
    const r = readiness.find((x) => x.stageKey === gate.stageKey)
    gateStatuses.set(gate.stageKey, r ? deriveGateStatus(gate, r) : gate.status)
  }
  const blockedGateCount = [...gateStatuses.values()].filter((s) => s === 'blocked').length

  const health = computeHealth({
    activities: bundle.activities,
    milestones: bundle.milestones,
    actions: bundle.actions,
    openCriticalRisks,
    openCriticalIssues,
    blockedGateCount,
    stored: bundle.health,
  })
  const overall = computeOverallHealth(health, bundle.lifecycle, blockedGateCount)

  const warnings = computeWarnings({
    milestones: bundle.milestones,
    forecastHistory: bundle.forecastHistory,
    actions: bundle.actions,
    checklist: bundle.checklist,
    gates: bundle.gates,
    readiness,
    currentStageKey,
    openCriticalRisks,
    criticalRisksWithoutMitigation: external.criticalRisksWithoutMitigation ?? 0,
    openCriticalIssues,
    today,
  })

  const baselineFinish = baselineCompletion(bundle.activities, bundle.milestones)
  const forecastFinish = forecastCompletion(bundle.activities, bundle.milestones)

  const openActions = bundle.actions.filter((a) => a.status === 'not_started' || a.status === 'in_progress')
  const overdue = bundle.actions.filter((a) => isActionOverdue(a, today))
  const closed = bundle.actions.filter((a) => a.status === 'completed')

  return {
    readiness,
    currentReadiness: readiness.find((r) => r.stageKey === currentStageKey) ?? null,
    averageReadiness: averageReadiness(readiness),
    gateStatuses,
    blockedGateCount,
    health,
    overall,
    milestoneKpis: computeMilestoneKpis(bundle.milestones, today),
    scheduleVariance: computeScheduleVariance(bundle.activities),
    warnings,
    attention: computeManagementAttention(warnings),
    baselineFinish,
    forecastFinish,
    forecastVarianceDays: daysBetween(baselineFinish, forecastFinish),
    openActions: openActions.length,
    overdueActions: overdue.length,
    criticalOverdueActions: overdue.filter((a) => a.priority === 'critical').length,
    actionCompletionRate: bundle.actions.length === 0 ? 0 : Math.round((closed.length / bundle.actions.length) * 100),
  }
}

export function useProjectAnalysis(bundle: ProjectLifecycleBundle, external: ExternalCounts = {}): ProjectAnalysis {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => analyseProject(bundle, external), [bundle, external.openCriticalRisks, external.openCriticalIssues, external.criticalRisksWithoutMitigation])
}
