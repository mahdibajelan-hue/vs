import { supabase } from '../../../lib/supabaseClient'
import { stageGateRadarSection, type SgRadarSection } from './stageGateRadarCore'
import { sgProgress } from '../../../modules/stagegate/sgProgress'
import { loadEpcProgress } from '../../../modules/epc/epcProgressLoader'
import type { EpcProgress } from '../../../modules/epc/epcProgress'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))

/** The Stage-Gate picture of a master project (through sg_projects.master_project_id); null when it has none. */
export async function loadStageGateRadar(masterProjectId: string): Promise<(SgRadarSection & { epc: EpcProgress }) | null> {
  const { data: proj } = await supabase.from('sg_projects').select('name').eq('master_project_id', masterProjectId).maybeSingle()
  const name = (proj as Row | null)?.name
  if (!name) return null
  const project = s(name)
  const [ph, ob, out, cr, it, dc, pr, sc, rep] = await Promise.all([
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title, gate_name, progress_engine').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    supabase.from('sg_lifecycle_outputs').select('id, phase_code').eq('is_active', true),
    supabase.from('sg_lifecycle_criteria').select('id, phase_code').eq('is_active', true),
    supabase.from('sg_project_phase_items').select('phase_code, kind, item_id, status, updated_at, updated_by').eq('project_name', project),
    supabase.from('sg_lifecycle_gate_decisions').select('phase_code, decision, decided_at, decided_by').eq('project_name', project),
    supabase.from('sg_project_lifecycle_phases').select('phase_code, gate_status, actual_start, actual_finish, planned_start, planned_finish, manual_actual_pct, weight_pct').eq('project_name', project),
    supabase.from('sg_lifecycle_schedule_items').select('id, phase_code, parent_id, weight_pct, manual_actual_pct').eq('project_name', project),
    supabase.from('sg_client_reports').select('*').eq('project_name', project).order('created_at', { ascending: false }).limit(1),
  ])
  if (ph.error || !ph.data?.length) return null
  const num = (v: unknown) => (v == null ? null : Number(v))
  const clientReport = ((rep.data ?? []) as Row[])[0] ?? null
  const epc = await loadEpcProgress(masterProjectId, clientReport)
  const prog = sgProgress({
    phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), engine: s(r.progress_engine) })),
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ phase: s(r.phase_code), plannedStart: r.planned_start ? s(r.planned_start) : null, plannedFinish: r.planned_finish ? s(r.planned_finish) : null, manualPct: num(r.manual_actual_pct), weightPct: num(r.weight_pct) })),
    schedule: ((sc.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), parentId: num(r.parent_id), weightPct: num(r.weight_pct), manualPct: num(r.manual_actual_pct) })),
    clientReport,
    epcLive: epc.overall,
  })
  const sec = stageGateRadarSection({
    project, engine: { phases: prog.phases, overall: prog.overall.actual, overallPlanned: prog.overall.planned },
    phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), sort: Number(r.sort_order), title: s(r.title), gateName: s(r.gate_name).replace(/\s*\[NEEDS REVIEW\]/i, '') })),
    steps: ((ob.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), seq: Number(r.seq), title: s(r.title) })),
    prereqs: [
      ...((out.data ?? []) as Row[]).map((r) => ({ phase: s(r.phase_code), kind: 'output' as const, id: Number(r.id) })),
      ...((cr.data ?? []) as Row[]).map((r) => ({ phase: s(r.phase_code), kind: 'criterion' as const, id: Number(r.id) })),
    ],
    items: ((it.data ?? []) as Row[]).map((r) => ({ project, phase: s(r.phase_code), kind: s(r.kind), itemId: Number(r.item_id), status: s(r.status), updatedAt: r.updated_at ? s(r.updated_at) : null, updatedBy: r.updated_by ? s(r.updated_by) : null })),
    decisions: ((dc.data ?? []) as Row[]).map((r) => ({ project, phase: s(r.phase_code), decision: s(r.decision), decidedAt: s(r.decided_at), decidedBy: r.decided_by ? s(r.decided_by) : null })),
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project, phase: s(r.phase_code), gateStatus: r.gate_status ? s(r.gate_status) : null, actualStart: r.actual_start ? s(r.actual_start) : null, actualFinish: r.actual_finish ? s(r.actual_finish) : null, plannedFinish: r.planned_finish ? s(r.planned_finish) : null, manualPct: r.manual_actual_pct == null ? null : Number(r.manual_actual_pct) })),
  })
  return sec && { ...sec, epc }
}
