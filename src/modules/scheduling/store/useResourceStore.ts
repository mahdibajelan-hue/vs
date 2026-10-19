import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import type { Assignment, Resource } from '../lib/resources'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CostEntry { id: string; date: string; amount: number; note: string }
export type CostSource = 'manual' | 'finance'

const fail = (what: string, error: { message: string } | null): boolean => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${error.message.includes('row-level') || error.message.includes('not_allowed') ? 'اجازهٔ ویرایش ندارید.' : error.message}`)
  return true
}
const mapRes = (r: Row): Resource => ({ id: r.id, name: r.name, kind: r.kind, unit: r.unit ?? '', maxUnits: Number(r.max_units ?? 0), ratePerDay: Number(r.rate_per_day ?? 0), execMatch: r.exec_match ?? '' })

interface State {
  projectId: string | null; loading: boolean
  resources: Resource[]; assignments: Assignment[]; costs: CostEntry[]
  /** certified payments of the project read from the finance module (never copied) */
  financeCosts: { date: string; amount: number }[]
  load: (projectId: string) => Promise<void>
  saveResource: (r: Omit<Resource, 'id'> & { id?: string }) => Promise<boolean>
  removeResource: (id: string) => Promise<boolean>
  saveAssignment: (a: { activityUid: string; resourceId: string; unitsPerDay: number }) => Promise<boolean>
  removeAssignment: (id: string) => Promise<boolean>
  addCost: (date: string, amount: number, note: string) => Promise<boolean>
  removeCost: (id: string) => Promise<boolean>
}

/** Resources, their assignments to activities and the actual-cost entries of one project; the finance module's certified payments are read alongside for the cost-performance figures. */
export const useResourceStore = create<State>((set, get) => ({
  projectId: null, loading: false, resources: [], assignments: [], costs: [], financeCosts: [],
  load: async (projectId) => {
    set({ projectId, loading: true, resources: [], assignments: [], costs: [], financeCosts: [] })
    const [r, a, c, fc] = await Promise.all([
      supabase.from('sch_resources').select('*').eq('project_id', projectId).order('sort').order('name'),
      supabase.from('sch_assignments').select('*').eq('project_id', projectId),
      supabase.from('sch_actual_costs').select('*').eq('project_id', projectId).order('cost_date'),
      supabase.from('fin_contracts').select('id').eq('master_project_id', projectId),
    ])
    if (get().projectId !== projectId) return
    if (fail('بارگذاری منابع', r.error ?? a.error ?? c.error)) { set({ loading: false }); return }
    const ids = ((fc.data ?? []) as unknown as Row[]).map((x) => x.id)
    let fin: { date: string; amount: number }[] = []
    if (ids.length) {
      const p = await supabase.from('fin_payment_certificates').select('certificate_date, gross_amount, certified_amount, status, certificate_type').in('contract_id', ids)
      fin = ((p.data ?? []) as unknown as Row[]).filter((x) => x.certificate_type === 'work' && x.status !== 'draft' && x.status !== 'rejected' && x.certificate_date).map((x) => ({ date: x.certificate_date as string, amount: Number(x.certified_amount ?? x.gross_amount ?? 0) }))
    }
    if (get().projectId !== projectId) return
    set({
      loading: false, financeCosts: fin,
      resources: ((r.data ?? []) as unknown as Row[]).map(mapRes),
      assignments: ((a.data ?? []) as unknown as Row[]).map((x): Assignment => ({ id: x.id, activityUid: x.activity_uid, resourceId: x.resource_id, unitsPerDay: Number(x.units_per_day) })),
      costs: ((c.data ?? []) as unknown as Row[]).map((x): CostEntry => ({ id: x.id, date: x.cost_date, amount: Number(x.amount), note: x.note ?? '' })),
    })
  },
  saveResource: async (x) => {
    const projectId = get().projectId!
    const row = { project_id: projectId, name: x.name, kind: x.kind, unit: x.unit, max_units: x.maxUnits, rate_per_day: x.ratePerDay, exec_match: x.execMatch }
    const q = x.id ? await supabase.from('sch_resources').update(row).eq('id', x.id).select('*').single() : await supabase.from('sch_resources').insert(row).select('*').single()
    if (fail('ثبت منبع', q.error)) return false
    const saved = mapRes(q.data as Row)
    set({ resources: [...get().resources.filter((y) => y.id !== saved.id), saved].sort((p, q2) => p.name.localeCompare(q2.name, 'fa')) }); return true
  },
  removeResource: async (id) => { const { error } = await supabase.from('sch_resources').delete().eq('id', id); if (fail('حذف منبع', error)) return false; set({ resources: get().resources.filter((x) => x.id !== id), assignments: get().assignments.filter((x) => x.resourceId !== id) }); return true },
  saveAssignment: async (a) => {
    const projectId = get().projectId!
    const q = await supabase.from('sch_assignments').upsert({ project_id: projectId, activity_uid: a.activityUid, resource_id: a.resourceId, units_per_day: a.unitsPerDay }, { onConflict: 'activity_uid,resource_id' }).select('*').single()
    if (fail('ثبت تخصیص منبع', q.error)) return false
    const x = q.data as Row
    set({ assignments: [...get().assignments.filter((y) => !(y.activityUid === a.activityUid && y.resourceId === a.resourceId)), { id: x.id, activityUid: x.activity_uid, resourceId: x.resource_id, unitsPerDay: Number(x.units_per_day) }] }); return true
  },
  removeAssignment: async (id) => { const { error } = await supabase.from('sch_assignments').delete().eq('id', id); if (fail('حذف تخصیص', error)) return false; set({ assignments: get().assignments.filter((x) => x.id !== id) }); return true },
  addCost: async (date, amount, note) => {
    const projectId = get().projectId!
    const q = await supabase.from('sch_actual_costs').insert({ project_id: projectId, cost_date: date, amount, note }).select('*').single()
    if (fail('ثبت هزینهٔ واقعی', q.error)) return false
    const x = q.data as Row
    set({ costs: [...get().costs, { id: x.id, date: x.cost_date, amount: Number(x.amount), note: x.note ?? '' }].sort((p, q2) => p.date.localeCompare(q2.date)) }); return true
  },
  removeCost: async (id) => { const { error } = await supabase.from('sch_actual_costs').delete().eq('id', id); if (fail('حذف هزینه', error)) return false; set({ costs: get().costs.filter((x) => x.id !== id) }); return true },
}))
