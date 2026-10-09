import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import type { AuthorityLimit, ChangeException, ChangeHistory, ChangeLink, ChangeRequest, ChangeStep, Route, RouteStep, Rule, RuleAudit, RuleSet, ValidationIssue } from '../types'
import { auditFromRow, contractFromRow, exceptionFromRow, historyFromRow, limitFromRow, linkFromRow, projectFromRow, requestFromRow, requestToRow, routeFromRow, routeStepFromRow, ruleFromRow, ruleSetFromRow, ruleToRow, stepFromRow, type ContractInfo, type ProjectInfo } from '../lib/changeData'
import type { EngineRuleSet } from '../lib/changeRules'
import { friendly } from '../lib/changeFlow'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Result<T = unknown> { ok: boolean; error?: string; id?: string; data?: T }
export interface Person { userId: string; name: string; position: string; organization: string }

async function fetchAll(table: string, build?: (q: any) => any, page = 1000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select('*')
    if (build) q = build(q)
    const { data, error } = await q.range(from, from + page - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return out
}
const me = () => useAuthStore.getState().profile?.id ?? null
const fail = (e: any): Result => ({ ok: false, error: friendly(e) })

export interface RuleBundle { sets: RuleSet[]; routes: Route[]; steps: RouteStep[]; rules: Rule[]; limits: AuthorityLimit[] }

interface State {
  loaded: boolean; loading: boolean; error: string | null
  projects: ProjectInfo[]; contracts: ContractInfo[]; orgs: Map<string, string>; programs: Map<string, string>; people: Person[]
  requests: ChangeRequest[]; steps: ChangeStep[]; links: ChangeLink[]; myRoles: Record<string, string[]>
  activeRules: EngineRuleSet | null; scopeProjectId: string
  setScope: (id: string) => void
  fetchAll: () => Promise<void>
  loadDetail: (id: string) => Promise<{ history: ChangeHistory[]; exceptions: ChangeException[] }>
  createDraft: (d: Partial<ChangeRequest>) => Promise<Result>
  updateDraft: (id: string, d: Partial<ChangeRequest>) => Promise<Result>
  deleteDraft: (id: string) => Promise<Result>
  rpc: (name: string, args: Record<string, unknown>, refreshId?: string) => Promise<Result<any>>
  refreshRequest: (id: string) => Promise<void>
  fetchActiveRules: () => Promise<void>
  loadRuleBundle: () => Promise<RuleBundle>
  loadAudit: () => Promise<RuleAudit[]>
  saveRule: (id: string | null, d: Partial<Rule>) => Promise<Result>
  deleteRow: (table: 'cm_rules' | 'cm_routes' | 'cm_route_steps' | 'cm_authority_limits' | 'cm_rule_sets', id: string) => Promise<Result>
  insertRow: (table: 'cm_routes' | 'cm_route_steps' | 'cm_authority_limits' | 'cm_rule_sets', row: Record<string, unknown>) => Promise<Result>
  updateRow: (table: 'cm_routes' | 'cm_route_steps' | 'cm_authority_limits' | 'cm_rule_sets', id: string, row: Record<string, unknown>) => Promise<Result>
  validateSet: (id: string) => Promise<ValidationIssue[]>
}

export const useChangeStore = create<State>()((set, get) => ({
  loaded: false, loading: false, error: null, projects: [], contracts: [], orgs: new Map(), programs: new Map(), people: [], requests: [], steps: [], links: [], myRoles: {}, activeRules: null, scopeProjectId: 'all',
  setScope: (id) => set({ scopeProjectId: id }),

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [projects, contracts, orgs, programs, reqs, steps, links, roles, people] = await Promise.all([
        fetchAll('master_projects', (q) => q.order('official_name')), fetchAll('fin_contracts'), fetchAll('organizations'), fetchAll('programs'),
        fetchAll('chg_change_requests', (q) => q.order('created_at', { ascending: false })), fetchAll('cm_request_steps', (q) => q.order('seq')), fetchAll('cm_links'),
        supabase.from('rasta_project_role_assignments').select('project_id, rasta_project_roles(name)').eq('user_id', me() ?? '00000000-0000-0000-0000-000000000000'),
        supabase.rpc('im_people', { p_project: null }),
      ])
      const myRoles: Record<string, string[]> = {}
      for (const r of (roles.data ?? []) as any[]) { const n = r.rasta_project_roles?.name; if (n) myRoles[r.project_id] = [...(myRoles[r.project_id] ?? []), n] }
      set({
        projects: projects.map(projectFromRow), contracts: contracts.map(contractFromRow), orgs: new Map(orgs.map((o: any) => [o.id, o.short_name || o.name])), programs: new Map(programs.map((p: any) => [p.id, p.name])),
        requests: reqs.map(requestFromRow), steps: steps.map(stepFromRow), links: links.map(linkFromRow), myRoles,
        people: ((people.data ?? []) as any[]).map((p) => ({ userId: p.id, name: p.full_name || p.email, position: p.position_title ?? '', organization: p.organization ?? '' })), loaded: true, loading: false,
      })
      await get().fetchActiveRules()
    } catch (e: any) { set({ loading: false, loaded: true, error: friendly(e) }) }
  },

  fetchActiveRules: async () => {
    const { data: s } = await supabase.from('cm_rule_sets').select('*').eq('status', 'active').maybeSingle()
    if (!s) { set({ activeRules: null }); return }
    const [routes, rules] = await Promise.all([supabase.from('cm_routes').select('*').eq('rule_set_id', s.id), supabase.from('cm_rules').select('*').eq('rule_set_id', s.id)])
    const ids = ((routes.data ?? []) as any[]).map((r) => r.id)
    const steps = ids.length ? await supabase.from('cm_route_steps').select('*').in('route_id', ids) : { data: [] as any[] }
    set({ activeRules: { set: { id: s.id, version: s.version, name: s.name }, routes: ((routes.data ?? []) as any[]).map(routeFromRow), steps: ((steps.data ?? []) as any[]).map(routeStepFromRow), rules: ((rules.data ?? []) as any[]).map(ruleFromRow) } })
  },

  loadDetail: async (id) => {
    const [h, x] = await Promise.all([supabase.from('chg_history').select('*').eq('change_request_id', id).order('created_at', { ascending: true }), supabase.from('cm_exceptions').select('*').eq('request_id', id).order('requested_at', { ascending: false })])
    return { history: ((h.data ?? []) as any[]).map(historyFromRow), exceptions: ((x.data ?? []) as any[]).map(exceptionFromRow) }
  },

  refreshRequest: async (id) => {
    const [r, s, l] = await Promise.all([supabase.from('chg_change_requests').select('*').eq('id', id).maybeSingle(), supabase.from('cm_request_steps').select('*').eq('request_id', id).order('seq'), supabase.from('cm_links').select('*').eq('request_id', id)])
    set((st) => ({
      requests: r.data ? (st.requests.some((x) => x.id === id) ? st.requests.map((x) => (x.id === id ? requestFromRow(r.data) : x)) : [requestFromRow(r.data), ...st.requests]) : st.requests.filter((x) => x.id !== id),
      steps: [...st.steps.filter((x) => x.requestId !== id), ...((s.data ?? []) as any[]).map(stepFromRow)], links: [...st.links.filter((x) => x.requestId !== id), ...((l.data ?? []) as any[]).map(linkFromRow)],
    }))
  },

  createDraft: async (d) => {
    const { data, error } = await supabase.from('chg_change_requests').insert({ ...requestToRow(d), created_by: me() }).select().single()
    if (error) return fail(error)
    await get().refreshRequest(data.id)
    return { ok: true, id: data.id }
  },
  updateDraft: async (id, d) => {
    const { error } = await supabase.from('chg_change_requests').update(requestToRow(d)).eq('id', id)
    if (error) return fail(error)
    await get().refreshRequest(id)
    return { ok: true, id }
  },
  deleteDraft: async (id) => {
    const { error } = await supabase.from('chg_change_requests').delete().eq('id', id)
    if (error) return fail(error)
    set((st) => ({ requests: st.requests.filter((x) => x.id !== id) }))
    return { ok: true }
  },

  /** Every workflow transition is a server function; the client never writes status/route fields. */
  rpc: async (name, args, refreshId) => {
    const { data, error } = await supabase.rpc(name, args)
    if (error) return fail(error)
    if (refreshId) await get().refreshRequest(refreshId)
    return { ok: true, data }
  },

  loadRuleBundle: async () => {
    const [sets, routes, steps, rules, limits] = await Promise.all([fetchAll('cm_rule_sets', (q) => q.order('version', { ascending: false })), fetchAll('cm_routes'), fetchAll('cm_route_steps', (q) => q.order('seq')), fetchAll('cm_rules', (q) => q.order('code')), fetchAll('cm_authority_limits')])
    return { sets: sets.map(ruleSetFromRow), routes: routes.map(routeFromRow), steps: steps.map(routeStepFromRow), rules: rules.map(ruleFromRow), limits: limits.map(limitFromRow) }
  },
  loadAudit: async () => { const { data } = await supabase.from('cm_rule_audit').select('*').order('at', { ascending: false }).limit(200); return ((data ?? []) as any[]).map(auditFromRow) },
  saveRule: async (id, d) => {
    const row = ruleToRow(d)
    const { data, error } = id ? await supabase.from('cm_rules').update(row).eq('id', id).select().single() : await supabase.from('cm_rules').insert(row).select().single()
    return error ? fail(error) : { ok: true, id: data.id }
  },
  deleteRow: async (table, id) => { const { error } = await supabase.from(table).delete().eq('id', id); return error ? fail(error) : { ok: true } },
  insertRow: async (table, row) => { const { data, error } = await supabase.from(table).insert(row).select().single(); return error ? fail(error) : { ok: true, id: data.id } },
  updateRow: async (table, id, row) => { const { error } = await supabase.from(table).update(row).eq('id', id); return error ? fail(error) : { ok: true, id } },
  validateSet: async (id) => { const { data } = await supabase.rpc('cm_validate_rule_set', { p_set: id }); return (data ?? []) as ValidationIssue[] },
}))
