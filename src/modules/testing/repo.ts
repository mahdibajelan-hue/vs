import { supabase } from '../../lib/supabaseClient'
import type { HtStage, CoatingKind, ProfilePoint, Reading, SectionPlan } from './lib/htCore'
import type { IgsParams, WallPart } from './lib/igs'
import { todayTehran } from '../../lib/today'

type Row = Record<string, any>
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => (v == null || v === '' ? null : Number(v))

/** a calibrated instrument of the test (the procedure's «تجهیزات مورد استفاده و کالیبراسیون») */
export interface HtEquip { name: string; range: string; accuracy: string; serial: string; calibExpiry: string | null }
/** the parties and references printed on the minutes */
export interface HtParties { employer: string; contractor: string; consultant: string; inspection: string; contractNo: string; procedureRef: string; procedureRev: string; waterSource: string }
export const EMPTY_PARTIES: HtParties = { employer: '', contractor: '', consultant: '', inspection: '', contractNo: '', procedureRef: 'IGS-C-PL-100(3)', procedureRev: '', waterSource: '' }
export interface HtSettings { method: 'igs' | 'factor'; igs: Partial<IgsParams> | null; equipment: HtEquip[]; parties: HtParties; testFactor: number; maxHoopPct: number; maxSectionKm: number; minSectionKm: number; density: number; strengthHoldH: number; leakHoldH: number; allowedDropBar: number; smysOverride: number | null; profile: ProfilePoint[] | null; profileName: string | null }
export const DEFAULT_HT_SETTINGS: HtSettings = { method: 'igs', igs: null, equipment: [], parties: EMPTY_PARTIES, testFactor: 1.25, maxHoopPct: 95, maxSectionKm: 20, minSectionKm: 1, density: 1000, strengthHoldH: 4, leakHoldH: 24, allowedDropBar: 0.5, smysOverride: null, profile: null, profileName: null }
export type TargetKind = 'section' | 'pack'
export interface HtSection extends Omit<SectionPlan, 'seq' | 'lengthKm' | 'hoopHighPct' | 'cut'> { wallMix: WallPart[] | null; weldFrom: string; weldTo: string; id: string; seq: number; code: string; cut: string; stage: HtStage; failed: boolean; failedNote: string; plannedDate: string | null; note: string; updatedAt: string }
export interface HtPack { id: string; code: string; station: string; title: string; designPressureBar: number; testPressureBar: number; medium: 'water' | 'air' | 'nitrogen'; stage: HtStage; failed: boolean; failedNote: string; plannedDate: string | null; note: string }
export interface HtReading extends Reading { id: number; targetId: string; note: string; by: string; /** where it was read: head / start / end / high / low / a km, or a station gauge */ location: string; km: number | null; elev: number | null; /** cumulative water injected, m³ (air and strength tests) */ volumeM3: number | null }
export type FormKind = 'permit' | 'gauge' | 'air' | 'strength' | 'leak' | 'drying'
export interface HtForm { id: string; targetKind: TargetKind; targetId: string; kind: FormKind; data: Record<string, unknown>; result: 'pending' | 'pass' | 'fail'; at: string | null; by: string; updatedAt: string }
export interface HtEvent { id: number; targetId: string; stage: HtStage; failed: boolean; note: string; by: string; at: string }
export interface CtRecord { id: string; kind: CoatingKind; kmFrom: number; kmTo: number; at: string; voltageKv: number | null; result: 'pass' | 'fail'; defects: number; reportNo: string; contractor: string; note: string; by: string }
export interface CtDefect { id: string; recordId: string | null; km: number; kind: string; severity: 'minor' | 'moderate' | 'severe'; status: 'open' | 'repaired' | 'verified'; note: string; repairedAt: string | null; by: string }

const settingsOf = (r: Row | null): HtSettings => r ? { method: r.method === 'factor' ? 'factor' : 'igs', igs: (r.igs as Partial<IgsParams>) ?? null, equipment: Array.isArray(r.equipment) ? (r.equipment as HtEquip[]) : [], parties: { ...EMPTY_PARTIES, ...((r.parties as Partial<HtParties>) ?? {}) }, testFactor: Number(r.test_factor), maxHoopPct: Number(r.max_hoop_pct), maxSectionKm: Number(r.max_section_km), minSectionKm: Number(r.min_section_km), density: Number(r.density), strengthHoldH: Number(r.strength_hold_h), leakHoldH: Number(r.leak_hold_h), allowedDropBar: Number(r.allowed_drop_bar), smysOverride: n(r.smys_override), profile: Array.isArray(r.profile) ? (r.profile as number[][]).map(([km, elev]) => ({ km, elev })) : null, profileName: r.profile_name ?? null } : DEFAULT_HT_SETTINGS
export const sectionOf = (r: Row): HtSection => ({ id: r.id, seq: Number(r.seq), code: s(r.code), kmFrom: Number(r.km_from), kmTo: Number(r.km_to), elevMin: Number(r.elev_min), elevMinKm: Number(r.elev_min_km), elevMax: Number(r.elev_max), elevMaxKm: Number(r.elev_max_km), pHigh: Number(r.p_high), pLow: Number(r.p_low), hoopLowPct: Number(r.hoop_low_pct), headKm: Number(r.head_km), pHead: Number(r.p_head), volumeM3: Number(r.volume_m3), cut: s(r.cut), wallMix: Array.isArray(r.wall_mix) ? (r.wall_mix as WallPart[]) : null, weldFrom: s(r.weld_from), weldTo: s(r.weld_to), elevStart: n(r.elev_start) ?? NaN, elevEnd: n(r.elev_end) ?? NaN, headElev: n(r.head_elev) ?? NaN, stage: r.stage, failed: !!r.failed, failedNote: s(r.failed_note), plannedDate: r.planned_date ?? null, note: s(r.note), updatedAt: s(r.updated_at) })
const packOf = (r: Row): HtPack => ({ id: r.id, code: s(r.code), station: s(r.station), title: s(r.title), designPressureBar: Number(r.design_pressure_bar), testPressureBar: Number(r.test_pressure_bar), medium: r.medium, stage: r.stage, failed: !!r.failed, failedNote: s(r.failed_note), plannedDate: r.planned_date ?? null, note: s(r.note) })
const readingOf = (r: Row): HtReading => ({ id: Number(r.id), targetId: r.target_id, phase: s(r.phase), at: s(r.at), pressureBar: Number(r.pressure_bar), tempC: n(r.temp_c), note: s(r.note), by: s(r.by_user), location: s(r.location), km: n(r.km), elev: n(r.elev), volumeM3: n(r.volume_m3) })
const formOf = (r: Row): HtForm => ({ id: r.id, targetKind: r.target_kind, targetId: r.target_id, kind: r.kind, data: (r.data as Record<string, unknown>) ?? {}, result: r.result, at: r.at ?? null, by: s(r.by_user), updatedAt: s(r.updated_at) })
const eventOf = (r: Row): HtEvent => ({ id: Number(r.id), targetId: r.target_id, stage: r.stage, failed: !!r.failed, note: s(r.note), by: s(r.by_user), at: s(r.at) })
const recordOf = (r: Row): CtRecord => ({ id: r.id, kind: r.kind, kmFrom: Number(r.km_from), kmTo: Number(r.km_to), at: s(r.at), voltageKv: n(r.voltage_kv), result: r.result, defects: Number(r.defects), reportNo: s(r.report_no), contractor: s(r.contractor), note: s(r.note), by: s(r.by_user) })
const defectOf = (r: Row): CtDefect => ({ id: r.id, recordId: r.record_id ?? null, km: Number(r.km), kind: s(r.kind), severity: r.severity, status: r.status, note: s(r.note), repairedAt: r.repaired_at ?? null, by: s(r.by_user) })

export async function loadTesting(pid: string) {
  const [st, se, pk, rd, ev, cr, cd, fm] = await Promise.all([
    supabase.from('ht_settings').select('*').eq('master_project_id', pid).maybeSingle(),
    supabase.from('ht_sections').select('*').eq('master_project_id', pid).order('seq'),
    supabase.from('ht_packs').select('*').eq('master_project_id', pid).order('code'),
    supabase.from('ht_readings').select('*').eq('master_project_id', pid).order('at'),
    supabase.from('ht_events').select('*').eq('master_project_id', pid).order('at', { ascending: false }),
    supabase.from('ct_records').select('*').eq('master_project_id', pid).order('at', { ascending: false }),
    supabase.from('ct_defects').select('*').eq('master_project_id', pid).order('km'),
    supabase.from('ht_forms').select('*').eq('master_project_id', pid),
  ])
  const err = st.error ?? se.error
  if (err) throw err
  return { settings: settingsOf(st.data as Row | null), sections: (se.data ?? []).map(sectionOf), packs: (pk.data ?? []).map(packOf), readings: (rd.data ?? []).map(readingOf), events: (ev.data ?? []).map(eventOf), records: (cr.data ?? []).map(recordOf), defects: (cd.data ?? []).map(defectOf), forms: fm.error ? [] : (fm.data ?? []).map(formOf) }
}

const chk = (r: { error: unknown }) => { if (r.error) throw r.error }
export async function saveSettings(pid: string, x: HtSettings, by: string) {
  chk(await supabase.from('ht_settings').upsert({ master_project_id: pid, test_factor: x.testFactor, max_hoop_pct: x.maxHoopPct, max_section_km: x.maxSectionKm, min_section_km: x.minSectionKm, density: x.density, strength_hold_h: x.strengthHoldH, leak_hold_h: x.leakHoldH, allowed_drop_bar: x.allowedDropBar, smys_override: x.smysOverride, profile: x.profile ? x.profile.map((p) => [p.km, p.elev]) : null, profile_name: x.profileName, method: x.method, igs: x.igs, equipment: x.equipment, parties: x.parties, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'master_project_id' }))
}
/** replaces the section plan (only while no section has started — the store checks) */
export async function replacePlan(pid: string, plan: SectionPlan[], by: string) {
  chk(await supabase.from('ht_sections').delete().eq('master_project_id', pid))
  if (!plan.length) return
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  chk(await supabase.from('ht_sections').insert(plan.map((x) => ({ master_project_id: pid, seq: x.seq, code: `HT-${String(x.seq).padStart(2, '0')}`, km_from: r3(x.kmFrom), km_to: r3(x.kmTo), elev_min: r3(x.elevMin), elev_min_km: r3(x.elevMinKm), elev_max: r3(x.elevMax), elev_max_km: r3(x.elevMaxKm), p_high: r3(x.pHigh), p_low: r3(x.pLow), hoop_low_pct: r3(x.hoopLowPct), head_km: r3(x.headKm), p_head: r3(x.pHead), volume_m3: Math.round(x.volumeM3), cut: x.cut, elev_start: r3(x.elevStart), elev_end: r3(x.elevEnd), head_elev: r3(x.headElev), created_by: by }))))
}
export async function patchTarget(kind: TargetKind, id: string, patch: Row) {
  chk(await supabase.from(kind === 'section' ? 'ht_sections' : 'ht_packs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
}
export async function logEvent(pid: string, kind: TargetKind, id: string, stage: HtStage, failed: boolean, note: string, by: string) {
  const r = await supabase.from('ht_events').insert({ master_project_id: pid, target_kind: kind, target_id: id, stage, failed, note, by_user: by }).select('*').single()
  chk(r); return eventOf(r.data)
}
export interface ReadingInput { phase: string; at: string; pressureBar: number; tempC: number | null; note: string; location?: string; km?: number | null; elev?: number | null; volumeM3?: number | null }
export async function addReading(pid: string, kind: TargetKind, id: string, x: ReadingInput, by: string) {
  const r = await supabase.from('ht_readings').insert({ master_project_id: pid, target_kind: kind, target_id: id, phase: x.phase, at: x.at, pressure_bar: x.pressureBar, temp_c: x.tempC, note: x.note, by_user: by, location: x.location ?? '', km: x.km ?? null, elev: x.elev ?? null, volume_m3: x.volumeM3 ?? null }).select('*').single()
  chk(r); return readingOf(r.data)
}
export async function savePack(pid: string, x: Partial<HtPack> & { code: string; designPressureBar: number; testPressureBar: number }, by: string) {
  const row = { master_project_id: pid, code: x.code.trim(), station: x.station ?? '', title: x.title ?? '', design_pressure_bar: x.designPressureBar, test_pressure_bar: x.testPressureBar, medium: x.medium ?? 'water', planned_date: x.plannedDate || null, note: x.note ?? '' }
  const r = x.id ? await supabase.from('ht_packs').update(row).eq('id', x.id).select('*').single() : await supabase.from('ht_packs').insert({ ...row, created_by: by }).select('*').single()
  chk(r); return packOf(r.data)
}
export async function deletePack(id: string) { chk(await supabase.from('ht_packs').delete().eq('id', id)) }
export async function addRecord(pid: string, x: Omit<CtRecord, 'id' | 'by'>, by: string) {
  const r = await supabase.from('ct_records').insert({ master_project_id: pid, kind: x.kind, km_from: x.kmFrom, km_to: x.kmTo, at: x.at, voltage_kv: x.voltageKv, result: x.result, defects: x.defects, report_no: x.reportNo, contractor: x.contractor, note: x.note, by_user: by }).select('*').single()
  chk(r); return recordOf(r.data)
}
export async function addDefect(pid: string, x: Omit<CtDefect, 'id' | 'by' | 'status' | 'repairedAt'>, by: string) {
  const r = await supabase.from('ct_defects').insert({ master_project_id: pid, record_id: x.recordId, km: x.km, kind: x.kind, severity: x.severity, note: x.note, by_user: by }).select('*').single()
  chk(r); return defectOf(r.data)
}
export async function setDefect(id: string, status: CtDefect['status']) {
  const r = await supabase.from('ct_defects').update({ status, repaired_at: status === 'open' ? null : todayTehran() }).eq('id', id).select('*').single()
  chk(r); return defectOf(r.data)
}

/** one minute (صورتجلسه) of a test: upserted per test and kind */
export async function saveForm(pid: string, kind: TargetKind, id: string, f: { kind: FormKind; data: Record<string, unknown>; result: HtForm['result']; at: string | null }, by: string) {
  const r = await supabase.from('ht_forms').upsert({ master_project_id: pid, target_kind: kind, target_id: id, kind: f.kind, data: f.data, result: f.result, at: f.at, by_user: by, updated_at: new Date().toISOString() }, { onConflict: 'target_id,kind' }).select('*').single()
  chk(r); return formOf(r.data)
}
