import { supabase } from '../../../lib/supabaseClient'

/** Confidential interview-summary notes attached to a decision. The lead (or a site admin) writes them; only a SITE admin can read them (RLS + no other RPC returns the text). */
import { type DecisionKind } from './decisionRules'
export * from './decisionRules'

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
