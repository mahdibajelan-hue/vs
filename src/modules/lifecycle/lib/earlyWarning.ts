import type {
  ChecklistItem, LifecycleAction, Milestone, MilestoneForecastPoint, ProjectGate, WarningSeverity,
} from '../types'
import { isActionOverdue, isChecklistOverdue, WARNING_SEVERITY_RANK } from '../types'
import { analyseDrift, daysUntilDue, deriveMilestoneStatus, milestoneVariance } from './milestones'
import type { StageReadiness } from './readiness'

/** Early-warning + management-attention engine.
 *
 * This is the part that makes the module a decision system rather than a dashboard. A dashboard
 * reports that progress is 63%; this engine answers *what is behind, what will probably be behind
 * next, who owns it, and what should be done* — the
 * PLAN → ACTUAL → VARIANCE → RISK → ISSUE → ACTION → OWNER → ESCALATION chain from the spec.
 *
 * Warnings are computed, not stored: recomputing on every load means a warning disappears the
 * moment its cause is fixed, and can never linger as stale noise. (plc_early_warnings exists for
 * warnings a human has explicitly acknowledged or annotated — those carry state worth keeping.)
 */

/** Slip beyond this, on a milestone whose forecast keeps moving, is a warning rather than noise. */
const DRIFT_WARNING_DAYS = 10
/** Gate readiness under this, once the stage is active, is a warning. */
const GATE_READINESS_THRESHOLD = 70

export interface ComputedWarning {
  triggerKey: string
  severity: WarningSeverity
  title: string
  detail: string
  /** What should happen — never just "investigate". */
  requiredAction: string
  ownerId: string | null
  relatedMilestoneId?: string
  relatedStageKey?: string
}

export interface WarningInput {
  milestones: Milestone[]
  forecastHistory: MilestoneForecastPoint[]
  actions: LifecycleAction[]
  checklist: ChecklistItem[]
  gates: ProjectGate[]
  readiness: StageReadiness[]
  currentStageKey: string
  openCriticalRisks: number
  criticalRisksWithoutMitigation: number
  openCriticalIssues: number
  today?: string
}

export function computeWarnings(input: WarningInput): ComputedWarning[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const out: ComputedWarning[] = []

  /* 1 — a milestone whose forecast keeps slipping. The drift, not the variance, is the signal. */
  for (const ms of input.milestones) {
    if (ms.actualDate) continue
    const drift = analyseDrift(ms.id, input.forecastHistory)
    if (!drift) continue
    if (drift.isWorsening && drift.currentVariance >= DRIFT_WARNING_DAYS) {
      out.push({
        triggerKey: 'milestone_drift',
        severity: ms.isCritical ? 'critical' : 'high',
        title: `روند تأخیر فزاینده: ${ms.name}`,
        detail: `پیش‌بینی تأخیر در چند دوره متوالی بدتر شده است (${drift.series.join(' → ')} روز). تأخیر فعلی ${drift.currentVariance} روز.`,
        requiredAction: 'بررسی علت ریشه‌ای تأخیر و ارائه برنامه جبرانی؛ صرف به‌روزرسانی مجدد پیش‌بینی کافی نیست.',
        ownerId: ms.ownerId,
        relatedMilestoneId: ms.id,
      })
    }
  }

  /* 2 — critical milestone already late. */
  for (const ms of input.milestones) {
    const status = deriveMilestoneStatus(ms, today)
    if (status === 'delayed' && ms.isCritical) {
      const v = milestoneVariance(ms)
      out.push({
        triggerKey: 'critical_milestone_delayed',
        severity: 'critical',
        title: `Milestone بحرانی تأخیرکرده: ${ms.name}`,
        detail: v !== null ? `${v} روز نسبت به Baseline` : 'تاریخ سررسید گذشته و تحقق ثبت نشده است',
        requiredAction: 'تعیین تکلیف فوری: تاریخ جدید با برنامه جبرانی، یا اعلام رسمی تأخیر به کارفرما.',
        ownerId: ms.ownerId,
        relatedMilestoneId: ms.id,
      })
    }
  }

  /* 3 — critical milestone approaching with no time left and no progress. */
  for (const ms of input.milestones) {
    if (ms.actualDate || !ms.isCritical) continue
    const days = daysUntilDue(ms, today)
    if (days !== null && days >= 0 && days <= 14) {
      out.push({
        triggerKey: 'critical_milestone_imminent',
        severity: 'high',
        title: `Milestone بحرانی در ${days} روز آینده: ${ms.name}`,
        detail: 'کمتر از دو هفته تا سررسید باقی مانده و تحقق ثبت نشده است.',
        requiredAction: 'تأیید آمادگی تحقق در جلسه هفتگی؛ در غیر این صورت اعلام زودهنگام تأخیر.',
        ownerId: ms.ownerId,
        relatedMilestoneId: ms.id,
      })
    }
  }

  /* 4 — critical risk with no mitigation plan. */
  if (input.criticalRisksWithoutMitigation > 0) {
    out.push({
      triggerKey: 'critical_risk_unmitigated',
      severity: 'critical',
      title: `${input.criticalRisksWithoutMitigation} ریسک بحرانی بدون برنامه کاهش`,
      detail: 'ریسک بحرانی ثبت شده اما اقدام کاهشی برای آن تعریف نشده است.',
      requiredAction: 'تعیین مالک و برنامه کاهش برای هر ریسک بحرانی در ماژول مدیریت ریسک.',
      ownerId: null,
    })
  }

  /* 5 — overdue critical action. */
  const overdueCritical = input.actions.filter((a) => isActionOverdue(a, today) && a.priority === 'critical')
  if (overdueCritical.length > 0) {
    out.push({
      triggerKey: 'critical_action_overdue',
      severity: 'critical',
      title: `${overdueCritical.length} اقدام بحرانی دارای تأخیر`,
      detail: overdueCritical.slice(0, 3).map((a) => a.title).join('، '),
      requiredAction: 'پیگیری مستقیم با مالک اقدام و در صورت لزوم ارجاع به سطح بالاتر.',
      ownerId: overdueCritical[0]?.ownerId ?? null,
    })
  }

  /* 6 — mandatory checklist item overdue in the active stage. */
  const overdueMandatory = input.checklist.filter(
    (c) => c.stageKey === input.currentStageKey && c.isMandatory && isChecklistOverdue(c, today),
  )
  if (overdueMandatory.length > 0) {
    out.push({
      triggerKey: 'mandatory_checklist_overdue',
      severity: 'high',
      title: `${overdueMandatory.length} الزام مرحله جاری دارای تأخیر`,
      detail: overdueMandatory.slice(0, 3).map((c) => c.title).join('، '),
      requiredAction: 'تکمیل الزامات معوق — این موارد مانع اعلام آمادگی گیت مرحله هستند.',
      ownerId: overdueMandatory[0]?.responsibleId ?? null,
      relatedStageKey: input.currentStageKey,
    })
  }

  /* 7 — the active stage's gate is far from ready. */
  const currentReadiness = input.readiness.find((r) => r.stageKey === input.currentStageKey)
  if (currentReadiness && currentReadiness.mandatoryTotal > 0 && currentReadiness.percent < GATE_READINESS_THRESHOLD) {
    out.push({
      triggerKey: 'gate_readiness_low',
      severity: 'medium',
      title: `آمادگی گیت مرحله جاری ${currentReadiness.percent}٪ است`,
      detail: `${currentReadiness.mandatoryTotal - currentReadiness.mandatoryDone} الزام از ${currentReadiness.mandatoryTotal} الزام باقی مانده است.`,
      requiredAction: 'تعیین مالک و سررسید برای الزامات باقی‌مانده تا مرحله در زمان مقرر بسته شود.',
      ownerId: null,
      relatedStageKey: input.currentStageKey,
    })
  }

  /* 8 — a gate explicitly blocked. */
  for (const gate of input.gates) {
    if (gate.status === 'blocked') {
      out.push({
        triggerKey: 'gate_blocked',
        severity: 'critical',
        title: `گیت مسدود: ${gate.name}`,
        detail: gate.comments || 'گیت به دلیل الزامات برآورده‌نشده مسدود است.',
        requiredAction: 'رفع عامل انسداد یا تصمیم رسمی مدیریت برای Override با ثبت دلیل.',
        ownerId: gate.gateOwnerId,
        relatedStageKey: gate.stageKey,
      })
    }
  }

  /* 9 — critical issues open. */
  if (input.openCriticalIssues > 0) {
    out.push({
      triggerKey: 'critical_issue_open',
      severity: 'high',
      title: `${input.openCriticalIssues} مسئله بحرانی باز`,
      detail: 'مسائل بحرانی باز روی توانایی پروژه برای عبور از گیت اثر مستقیم دارند.',
      requiredAction: 'تعیین تکلیف در جلسه مدیریت پروژه و ثبت اقدام با مالک و سررسید.',
      ownerId: null,
    })
  }

  return out.sort((a, b) => WARNING_SEVERITY_RANK[b.severity] - WARNING_SEVERITY_RANK[a.severity])
}

/* ------------------------------------------------------- management attention */

export type EscalationLevel = 'project_manager' | 'pmo' | 'plan_manager' | 'portfolio_manager' | 'ceo'

export const ESCALATION_LABEL_FA: Record<EscalationLevel, string> = {
  project_manager: 'مدیر پروژه',
  pmo: 'PMO',
  plan_manager: 'مدیر طرح',
  portfolio_manager: 'مدیر سبد',
  ceo: 'مدیرعامل',
}

export interface AttentionItem {
  rank: number
  problem: string
  impact: string
  ownerId: string | null
  dueDate: string | null
  recommendedAction: string
  escalation: EscalationLevel
  severity: WarningSeverity
  relatedMilestoneId?: string
}

/** Escalation ladder: the more severe and the more structural the problem, the higher it goes. */
function escalationFor(w: ComputedWarning): EscalationLevel {
  if (w.severity === 'critical') {
    if (w.triggerKey === 'gate_blocked' || w.triggerKey === 'critical_risk_unmitigated') return 'portfolio_manager'
    return 'plan_manager'
  }
  if (w.severity === 'high') return 'pmo'
  return 'project_manager'
}

function impactFor(w: ComputedWarning): string {
  switch (w.triggerKey) {
    case 'critical_milestone_delayed':
    case 'milestone_drift':
      return 'تأخیر مستقیم در تاریخ تحویل پروژه و احتمال جریمه قراردادی'
    case 'critical_milestone_imminent':
      return 'در صورت عدم تحقق، مسیر بحرانی پروژه جابه‌جا می‌شود'
    case 'critical_risk_unmitigated':
      return 'ریسک بدون کنترل، در صورت وقوع مستقیماً به هزینه یا تأخیر تبدیل می‌شود'
    case 'critical_action_overdue':
      return 'تصمیم گرفته‌شده اجرا نشده است — اثر تصمیم قبلی از بین می‌رود'
    case 'gate_blocked':
      return 'پروژه نمی‌تواند وارد مرحله بعد شود؛ کل زمان‌بندی متوقف می‌ماند'
    case 'mandatory_checklist_overdue':
      return 'مرحله جاری در زمان مقرر بسته نمی‌شود'
    case 'gate_readiness_low':
      return 'احتمال تأخیر در عبور از گیت و لغزش شروع مرحله بعد'
    default:
      return 'اثر بر عملکرد پروژه'
  }
}

/**
 * The five things a manager should look at right now, ranked. Deliberately capped: a list of
 * thirty "attention items" is another dashboard, not attention.
 */
export function computeManagementAttention(warnings: ComputedWarning[], limit = 5): AttentionItem[] {
  return warnings.slice(0, limit).map((w, i) => ({
    rank: i + 1,
    problem: w.title,
    impact: impactFor(w),
    ownerId: w.ownerId,
    dueDate: null,
    recommendedAction: w.requiredAction,
    escalation: escalationFor(w),
    severity: w.severity,
    relatedMilestoneId: w.relatedMilestoneId,
  }))
}
