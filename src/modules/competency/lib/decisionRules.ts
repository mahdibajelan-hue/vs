/** Pure decision-note rules (no database access) — shared by the dialog and tests. */
export type DecisionKind = 'APPROVED' | 'APPROVAL_REVOKED' | 'NOT_APPROVED' | 'OPEN_TO_WORK' | 'ON_PROJECT' | 'NOT_ASSIGNED'

export const DECISION_LABEL_FA: Record<DecisionKind, string> = {
  APPROVED: 'تأیید صلاحیت',
  APPROVAL_REVOKED: 'لغو تأیید صلاحیت',
  NOT_APPROVED: 'عدم تأیید صلاحیت',
  OPEN_TO_WORK: 'آماده به کار (عدم اختصاص به پروژه)',
  ON_PROJECT: 'اختصاص به پروژه',
  NOT_ASSIGNED: 'عدم اختصاص به پروژه',
}

/** Negative decisions need a written reason; positive ones may carry one. Mirrors the SQL rule (≥ 10 characters). */
export const MIN_REASON_CHARS = 10
export const noteRequired = (d: DecisionKind): boolean => d === 'APPROVAL_REVOKED' || d === 'NOT_APPROVED' || d === 'OPEN_TO_WORK' || d === 'NOT_ASSIGNED'
export const noteValid = (d: DecisionKind, note: string): boolean => (noteRequired(d) ? note.trim().length >= MIN_REASON_CHARS : true)

