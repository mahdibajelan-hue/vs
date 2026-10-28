/**
 * Facts for the analysis center, the report composer and the assistant: one ProjectFacts per project the user can
 * read. Everything is read through the user's own session, so row-level security decides what is visible — the
 * analysis never sees a project the user cannot open. Facts stay in memory for the session (not in browser storage:
 * they include contract figures and names).
 */
import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { batchedRows } from '../../../lib/batchedQuery'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { loadEvidenceReport } from '../lib/evidenceLoader'
import type { ChangeFact, IssueFact, ProjectFacts } from '../lib/analyticsCore'
import type { MasterProject } from '../../masterdata/types'

export type CauseVerdict = 'confirmed' | 'rejected' | 'needs_data'
export interface CauseReview { key: string; verdict: CauseVerdict; note: string; reviewedBy: string | null; reviewedAt: string }
export interface ReportConfigRow { id: string; name: string; config: Record<string, unknown>; shared: boolean; createdBy: string; updatedAt: string }

const FRESH_MS = 10 * 60 * 1000

interface AnalyticsState {
  facts: Map<string, ProjectFacts>
  failed: string[]
  progress: { done: number; total: number }
  loadedAt: number | null
  loading: boolean
  reviews: Map<string, CauseReview>
  accepted: Map<string, string>
  configs: ReportConfigRow[]
  load: (force?: boolean) => Promise<void>
  loadReviews: () => Promise<void>
  reviewCause: (projectId: string, key: string, text: string, verdict: CauseVerdict, note: string) => Promise<string | null>
  registerSuggestion: (s: { projectId: string; key: string; origin: 'rule' | 'statistical'; title: string; priority: string; due: string; payload: Record<string, unknown> }) => Promise<string | null>
  loadConfigs: () => Promise<void>
  saveConfig: (name: string, config: Record<string, unknown>, shared: boolean, id?: string) => Promise<string | null>
}

async function factsOf(p: MasterProject): Promise<ProjectFacts> {
  const md = useMasterDataStore.getState()
  const [{ report, input, metrics, bundle, names }, chg] = await Promise.all([
    loadEvidenceReport(p.id, p.officialName),
    batchedRows({ table: 'chg_change_requests', column: 'master_project_id', select: 'id, cr_number, title, status, submitted_at, approved_change_amount, proposed_change_amount, approved_schedule_impact_days, proposed_schedule_impact_days' }, [p.id]).catch(() => null),
  ])
  const who = (id: string | null | undefined) => (id ? names.get(id) ?? null : null)
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
  const epc = metrics?.epc
  const w = epc?.weights ?? { e: 1, p: 1, c: 1 }
  const disciplines: ProjectFacts['disciplines'] = []
  if (epc?.eng) disciplines.push({ key: 'engineering', actual: epc.eng.actual, planned: epc.eng.planned, weight: w.e })
  if (epc?.proc) disciplines.push({ key: 'procurement', actual: epc.proc.actual, planned: epc.proc.planned, weight: w.p })
  if (epc?.cons) disciplines.push({ key: 'construction', actual: epc.cons.actual, planned: epc.cons.planned, weight: w.c })
  const issues: IssueFact[] | null = bundle?.issues ? bundle.issues.issues.map((i) => ({
    id: i.id, title: i.title, status: i.status, priority: i.priority, category: i.category ?? null, due: i.resolveDueDate ?? i.deadlineDate ?? null,
    createdAt: i.identifiedAt ?? i.createdAt, closedAt: i.closedAt, owner: who(i.ownerId ?? i.pursuerId),
  })) : null
  const changes: ChangeFact[] | null = chg ? chg.map((c) => ({
    id: String(c.id), number: String(c.cr_number ?? ''), title: String(c.title ?? ''), status: String(c.status ?? ''), submittedAt: (c.submitted_at as string) ?? null,
    approvedCost: num(c.approved_change_amount), proposedCost: num(c.proposed_change_amount), approvedDays: num(c.approved_schedule_impact_days), proposedDays: num(c.proposed_schedule_impact_days),
  })) : null
  const program = md.programs.find((x) => x.id === p.programId), portfolio = md.portfolios.find((x) => x.id === p.portfolioId)
  return {
    id: p.id, name: p.officialName,
    program: program ? { id: program.id, name: program.name } : null,
    portfolio: portfolio ? { id: portfolio.id, name: portfolio.name } : null,
    location: p.location ?? '', projectType: p.projectType ?? '', contractType: p.contractType ?? '',
    contractor: md.organizations.find((o) => o.id === p.contractorOrgId)?.name ?? null,
    contractValue: p.contractValue, manager: who(p.projectManagerId),
    phase: metrics?.current ? { code: metrics.current.code, title: metrics.current.title } : null,
    disciplines, issues, changes, input, report,
  }
}

export const useAnalyticsStore = create<AnalyticsState>()((set, get) => ({
  facts: new Map(), failed: [], progress: { done: 0, total: 0 }, loadedAt: null, loading: false,
  reviews: new Map(), accepted: new Map(), configs: [],

  load: async (force = false) => {
    const st = get()
    if (st.loading) return
    if (!force && st.loadedAt && Date.now() - st.loadedAt < FRESH_MS) return
    const md = useMasterDataStore.getState()
    if (!md.loaded) await md.fetchAll()
    // the projects the database says this user may open — some module tables (lifecycle, contracts) are readable more
    // widely than the project itself, so the analysis is limited here and fails closed if the check cannot run
    const acc = await supabase.rpc('rp_accessible_projects')
    if (acc.error) { set({ loading: false, loadedAt: Date.now(), facts: new Map(), failed: ['بررسی دسترسی پروژه‌ها انجام نشد؛ تحلیلی نمایش داده نمی‌شود'] }); return }
    const allowed = new Set(((acc.data ?? []) as unknown[]).map((r) => String(typeof r === 'object' && r ? Object.values(r)[0] : r)))
    const projects = useMasterDataStore.getState().projects.filter((p) => allowed.has(p.id))
    set({ loading: true, progress: { done: 0, total: projects.length }, failed: [] })
    const next = new Map<string, ProjectFacts>()
    const failed: string[] = []
    // every project starts together so the batched loaders send one query per table for the whole set
    await Promise.all(projects.map(async (p) => {
      try { next.set(p.id, await factsOf(p)) } catch { failed.push(p.officialName) }
      set((s) => ({ progress: { ...s.progress, done: s.progress.done + 1 } }))
    }))
    set({ facts: next, failed, loading: false, loadedAt: Date.now() })
    void get().loadReviews()
  },

  loadReviews: async () => {
    const [r, l] = await Promise.all([
      supabase.from('rp_cause_reviews').select('master_project_id, cause_key, verdict, note, reviewed_by, reviewed_at'),
      supabase.from('rp_suggestion_log').select('master_project_id, suggestion_key, action_id'),
    ])
    const reviews = new Map<string, CauseReview>()
    for (const x of (r.data ?? []) as Record<string, string>[]) reviews.set(`${x.master_project_id}|${x.cause_key}`, { key: x.cause_key, verdict: x.verdict as CauseVerdict, note: x.note, reviewedBy: x.reviewed_by, reviewedAt: x.reviewed_at })
    const accepted = new Map<string, string>()
    for (const x of (l.data ?? []) as Record<string, string>[]) accepted.set(`${x.master_project_id}|${x.suggestion_key}`, x.action_id)
    set({ reviews, accepted })
  },

  reviewCause: async (projectId, key, text, verdict, note) => {
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('rp_cause_reviews').upsert({ master_project_id: projectId, cause_key: key, cause_text: text.slice(0, 500), verdict, note, reviewed_by: u.user?.id, reviewed_at: new Date().toISOString() }, { onConflict: 'master_project_id,cause_key' })
    if (error) return error.message.includes('row-level security') ? 'بازبینی علت فقط برای نقش‌های بازبین گزارش (مدیر طرح، کنترل پروژه، مدیر) مجاز است' : error.message
    set((s) => ({ reviews: new Map(s.reviews).set(`${projectId}|${key}`, { key, verdict, note, reviewedBy: u.user?.id ?? null, reviewedAt: new Date().toISOString() }) }))
    return null
  },

  // registering is always a person's explicit act: the suggestion becomes a management action, and the log keeps
  // which suggestion (and which rule) it came from so a proposal is never mistaken for a decided action
  registerSuggestion: async (s) => {
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('rasta_actions').insert({ master_project_id: s.projectId, title: s.title.slice(0, 300), priority: s.priority, due_date: s.due, status: 'not_started', source: 'management_report', created_by: u.user?.id }).select('id').single()
    if (error || !data) return error?.message ?? 'ثبت نشد'
    await supabase.from('rp_suggestion_log').insert({ master_project_id: s.projectId, suggestion_key: s.key, origin: s.origin, payload: s.payload, action_id: data.id, accepted_by: u.user?.id })
    set((st) => ({ accepted: new Map(st.accepted).set(`${s.projectId}|${s.key}`, String(data.id)) }))
    return null
  },

  loadConfigs: async () => {
    const { data } = await supabase.from('rp_report_configs').select('id, name, config, shared, created_by, updated_at').eq('archived', false).order('updated_at', { ascending: false })
    set({ configs: ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name), config: (r.config as Record<string, unknown>) ?? {}, shared: !!r.shared, createdBy: String(r.created_by), updatedAt: String(r.updated_at) })) })
  },

  saveConfig: async (name, config, shared, id) => {
    const { data: u } = await supabase.auth.getUser()
    const row = { name, config, shared, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('rp_report_configs').update(row).eq('id', id) : await supabase.from('rp_report_configs').insert({ ...row, created_by: u.user?.id })
    if (error) return error.message
    await get().loadConfigs()
    return null
  },
}))
