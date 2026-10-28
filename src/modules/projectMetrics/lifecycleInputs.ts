import { batchedRows, shared, sortBy } from '../../lib/batchedQuery'
import { supabase } from '../../lib/supabaseClient'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const sn = (v: unknown) => (v == null || v === '' ? null : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))

export interface LcPhaseDef { code: string; sort: number; title: string; gateName: string; engine: string }
export interface LcPhaseRow { phase: string; weightPct: number | null; plannedStart: string | null; plannedFinish: string | null; actualStart: string | null; actualFinish: string | null; manualPct: number | null; gateStatus: string | null }
export interface LcScheduleItem { id: number; phase: string; parentId: number | null; weightPct: number | null; manualPct: number | null; plannedStart: string | null; plannedFinish: string | null }
export interface LcHistory { phase: string; pct: number; at: string }
export interface LifecycleInputs {
  project: string
  phases: LcPhaseDef[]
  phaseRows: LcPhaseRow[]
  schedule: LcScheduleItem[]
  history: LcHistory[]
  clientReport: Record<string, unknown> | null
}

/**
 * Every master project has a lifecycle: its Stage-Gate project (sg_projects.master_project_id). A project that has none
 * yet gets one on first use, named after the project, so the lifecycle, the radar and the dashboard always have one.
 */
export async function ensureLifecycleProject(masterProjectId: string): Promise<string | null> {
  const [data] = await batchedRows({ table: 'sg_projects', column: 'master_project_id', select: 'name, master_project_id' }, masterProjectId)
  if (data) return s((data as Row).name)
  const { data: mp } = await supabase.from('master_projects').select('official_name, status').eq('id', masterProjectId).maybeSingle()
  if (!mp) return null
  const name = s((mp as Row).official_name)
  const st = s((mp as Row).status)
  const phase = st === 'planning' || st === 'approved' ? 'مهندسی' : st === 'completed' ? 'تکمیل‌شده' : 'اجرا'
  const { error } = await supabase.from('sg_projects').insert({ name, master_project_id: masterProjectId, current_phase: phase })
  return error ? null : name
}

/** The lifecycle rows of one master project (its master plan: phases, phase windows and the schedule items under them). */
export async function loadLifecycleInputs(masterProjectId: string): Promise<LifecycleInputs | null> {
  const project = await ensureLifecycleProject(masterProjectId)
  if (!project) return null
  // batched: every project loading at the same time shares one query per table (see lib/batchedQuery)
  const by = (table: string) => batchedRows({ table, column: 'project_name' }, project)
  const [ph, prRows, scRows, hiRows, repRows] = await Promise.all([
    shared('sg_lifecycle_phases:active', () => supabase.from('sg_lifecycle_phases').select('*').eq('is_active', true).order('sort_order')),
    by('sg_project_lifecycle_phases'),
    by('sg_lifecycle_schedule_items'),
    by('sg_lifecycle_progress_history').then((r) => sortBy(r, 'recorded_at')),
    by('sg_client_reports').then((r) => sortBy(r, 'created_at', true).slice(0, 1)),
  ])
  const pr = { data: prRows }, sc = { data: scRows }, hi = { data: hiRows }, rep = { data: repRows }
  if (ph.error || !ph.data?.length) return null
  return {
    project,
    phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), sort: Number(r.sort_order), title: s(r.title), gateName: s(r.gate_name).replace(/\s*\[NEEDS REVIEW\]/i, ''), engine: s(r.progress_engine) })),
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ phase: s(r.phase_code), weightPct: num(r.weight_pct), plannedStart: sn(r.planned_start), plannedFinish: sn(r.planned_finish), actualStart: sn(r.actual_start), actualFinish: sn(r.actual_finish), manualPct: num(r.manual_actual_pct), gateStatus: sn(r.gate_status) })),
    schedule: ((sc.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), parentId: num(r.parent_id), weightPct: num(r.weight_pct), manualPct: num(r.manual_actual_pct), plannedStart: sn(r.planned_start), plannedFinish: sn(r.planned_finish) })),
    history: ((hi.data ?? []) as Row[]).map((r) => ({ phase: s(r.phase_code), pct: Number(r.new_pct ?? 0), at: s(r.recorded_at).slice(0, 10) })),
    clientReport: ((rep.data ?? []) as Row[])[0] ?? null,
  }
}
