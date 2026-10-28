import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { monthIndex, type ScChoice } from '../lib/scenarioCore'
import type { ResKind, ResPlanRow, ResUsageRow } from '../lib/resourceCore'

/**
 * The planning side of the portfolio (council round 2): saved scenarios, each project's baseline cash plan, and the
 * manpower / equipment really on site from the execution module's approved daily reports.
 */

type Row = Record<string, unknown>
const report = (action: string, error: { message: string } | null) => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

export interface PfScenario {
  id: string
  name: string
  note: string
  caps: Record<number, number>
  choices: Record<string, ScChoice>
  terminationPct: number
  archived: boolean
  createdBy: string | null
  updatedAt: string
}

const scenarioFromRow = (r: Row): PfScenario => ({
  id: String(r.id), name: String(r.name ?? ''), note: String(r.note ?? ''),
  caps: Object.fromEntries(Object.entries((r.caps ?? {}) as Record<string, number>).map(([k, v]) => [Number(k), Number(v)])),
  choices: (r.choices ?? {}) as Record<string, ScChoice>,
  terminationPct: Number(r.termination_pct ?? 0), archived: !!r.archived,
  createdBy: (r.created_by as string) ?? null, updatedAt: String(r.updated_at ?? r.created_at ?? ''),
})

/** how far back the capacity view reads the daily reports */
const RESOURCE_MONTHS = 6

interface PlanningState {
  scenariosLoaded: boolean
  scenarios: PfScenario[]
  /** baseline cash plan in rial, per project → month index → amount */
  cashPlans: Map<string, Map<number, number>>
  resourcesLoaded: boolean
  usage: ResUsageRow[]
  plans: ResPlanRow[]
  loadScenarios: () => Promise<void>
  loadResources: () => Promise<void>
  saveScenario: (s: Omit<PfScenario, 'id' | 'archived' | 'createdBy' | 'updatedAt'> & { id?: string }) => Promise<PfScenario | null>
  archiveScenario: (id: string) => Promise<boolean>
}

export const usePortfolioPlanningStore = create<PlanningState>()((set) => ({
  scenariosLoaded: false,
  scenarios: [],
  cashPlans: new Map(),
  resourcesLoaded: false,
  usage: [],
  plans: [],

  loadScenarios: async () => {
    const [sc, cp] = await Promise.all([
      supabase.from('pf_scenarios').select('*').eq('archived', false).order('updated_at', { ascending: false }),
      supabase.from('fin_cashflow_plans').select('master_project_id, jalali_year, jalali_month, amount').eq('kind', 'baseline').eq('fund', 'rial').not('master_project_id', 'is', null),
    ])
    report('بارگذاری سناریوها', sc.error); report('بارگذاری برنامهٔ نقدی', cp.error)
    const cashPlans = new Map<string, Map<number, number>>()
    for (const r of (cp.data ?? []) as Row[]) {
      const pid = String(r.master_project_id)
      const m = cashPlans.get(pid) ?? new Map<number, number>()
      const k = monthIndex(Number(r.jalali_year), Number(r.jalali_month))
      m.set(k, (m.get(k) ?? 0) + Number(r.amount ?? 0))
      cashPlans.set(pid, m)
    }
    set({ scenariosLoaded: true, scenarios: ((sc.data ?? []) as Row[]).map(scenarioFromRow), cashPlans })
  },

  loadResources: async () => {
    const from = new Date()
    from.setMonth(from.getMonth() - RESOURCE_MONTHS)
    const [u, p] = await Promise.all([
      supabase.rpc('pf_resource_usage', { p_from: from.toISOString().slice(0, 10) }),
      supabase.from('sch_resources').select('project_id, name, kind, max_units, exec_match'),
    ])
    report('بارگذاری منابع اجرا', u.error); report('بارگذاری برنامهٔ منابع', p.error)
    set({
      resourcesLoaded: true,
      usage: ((u.data ?? []) as Row[]).map((r) => ({
        projectId: String(r.project_id), ym: String(r.ym), kind: (r.kind === 'man' ? 'man' : 'equip') as ResKind, name: String(r.name ?? ''),
        days: Number(r.days ?? 0), avgTotal: Number(r.avg_total ?? 0), avgActive: Number(r.avg_active ?? 0), avgIdle: Number(r.avg_idle ?? 0),
        avgUnavailable: Number(r.avg_unavailable ?? 0), peakTotal: Number(r.peak_total ?? 0), lastDate: String(r.last_date ?? ''),
      })),
      plans: ((p.data ?? []) as Row[]).map((r) => ({ projectId: String(r.project_id), name: String(r.name ?? ''), kind: String(r.kind ?? ''), maxUnits: Number(r.max_units ?? 0), execMatch: String(r.exec_match ?? '') })),
    })
  },

  saveScenario: async (s) => {
    const row = { name: s.name.trim(), note: s.note.trim(), caps: s.caps, choices: s.choices, termination_pct: s.terminationPct, updated_at: new Date().toISOString() }
    let res
    if (s.id) res = await supabase.from('pf_scenarios').update(row).eq('id', s.id).select('*').single()
    else {
      const { data: u } = await supabase.auth.getUser()
      res = await supabase.from('pf_scenarios').insert({ ...row, created_by: u.user?.id }).select('*').single()
    }
    if (report('ذخیرهٔ سناریو', res.error) || !res.data) return null
    const saved = scenarioFromRow(res.data as Row)
    set((st) => ({ scenarios: [saved, ...st.scenarios.filter((x) => x.id !== saved.id)] }))
    return saved
  },

  archiveScenario: async (id) => {
    const { error } = await supabase.from('pf_scenarios').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (report('بایگانی سناریو', error)) return false
    set((st) => ({ scenarios: st.scenarios.filter((x) => x.id !== id) }))
    return true
  },
}))
