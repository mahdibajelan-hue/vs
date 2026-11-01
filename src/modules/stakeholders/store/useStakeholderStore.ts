import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { Concern, EngagementLog, Stakeholder } from '../types'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const sn = (v: unknown) => (v == null || v === '' ? null : String(v))

const shOf = (r: Row): Stakeholder => ({
  id: s(r.id), projectId: s(r.master_project_id), code: s(r.code), name: s(r.name), organization: s(r.organization), roleTitle: s(r.role_title),
  category: r.category as Stakeholder['category'], side: r.side === 'internal' ? 'internal' : 'external', phone: s(r.phone), email: s(r.email),
  power: Number(r.power ?? 3), interest: Number(r.interest ?? 3), attitude: r.attitude as Stakeholder['attitude'],
  current: r.engagement_current as Stakeholder['current'], desired: r.engagement_desired as Stakeholder['desired'],
  owner: s(r.owner), ownerEmail: s(r.owner_email), channel: s(r.channel), frequencyDays: r.frequency_days == null ? null : Number(r.frequency_days),
  expectations: s(r.expectations), strategy: s(r.strategy), note: s(r.note), active: r.is_active !== false, createdAt: s(r.created_at),
})
const logOf = (r: Row): EngagementLog => ({
  id: s(r.id), stakeholderId: s(r.stakeholder_id), happenedOn: s(r.happened_on), kind: r.kind as EngagementLog['kind'], subject: s(r.subject), summary: s(r.summary),
  attendees: s(r.attendees), sentiment: r.sentiment as EngagementLog['sentiment'], nextAction: s(r.next_action), nextDue: sn(r.next_due), nextOwner: s(r.next_owner),
  nextOwnerEmail: s(r.next_owner_email), nextDone: !!r.next_done, createdBy: sn(r.created_by),
})
const concernOf = (r: Row): Concern => ({
  id: s(r.id), stakeholderId: s(r.stakeholder_id), raisedOn: s(r.raised_on), title: s(r.title), description: s(r.description), category: r.category as Concern['category'],
  priority: r.priority as Concern['priority'], status: r.status as Concern['status'], owner: s(r.owner), ownerEmail: s(r.owner_email), dueDate: sn(r.due_date),
  resolution: s(r.resolution), resolvedOn: sn(r.resolved_on),
})

export type StakeholderInput = Omit<Stakeholder, 'id' | 'projectId' | 'createdAt' | 'active'>
export type LogInput = Omit<EngagementLog, 'id' | 'createdBy' | 'nextDone'>
export type ConcernInput = Omit<Concern, 'id' | 'resolvedOn'>

const shRow = (p: StakeholderInput) => ({
  code: p.code.trim(), name: p.name.trim(), organization: p.organization, role_title: p.roleTitle, category: p.category, side: p.side, phone: p.phone, email: p.email.trim(),
  power: p.power, interest: p.interest, attitude: p.attitude, engagement_current: p.current, engagement_desired: p.desired, owner: p.owner, owner_email: p.ownerEmail.trim().toLowerCase(),
  channel: p.channel, frequency_days: p.frequencyDays, expectations: p.expectations, strategy: p.strategy, note: p.note,
})
const concernRow = (p: ConcernInput) => ({
  stakeholder_id: p.stakeholderId, raised_on: p.raisedOn, title: p.title.trim(), description: p.description, category: p.category, priority: p.priority, status: p.status,
  owner: p.owner, owner_email: p.ownerEmail.trim().toLowerCase(), due_date: p.dueDate, resolution: p.resolution,
})

interface State {
  projectId: string | null
  loading: boolean
  error: string | null
  stakeholders: Stakeholder[]
  logs: EngagementLog[]
  concerns: Concern[]
  load: (projectId: string) => Promise<void>
  saveStakeholder: (p: StakeholderInput, by: string, id?: string) => Promise<string | null>
  setActive: (id: string, active: boolean) => Promise<boolean>
  addLog: (p: LogInput, by: string) => Promise<boolean>
  setFollowUpDone: (id: string, done: boolean) => Promise<boolean>
  saveConcern: (p: ConcernInput, by: string, id?: string) => Promise<boolean>
}

const friendly = (m: string) => (/duplicate key|unique/i.test(m) ? 'این کد ذینفع در این پروژه قبلاً ثبت شده است.' : /row-level security|permission/i.test(m) ? 'دسترسی ثبت در این پروژه را ندارید.' : m)

export const useStakeholderStore = create<State>()((set, get) => {
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) { set({ error: friendly(error.message) }); return false }
    set({ error: null })
    const pid = get().projectId; if (pid) await get().load(pid)
    return true
  }
  return {
    projectId: null, loading: false, error: null, stakeholders: [], logs: [], concerns: [],

    load: async (projectId) => {
      set({ loading: get().projectId !== projectId, projectId })
      const [a, b, c] = await Promise.all([
        supabase.from('sh_stakeholders').select('*').eq('master_project_id', projectId).order('code'),
        supabase.from('sh_engagements').select('*').eq('master_project_id', projectId).order('happened_on', { ascending: false }).limit(2000),
        supabase.from('sh_concerns').select('*').eq('master_project_id', projectId).order('raised_on', { ascending: false }).limit(2000),
      ])
      if (get().projectId !== projectId) return
      const err = a.error ?? b.error ?? c.error
      if (err) { set({ loading: false, error: err.message }); return }
      set({ loading: false, error: null, stakeholders: (a.data ?? []).map(shOf), logs: (b.data ?? []).map(logOf), concerns: (c.data ?? []).map(concernOf) })
    },

    saveStakeholder: async (p, by, id) => {
      const pid = get().projectId
      if (!pid) return null
      if (id) {
        const ok = await run(supabase.from('sh_stakeholders').update({ ...shRow(p), updated_at: new Date().toISOString() }).eq('id', id))
        return ok ? id : null
      }
      const { data, error } = await supabase.from('sh_stakeholders').insert({ ...shRow(p), master_project_id: pid, created_by: by }).select('id').single()
      if (error) { set({ error: friendly(error.message) }); return null }
      await get().load(pid)
      return String((data as Row).id)
    },
    setActive: (id, active) => run(supabase.from('sh_stakeholders').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id)),

    addLog: async (p, by) => {
      const pid = get().projectId
      if (!pid) return false
      return run(supabase.from('sh_engagements').insert({
        stakeholder_id: p.stakeholderId, master_project_id: pid, happened_on: p.happenedOn, kind: p.kind, subject: p.subject.trim(), summary: p.summary, attendees: p.attendees,
        sentiment: p.sentiment, next_action: p.nextAction.trim(), next_due: p.nextAction.trim() ? p.nextDue : null, next_owner: p.nextOwner, next_owner_email: p.nextOwnerEmail.trim().toLowerCase(), created_by: by,
      }))
    },
    setFollowUpDone: (id, done) => run(supabase.from('sh_engagements').update({ next_done: done, next_done_at: done ? new Date().toISOString() : null }).eq('id', id)),

    saveConcern: async (p, by, id) => {
      const pid = get().projectId
      if (!pid) return false
      const done = p.status === 'resolved' || p.status === 'closed'
      const row = { ...concernRow(p), resolved_on: done ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() }
      if (id) {
        const prev = get().concerns.find((c) => c.id === id)
        return run(supabase.from('sh_concerns').update({ ...row, resolved_on: done ? prev?.resolvedOn ?? row.resolved_on : null }).eq('id', id))
      }
      return run(supabase.from('sh_concerns').insert({ ...row, master_project_id: pid, created_by: by }))
    },
  }
})
