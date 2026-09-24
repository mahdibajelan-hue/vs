import type {
  CompCompetencyScore,
  CompDevelopmentAction,
  CompDevelopmentActionSource,
  CompDevelopmentActionStatus,
  CompDevelopmentActionType,
  CompDevelopmentPlanStatus,
  CompDevelopmentPriority,
  CompGapOutcome,
} from '../types'

// ---------------------------------------------------------------------------
// Individual Development Plan (Phase 5) — presentation helpers over
// comp_development_plans / comp_development_actions (schema.sql Section 52).
// Suggestions themselves come from comp_seed_development_plan server-side;
// nothing here derives an action from a score.
// ---------------------------------------------------------------------------

export const PLAN_STATUS_META: Record<CompDevelopmentPlanStatus, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: '#94a3b8' },
  ACTIVE: { label: 'در حال اجرا', color: '#38bdf8' },
  COMPLETED: { label: 'تکمیل‌شده', color: '#34d399' },
  CANCELLED: { label: 'لغوشده', color: '#f87171' },
}

export const ACTION_TYPE_LABEL_FA: Record<CompDevelopmentActionType, string> = {
  TRAINING: 'آموزش',
  MENTORING: 'مربی‌گری',
  ON_THE_JOB: 'یادگیری حین کار',
  SELF_STUDY: 'مطالعه شخصی',
  PROJECT_ASSIGNMENT: 'واگذاری پروژه',
  OTHER: 'سایر',
  EVIDENCE_COLLECTION: 'ارزیابی تکمیلی',
}

export const ACTION_STATUS_META: Record<CompDevelopmentActionStatus, { label: string; color: string }> = {
  NOT_STARTED: { label: 'شروع‌نشده', color: '#94a3b8' },
  IN_PROGRESS: { label: 'در حال انجام', color: '#38bdf8' },
  DONE: { label: 'انجام‌شده', color: '#34d399' },
  CANCELLED: { label: 'لغوشده', color: '#f87171' },
}

export const PRIORITY_META: Record<CompDevelopmentPriority, { label: string; color: string }> = {
  HIGH: { label: 'اولویت بالا', color: '#f87171' },
  MEDIUM: { label: 'اولویت متوسط', color: '#fbbf24' },
  LOW: { label: 'اولویت پایین', color: '#94a3b8' },
}

export const ACTION_SOURCE_LABEL_FA: Record<CompDevelopmentActionSource, string> = {
  GAP_ENGINE: 'پیشنهاد موتور شکاف',
  AI: 'پیشنهاد هوش مصنوعی',
  MANUAL: 'افزوده دستی',
}

export const GAP_OUTCOME_META: Record<CompGapOutcome, { label: string; color: string }> = {
  CLOSED: { label: 'شکاف بسته شد', color: '#34d399' },
  NARROWED: { label: 'شکاف کاهش یافت', color: '#a3e635' },
  UNCHANGED: { label: 'بدون تغییر', color: '#fbbf24' },
  WIDENED: { label: 'شکاف بیشتر شد', color: '#f87171' },
  NEW_GAP: { label: 'شکاف جدید', color: '#f87171' },
  GAP_IDENTIFIED: { label: 'شکاف شناسایی شد', color: '#fb923c' },
  NO_GAP: { label: 'بدون شکاف', color: '#38bdf8' },
  UNKNOWN: { label: 'نامعلوم (شواهد ناکافی)', color: '#94a3b8' },
  NOT_COMPARABLE: { label: 'غیرقابل مقایسه', color: '#64748b' },
}

/** Progress counts over the non-cancelled actions — a cancelled action is neither done nor pending. */
export function planProgress(actions: CompDevelopmentAction[]) {
  const live = actions.filter((a) => a.status !== 'CANCELLED')
  const done = live.filter((a) => a.status === 'DONE').length
  const inProgress = live.filter((a) => a.status === 'IN_PROGRESS').length
  const today = new Date().toISOString().slice(0, 10)
  const overdue = live.filter((a) => a.status !== 'DONE' && a.dueDate != null && a.dueDate < today).length
  return { total: live.length, done, inProgress, overdue, percent: live.length > 0 ? Math.round((done / live.length) * 100) : 0 }
}

export interface ActionGroup {
  competencyId: string | null
  labelFa: string
  score: CompCompetencyScore | null
  actions: CompDevelopmentAction[]
}

/** Groups actions per competency (general actions last), ordering groups like the gap table:
 * critical gaps first, then gaps, then evidence collection, then the rest. */
export function groupActionsByCompetency(
  actions: CompDevelopmentAction[],
  scores: CompCompetencyScore[],
  labelFor: (competencyId: string) => string,
): ActionGroup[] {
  const map = new Map<string | null, CompDevelopmentAction[]>()
  for (const a of [...actions].sort((x, y) => x.sortOrder - y.sortOrder)) {
    const list = map.get(a.competencyId) ?? []
    list.push(a)
    map.set(a.competencyId, list)
  }
  const rank = (s: CompCompetencyScore | null) =>
    !s ? 5 : s.status === 'CRITICAL_GAP' ? 0 : s.status === 'GAP' ? 1 : s.status === 'INSUFFICIENT_EVIDENCE' ? 2 : 3
  return [...map.entries()]
    .map(([competencyId, list]) => ({
      competencyId,
      labelFa: competencyId ? labelFor(competencyId) : 'اقدامات عمومی',
      score: competencyId ? scores.find((s) => s.competencyId === competencyId) ?? null : null,
      actions: list,
    }))
    .sort((a, b) => {
      if (a.competencyId == null) return 1
      if (b.competencyId == null) return -1
      return rank(a.score) - rank(b.score) || (b.score?.gap ?? 0) - (a.score?.gap ?? 0) || a.labelFa.localeCompare(b.labelFa, 'fa')
    })
}
