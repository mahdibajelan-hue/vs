import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { loadProjectMetrics } from '../../projectMetrics/projectMetricsLoader'
import { HEALTH_DIMENSION_LABEL_FA } from '../../lifecycle/types'
import { DEFAULT_WEIGHTS, type PfDecision, type PfDecisionKind, type PfScore, type PfSnapshot, type PfWeights } from '../lib/portfolioCore'

/**
 * Portfolio module state: governance rows (weights, scores, decisions) and every project's snapshot from the project
 * dashboard's own engine. Snapshots load a few at a time and fill in as they arrive; one project failing leaves its
 * row as «بدون دادهٔ عملکرد» instead of breaking the page.
 */

type Row = Record<string, unknown>
const report = (action: string, error: { message: string } | null) => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

const decisionFromRow = (r: Row): PfDecision => ({
  id: String(r.id), projectId: String(r.master_project_id), decision: r.decision as PfDecisionKind,
  rationale: String(r.rationale ?? ''), conditions: String(r.conditions ?? ''), reviewBy: (r.review_by as string) ?? null,
  healthAtDecision: (r.health_at_decision as string) ?? null, priorityAtDecision: r.priority_at_decision == null ? null : Number(r.priority_at_decision),
  voided: !!r.voided, voidReason: String(r.void_reason ?? ''), decidedBy: (r.decided_by as string) ?? null, decidedAt: String(r.decided_at),
})

// all projects start together so the batched loaders (lib/batchedQuery) send one query per table for the whole
// portfolio instead of one per project
const CONCURRENCY = 24
const CACHE_KEY = 'farin.pf.snapshots.v2'
const CACHE_MAX_AGE = 12 * 3600 * 1000
function readCache(): { at: number; data: Record<string, PfSnapshot | null> } | null {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); return c && Date.now() - c.at < CACHE_MAX_AGE ? c : null } catch { return null }
}
function writeCache(m: Map<string, PfSnapshot | null>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: Object.fromEntries(m) })) } catch { /* storage full or blocked: the page still works */ }
}

interface PortfolioState {
  loaded: boolean
  weights: PfWeights
  scores: Map<string, PfScore>
  decisions: PfDecision[]
  names: Map<string, string>
  canGovern: boolean
  canScore: boolean
  snapshots: Map<string, PfSnapshot | null>
  snapshotProgress: { done: number; total: number }
  /** when the shown snapshots came from this browser's last visit (shown at once, refreshed in the background) */
  cachedAt: number | null
  loadGovernance: () => Promise<void>
  loadSnapshots: (projectIds: string[]) => Promise<void>
  saveWeights: (w: PfWeights) => Promise<boolean>
  saveScore: (projectId: string, s: Pick<PfScore, 'strategic' | 'benefit' | 'mandatory' | 'note'>) => Promise<boolean>
  recordDecision: (d: { projectId: string; decision: PfDecisionKind; rationale: string; conditions: string; reviewBy: string | null; healthAtDecision: string; priorityAtDecision: number | null }) => Promise<boolean>
  voidDecision: (id: string, reason: string) => Promise<boolean>
}

let snapshotRun = 0

/** the EPC curve reduced to month-end points of the last 12 months (plus today) — enough for the portfolio trend */
function trendOf(curve: { date: string; planned: number; earned: number | null }[]) {
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  return curve.filter((p) => p.date >= from && p.date <= today).map((p) => ({ date: p.date, planned: Math.round(p.planned * 10) / 10, earned: p.earned == null ? null : Math.round(p.earned * 10) / 10 })).slice(-14)
}

export const usePortfolioStore = create<PortfolioState>()((set, get) => ({
  loaded: false,
  weights: DEFAULT_WEIGHTS,
  scores: new Map(),
  decisions: [],
  names: new Map(),
  canGovern: false,
  canScore: false,
  snapshots: new Map(),
  snapshotProgress: { done: 0, total: 0 },
  cachedAt: null,

  loadGovernance: async () => {
    const [st, sc, dc, gov, sco, pf] = await Promise.all([
      supabase.from('pf_settings').select('weights').eq('id', true).maybeSingle(),
      supabase.from('pf_project_scores').select('*'),
      supabase.from('pf_decisions').select('*').order('decided_at', { ascending: false }),
      supabase.rpc('pf_can_govern'),
      supabase.rpc('pf_can_score'),
      supabase.from('profiles').select('id, full_name, email'),
    ])
    report('بارگذاری تنظیمات سبد', st.error); report('بارگذاری امتیاز پروژه‌ها', sc.error); report('بارگذاری تصمیم‌های سبد', dc.error)
    const w = (st.data?.weights ?? null) as Partial<PfWeights> | null
    set({
      loaded: true,
      weights: { ...DEFAULT_WEIGHTS, ...(w ?? {}) },
      scores: new Map(((sc.data ?? []) as Row[]).map((r) => [String(r.master_project_id), {
        strategic: r.strategic == null ? null : Number(r.strategic), benefit: r.benefit == null ? null : Number(r.benefit),
        mandatory: !!r.mandatory, note: String(r.note ?? ''), updatedAt: (r.updated_at as string) ?? null, updatedBy: (r.updated_by as string) ?? null,
      }])),
      decisions: ((dc.data ?? []) as Row[]).map(decisionFromRow),
      canGovern: gov.data === true,
      canScore: sco.data === true,
      names: new Map(((pf.data ?? []) as Row[]).map((r) => [String(r.id), String(r.full_name || r.email || '')])),
    })
  },

  loadSnapshots: async (ids) => {
    const run = ++snapshotRun
    // stale-while-revalidate: show the last visit's figures at once, then recompute everything in the background
    let todo = ids.filter((id) => !get().snapshots.has(id))
    if (get().snapshots.size === 0) {
      const c = readCache()
      if (c) {
        set({ snapshots: new Map(Object.entries(c.data)), cachedAt: c.at })
        todo = ids
      }
    }
    set({ snapshotProgress: { done: ids.length - todo.length, total: ids.length } })
    let i = 0
    const worker = async () => {
      while (i < todo.length && run === snapshotRun) {
        const id = todo[i++]
        let snap: PfSnapshot | null = null
        try {
          const m = await loadProjectMetrics(id)
          if (m) {
            snap = {
              health: m.health?.status ?? null,
              healthScore: m.health ? m.health.score : null,
              drivenBy: m.health?.drivenBy ? HEALTH_DIMENSION_LABEL_FA[m.health.drivenBy] : null,
              // without an EPC budget the indexes are not measured — keep them null, never a 0 that reads as «far behind»
              spi: m.evm.bac > 0 ? m.evm.spi : null, cpi: m.evm.bac > 0 ? m.evm.cpi : null, bacEvm: m.evm.bac, eac: m.evm.bac > 0 ? m.evm.eac : null,
              blockers: m.health?.blockers ?? [],
              actual: m.lifecycle.actual, planned: m.lifecycle.planned,
              phase: m.current ? { code: m.current.code, title: m.current.title } : null,
              ac: m.evm.bac > 0 ? m.evm.ac : null,
              trend: trendOf(m.curve),
            }
          }
        } catch { snap = null }
        if (run !== snapshotRun) return
        set((s) => {
          const snapshots = new Map(s.snapshots); snapshots.set(id, snap)
          return { snapshots, snapshotProgress: { done: s.snapshotProgress.done + 1, total: s.snapshotProgress.total } }
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker))
    if (run === snapshotRun) { writeCache(get().snapshots); set({ cachedAt: null }) }
  },

  saveWeights: async (w) => {
    const { error } = await supabase.from('pf_settings').upsert({ id: true, weights: w, updated_at: new Date().toISOString() })
    if (report('ذخیرهٔ وزن معیارها', error)) return false
    set({ weights: w })
    return true
  },

  saveScore: async (projectId, s) => {
    const { error } = await supabase.from('pf_project_scores').upsert({ master_project_id: projectId, strategic: s.strategic, benefit: s.benefit, mandatory: s.mandatory, note: s.note, updated_at: new Date().toISOString() })
    if (report('ذخیرهٔ امتیاز پروژه', error)) return false
    const { data: u } = await supabase.auth.getUser()
    set((st) => { const scores = new Map(st.scores); scores.set(projectId, { ...s, updatedAt: new Date().toISOString(), updatedBy: u.user?.id ?? null }); return { scores } })
    return true
  },

  recordDecision: async (d) => {
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('pf_decisions').insert({
      master_project_id: d.projectId, decision: d.decision, rationale: d.rationale.trim(), conditions: d.conditions.trim(),
      review_by: d.reviewBy, health_at_decision: d.healthAtDecision, priority_at_decision: d.priorityAtDecision, decided_by: u.user?.id,
    }).select('*').single()
    if (report('ثبت تصمیم سبد', error) || !data) return false
    set((s) => ({ decisions: [decisionFromRow(data as Row), ...s.decisions] }))
    return true
  },

  voidDecision: async (id, reason) => {
    const { error } = await supabase.from('pf_decisions').update({ voided: true, void_reason: reason.trim() }).eq('id', id)
    if (report('ابطال تصمیم', error)) return false
    set((s) => ({ decisions: s.decisions.map((d) => (d.id === id ? { ...d, voided: true, voidReason: reason.trim() } : d)) }))
    return true
  },
}))
