import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { DepType } from '../lib/cpm'
import type { MasterSchedule, StrategyKey, GovStatus } from '../lib/strategy'
import type { BaselineRow, TemplateNode } from '../lib/planTree'

/** Plan-side data that sits next to plc_activities: dependencies, frozen baselines, success
 * templates, and the execution strategy with its immutable schedule versions. */

export interface PlanDep { id: string; projectId: string; fromId: string; toId: string; type: DepType; lag: number }
export interface PlanBaseline { id: string; projectId: string; label: string; rows: BaselineRow[]; createdAt: string }
export interface PlanTemplate { id: string; name: string; description: string; nodes: TemplateNode[]; createdAt: string }
export interface ProjectStrategy { projectId: string; strategy: StrategyKey; startDate: string | null; govStatus: GovStatus; durations: number[] | null }
export interface ScheduleVersionRow {
  id: string; projectId: string; label: string; strategy: StrategyKey; startDate: string
  commissioningStart: string; finishDate: string; totalDays: number; note: string; createdAt: string
}

function fail(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

interface PlanState {
  deps: PlanDep[]
  baselines: PlanBaseline[]
  templates: PlanTemplate[]
  strategy: ProjectStrategy | null
  versions: ScheduleVersionRow[]
  loadedFor: string | null

  load: (projectId: string) => Promise<void>
  addDep: (projectId: string, fromId: string, toId: string, type: DepType, lag: number) => Promise<void>
  removeDep: (projectId: string, id: string) => Promise<void>
  takeBaseline: (projectId: string, label: string, rows: BaselineRow[]) => Promise<void>
  saveTemplate: (name: string, description: string, nodes: TemplateNode[]) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  saveStrategy: (s: ProjectStrategy) => Promise<void>
  recordVersion: (projectId: string, label: string, strategy: StrategyKey, sched: MasterSchedule, note: string) => Promise<void>
}

export const usePlanStore = create<PlanState>()((set, get) => ({
  deps: [], baselines: [], templates: [], strategy: null, versions: [], loadedFor: null,

  load: async (projectId) => {
    const [d, b, t, s, v] = await Promise.all([
      supabase.from('plc_activity_deps').select('*').eq('project_id', projectId),
      supabase.from('plc_plan_baselines').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('plc_plan_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('plc_project_strategy').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('plc_schedule_versions').select('*').eq('project_id', projectId).order('created_at'),
    ])
    set({
      loadedFor: projectId,
      deps: (d.data ?? []).map((r) => ({ id: r.id, projectId: r.project_id, fromId: r.from_id, toId: r.to_id, type: r.dep_type as DepType, lag: r.lag_days })),
      baselines: (b.data ?? []).map((r) => ({ id: r.id, projectId: r.project_id, label: r.label, rows: r.rows as BaselineRow[], createdAt: r.created_at })),
      templates: (t.data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description ?? '', nodes: r.nodes as TemplateNode[], createdAt: r.created_at })),
      strategy: s.data ? {
        projectId, strategy: s.data.strategy as StrategyKey, startDate: s.data.start_date,
        govStatus: s.data.gov_status as GovStatus, durations: (s.data.durations as number[] | null) ?? null,
      } : null,
      versions: (v.data ?? []).map((r) => ({
        id: r.id, projectId: r.project_id, label: r.label, strategy: r.strategy as StrategyKey, startDate: r.start_date,
        commissioningStart: r.commissioning_start, finishDate: r.finish_date, totalDays: r.total_days, note: r.note ?? '', createdAt: r.created_at,
      })),
    })
  },

  addDep: async (projectId, fromId, toId, type, lag) => {
    const { error } = await supabase.from('plc_activity_deps').upsert(
      { project_id: projectId, from_id: fromId, to_id: toId, dep_type: type, lag_days: lag }, { onConflict: 'from_id,to_id' })
    if (fail('ثبت وابستگی', error)) return
    await get().load(projectId)
  },

  removeDep: async (projectId, id) => {
    const { error } = await supabase.from('plc_activity_deps').delete().eq('id', id)
    if (fail('حذف وابستگی', error)) return
    await get().load(projectId)
  },

  takeBaseline: async (projectId, label, rows) => {
    const { error } = await supabase.from('plc_plan_baselines').insert({ project_id: projectId, label, rows })
    if (fail('ثبت خط مبنا', error)) return
    await get().load(projectId)
  },

  saveTemplate: async (name, description, nodes) => {
    const { error } = await supabase.from('plc_plan_templates').insert({ name, description, nodes })
    if (fail('ذخیره قالب برنامه', error)) return
    const { data } = await supabase.from('plc_plan_templates').select('*').order('created_at', { ascending: false })
    set({ templates: (data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description ?? '', nodes: r.nodes as TemplateNode[], createdAt: r.created_at })) })
  },

  deleteTemplate: async (id) => {
    const { error } = await supabase.from('plc_plan_templates').delete().eq('id', id)
    if (fail('حذف قالب', error)) return
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
  },

  saveStrategy: async (s) => {
    const { error } = await supabase.from('plc_project_strategy').upsert({
      project_id: s.projectId, strategy: s.strategy, start_date: s.startDate, gov_status: s.govStatus,
      durations: s.durations, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' })
    if (fail('ذخیره راهبرد اجرا', error)) return
    set({ strategy: s })
  },

  recordVersion: async (projectId, label, strategy, sched, note) => {
    const { error } = await supabase.from('plc_schedule_versions').insert({
      project_id: projectId, label, strategy, start_date: sched.startDate,
      commissioning_start: sched.commissioningStart, finish_date: sched.finishDate, total_days: sched.totalDays,
      snapshot: sched.gates.map((g) => ({ code: g.code, start: g.start, finish: g.finish, days: g.days, critical: g.critical })), note,
    })
    if (fail('ثبت نسخه زمان‌بندی', error)) return
    await get().load(projectId)
  },
}))
