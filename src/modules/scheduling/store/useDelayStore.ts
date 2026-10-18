import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { DEFAULT_CONTRACT, type Contract, type DelayEvent, type Party } from '../lib/delay'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Milestone { id: string; title: string; activityUid: string | null; contractDate: string; ldPerDay: number; sort: number }

const fail = (what: string, error: { message: string } | null): boolean => {
  if (!error) return false
  const m = error.message.includes('not_allowed') ? 'فقط نقش تأییدکننده می‌تواند تمدید را تأیید یا رد کند.' : error.message
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${m}`)
  return true
}
const mapContract = (r: Row): Contract => ({ contractStart: r.contract_start, contractFinish: r.contract_finish, contractValue: Number(r.contract_value ?? 0), ldPerDay: Number(r.ld_per_day ?? 0), ldCapPct: Number(r.ld_cap_pct ?? 10), noticeDays: Number(r.notice_days ?? 14), docReviewDays: Number(r.doc_review_days ?? 14), toleranceDays: Number(r.tolerance_days ?? 0), concurrentCompensable: !!r.concurrent_compensable, forceMajeureNotice: r.force_majeure_notice !== false })
const mapEvent = (r: Row): DelayEvent => ({ id: r.id, title: r.title, cause: r.cause, party: r.party as Party, clause: r.clause ?? '', eventStart: r.event_start, eventEnd: r.event_end, noticeDate: r.notice_date, activityUids: r.activity_uids ?? [], claimedDays: Number(r.claimed_days ?? 0), critical: r.critical, status: r.status, approvedDays: r.approved_days == null ? null : Number(r.approved_days), approvedCost: r.approved_cost == null ? null : Number(r.approved_cost), sourceType: r.source_type ?? 'manual', sourceRef: r.source_ref ?? '', note: r.note ?? '' })
const eventRow = (projectId: string, e: Omit<DelayEvent, 'id'>) => ({ project_id: projectId, title: e.title, cause: e.cause, party: e.party, clause: e.clause, event_start: e.eventStart, event_end: e.eventEnd, notice_date: e.noticeDate, activity_uids: e.activityUids, claimed_days: e.claimedDays, critical: e.critical, status: e.status, approved_days: e.approvedDays, approved_cost: e.approvedCost, source_type: e.sourceType, source_ref: e.sourceRef, note: e.note })

interface State {
  projectId: string | null; loading: boolean
  contract: Contract; hasContract: boolean
  milestones: Milestone[]; events: DelayEvent[]
  load: (projectId: string) => Promise<void>
  saveContract: (c: Contract) => Promise<boolean>
  saveMilestone: (m: Omit<Milestone, 'id' | 'sort'> & { id?: string }) => Promise<boolean>
  removeMilestone: (id: string) => Promise<boolean>
  saveEvent: (e: Omit<DelayEvent, 'id'> & { id?: string }) => Promise<boolean>
  removeEvent: (id: string) => Promise<boolean>
}

export const useDelayStore = create<State>((set, get) => ({
  projectId: null, loading: false, contract: DEFAULT_CONTRACT, hasContract: false, milestones: [], events: [],
  load: async (projectId) => {
    set({ projectId, loading: true, contract: DEFAULT_CONTRACT, hasContract: false, milestones: [], events: [] })
    const [c, m, e] = await Promise.all([
      supabase.from('sch_contract').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('sch_milestones').select('*').eq('project_id', projectId).order('contract_date'),
      supabase.from('sch_delay_events').select('*').eq('project_id', projectId).order('event_start'),
    ])
    if (get().projectId !== projectId) return
    if (fail('بارگذاری تحلیل تاخیرات', c.error ?? m.error ?? e.error)) { set({ loading: false }); return }
    set({
      contract: c.data ? mapContract(c.data as Row) : DEFAULT_CONTRACT, hasContract: !!c.data, loading: false,
      milestones: ((m.data ?? []) as Row[]).map((r): Milestone => ({ id: r.id, title: r.title, activityUid: r.activity_uid, contractDate: r.contract_date, ldPerDay: Number(r.ld_per_day ?? 0), sort: r.sort ?? 0 })),
      events: ((e.data ?? []) as Row[]).map(mapEvent),
    })
  },
  saveContract: async (c) => {
    const projectId = get().projectId!
    const { error } = await supabase.from('sch_contract').upsert({ project_id: projectId, contract_start: c.contractStart || null, contract_finish: c.contractFinish || null, contract_value: c.contractValue, ld_per_day: c.ldPerDay, ld_cap_pct: c.ldCapPct, notice_days: c.noticeDays, doc_review_days: c.docReviewDays, tolerance_days: c.toleranceDays, concurrent_compensable: c.concurrentCompensable, force_majeure_notice: c.forceMajeureNotice, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    if (fail('ثبت شرایط قرارداد', error)) return false
    set({ contract: c, hasContract: true }); return true
  },
  saveMilestone: async (m) => {
    const projectId = get().projectId!
    const row = { project_id: projectId, title: m.title, activity_uid: m.activityUid, contract_date: m.contractDate, ld_per_day: m.ldPerDay }
    const r = m.id ? await supabase.from('sch_milestones').update(row).eq('id', m.id) : await supabase.from('sch_milestones').insert(row)
    if (fail('ثبت نقطهٔ عطف', r.error)) return false
    await get().load(projectId); return true
  },
  removeMilestone: async (id) => { const { error } = await supabase.from('sch_milestones').delete().eq('id', id); if (fail('حذف نقطهٔ عطف', error)) return false; set({ milestones: get().milestones.filter((x) => x.id !== id) }); return true },
  saveEvent: async (e) => {
    const projectId = get().projectId!
    const row = eventRow(projectId, e)
    const r = e.id ? await supabase.from('sch_delay_events').update(row).eq('id', e.id).select('*').single() : await supabase.from('sch_delay_events').insert(row).select('*').single()
    if (fail('ثبت رویداد تاخیر', r.error)) return false
    const saved = mapEvent(r.data as Row)
    set({ events: [...get().events.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.eventStart.localeCompare(b.eventStart)) }); return true
  },
  removeEvent: async (id) => { const { error } = await supabase.from('sch_delay_events').delete().eq('id', id); if (fail('حذف رویداد تاخیر', error)) return false; set({ events: get().events.filter((x) => x.id !== id) }); return true },
}))
