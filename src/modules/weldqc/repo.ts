import { supabase } from '../../lib/supabaseClient'
import { buildWeldFiles, type WeldFile } from '../execution/lib/weldFile'
import { splitStamps } from '../execution/lib/registers'
import type { DefectType, Pass, Verdict } from './lib/rules'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => (v == null || v === '' ? null : Number(v))
const chk = <T extends { error: unknown }>(r: T): T => { if (r.error) throw r.error; return r }
export const BUCKET = 'wq-films'
/** the report forms a weld's QC file needs (welders of each pass, the execution RT result, coating) */
const FORMS = ['fitup', 'welding', 'tie_in', 'rt_request', 'rt_request_rp', 'rt_report', 'weld_repair', 'fj_coating', 'bond_test']

export interface Welder { id: string; key: string; raw: string; name: string; status: string }
export interface QcWeld extends WeldFile { stampsBy: Record<Pass, string[]>; weldDate: string }
export interface Joint { weldId: string; round: number; closed: boolean; finalStatus: Verdict | null; closedAt: string | null; thkMm: number | null; odMm: number | null; service: string; note: string }
export interface Film { id: string; weldId: string; round: number; examType: 'RT' | 'RS'; attempt: number; segment: string; path: string; fileName: string; mime: string; width: number | null; height: number | null; pxPerMm: number | null; iqi: string; density: string; quality: 'pending' | 'accepted' | 'retake' | 'reshoot'; qualityNote: string; qualityName: string; qualityAt: string | null; uploadedName: string; createdAt: string }
export interface Mark { id: string; filmId: string; kind: 'line' | 'box' | 'point' | 'calib'; geom: { x1: number; y1: number; x2: number; y2: number }; label: string }
export interface Defect { id: string; weldId: string; filmId: string | null; round: number; type: DefectType; lengthMm: number; depthMm: number; positionMm: number; pass: Pass | ''; welders: string[]; bbox: { x: number; y: number; w: number; h: number } | null; detectedBy: 'manual' | 'ai'; confidence: number | null; verdict: Verdict | null; verdictReason: string; repairAdvice: string; note: string; removed: boolean; createdName: string; createdAt: string }
export interface Evaluation { id: string; weldId: string; round: number; overall: Verdict; summary: string; thkMm: number | null; evaluatedName: string; evaluatedAt: string; signedName: string; signedAt: string | null; forcedCutout: boolean }
export interface Repair { id: string; weldId: string; round: number; method: string; performedBy: string; approvedBy: string; repairWps: string; note: string; createdName: string; createdAt: string }
export interface Vt { id: string; weldId: string; round: number; result: 'accept' | 'reject'; note: string; files: { path: string; name: string; mime: string }[]; byName: string; at: string }
export interface Opinion { id: string; weldId: string; targetKind: 'defect' | 'evaluation' | 'joint'; targetId: string; stance: 'agree' | 'disagree' | 'note'; body: string; authorName: string; at: string }

export interface WqData {
  welds: QcWeld[]; welders: Welder[]; joints: Joint[]; films: Film[]; marks: Mark[]; defects: Defect[]
  evaluations: Evaluation[]; repairs: Repair[]; vts: Vt[]; opinions: Opinion[]; criteria: unknown
}

async function pages(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const r = chk(await build(from, from + 999)); const d = (r.data ?? []) as Row[]
    out.push(...d); if (d.length < 1000) return out
  }
}
const byProject = (table: string, pid: string, cols = '*') => pages((a, b) => supabase.from(table).select(cols).eq('project_id', pid).range(a, b))

export async function loadAll(pid: string): Promise<WqData> {
  const [welds, links, reports, welders, joints, films, marks, defects, evals, repairs, vts, opinions, settings] = await Promise.all([
    byProject('ex_welds', pid, 'id, project_id, section_raw, weld_raw, pipe_no, status, c_pipe, c_size, c_thk, c_length, c_bend'),
    byProject('ex_line_welds', pid, 'line_id, weld_id, project_id'),
    pages((a, b) => supabase.from('ex_reports').select('id, form_key, report_date, report_no, status').eq('project_id', pid).in('form_key', FORMS).range(a, b)),
    byProject('ex_welders', pid, 'id, welder_key, welder_raw, full_name, status'),
    byProject('wq_joints', pid), byProject('wq_films', pid), byProject('wq_marks', pid), byProject('wq_defects', pid),
    byProject('wq_evaluations', pid), byProject('wq_repairs', pid), byProject('wq_vt', pid), byProject('wq_opinions', pid),
    supabase.from('wq_settings').select('criteria').eq('project_id', pid).maybeSingle(),
  ])
  const lineIds = links.map((l) => l.line_id as string)
  const lines: Row[] = []
  for (let i = 0; i < lineIds.length; i += 150) {
    const r = chk(await supabase.from('ex_report_lines').select('id, report_id, detail').in('id', lineIds.slice(i, i + 150)))
    lines.push(...((r.data ?? []) as Row[]))
  }
  const files = buildWeldFiles({
    projectId: pid,
    welds: welds.map((w) => ({ id: w.id, projectId: w.project_id, sectionRaw: s(w.section_raw), weldRaw: s(w.weld_raw), pipeNo: w.pipe_no, status: s(w.status), central: Object.fromEntries(([['pipe', w.c_pipe], ['size', w.c_size], ['thk', w.c_thk], ['length', w.c_length], ['bend', w.c_bend]] as [string, unknown][]).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])) })),
    links: links.map((l) => ({ lineId: l.line_id, weldId: l.weld_id, projectId: l.project_id })),
    lines: lines.map((l) => ({ id: l.id, reportId: l.report_id, detail: (l.detail ?? {}) as Record<string, unknown> })),
    reports: reports.map((r) => ({ id: r.id, formKey: s(r.form_key), reportDate: s(r.report_date), reportNo: s(r.report_no), status: s(r.status) })),
  })
  return {
    welds: files.map((f) => ({ ...f, weldDate: f.welding?.date ?? '', stampsBy: { root: splitStamps(f.welding?.stamps.root), hot: splitStamps(f.welding?.stamps.hot), fill: splitStamps(f.welding?.stamps.fill), cap: splitStamps(f.welding?.stamps.cap) } })),
    welders: welders.map((w) => ({ id: w.id, key: s(w.welder_key), raw: s(w.welder_raw), name: s(w.full_name), status: s(w.status) })),
    joints: joints.map((j) => ({ weldId: j.weld_id, round: Number(j.current_round) || 0, closed: !!j.is_closed, finalStatus: j.final_status ?? null, closedAt: j.closed_at ?? null, thkMm: n(j.thk_mm), odMm: n(j.od_mm), service: s(j.service_type), note: s(j.note) })),
    films: films.map((f) => ({ id: f.id, weldId: f.weld_id, round: Number(f.round) || 0, examType: f.exam_type, attempt: Number(f.attempt) || 1, segment: s(f.segment), path: s(f.path), fileName: s(f.file_name), mime: s(f.mime), width: n(f.width), height: n(f.height), pxPerMm: n(f.px_per_mm), iqi: s(f.iqi), density: s(f.density), quality: f.quality_status, qualityNote: s(f.quality_note), qualityName: s(f.quality_name), qualityAt: f.quality_at ?? null, uploadedName: s(f.uploaded_name), createdAt: s(f.created_at) })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    marks: marks.filter((m) => !m.removed_at).map((m) => ({ id: m.id, filmId: m.film_id, kind: m.kind, geom: m.geom, label: s(m.label) })),
    defects: defects.map((d) => ({ id: d.id, weldId: d.weld_id, filmId: d.film_id ?? null, round: Number(d.round) || 0, type: d.defect_type, lengthMm: Number(d.length_mm) || 0, depthMm: Number(d.depth_mm) || 0, positionMm: Number(d.position_mm) || 0, pass: s(d.pass) as Pass | '', welders: (d.welders ?? []) as string[], bbox: d.bbox ?? null, detectedBy: d.detected_by, confidence: n(d.confidence), verdict: d.verdict ?? null, verdictReason: s(d.verdict_reason), repairAdvice: s(d.repair_advice), note: s(d.note), removed: !!d.removed_at, createdName: s(d.created_name), createdAt: s(d.created_at) })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    evaluations: evals.map((e) => ({ id: e.id, weldId: e.weld_id, round: Number(e.round) || 0, overall: e.overall_status, summary: s(e.summary), thkMm: n(e.thk_mm), evaluatedName: s(e.evaluated_name), evaluatedAt: s(e.evaluated_at), signedName: s(e.signed_name), signedAt: e.signed_at ?? null, forcedCutout: !!e.forced_cutout })).sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt)),
    repairs: repairs.map((r) => ({ id: r.id, weldId: r.weld_id, round: Number(r.round) || 0, method: s(r.method), performedBy: s(r.performed_by), approvedBy: s(r.approved_by), repairWps: s(r.repair_wps), note: s(r.note), createdName: s(r.created_name), createdAt: s(r.created_at) })),
    vts: vts.map((v) => ({ id: v.id, weldId: v.weld_id, round: Number(v.round) || 0, result: v.result, note: s(v.note), files: (v.files ?? []) as Vt['files'], byName: s(v.by_name), at: s(v.at) })).sort((a, b) => a.at.localeCompare(b.at)),
    opinions: opinions.map((o) => ({ id: o.id, weldId: o.weld_id, targetKind: o.target_kind, targetId: o.target_id, stance: o.stance, body: s(o.body), authorName: s(o.author_name), at: s(o.at) })).sort((a, b) => a.at.localeCompare(b.at)),
    criteria: (settings.data as Row | null)?.criteria ?? null,
  }
}

/** which module actions the signed-in person holds on this project (the database decides; this only shapes the screen) */
export async function loadCaps(pid: string): Promise<Record<'submit' | 'edit' | 'approve' | 'configure', boolean>> {
  const r = await supabase.rpc('wq_my_caps', { p_project: pid })
  const d = (r.data ?? {}) as Record<string, unknown>
  return { submit: d.submit === true, edit: d.edit === true, approve: d.approve === true, configure: d.configure === true }
}
export async function ensureJoint(weldId: string) { chk(await supabase.rpc('wq_ensure_joint', { p_weld: weldId })) }
export async function updateJoint(weldId: string, patch: { thk_mm?: number | null; od_mm?: number | null; service_type?: string; note?: string }) {
  await ensureJoint(weldId); chk(await supabase.from('wq_joints').update({ ...patch, updated_at: new Date().toISOString() }).eq('weld_id', weldId))
}

export async function uploadFile(pid: string, weldId: string, file: Blob, name: string): Promise<string> {
  const ext = (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const path = `${pid}/${weldId}/${crypto.randomUUID()}.${ext}`
  chk(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }))
  return path
}
export async function signedUrl(path: string): Promise<string | null> {
  const r = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return r.data?.signedUrl ?? null
}

export async function addFilm(row: { project_id: string; weld_id: string; round: number; exam_type: 'RT' | 'RS'; attempt: number; segment: string; path: string; file_name: string; mime: string; width: number | null; height: number | null; iqi: string; density: string; uploaded_name: string }) {
  await ensureJoint(row.weld_id); chk(await supabase.from('wq_films').insert(row))
}
export async function updateFilm(id: string, patch: Row) { chk(await supabase.from('wq_films').update(patch).eq('id', id)) }
export async function addMark(row: { project_id: string; film_id: string; kind: Mark['kind']; geom: Mark['geom']; label: string }) { chk(await supabase.from('wq_marks').insert(row)) }
export async function removeMark(id: string) { chk(await supabase.from('wq_marks').update({ removed_at: new Date().toISOString() }).eq('id', id)) }
export async function addDefect(row: Row) { await ensureJoint(row.weld_id as string); chk(await supabase.from('wq_defects').insert(row)) }
export async function updateDefect(id: string, patch: Row) { chk(await supabase.from('wq_defects').update(patch).eq('id', id)) }
export async function evaluate(weldId: string, overall: Verdict, summary: string, verdicts: { id: string; verdict: Verdict; reason: string; advice: string }[], thk: number, name: string) {
  chk(await supabase.rpc('wq_evaluate', { p_weld: weldId, p_overall: overall, p_summary: summary, p_verdicts: verdicts, p_thk: thk, p_name: name }))
}
export async function sign(weldId: string, forceCutout: boolean, name: string): Promise<Verdict> {
  return chk(await supabase.rpc('wq_sign', { p_weld: weldId, p_force_cutout: forceCutout, p_name: name })).data as Verdict
}
export async function addRepair(weldId: string, r: { method: string; performedBy: string; approvedBy: string; repairWps: string; note: string }, name: string) {
  chk(await supabase.rpc('wq_repair', { p_weld: weldId, p_method: r.method, p_performed_by: r.performedBy, p_approved_by: r.approvedBy, p_wps: r.repairWps, p_note: r.note, p_name: name }))
}
export async function addVt(row: { project_id: string; weld_id: string; round: number; result: 'accept' | 'reject'; note: string; files: Vt['files']; by_name: string }) { await ensureJoint(row.weld_id); chk(await supabase.from('wq_vt').insert(row)) }
export async function addOpinion(row: { project_id: string; weld_id: string; target_kind: Opinion['targetKind']; target_id: string; stance: Opinion['stance']; body: string; author_name: string }) { chk(await supabase.from('wq_opinions').insert(row)) }
export async function saveCriteria(pid: string, criteria: unknown) { chk(await supabase.from('wq_settings').upsert({ project_id: pid, criteria, updated_at: new Date().toISOString() })) }

const ERR: Record<string, string> = {
  not_allowed: 'دسترسی این کار را ندارید (سطح دسترسی در «مدیریت کاربران» تعیین می‌شود).', file_closed: 'پروندهٔ این سرجوش بسته شده است.',
  no_accepted_film: 'هیچ فیلمی از این راند از نظر کیفیت تأیید نشده؛ ابتدا کیفیت فیلم را بررسی کنید.', no_evaluation: 'هنوز ارزیابی‌ای برای این راند ثبت نشده است.',
  cutout_not_allowed: 'تبدیل به «برش» فقط در راند سوم و برای نتیجهٔ «تعمیر» مجاز است.', max_repairs: 'سقف دو بار تعمیر تکمیل شده؛ طبق رویه باید برش کامل انجام شود.',
  not_repair: 'ثبت تعمیر فقط برای راندی که نتیجهٔ آن «نیاز به تعمیر» است مجاز است.', not_signed: 'پیش از ثبت تعمیر، بازرس NDT باید ارزیابی این راند را تأیید کند.',
  weld_not_found: 'این سرجوش در فهرست مرکزی جوش‌ها پیدا نشد.', 'row-level security': 'دسترسی این کار را ندارید یا پرونده بسته است.',
}
export function explain(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  for (const [k, v] of Object.entries(ERR)) if (m.includes(k)) return v
  return m
}
