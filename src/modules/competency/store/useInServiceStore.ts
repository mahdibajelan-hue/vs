import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { DEFAULT_WEIGHTS, type RaterKind, type ResultItem, type Weights } from '../lib/inservice'
import type { Decision, DecisionKind, DecisionStatus } from '../lib/discipline'

export interface InServiceCycle {
  id: string; assessmentId: string; periodLabel: string; periodStart: string; periodEnd: string; projectName: string; status: 'open' | 'closed'
  weights: Weights; technicalScore: number | null; technicalNote: string; resultsItems: ResultItem[]; summaryNote: string; finalScore: number | null; dueDate: string | null; createdAt: string; closedAt: string | null
}
export interface InServiceRater { cycleId: string; userId: string; kind: RaterKind; submittedAt: string | null }
export interface InServiceRating { cycleId: string; raterId: string; competencyId: string; rating: number; notes: string }
export interface DisciplineRow extends Decision { assessmentId: string; reason: string; evidenceNote: string; proposedBy: string | null; proposedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string; revokeReason: string }

type Row = Record<string, unknown>
const cycleFrom = (r: Row): InServiceCycle => ({ id: r.id as string, assessmentId: r.assessment_id as string, periodLabel: r.period_label as string, periodStart: r.period_start as string, periodEnd: r.period_end as string, projectName: (r.project_name as string) ?? '', status: r.status as 'open' | 'closed', weights: { ...DEFAULT_WEIGHTS, ...((r.weights as Partial<Weights>) ?? {}) }, technicalScore: r.technical_score == null ? null : Number(r.technical_score), technicalNote: (r.technical_note as string) ?? '', resultsItems: (r.results_items as ResultItem[]) ?? [], summaryNote: (r.summary_note as string) ?? '', finalScore: r.final_score == null ? null : Number(r.final_score), dueDate: (r.due_date as string) ?? null, createdAt: r.created_at as string, closedAt: (r.closed_at as string) ?? null })
const decisionFrom = (r: Row): DisciplineRow => ({ id: r.id as string, assessmentId: r.assessment_id as string, kind: r.kind as DecisionKind, points: r.points == null ? null : Number(r.points), startDate: r.start_date as string, endDate: (r.end_date as string) ?? null, status: r.status as DecisionStatus, reason: r.reason as string, evidenceNote: (r.evidence_note as string) ?? '', proposedBy: (r.proposed_by as string) ?? null, proposedAt: r.proposed_at as string, decidedBy: (r.decided_by as string) ?? null, decidedAt: (r.decided_at as string) ?? null, decisionNote: (r.decision_note as string) ?? '', revokeReason: (r.revoke_reason as string) ?? '' })

const ERR: Record<string, string> = {
  separation_of_duties: 'تصمیم‌گیرنده باید غیر از پیشنهاددهنده باشد.', forbidden: 'اجازهٔ این کار را ندارید.', reason_required: 'نوشتن دلیل الزامی است.', not_proposed: 'این مورد دیگر در انتظار تصمیم نیست.', not_approved: 'فقط تصمیم تصویب‌شده قابل لغو است.',
}
const faErr = (m: string) => Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? m

interface State {
  cycles: InServiceCycle[]; raters: InServiceRater[]; ratings: InServiceRating[]; decisions: DisciplineRow[]; loaded: boolean; error: string | null
  fetchAll: () => Promise<void>
  createCycle: (a: { assessmentId: string; periodLabel: string; periodStart: string; periodEnd: string; projectName: string; dueDate: string | null }) => Promise<string | null>
  addRater: (cycleId: string, userId: string, kind: RaterKind) => Promise<void>
  removeRater: (cycleId: string, userId: string) => Promise<void>
  saveMyRatings: (cycleId: string, rows: { competencyId: string; rating: number; notes: string }[], submit: boolean) => Promise<boolean>
  patchCycle: (id: string, patch: Partial<{ technical_score: number | null; technical_note: string; results_items: ResultItem[]; summary_note: string; weights: Weights }>) => Promise<void>
  closeCycle: (id: string, finalScore: number | null) => Promise<void>
  reopenCycle: (id: string) => Promise<void>
  propose: (a: { assessmentId: string; kind: DecisionKind; points: number | null; startDate: string; endDate: string | null; reason: string; evidenceNote: string }) => Promise<boolean>
  decide: (id: string, decision: 'approve' | 'reject' | 'revoke', note: string) => Promise<boolean>
}

export const useInServiceStore = create<State>()((set, get) => ({
  cycles: [], raters: [], ratings: [], decisions: [], loaded: false, error: null,
  fetchAll: async () => {
    const [c, r, g, d] = await Promise.all([
      supabase.from('comp_inservice_cycles').select('*').order('period_start', { ascending: false }),
      supabase.from('comp_inservice_raters').select('*'),
      supabase.from('comp_inservice_ratings').select('*'),
      supabase.from('comp_disciplinary_decisions').select('*').order('proposed_at', { ascending: false }),
    ])
    set({
      cycles: ((c.data ?? []) as Row[]).map(cycleFrom), raters: ((r.data ?? []) as Row[]).map((x) => ({ cycleId: x.cycle_id as string, userId: x.user_id as string, kind: x.kind as RaterKind, submittedAt: (x.submitted_at as string) ?? null })),
      ratings: ((g.data ?? []) as Row[]).map((x) => ({ cycleId: x.cycle_id as string, raterId: x.rater_id as string, competencyId: x.competency_id as string, rating: Number(x.rating), notes: (x.notes as string) ?? '' })),
      decisions: ((d.data ?? []) as Row[]).map(decisionFrom), loaded: true, error: c.error?.message ?? null,
    })
  },
  createCycle: async (a) => {
    const { data, error } = await supabase.from('comp_inservice_cycles').insert({ assessment_id: a.assessmentId, period_label: a.periodLabel, period_start: a.periodStart, period_end: a.periodEnd, project_name: a.projectName, due_date: a.dueDate }).select('id').single()
    if (error) { set({ error: error.code === '23505' ? 'برای این فرد و دوره قبلاً ارزیابی ثبت شده است.' : faErr(error.message) }); return null }
    await get().fetchAll(); return (data as { id: string }).id
  },
  addRater: async (cycleId, userId, kind) => { const { error } = await supabase.from('comp_inservice_raters').upsert({ cycle_id: cycleId, user_id: userId, kind }); if (error) set({ error: faErr(error.message) }); await get().fetchAll() },
  removeRater: async (cycleId, userId) => { await supabase.from('comp_inservice_raters').update({ submitted_at: null }).eq('cycle_id', cycleId).eq('user_id', userId); const { error } = await supabase.from('comp_inservice_raters').delete().eq('cycle_id', cycleId).eq('user_id', userId); if (error) set({ error: faErr(error.message) }); await get().fetchAll() },
  saveMyRatings: async (cycleId, rows, submit) => {
    const me = (await supabase.auth.getUser()).data.user?.id
    if (!me) return false
    const { error } = await supabase.from('comp_inservice_ratings').upsert(rows.map((r) => ({ cycle_id: cycleId, rater_id: me, competency_id: r.competencyId, rating: r.rating, notes: r.notes })), { onConflict: 'cycle_id,rater_id,competency_id' })
    if (error) { set({ error: faErr(error.message) }); return false }
    if (submit) await supabase.from('comp_inservice_raters').update({ submitted_at: new Date().toISOString() }).eq('cycle_id', cycleId).eq('user_id', me)
    await get().fetchAll(); return true
  },
  patchCycle: async (id, patch) => { const { error } = await supabase.from('comp_inservice_cycles').update(patch).eq('id', id); if (error) set({ error: faErr(error.message) }); await get().fetchAll() },
  closeCycle: async (id, finalScore) => { const me = (await supabase.auth.getUser()).data.user?.id; const { error } = await supabase.from('comp_inservice_cycles').update({ status: 'closed', final_score: finalScore, closed_at: new Date().toISOString(), closed_by: me }).eq('id', id); if (error) set({ error: faErr(error.message) }); await get().fetchAll() },
  reopenCycle: async (id) => { const { error } = await supabase.from('comp_inservice_cycles').update({ status: 'open', closed_at: null }).eq('id', id); if (error) set({ error: faErr(error.message) }); await get().fetchAll() },
  propose: async (a) => {
    const { error } = await supabase.from('comp_disciplinary_decisions').insert({ assessment_id: a.assessmentId, kind: a.kind, points: a.points, start_date: a.startDate, end_date: a.endDate, reason: a.reason, evidence_note: a.evidenceNote, status: 'proposed' })
    if (error) { set({ error: faErr(error.message) }); return false }
    await get().fetchAll(); return true
  },
  decide: async (id, decision, note) => {
    const { error } = await supabase.rpc('comp_discipline_decide', { p_id: id, p_decision: decision, p_note: note })
    if (error) { set({ error: faErr(error.message) }); return false }
    set({ error: null }); await get().fetchAll(); return true
  },
}))
