import { supabase } from '../../../lib/supabaseClient'
import { fetchPages } from '../../../modules/supervision/lib/fetchPages'
import { pickerProgress, type PickerProgress, type PickerSource } from './pickerProgressCore'
import { ensureEpcStores, epcProgressOf } from '../../../modules/epc/epcProgressLoader'
import { weightsFromReport, type EpcProgress } from '../../../modules/epc/epcProgress'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))

/** Progress of every listed project for the picker's gauges: the Stage-Gate lifecycle first (one round), then again
 * once the EPC modules are loaded — their live progress feeds the EPC phase and gauges projects outside Stage-Gate. */
export async function loadPickerProgress(projectIds: string[], onFirst?: (m: Map<string, PickerProgress>) => void): Promise<Map<string, PickerProgress>> {
  const src = await loadSgSource().catch(() => null)
  const base: PickerSource = src ?? { links: [], phases: [], steps: [], items: [], decisions: [], phaseRows: [] }
  onFirst?.(pickerProgress(base))
  await ensureEpcStores()
  const reportOf = new Map(base.links.map((l) => [l.masterId, base.engines?.clientReports.get(l.project)]))
  const epc = new Map<string, EpcProgress>()
  for (const id of projectIds) epc.set(id, epcProgressOf(id, weightsFromReport(reportOf.get(id))))
  return pickerProgress({ ...base, epc })
}

async function loadSgSource(): Promise<PickerSource | null> {
  const [pj, ph, ob, it, dc, pr, sc, rep] = await Promise.all([
    supabase.from('sg_projects').select('name, master_project_id').not('master_project_id', 'is', null),
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title, gate_name, progress_engine').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    fetchPages<Row>((a, b) => supabase.from('sg_project_phase_items').select('project_name, phase_code, kind, item_id, status, updated_at').order('id').range(a, b)),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_gate_decisions').select('project_name, phase_code, decision, decided_at').order('id').range(a, b)),
    supabase.from('sg_project_lifecycle_phases').select('project_name, phase_code, gate_status, actual_start, actual_finish, planned_start, planned_finish, manual_actual_pct, weight_pct'),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_schedule_items').select('id, project_name, phase_code, parent_id, weight_pct, manual_actual_pct').order('id').range(a, b)),
    supabase.from('sg_client_reports').select('*').order('created_at', { ascending: true }),
  ])
  if (pj.error || ph.error || !ph.data?.length) return null
  const num = (v: unknown) => (v == null ? null : Number(v))
  const reports = new Map<string, Record<string, unknown>>()
  for (const r of (rep.data ?? []) as Row[]) reports.set(s(r.project_name), r) // ascending → the latest wins
  return {
    links: ((pj.data ?? []) as Row[]).map((r) => ({ project: s(r.name), masterId: s(r.master_project_id) })),
    phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), sort: Number(r.sort_order), title: s(r.title), gateName: s(r.gate_name) })),
    steps: ((ob.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), seq: Number(r.seq), title: s(r.title) })),
    items: it.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), kind: s(r.kind), itemId: Number(r.item_id), status: s(r.status), updatedAt: r.updated_at ? s(r.updated_at) : null, updatedBy: null })),
    decisions: dc.data.map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), decision: s(r.decision), decidedAt: s(r.decided_at), decidedBy: null })),
    engines: {
      phases: (ph.data as Row[]).map((r) => ({ code: s(r.code), engine: s(r.progress_engine) })),
      phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), plannedStart: r.planned_start ? s(r.planned_start) : null, plannedFinish: r.planned_finish ? s(r.planned_finish) : null, manualPct: num(r.manual_actual_pct), weightPct: num(r.weight_pct) })),
      schedule: sc.data.map((r) => ({ project: s(r.project_name), id: Number(r.id), phase: s(r.phase_code), parentId: num(r.parent_id), weightPct: num(r.weight_pct), manualPct: num(r.manual_actual_pct) })),
      clientReports: reports,
    },
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project: s(r.project_name), phase: s(r.phase_code), gateStatus: r.gate_status ? s(r.gate_status) : null, actualStart: r.actual_start ? s(r.actual_start) : null, actualFinish: r.actual_finish ? s(r.actual_finish) : null, plannedFinish: r.planned_finish ? s(r.planned_finish) : null, manualPct: r.manual_actual_pct == null ? null : Number(r.manual_actual_pct) })),
  }
}
