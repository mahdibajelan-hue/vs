import { supabase } from '../../lib/supabaseClient'
import type { Discipline, Item, JointType, Log, NdtResult, Station, StationKind, Weld } from './lib/spCore'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => (v == null || v === '' ? null : Number(v))
const chk = (r: { error: unknown }) => { if (r.error) throw r.error }
const BUCKET = 'sp-drawings'

export type DrawingKind = 'piping' | 'iso' | 'weld_map' | 'pid' | 'civil' | 'other'
export const DRAWING_KIND_FA: Record<DrawingKind, string> = { piping: 'نقشهٔ پایپینگ', iso: 'ایزومتریک', weld_map: 'نقشهٔ جوش (Weld Map)', pid: 'P&ID', civil: 'نقشهٔ سیویل', other: 'سایر' }
export type DrawingStatus = 'for_review' | 'ifc' | 'afc' | 'as_built'
export const DRAWING_STATUS_FA: Record<DrawingStatus, string> = { for_review: 'برای بررسی', ifc: 'IFC', afc: 'AFC — برای اجرا', as_built: 'As-Built' }
export interface StationRec extends Station { twinAssetId: string | null; note: string; updatedAt: string }
export interface Drawing { id: string; stationId: string; kind: DrawingKind; number: string; title: string; rev: string; status: DrawingStatus; filePath: string | null; fileName: string | null; mime: string | null; note: string; by: string; updatedAt: string }
export interface PipeLine { id: string; stationId: string; lineNo: string; isoNo: string; sizeIn: number | null; material: string; spec: string; service: string; lengthM: number | null; drawingId: string | null; testPack: string }
/** a twin asset that can become a station */
export interface TwinAsset { id: string; tag: string; kind: string; name: string; km: number }

const stationOf = (r: Row): StationRec => ({ id: r.id, code: s(r.code), name: s(r.name), kind: r.kind as StationKind, km: n(r.km), plannedStart: r.planned_start ?? null, plannedFinish: r.planned_finish ?? null, weights: (r.weights as Station['weights']) ?? null, twinAssetId: r.twin_asset_id ?? null, note: s(r.note), updatedAt: s(r.updated_at) })
const itemOf = (r: Row): Item => ({ id: r.id, stationId: r.station_id, discipline: r.discipline as Discipline, code: s(r.code), title: s(r.title), unit: s(r.unit), qty: Number(r.qty), weight: Number(r.weight), plannedStart: r.planned_start ?? null, plannedFinish: r.planned_finish ?? null, sort: Number(r.sort) })
const logOf = (r: Row): Log => ({ id: r.id, stationId: r.station_id, itemId: r.item_id, at: s(r.at), qty: Number(r.qty), note: s(r.note), by: s(r.by_user) })
const drawingOf = (r: Row): Drawing => ({ id: r.id, stationId: r.station_id, kind: r.kind, number: s(r.number), title: s(r.title), rev: s(r.rev), status: r.status, filePath: r.file_path ?? null, fileName: r.file_name ?? null, mime: r.mime ?? null, note: s(r.note), by: s(r.by_user), updatedAt: s(r.updated_at) })
const lineOf = (r: Row): PipeLine => ({ id: r.id, stationId: r.station_id, lineNo: s(r.line_no), isoNo: s(r.iso_no), sizeIn: n(r.size_in), material: s(r.material), spec: s(r.spec), service: s(r.service), lengthM: n(r.length_m), drawingId: r.drawing_id ?? null, testPack: s(r.test_pack) })
export const weldOf = (r: Row): Weld => ({
  id: r.id, stationId: r.station_id, lineId: r.line_id ?? null, drawingId: r.drawing_id ?? null, weldNo: s(r.weld_no), sizeIn: Number(r.size_in) || 0, thkMm: n(r.thk_mm), jointType: r.joint_type as JointType, shopField: r.shop_field,
  material: s(r.material), wps: s(r.wps), welder: s(r.welder), fitupDate: r.fitup_date ?? null, weldDate: r.weld_date ?? null, ndtMethod: s(r.ndt_method), ndtDate: r.ndt_date ?? null, ndtResult: r.ndt_result as NdtResult, repairs: Number(r.repairs) || 0,
  x: n(r.x), y: n(r.y), note: s(r.note),
})

/** every page of a table (Supabase returns at most 1000 rows per request) */
async function all(table: string, pid: string, order = 'created_at'): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const r = await supabase.from(table).select('*').eq('master_project_id', pid).eq('archived', false).order(order).range(from, from + 999)
    chk(r); out.push(...((r.data ?? []) as Row[]))
    if ((r.data ?? []).length < 1000) return out
  }
}
export async function loadAll(pid: string) {
  const [st, it, lg, dw, ln, wd] = await Promise.all([all('sp_stations', pid, 'km'), all('sp_items', pid, 'sort'), all('sp_logs', pid, 'at'), all('sp_drawings', pid), all('sp_lines', pid), all('sp_welds', pid, 'weld_no')])
  return { stations: st.map(stationOf), items: it.map(itemOf), logs: lg.map(logOf), drawings: dw.map(drawingOf), lines: ln.map(lineOf), welds: wd.map(weldOf) }
}
export async function twinAssets(pid: string): Promise<TwinAsset[]> {
  const r = await supabase.from('pdt_assets').select('id, tag, kind, name, km').eq('master_project_id', pid).in('kind', ['station', 'valve', 'launcher']).order('km')
  return ((r.data ?? []) as Row[]).map((x) => ({ id: x.id, tag: s(x.tag), kind: s(x.kind), name: s(x.name), km: Number(x.km) }))
}

const now = () => new Date().toISOString()
export async function saveStation(pid: string, x: Partial<StationRec> & { code: string }, by: string) {
  const row = { master_project_id: pid, code: x.code.trim(), name: x.name ?? '', kind: x.kind ?? 'valve', km: x.km ?? null, twin_asset_id: x.twinAssetId ?? null, planned_start: x.plannedStart || null, planned_finish: x.plannedFinish || null, weights: x.weights ?? null, note: x.note ?? '', updated_at: now() }
  const r = x.id ? await supabase.from('sp_stations').update(row).eq('id', x.id).select('*').single() : await supabase.from('sp_stations').insert({ ...row, created_by: by }).select('*').single()
  chk(r); return stationOf(r.data)
}
export async function archive(table: 'sp_stations' | 'sp_items' | 'sp_logs' | 'sp_drawings' | 'sp_lines' | 'sp_welds', id: string) {
  chk(await supabase.from(table).update({ archived: true }).eq('id', id))
}
export async function saveItems(pid: string, rows: (Partial<Item> & { stationId: string; discipline: Discipline; title: string })[]) {
  const ins = rows.filter((x) => !x.id).map((x) => ({ master_project_id: pid, station_id: x.stationId, discipline: x.discipline, code: x.code ?? '', title: x.title, unit: x.unit ?? '', qty: x.qty ?? 0, weight: x.weight ?? 1, planned_start: x.plannedStart || null, planned_finish: x.plannedFinish || null, sort: x.sort ?? 0 }))
  const out: Item[] = []
  if (ins.length) { const r = await supabase.from('sp_items').insert(ins).select('*'); chk(r); out.push(...((r.data ?? []) as Row[]).map(itemOf)) }
  for (const x of rows.filter((y) => y.id)) {
    const r = await supabase.from('sp_items').update({ discipline: x.discipline, code: x.code ?? '', title: x.title, unit: x.unit ?? '', qty: x.qty ?? 0, weight: x.weight ?? 1, planned_start: x.plannedStart || null, planned_finish: x.plannedFinish || null, sort: x.sort ?? 0, updated_at: now() }).eq('id', x.id!).select('*').single()
    chk(r); out.push(itemOf(r.data))
  }
  return out
}
export async function addLogs(pid: string, rows: { stationId: string; itemId: string; at: string; qty: number; note: string }[], by: string) {
  if (!rows.length) return []
  const r = await supabase.from('sp_logs').insert(rows.map((x) => ({ master_project_id: pid, station_id: x.stationId, item_id: x.itemId, at: x.at, qty: x.qty, note: x.note, by_user: by }))).select('*')
  chk(r); return ((r.data ?? []) as Row[]).map(logOf)
}
const weldRow = (pid: string, x: Partial<Weld> & { stationId: string; weldNo: string }, by: string) => ({
  master_project_id: pid, station_id: x.stationId, line_id: x.lineId ?? null, drawing_id: x.drawingId ?? null, weld_no: x.weldNo.trim(), size_in: x.sizeIn ?? 0, thk_mm: x.thkMm ?? null, joint_type: x.jointType ?? 'BW', shop_field: x.shopField ?? 'field',
  material: x.material ?? '', wps: x.wps ?? '', welder: x.welder ?? '', fitup_date: x.fitupDate || null, weld_date: x.weldDate || null, ndt_method: x.ndtMethod ?? 'RT', ndt_date: x.ndtDate || null, ndt_result: x.ndtResult ?? 'pending', repairs: x.repairs ?? 0,
  x: x.x ?? null, y: x.y ?? null, note: x.note ?? '', by_user: by, updated_at: now(),
})
export async function saveWeld(pid: string, x: Partial<Weld> & { stationId: string; weldNo: string }, by: string) {
  const row = weldRow(pid, x, by)
  const r = x.id ? await supabase.from('sp_welds').update(row).eq('id', x.id).select('*').single() : await supabase.from('sp_welds').insert(row).select('*').single()
  chk(r); return weldOf(r.data)
}
/** many welds at once (spreadsheet import): new numbers are added, existing numbers of the station updated */
export async function upsertWelds(pid: string, rows: (Partial<Weld> & { stationId: string; weldNo: string })[], by: string) {
  const out: Weld[] = []
  for (let i = 0; i < rows.length; i += 200) {
    const r = await supabase.from('sp_welds').upsert(rows.slice(i, i + 200).map((x) => { const w = weldRow(pid, x, by); return { ...w, archived: false } }), { onConflict: 'station_id,weld_no' }).select('*')
    chk(r); out.push(...((r.data ?? []) as Row[]).map(weldOf))
  }
  return out
}
export async function patchWelds(ids: string[], patch: Row) {
  if (!ids.length) return []
  const r = await supabase.from('sp_welds').update({ ...patch, updated_at: now() }).in('id', ids).select('*')
  chk(r); return ((r.data ?? []) as Row[]).map(weldOf)
}
export async function saveLine(pid: string, x: Partial<PipeLine> & { stationId: string; lineNo: string }) {
  const row = { master_project_id: pid, station_id: x.stationId, line_no: x.lineNo.trim(), iso_no: x.isoNo ?? '', size_in: x.sizeIn ?? null, material: x.material ?? '', spec: x.spec ?? '', service: x.service ?? '', length_m: x.lengthM ?? null, drawing_id: x.drawingId ?? null, test_pack: x.testPack ?? '', updated_at: now() }
  const r = x.id ? await supabase.from('sp_lines').update(row).eq('id', x.id).select('*').single() : await supabase.from('sp_lines').insert(row).select('*').single()
  chk(r); return lineOf(r.data)
}
export async function saveDrawing(pid: string, x: Partial<Drawing> & { stationId: string }, file: File | null, by: string) {
  let filePath = x.filePath ?? null, fileName = x.fileName ?? null, mime = x.mime ?? null
  if (file) {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
    filePath = `${pid}/${x.stationId}/${crypto.randomUUID()}-${safe}`
    chk(await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: file.type || undefined }))
    fileName = file.name; mime = file.type || null
  }
  const row = { master_project_id: pid, station_id: x.stationId, kind: x.kind ?? 'piping', number: x.number ?? '', title: x.title ?? '', rev: x.rev ?? '0', status: x.status ?? 'afc', file_path: filePath, file_name: fileName, mime, note: x.note ?? '', by_user: by, updated_at: now() }
  const r = x.id ? await supabase.from('sp_drawings').update(row).eq('id', x.id).select('*').single() : await supabase.from('sp_drawings').insert(row).select('*').single()
  chk(r); return drawingOf(r.data)
}
/** a short-lived link to a drawing's file */
export async function drawingUrl(path: string, download?: string) {
  const r = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30, download ? { download } : undefined)
  if (r.error) throw r.error
  return r.data.signedUrl
}
