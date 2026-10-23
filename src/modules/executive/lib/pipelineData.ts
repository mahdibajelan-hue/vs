import { supabase } from '../../../lib/supabaseClient'
import { fetchPages } from '../../supervision/lib/fetchPages'
import type { SgDecision, SgItem, SgPhase, SgPhaseRow, SgStepDef } from './lifecyclePipeline'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => Number(v)

export interface PipelineSource {
  projects: string[]
  phases: SgPhase[]
  steps: SgStepDef[]
  titles: Map<string, string>
  items: SgItem[]
  decisions: SgDecision[]
  phaseRows: SgPhaseRow[]
  /** standard duration per phase, days */
  standardDays: Map<string, number>
  /** the free-text stage Stage-Gate keeps per project (shown as a hint when no gate data exists) */
  stageText: Map<string, string>
  /** email → full name (people the reader may see) */
  names: Map<string, string>
}

/** Everything the lifecycle report needs, in one round (items are paged past PostgREST's 1000-row cap). */
export async function loadPipelineSource(): Promise<{ data: PipelineSource | null; error?: string }> {
  const [pj, ph, ob, out, cr, it, dc, pr, du, pf] = await Promise.all([
    supabase.from('sg_projects').select('name, is_guide, current_phase').order('name'),
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    supabase.from('sg_lifecycle_outputs').select('id, title'),
    supabase.from('sg_lifecycle_criteria').select('id, title'),
    fetchPages<Row>((a, b) => supabase.from('sg_project_phase_items').select('project_name, phase_code, kind, item_id, status, updated_at, updated_by').order('id').range(a, b)),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_gate_decisions').select('project_name, phase_code, decision, decided_at, decided_by').order('id').range(a, b)),
    supabase.from('sg_project_lifecycle_phases').select('project_name, phase_code, gate_status, actual_start'),
    supabase.from('sg_lifecycle_phase_durations').select('phase_code, duration_days'),
    supabase.from('profiles').select('email, full_name'),
  ])
  const err = [pj, ph, ob, it, dc, pr].find((r) => r.error)?.error
  if (err) return { data: null, error: err.message }
  const titles = new Map<string, string>()
  for (const r of (out.data ?? []) as Row[]) titles.set(`output:${s(r.id)}`, s(r.title))
  for (const r of (cr.data ?? []) as Row[]) titles.set(`criterion:${s(r.id)}`, s(r.title))
  return {
    data: {
      projects: ((pj.data ?? []) as Row[]).filter((r) => !r.is_guide).map((r) => s(r.name)),
      phases: ((ph.data ?? []) as Row[]).map((r) => ({ code: s(r.code), sort: n(r.sort_order), title: s(r.title) })),
      steps: ((ob.data ?? []) as Row[]).map((r) => ({ id: n(r.id), phase: s(r.phase_code), seq: n(r.seq), title: s(r.title) })),
      titles,
      items: it.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), kind: s(r.kind), itemId: n(r.item_id), status: s(r.status), updatedAt: r.updated_at ? s(r.updated_at) : null, updatedBy: r.updated_by ? s(r.updated_by) : null })),
      decisions: dc.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), decision: s(r.decision), decidedAt: s(r.decided_at), decidedBy: r.decided_by ? s(r.decided_by) : null })),
      phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), gateStatus: r.gate_status ? s(r.gate_status) : null, actualStart: r.actual_start ? s(r.actual_start) : null })),
      stageText: new Map(((pj.data ?? []) as Row[]).filter((r) => r.current_phase).map((r) => [s(r.name), s(r.current_phase)])),
      standardDays: new Map(((du.data ?? []) as Row[]).map((r) => [s(r.phase_code), n(r.duration_days)])),
      names: new Map(((pf.data ?? []) as Row[]).filter((r) => r.email && r.full_name).map((r) => [s(r.email).toLowerCase(), s(r.full_name)])),
    },
  }
}
