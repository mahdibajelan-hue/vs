/**
 * Disciplinary decisions: a score deduction, a temporary suspension or a work ban. A proposal changes nothing until it is
 * approved by someone other than its author; an approved decision can later be revoked with a reason.
 */
export type DecisionKind = 'score_deduction' | 'suspension' | 'work_ban'
export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'revoked'
export interface Decision { id: string; kind: DecisionKind; points: number | null; startDate: string; endDate: string | null; status: DecisionStatus }
export const KIND_LABEL_FA: Record<DecisionKind, string> = { score_deduction: 'کاهش امتیاز', suspension: 'تعلیق موقت', work_ban: 'ممنوع‌الکاری' }
export const STATUS_LABEL_FA: Record<DecisionStatus, string> = { proposed: 'در انتظار تصمیم', approved: 'تصویب‌شده', rejected: 'ردشده', revoked: 'لغوشده' }

export interface DisciplineState {
  /** 100 minus the points of approved, unrevoked deductions (never below 0) */
  conductScore: number
  deducted: number
  banned: boolean
  suspendedUntil: string | null
  /** false while banned or suspended: the person must not be proposed for work */
  eligible: boolean
  pending: number
  label: string
}

export function disciplineState(decisions: Decision[], todayIso: string): DisciplineState {
  const live = decisions.filter((d) => d.status === 'approved')
  const deducted = live.filter((d) => d.kind === 'score_deduction').reduce((a, d) => a + (d.points ?? 0), 0)
  const banned = live.some((d) => d.kind === 'work_ban' && d.startDate <= todayIso && (d.endDate == null || d.endDate >= todayIso))
  const susp = live.filter((d) => d.kind === 'suspension' && d.startDate <= todayIso && d.endDate != null && d.endDate >= todayIso).map((d) => d.endDate as string).sort().at(-1) ?? null
  return { conductScore: Math.max(0, 100 - deducted), deducted, banned, suspendedUntil: susp, eligible: !banned && !susp, pending: decisions.filter((d) => d.status === 'proposed').length, label: banned ? 'ممنوع‌الکار' : susp ? 'تعلیق موقت' : deducted > 0 ? 'دارای کسر امتیاز' : 'بدون سابقهٔ انضباطی' }
}
