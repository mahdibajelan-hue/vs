import type { ChecklistItem, GateStatus, Milestone, ProjectGate } from '../types'
import { isChecklistOverdue } from '../types'

/** Stage readiness engine.
 *
 * The rule that gives this module its teeth: **a percentage never opens a gate**. A stage sitting
 * at 96% with one unmet mandatory requirement is NOT ready, and the UI must say which requirement
 * — otherwise "readiness" degenerates into the same progress bar the organisation already
 * distrusts. `blockers` therefore carries the actual reasons, and `isReady` is false whenever it
 * is non-empty, independent of `percent`.
 */

export interface ReadinessBlocker {
  kind: 'mandatory_checklist' | 'missing_document' | 'missing_approval' | 'milestone_not_achieved' | 'critical_issue' | 'critical_risk' | 'overdue_item'
  label: string
  detail: string
}

export interface StageReadiness {
  stageKey: string
  /** Weighted completion across the stage's checklist — informational only. */
  percent: number
  mandatoryTotal: number
  mandatoryDone: number
  optionalTotal: number
  optionalDone: number
  overdueCount: number
  blockers: ReadinessBlocker[]
  /** True only when every blocker is cleared AND percent >= the gate's threshold. */
  isReady: boolean
}

export interface ReadinessContext {
  /** Milestones the stage must have achieved before its gate can open. */
  stageMilestones?: Milestone[]
  openCriticalIssues?: number
  openCriticalRisks?: number
  /** Gate threshold; defaults to 100 so an unconfigured gate is strict rather than permissive. */
  threshold?: number
}

const DONE_STATUSES = new Set(['completed', 'waived'])

export function computeStageReadiness(
  stageKey: string,
  items: ChecklistItem[],
  ctx: ReadinessContext = {},
  today = new Date().toISOString().slice(0, 10),
): StageReadiness {
  const stageItems = items.filter((i) => i.stageKey === stageKey)
  const mandatory = stageItems.filter((i) => i.isMandatory)
  const optional = stageItems.filter((i) => !i.isMandatory)

  const mandatoryDone = mandatory.filter((i) => DONE_STATUSES.has(i.status)).length
  const optionalDone = optional.filter((i) => DONE_STATUSES.has(i.status)).length

  // Mandatory items carry double weight: an organisation that finishes every optional item and
  // half the mandatory ones is not 75% ready, it is blocked.
  const weighted = mandatory.length * 2 + optional.length
  const weightedDone = mandatoryDone * 2 + optionalDone
  const percent = weighted === 0 ? 0 : Math.round((weightedDone / weighted) * 100)

  const blockers: ReadinessBlocker[] = []

  for (const item of mandatory) {
    if (!DONE_STATUSES.has(item.status)) {
      blockers.push({
        kind: 'mandatory_checklist',
        label: item.title,
        detail: 'بند الزامی تکمیل نشده است',
      })
      continue
    }
    // A completed item that still owes its evidence or approval is not really complete.
    if (item.status === 'completed' && item.requiresDocument && !item.evidenceUrl) {
      blockers.push({ kind: 'missing_document', label: item.title, detail: 'مدرک/مستند پیوست نشده است' })
    }
    if (item.status === 'completed' && item.requiresApproval && !item.completionDate) {
      blockers.push({ kind: 'missing_approval', label: item.title, detail: 'تأیید ثبت نشده است' })
    }
  }

  const overdue = stageItems.filter((i) => isChecklistOverdue(i, today))
  for (const item of overdue) {
    if (item.isMandatory) {
      blockers.push({ kind: 'overdue_item', label: item.title, detail: `سررسید گذشته (${item.dueDate})` })
    }
  }

  for (const ms of ctx.stageMilestones ?? []) {
    if (ms.status !== 'achieved') {
      blockers.push({
        kind: 'milestone_not_achieved',
        label: ms.name,
        detail: 'Milestone الزامی این مرحله هنوز محقق نشده است',
      })
    }
  }

  if ((ctx.openCriticalIssues ?? 0) > 0) {
    blockers.push({
      kind: 'critical_issue',
      label: `${ctx.openCriticalIssues} مسئله بحرانی باز`,
      detail: 'مسائل بحرانی باز باید پیش از عبور از گیت تعیین تکلیف شوند',
    })
  }
  if ((ctx.openCriticalRisks ?? 0) > 0) {
    blockers.push({
      kind: 'critical_risk',
      label: `${ctx.openCriticalRisks} ریسک بحرانی بدون کاهش`,
      detail: 'ریسک بحرانی بدون برنامه کاهش، مانع اعلام آمادگی است',
    })
  }

  const threshold = ctx.threshold ?? 100
  return {
    stageKey,
    percent,
    mandatoryTotal: mandatory.length,
    mandatoryDone,
    optionalTotal: optional.length,
    optionalDone,
    overdueCount: overdue.length,
    blockers,
    isReady: blockers.length === 0 && percent >= threshold,
  }
}

/**
 * Derives what a gate's status *should* be from readiness. Deliberately never overwrites a
 * decision a human already made: once a gate is approved or rejected, that verdict stands until
 * a person changes it — a recalculation must not silently un-approve a gate someone signed.
 */
export function deriveGateStatus(gate: ProjectGate, readiness: StageReadiness): GateStatus {
  if (gate.status === 'approved' || gate.status === 'rejected') return gate.status
  if (gate.overrideBy) return 'approved'
  if (readiness.blockers.some((b) => b.kind === 'critical_issue' || b.kind === 'milestone_not_achieved')) return 'blocked'
  if (readiness.isReady) return 'ready'
  if (readiness.percent > 0) return 'in_progress'
  return 'not_started'
}

/** Average readiness across the stages a project has actually started — the number the Portfolio
 * dashboard's "Average Project Readiness" KPI reports. */
export function averageReadiness(list: StageReadiness[]): number {
  const started = list.filter((r) => r.mandatoryTotal + r.optionalTotal > 0)
  if (started.length === 0) return 0
  return Math.round(started.reduce((s, r) => s + r.percent, 0) / started.length)
}
