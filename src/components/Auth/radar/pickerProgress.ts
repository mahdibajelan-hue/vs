import { supabase } from '../../../lib/supabaseClient'
import { fetchPages } from '../../../modules/supervision/lib/fetchPages'
import { pickerProgress, type PickerProgress } from './pickerProgressCore'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))

/** Lifecycle progress of every project linked to Stage-Gate, in one round (for the picker's gauges). */
export async function loadPickerProgress(): Promise<Map<string, PickerProgress>> {
  const [pj, ph, ob, it, dc, pr] = await Promise.all([
    supabase.from('sg_projects').select('name, master_project_id').not('master_project_id', 'is', null),
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title, gate_name').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    fetchPages<Row>((a, b) => supabase.from('sg_project_phase_items').select('project_name, phase_code, kind, item_id, status, updated_at').order('id').range(a, b)),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_gate_decisions').select('project_name, phase_code, decision, decided_at').order('id').range(a, b)),
    supabase.from('sg_project_lifecycle_phases').select('project_name, phase_code, gate_status, actual_start, actual_finish, planned_finish, manual_actual_pct'),
  ])
  if (pj.error || ph.error || !ph.data?.length) return new Map()
  return pickerProgress({
    links: ((pj.data ?? []) as Row[]).map((r) => ({ project: s(r.name), masterId: s(r.master_project_id) })),
    phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), sort: Number(r.sort_order), title: s(r.title), gateName: s(r.gate_name) })),
    steps: ((ob.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), seq: Number(r.seq), title: s(r.title) })),
    items: it.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), kind: s(r.kind), itemId: Number(r.item_id), status: s(r.status), updatedAt: r.updated_at ? s(r.updated_at) : null, updatedBy: null })),
    decisions: dc.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), decision: s(r.decision), decidedAt: s(r.decided_at), decidedBy: null })),
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), gateStatus: r.gate_status ? s(r.gate_status) : null, actualStart: r.actual_start ? s(r.actual_start) : null, actualFinish: r.actual_finish ? s(r.actual_finish) : null, plannedFinish: r.planned_finish ? s(r.planned_finish) : null, manualPct: r.manual_actual_pct == null ? null : Number(r.manual_actual_pct) })),
  })
}
