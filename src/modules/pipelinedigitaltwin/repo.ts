import { supabase } from '../../lib/supabaseClient'
import type { Asset, AssetEvent, JointRow } from './lib/twinCore'
import type { GeoPoint } from './types'

type Row = Record<string, any>
const s = (v: unknown) => (v == null ? '' : String(v))

export interface TwinSettings { diameterIn: number; wallMm: number; material: string; designPressureBar: number; fluid: string; stockLengthM: number }
export const DEFAULT_SETTINGS: TwinSettings = { diameterIn: 48, wallMm: 19.1, material: 'API 5L X70', designPressureBar: 100, fluid: 'گاز طبیعی', stockLengthM: 12 }

/** where the route geometry came from: the land module's shared route (KML), or the twin's own (demo / no land access) */
export type RouteOrigin = 'land' | 'twin' | null
export interface TwinData {
  settings: TwinSettings
  points: GeoPoint[]
  routeName: string | null
  routeOrigin: RouteOrigin
  startKm: number
  plannedKm: number | null
  rows: JointRow[]
  assets: Asset[]
  events: AssetEvent[]
  phase: string | null
}

const toPoints = (g: unknown): GeoPoint[] =>
  Array.isArray(g) ? (g as number[][]).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => ({ lon: Number(p[0]), lat: Number(p[1]), elevation: p.length > 2 && p[2] != null ? Number(p[2]) : null })) : []
export const toGeometry = (pts: GeoPoint[]) => pts.map((p) => (p.elevation != null ? [p.lon, p.lat, Math.round(p.elevation * 10) / 10] : [p.lon, p.lat]))

export const assetOf = (r: Row): Asset => ({ id: r.id, projectId: r.master_project_id, tag: s(r.tag), kind: r.kind, name: s(r.name), km: Number(r.km), size: s(r.size), make: s(r.make), installDate: r.install_date ?? null, condition: r.condition, opState: r.op_state, criticality: r.criticality, inspectEveryDays: r.inspect_every_days == null ? null : Number(r.inspect_every_days), nextInspection: r.next_inspection ?? null, note: s(r.note), updatedAt: s(r.updated_at) })
export const eventOf = (r: Row): AssetEvent => ({ id: r.id, assetId: r.asset_id, kind: r.kind, at: s(r.at), result: s(r.result), condition: r.condition ?? null, opState: r.op_state ?? null, note: s(r.note), by: s(r.by_user) })
const jointRowOf = (r: Row): JointRow => ({ joint_no: Number(r.joint_no), welding: r.welding, welding_at: r.welding_at, ndt: r.ndt, ndt_at: r.ndt_at, coating: r.coating, coating_at: r.coating_at, lowering: r.lowering, lowering_at: r.lowering_at, backfill: r.backfill, backfill_at: r.backfill_at, welders: r.welders ?? [], weld_ref: s(r.weld_ref), notes: s(r.notes), updated_by: r.updated_by, updated_at: r.updated_at })

/** reads every joint row of a project (they can be tens of thousands: paged) */
async function allJointRows(projectId: string): Promise<JointRow[]> {
  const out: JointRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('pdt_joints').select('*').eq('master_project_id', projectId).order('joint_no').range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []).map(jointRowOf))
    if (!data || data.length < 1000) return out
  }
}

export async function loadTwin(projectId: string): Promise<TwinData> {
  const [st, lr, as, ph] = await Promise.all([
    supabase.from('pdt_settings').select('*').eq('master_project_id', projectId).maybeSingle(),
    supabase.from('la_routes').select('name, total_km, start_km, geometry, geometry_source').eq('master_project_id', projectId).maybeSingle(),
    supabase.from('pdt_assets').select('*').eq('master_project_id', projectId).order('km'),
    supabase.from('sg_projects').select('current_phase').eq('master_project_id', projectId).maybeSingle(),
  ])
  if (st.error) throw st.error
  const rows = await allJointRows(projectId)
  const assets = (as.data ?? []).map(assetOf)
  const ev = assets.length ? await supabase.from('pdt_asset_events').select('*').in('asset_id', assets.map((a) => a.id)).order('at', { ascending: false }) : { data: [] as Row[] }
  const sr = st.data as Row | null
  const landPts = toPoints(lr.data?.geometry)
  const ownPts = toPoints(sr?.geometry)
  const settings: TwinSettings = sr ? { diameterIn: Number(sr.diameter_in), wallMm: Number(sr.wall_mm), material: s(sr.material), designPressureBar: Number(sr.design_pressure_bar), fluid: s(sr.fluid), stockLengthM: Number(sr.stock_length_m) || 12 } : DEFAULT_SETTINGS
  return {
    settings, rows, assets, events: (ev.data ?? []).map(eventOf), phase: ph.data?.current_phase ?? null,
    points: landPts.length >= 2 ? landPts : ownPts,
    routeName: landPts.length >= 2 ? s(lr.data?.name) || null : sr?.geometry_name ?? null,
    routeOrigin: landPts.length >= 2 ? 'land' : ownPts.length >= 2 ? 'twin' : null,
    startKm: Number(lr.data?.start_km ?? 0),
    plannedKm: lr.data?.total_km != null ? Number(lr.data.total_km) : null,
  }
}

const settingsRow = (projectId: string, x: TwinSettings, by: string) => ({ master_project_id: projectId, diameter_in: x.diameterIn, wall_mm: x.wallMm, material: x.material, design_pressure_bar: x.designPressureBar, fluid: x.fluid, stock_length_m: x.stockLengthM, updated_by: by, updated_at: new Date().toISOString() })
export async function saveSettings(projectId: string, x: TwinSettings, by: string) {
  const { error } = await supabase.from('pdt_settings').upsert(settingsRow(projectId, x, by), { onConflict: 'master_project_id' })
  if (error) throw error
}

/**
 * Saves an imported route where every module reads it: the land module's route row (shared). Without the right to edit it,
 * or for a demo route, the twin keeps it in its own settings so the land module's route is never overwritten with a sample.
 */
export async function saveRoute(projectId: string, pts: GeoPoint[], name: string, kind: 'kml' | 'demo', settings: TwinSettings, by: string, projectName: string): Promise<'land' | 'twin'> {
  const geometry = toGeometry(pts)
  if (kind === 'kml') {
    const cur = await supabase.from('la_routes').select('master_project_id').eq('master_project_id', projectId).maybeSingle()
    const res = cur.data
      ? await supabase.from('la_routes').update({ geometry, geometry_source: 'kml', updated_at: new Date().toISOString() }).eq('master_project_id', projectId).select('master_project_id')
      : await supabase.from('la_routes').insert({ master_project_id: projectId, name: projectName, geometry, geometry_source: 'kml', created_by: null }).select('master_project_id')
    if (!res.error && res.data?.length) return 'land'
  }
  const { error } = await supabase.from('pdt_settings').upsert({ ...settingsRow(projectId, settings, by), geometry, geometry_name: name }, { onConflict: 'master_project_id' })
  if (error) throw error
  return 'twin'
}

export async function upsertJointRows(projectId: string, rows: JointRow[], by: string) {
  const at = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ master_project_id: projectId, joint_no: r.joint_no, welding: r.welding, welding_at: r.welding_at, ndt: r.ndt, ndt_at: r.ndt_at, coating: r.coating, coating_at: r.coating_at, lowering: r.lowering, lowering_at: r.lowering_at, backfill: r.backfill, backfill_at: r.backfill_at, welders: r.welders, weld_ref: r.weld_ref, notes: r.notes, updated_by: by, updated_at: at }))
    const { error } = await supabase.from('pdt_joints').upsert(chunk, { onConflict: 'master_project_id,joint_no' })
    if (error) throw error
  }
}

export async function logJointEvent(projectId: string, from: number, to: number, field: string, value: string, note: string, by: string, at?: string) {
  await supabase.from('pdt_joint_events').insert({ master_project_id: projectId, joint_from: from, joint_to: to, field, to_value: value, note, by_user: by, ...(at ? { at } : {}) })
}

export interface JointEventRow { id: number; from: number; to: number; field: string; value: string; note: string; by: string; at: string }
export async function jointEvents(projectId: string, no: number): Promise<JointEventRow[]> {
  const { data } = await supabase.from('pdt_joint_events').select('*').eq('master_project_id', projectId).lte('joint_from', no).gte('joint_to', no).order('at', { ascending: false }).limit(100)
  return (data ?? []).map((r: Row) => ({ id: Number(r.id), from: Number(r.joint_from), to: Number(r.joint_to), field: s(r.field), value: s(r.to_value), note: s(r.note), by: s(r.by_user), at: s(r.at) }))
}

export async function saveAsset(projectId: string, a: Partial<Asset> & { tag: string; kind: Asset['kind']; km: number }, by: string): Promise<Asset> {
  const row = { master_project_id: projectId, tag: a.tag.trim(), kind: a.kind, name: a.name ?? '', km: a.km, size: a.size ?? '', make: a.make ?? '', install_date: a.installDate || null, condition: a.condition ?? 'good', op_state: a.opState ?? 'na', criticality: a.criticality ?? 'medium', inspect_every_days: a.inspectEveryDays ?? null, next_inspection: a.nextInspection || null, note: a.note ?? '', updated_at: new Date().toISOString() }
  const res = a.id ? await supabase.from('pdt_assets').update(row).eq('id', a.id).select('*').single() : await supabase.from('pdt_assets').insert({ ...row, created_by: by }).select('*').single()
  if (res.error) throw res.error
  return assetOf(res.data)
}
export async function deleteAsset(id: string) {
  const { error } = await supabase.from('pdt_assets').delete().eq('id', id)
  if (error) throw error
}
export async function addAssetEvent(e: Omit<AssetEvent, 'id'>, patch: Partial<Asset>): Promise<AssetEvent> {
  const res = await supabase.from('pdt_asset_events').insert({ asset_id: e.assetId, kind: e.kind, at: e.at, result: e.result, condition: e.condition, op_state: e.opState, note: e.note, by_user: e.by }).select('*').single()
  if (res.error) throw res.error
  if (Object.keys(patch).length) {
    const up = await supabase.from('pdt_assets').update({ ...(patch.condition ? { condition: patch.condition } : {}), ...(patch.opState ? { op_state: patch.opState } : {}), ...(patch.nextInspection ? { next_inspection: patch.nextInspection } : {}), updated_at: new Date().toISOString() }).eq('id', e.assetId)
    if (up.error) throw up.error
  }
  return eventOf(res.data)
}

/** official numbers other modules own, read for consistency: open NCRs of the execution module */
export async function openNcrCount(projectId: string): Promise<number | null> {
  const { count, error } = await supabase.from('ex_ncr').select('id', { count: 'exact', head: true }).eq('project_id', projectId).not('status', 'in', '(closed,void)')
  return error ? null : count ?? 0
}
