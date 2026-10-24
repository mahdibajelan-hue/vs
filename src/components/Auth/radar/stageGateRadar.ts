import { supabase } from '../../../lib/supabaseClient'
import { stageGateRadarSection, type SgRadarSection } from './stageGateRadarCore'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))

/** The Stage-Gate picture of a master project (through sg_projects.master_project_id); null when it has none. */
export async function loadStageGateRadar(masterProjectId: string): Promise<SgRadarSection | null> {
  const { data: proj } = await supabase.from('sg_projects').select('name').eq('master_project_id', masterProjectId).maybeSingle()
  const name = (proj as Row | null)?.name
  if (!name) return null
  const project = s(name)
  const [ph, ob, out, cr, it, dc, pr] = await Promise.all([
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title, gate_name').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    supabase.from('sg_lifecycle_outputs').select('id, phase_code').eq('is_active', true),
    supabase.from('sg_lifecycle_criteria').select('id, phase_code').eq('is_active', true),
    supabase.from('sg_project_phase_items').select('phase_code, kind, item_id, status, updated_at, updated_by').eq('project_name', project),
    supabase.from('sg_lifecycle_gate_decisions').select('phase_code, decision, decided_at, decided_by').eq('project_name', project),
    supabase.from('sg_project_lifecycle_phases').select('phase_code, gate_status, actual_start, actual_finish, planned_finish, manual_actual_pct').eq('project_name', project),
  ])
  if (ph.error || !ph.data?.length) return null
  return stageGateRadarSection({
    project,
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
}
