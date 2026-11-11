import { supabase } from '../../../lib/supabaseClient'
import { fetchPages } from '../../../modules/supervision/lib/fetchPages'
import { pickerProgress, type PickerProgress, type PickerSource } from './pickerProgressCore'
import { ensureEpcStores, epcProgressOf } from '../../../modules/epc/epcProgressLoader'
import { weightsFromReport } from '../../../modules/epc/epcProgress'
import { readEpcSnapshots, saveEpcSnapshot, STALE_MS, type EpcSnapshot } from './epcSnapshots'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))

/**
 * Progress of every listed project for the picker's gauges. Each card is saved with the project's EPC figure
 * (radar_epc_snapshots), so the picker draws every card from one request. A card is computed again — from that
 * project's own Stage-Gate and EPC data only — when it is older than STALE_MS, when it was never saved, or when the
 * project's Stage-Gate data changed after it was saved (anyone's phase item, gate decision, phase row, schedule item or
 * client report); the card updates as it lands and is saved for everyone.
 */
export async function loadPickerProgress(projectIds: string[], onFirst?: (m: Map<string, PickerProgress>) => void): Promise<Map<string, PickerProgress>> {
  const [snaps, links] = await Promise.all([readEpcSnapshots(projectIds).catch(() => new Map<string, EpcSnapshot>()), readLinks(projectIds)])
  const out = new Map<string, PickerProgress>()
  for (const [id, sn] of snaps) if (sn.picker) out.set(id, sn.picker)
  const changed = await changedSince(snaps, links)
  const due = projectIds.filter((id) => { const sn = snaps.get(id); return !sn || sn.picker === undefined || Date.now() - sn.at > STALE_MS || changed.has(id) })
  onFirst?.(new Map(out))
  if (!due.length) return out
  // Stage-Gate data of the due projects only, then each one's EPC figure from its own module data
  const src = await loadSgSource(links.filter((l) => due.includes(l.masterId))).catch(() => null)
  const base: PickerSource = src ?? { links: [], phases: [], steps: [], items: [], decisions: [], phaseRows: [] }
  const reportOf = new Map(base.links.map((l) => [l.masterId, base.engines?.clientReports.get(l.project)]))
  for (const id of due) {
    await ensureEpcStores(id, { only: true })
    const e = epcProgressOf(id, weightsFromReport(reportOf.get(id)))
    const card = pickerProgress({ ...base, links: base.links.filter((l) => l.masterId === id), epc: new Map([[id, e]]) }).get(id) ?? null
    if (card) out.set(id, card); else out.delete(id)
    saveEpcSnapshot(id, e, card)
    onFirst?.(new Map(out))
  }
  return out
}

type Link = { project: string; masterId: string }
async function readLinks(ids: string[]): Promise<Link[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('sg_projects').select('name, master_project_id').in('master_project_id', ids)
  return ((data ?? []) as Row[]).map((r) => ({ project: s(r.name), masterId: s(r.master_project_id) }))
}

/** projects whose Stage-Gate data changed after their saved card (only rows changed since the oldest card are read) */
async function changedSince(snaps: Map<string, EpcSnapshot>, links: Link[]): Promise<Set<string>> {
  const out = new Set<string>()
  const linked = links.filter((l) => snaps.get(l.masterId)?.picker !== undefined)
  if (!linked.length) return out
  const oldest = new Date(Math.min(...linked.map((l) => snaps.get(l.masterId)!.at))).toISOString()
  const names = linked.map((l) => l.project)
  const since = (table: string, col: string) => supabase.from(table).select(`project_name, ${col}`).in('project_name', names).gt(col, oldest).limit(1000)
  const res = await Promise.all([since('sg_project_phase_items', 'updated_at'), since('sg_lifecycle_gate_decisions', 'decided_at'), since('sg_project_lifecycle_phases', 'updated_at'), since('sg_lifecycle_schedule_items', 'updated_at'), since('sg_client_reports', 'created_at')])
  const cols = ['updated_at', 'decided_at', 'updated_at', 'updated_at', 'created_at']
  const byName = new Map(linked.map((l) => [l.project, l.masterId]))
  res.forEach((r, k) => {
    for (const row of (r.data ?? []) as unknown as Row[]) {
      const id = byName.get(s(row.project_name))
      if (id && Date.parse(s(row[cols[k]])) > snaps.get(id)!.at) out.add(id)
    }
  })
  return out
}

async function loadSgSource(links: Link[]): Promise<PickerSource | null> {
  const names = links.map((l) => l.project)
  if (!names.length) names.push('\u0000') // no linked project: phases still load, project rows come back empty
  const [pj, ph, ob, it, dc, pr, sc, rep] = await Promise.all([
    Promise.resolve({ data: links.map((l) => ({ name: l.project, master_project_id: l.masterId })), error: null }),
    supabase.from('sg_lifecycle_phases').select('code, sort_order, title, gate_name, progress_engine').eq('is_active', true),
    supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title').eq('is_active', true),
    fetchPages<Row>((a, b) => supabase.from('sg_project_phase_items').select('project_name, phase_code, kind, item_id, status, updated_at').in('project_name', names).order('id').range(a, b)),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_gate_decisions').select('project_name, phase_code, decision, decided_at').in('project_name', names).order('id').range(a, b)),
    supabase.from('sg_project_lifecycle_phases').select('project_name, phase_code, gate_status, actual_start, actual_finish, planned_start, planned_finish, manual_actual_pct, weight_pct').in('project_name', names),
    fetchPages<Row>((a, b) => supabase.from('sg_lifecycle_schedule_items').select('id, project_name, phase_code, parent_id, weight_pct, manual_actual_pct').in('project_name', names).order('id').range(a, b)),
    supabase.from('sg_client_reports').select('*').in('project_name', names).order('created_at', { ascending: true }),
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
