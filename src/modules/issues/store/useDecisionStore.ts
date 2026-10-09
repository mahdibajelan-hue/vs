import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useSystemStore } from '../../../store/useSystemStore'
import type { ImDecision, ImDecisionOption } from '../lib/imDecisions'
import { explainServerError } from './useIssueWorkStore'

const fail = (a: string, e: { message: string }) => {
  const m = explainServerError(e.message)
    .replace('only_decider_may_decide', 'فقط تصمیم‌گیرنده یا مدیر می‌تواند تصمیم را ثبت کند')
    .replace('decision_needs_option_or_rationale', 'برای ثبت تصمیم، یک گزینه یا دلیل لازم است')
    .replace('decided_is_final_admin_only', 'تصمیم اتخاذشده نهایی است؛ فقط مدیر می‌تواند آن را تغییر دهد')
  useSystemStore.getState().setStorageError(`خطا در ${a}: ${m}`)
  return { ok: false as const, error: m }
}

const rowToDecision = (r: Record<string, unknown>): ImDecision => ({
  id: r.id as string, code: r.code as string, projectId: r.project_id as string, issueId: (r.issue_id as string) ?? null, title: r.title as string, question: (r.question as string) ?? '',
  requestedBy: (r.requested_by as string) ?? null, deciderId: (r.decider_id as string) ?? null, neededBy: (r.needed_by as string) ?? null, status: r.status as ImDecision['status'],
  chosenOption: (r.chosen_option as string) ?? null, rationale: (r.rationale as string) ?? '', decidedAt: (r.decided_at as string) ?? null, createdAt: r.created_at as string,
})
const rowToOption = (r: Record<string, unknown>): ImDecisionOption => ({
  id: r.id as string, decisionId: r.decision_id as string, title: r.title as string, pros: (r.pros as string) ?? '', cons: (r.cons as string) ?? '',
  costImpact: r.cost_impact === null ? null : Number(r.cost_impact), timeImpactDays: r.time_impact_days === null ? null : Number(r.time_impact_days), recommended: !!r.recommended,
})

interface DecisionState {
  decisions: ImDecision[]
  options: ImDecisionOption[]
  loaded: boolean
  fetchAll: () => Promise<void>
  create: (d: { projectId: string; issueId: string | null; title: string; question: string; deciderId: string | null; neededBy: string | null; options: { title: string; pros: string; cons: string; timeImpactDays: number | null; costImpact: number | null; recommended: boolean }[] }) => Promise<{ ok: boolean; error?: string }>
  decide: (id: string, optionId: string | null, rationale: string) => Promise<{ ok: boolean; error?: string }>
  setStatus: (id: string, status: 'deferred' | 'cancelled' | 'pending', reason?: string) => Promise<{ ok: boolean; error?: string }>
}

export const useDecisionStore = create<DecisionState>()((set, get) => ({
  decisions: [], options: [], loaded: false,
  fetchAll: async () => {
    const [d, o] = await Promise.all([supabase.from('im_decisions').select('*').order('created_at', { ascending: false }).limit(500), supabase.from('im_decision_options').select('*')])
    set({ decisions: ((d.data ?? []) as Record<string, unknown>[]).map(rowToDecision), options: ((o.data ?? []) as Record<string, unknown>[]).map(rowToOption), loaded: true })
  },
  create: async (d) => {
    const { data, error } = await supabase.from('im_decisions').insert({ project_id: d.projectId, issue_id: d.issueId, title: d.title, question: d.question, decider_id: d.deciderId, needed_by: d.neededBy, requested_by: useAuthStore.getState().profile?.id ?? null }).select().single()
    if (error || !data) return fail('ثبت تصمیم', error ?? { message: 'unknown' })
    if (d.options.length) {
      const { error: oe } = await supabase.from('im_decision_options').insert(d.options.map((o, k) => ({ decision_id: data.id, title: o.title, pros: o.pros, cons: o.cons, time_impact_days: o.timeImpactDays, cost_impact: o.costImpact, recommended: o.recommended, sort: k })))
      if (oe) return fail('ثبت گزینه‌ها', oe)
    }
    await get().fetchAll()
    return { ok: true }
  },
  decide: async (id, optionId, rationale) => {
    const { error } = await supabase.from('im_decisions').update({ status: 'decided', chosen_option: optionId, rationale }).eq('id', id)
    if (error) return fail('ثبت تصمیم', error)
    await get().fetchAll()
    return { ok: true }
  },
  setStatus: async (id, status, reason = '') => {
    const { error } = await supabase.from('im_decisions').update({ status, ...(reason ? { rationale: reason } : {}) }).eq('id', id)
    if (error) return fail('تغییر وضعیت تصمیم', error)
    await get().fetchAll()
    return { ok: true }
  },
}))
