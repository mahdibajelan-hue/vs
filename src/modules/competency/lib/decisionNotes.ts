import { supabase } from '../../../lib/supabaseClient'

/** Confidential interview-summary notes attached to a decision. The lead (or a site admin) writes them; only a SITE admin can read them (RLS + no other RPC returns the text). */
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

export interface DecisionNote { id: string; decision: DecisionKind; projectName: string; note: string; createdAt: string; authorId: string | null }

export async function addDecisionNote(assessmentId: string, decision: DecisionKind, note: string, projectName = ''): Promise<string | null> {
  if (!note.trim()) return null
  const { error } = await supabase.rpc('comp_add_decision_note', { p_assessment_id: assessmentId, p_decision: decision, p_note: note, p_project_name: projectName })
  return error ? error.message : null
}

/** Site admins only — for everybody else RLS returns no rows. */
export async function fetchDecisionNotes(assessmentId: string): Promise<DecisionNote[]> {
  const { data } = await supabase.from('comp_decision_notes').select('id, decision, project_name, note, created_at, author_id').eq('assessment_id', assessmentId).order('created_at', { ascending: false })
  return ((data ?? []) as { id: string; decision: DecisionKind; project_name: string; note: string; created_at: string; author_id: string | null }[]).map((r) => ({ id: r.id, decision: r.decision, projectName: r.project_name, note: r.note, createdAt: r.created_at, authorId: r.author_id }))
}
