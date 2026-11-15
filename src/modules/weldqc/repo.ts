import { supabase } from '../../lib/supabaseClient'
import type { Feat } from './lib/detect'
import { buildWeldFiles, coatTestVerdict, type WeldFile } from '../execution/lib/weldFile'
import { splitStamps } from '../execution/lib/registers'
import type { DefectType, Pass, Verdict } from './lib/rules'
import { sidesFromRows, type CrewRow, type PassSides, type Quadrant } from './lib/crew'
import type { Code } from './lib/api1104'
import type { Metrics } from './lib/filmio'
import type { ActionKind, CapaStatus, CauseCat, Metric, Party, Rule, Severity, Trigger } from './lib/capa'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => (v == null || v === '' ? null : Number(v))
const chk = <T extends { error: unknown }>(r: T): T => { if (r.error) throw r.error; return r }
export const BUCKET = 'wq-films'
/** the report forms a weld's QC file needs (welders of each pass, the execution RT result, coating) */
const FORMS = ['fitup', 'welding', 'tie_in', 'rt_request', 'rt_request_rp', 'rt_report', 'weld_repair', 'fj_coating', 'bond_test']

export interface Welder { id: string; key: string; raw: string; name: string; status: string; kind: string; hasPhoto: boolean; cardNo: string; cardStatus: string; nationalId: string }
export interface Qual { id: string; welderId: string; wqtNo: string; process: string; position: string; materialGroup: string; thkMin: number | null; thkMax: number | null; diaMin: number | null; diaMax: number | null; issueDate: string | null; expiryDate: string | null; status: string }
/** the coating facts of a weld from the daily reports (application form and bond / holiday test) */
export interface CoatFacts { fj?: { date: string; reportNo: string; result: string; thkMin: number | null; sleeve: string; approved: boolean }; bond?: { date: string; reportNo: string; verdict: 'ok' | 'rej' | ''; adhesionFail: boolean; holidays: number | null; holVolt: string; approved: boolean } }
export interface Coating { id: string; weldId: string; kind: 'application' | 'inspection' | 'repair'; random: boolean; applicatorKey: string; system: string; at: string; holidayKv: number | null; holidayCount: number | null; dftMinUm: number | null; adhesion: number | null; visual: '' | 'pass' | 'fail'; result: '' | 'pass' | 'repair' | 'fail'; defects: string; files: { path: string; name: string; mime: string }[]; note: string; createdName: string; removed: boolean }
export interface QcWeld extends WeldFile { stampsBy: Record<Pass, string[]>; weldDate: string; sides: PassSides; lengthM: number | null; tieKm: number | null; coat: CoatFacts; vtReport: string }
export interface Joint { weldId: string; round: number; closed: boolean; finalStatus: Verdict | null; closedAt: string | null; thkMm: number | null; odMm: number | null; service: string; note: string; filmCount: number | null; wpsId: string | null; signs: Record<string, { name: string; at: string }> }
export interface Film { id: string; weldId: string; round: number; examType: 'RT' | 'RS'; attempt: number; segment: string; path: string; fileName: string; mime: string; width: number | null; height: number | null; pxPerMm: number | null; iqi: string; density: string; quality: 'pending' | 'accepted' | 'retake' | 'reshoot'; qualityNote: string; qualityName: string; qualityAt: string | null; uploadedName: string; createdAt: string; displayPath: string | null; origMime: string; metrics: Partial<Metrics>; ai: AiRun | null; /** film number round the pipe, where it starts (mm from 12 o'clock, clockwise) and the length of weld it covers */ seq: number | null; startMm: number | null; lenMm: number | null; shotAt: string | null }
/** the last run of the candidate-region assistant on a film, and what the interpreter did with each candidate */
export interface AiRun { at: string; band: boolean; version?: string; items: { code: string | null; why: string; confidence: number; clock: number | null; bbox: { x: number; y: number; w: number; h: number }; action: '' | 'accepted' | 'modified' | 'dismissed' }[] }
export interface Mark { id: string; filmId: string; kind: 'line' | 'box' | 'point' | 'calib'; geom: { x1: number; y1: number; x2: number; y2: number }; label: string }
export interface Defect { id: string; weldId: string; filmId: string | null; round: number; type: DefectType; lengthMm: number; depthMm: number; positionMm: number; pass: Pass | ''; welders: string[]; bbox: { x: number; y: number; w: number; h: number } | null; detectedBy: 'manual' | 'ai'; confidence: number | null; verdict: Verdict | null; verdictReason: string; repairAdvice: string; note: string; removed: boolean; createdName: string; createdAt: string; code: Code | ''; widthMm: number | null; clock: number | null; quadrant: number | null; densityOver: boolean; aiAction: '' | 'accepted' | 'modified' }
export interface Evaluation { id: string; weldId: string; round: number; overall: Verdict; summary: string; thkMm: number | null; evaluatedName: string; evaluatedAt: string; signedName: string; signedAt: string | null; forcedCutout: boolean; /** the round was signed by the person who evaluated it (allowed to the QC manager only, and shown) */ samePerson: boolean }
export interface Repair { id: string; weldId: string; round: number; method: string; performedBy: string; approvedBy: string; repairWps: string; note: string; createdName: string; createdAt: string; clockFrom: number | null; clockTo: number | null; repairWpsId: string | null }
export interface Vt { id: string; weldId: string; round: number; result: 'accept' | 'reject'; note: string; files: { path: string; name: string; mime: string }[]; byName: string; at: string }
export interface Opinion { id: string; weldId: string; targetKind: 'defect' | 'evaluation' | 'joint'; targetId: string; stance: 'agree' | 'disagree' | 'note'; body: string; authorName: string; at: string }

export interface WqData {
  welds: QcWeld[]; welders: Welder[]; joints: Joint[]; films: Film[]; marks: Mark[]; defects: Defect[]
  evaluations: Evaluation[]; repairs: Repair[]; vts: Vt[]; opinions: Opinion[]; criteria: unknown
  wps: Wps[]; pipes: StrungPipe[]
  capa: CapaCase[]; capaAttendees: CapaAttendee[]; capaActions: CapaAction[]; capaEvents: CapaEvent[]
  crew: (CrewRow & { weldId: string })[]; coatings: Coating[]; quals: Qual[]
  /** hydrotest sections of the line (testing module) — the final test of a weld */
  sections: { code: string; kmFrom: number; kmTo: number; stage: string; failed: boolean }[]
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
  const [welds, links, reports, welders, joints, films, marks, defects, evals, repairs, vts, opinions, crew, coatings, quals, settings, hts] = await Promise.all([
    byProject('ex_welds', pid, 'id, project_id, section_raw, weld_raw, pipe_no, status, c_pipe, c_size, c_thk, c_length, c_bend'),
    byProject('ex_line_welds', pid, 'line_id, weld_id, project_id'),
    pages((a, b) => supabase.from('ex_reports').select('id, form_key, report_date, report_no, status').eq('project_id', pid).in('form_key', FORMS).range(a, b)),
    byProject('ex_welders', pid, 'id, welder_key, welder_raw, full_name, status, kind, has_photo, card_no, card_status, national_id'),
    byProject('wq_joints', pid), byProject('wq_films', pid), byProject('wq_marks', pid), byProject('wq_defects', pid),
    byProject('wq_evaluations', pid), byProject('wq_repairs', pid), byProject('wq_vt', pid), byProject('wq_opinions', pid),
    byProject('wq_crew', pid), byProject('wq_coating', pid), byProject('ex_welder_quals', pid, 'id, welder_id, wqt_no, process, position, material_group, thk_min, thk_max, dia_min, dia_max, issue_date, expiry_date, status'),
    supabase.from('wq_settings').select('criteria').eq('project_id', pid).maybeSingle(),
    supabase.from('ht_sections').select('code, km_from, km_to, stage, failed').eq('master_project_id', pid),
  ])
  const [wpsRows, pipes] = await Promise.all([byProject('wq_wps', pid).then((r) => r.filter((x) => !x.removed_at)).catch(() => [] as Row[]), loadStrung(pid).catch(() => [] as StrungPipe[])])
  const [capa, capaAtt, capaAct, capaEv] = await Promise.all(['wq_capa', 'wq_capa_attendees', 'wq_capa_actions', 'wq_capa_events'].map((t) => byProject(t, pid).catch(() => [] as Row[])))
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
  // the report rows of each weld: who welded which half of each pass, the coating application and its test
  const repById = new Map(reports.map((r) => [r.id as string, r]))
  const lineById = new Map(lines.map((l) => [l.id as string, l]))
  const rowsOf = new Map<string, { formKey: string; detail: Record<string, unknown>; date: string; reportNo: string; approved: boolean }[]>()
  for (const k of links) {
    const l = lineById.get(k.line_id), r = l ? repById.get(l.report_id) : undefined
    if (!l || !r || r.status === 'rejected') continue
    const x = rowsOf.get(k.weld_id) ?? []; x.push({ formKey: s(r.form_key), detail: (l.detail ?? {}) as Record<string, unknown>, date: s(r.report_date), reportNo: s(r.report_no), approved: r.status === 'approved' }); rowsOf.set(k.weld_id, x)
  }
  const num = (v: unknown) => { const x = Number(String(v ?? '').replace('٫', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(x) ? x : null }
  const facts = (rows: { formKey: string; detail: Record<string, unknown>; date: string; reportNo: string; approved: boolean }[]) => {
    const c: CoatFacts = {}
    for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      const d = r.detail
      if (r.formKey === 'fj_coating') { const t = ['thk12', 'thk3', 'thk6', 'thk9'].map((k) => num(d[k])).filter((v): v is number => v != null); c.fj = { date: r.date, reportNo: r.reportNo, result: s(d.result), thkMin: t.length ? Math.min(...t) : null, sleeve: s(d.sleeveType), approved: r.approved } }
      if (r.formKey === 'bond_test') { const hol = num(d.holCount); c.bond = { date: r.date, reportNo: r.reportNo, verdict: coatTestVerdict(d), adhesionFail: s(d.adhPipeOk) === 'rej' || s(d.adhMainOk) === 'rej', holidays: hol, holVolt: s(d.holVolt), approved: r.approved } }
    }
    return c
  }
  return {
    welds: files.map((f) => {
      const rows = rowsOf.get(f.id) ?? []
      const weldRow = rows.find((r) => r.formKey === 'welding' || r.formKey === 'tie_in')
      return { ...f, weldDate: f.welding?.date ?? '', stampsBy: { root: splitStamps(f.welding?.stamps.root), hot: splitStamps(f.welding?.stamps.hot), fill: splitStamps(f.welding?.stamps.fill), cap: splitStamps(f.welding?.stamps.cap) }, sides: sidesFromRows(rows, splitStamps), lengthM: num(f.central.length ?? weldRow?.detail.lengthM), tieKm: num(rows.find((r) => r.formKey === 'tie_in')?.detail.km), coat: facts(rows), vtReport: s(weldRow?.detail.vt) }
    }),
    welders: welders.map((w) => ({ id: w.id, key: s(w.welder_key), raw: s(w.welder_raw), name: s(w.full_name), status: s(w.status), kind: s(w.kind) || 'welder', hasPhoto: !!w.has_photo, cardNo: s(w.card_no), cardStatus: s(w.card_status), nationalId: s(w.national_id) })),
    quals: quals.map((q) => ({ id: q.id, welderId: q.welder_id, wqtNo: s(q.wqt_no), process: s(q.process), position: s(q.position), materialGroup: s(q.material_group), thkMin: n(q.thk_min), thkMax: n(q.thk_max), diaMin: n(q.dia_min), diaMax: n(q.dia_max), issueDate: q.issue_date ?? null, expiryDate: q.expiry_date ?? null, status: s(q.status) })),
    crew: crew.map((c) => ({ id: c.id, weldId: c.weld_id, pass: c.pass, quadrant: Number(c.quadrant) as Quadrant, welderKey: s(c.welder_key), position: s(c.position), direction: s(c.direction) as CrewRow['direction'], process: s(c.process), startedAt: c.started_at ?? null, finishedAt: c.finished_at ?? null, vt: s(c.vt) as CrewRow['vt'], note: s(c.note), removed: !!c.removed_at })),
    coatings: coatings.map((c) => ({ id: c.id, weldId: c.weld_id, kind: c.kind, random: !!c.random_test, applicatorKey: s(c.applicator_key), system: s(c.system), at: s(c.at), holidayKv: n(c.holiday_kv), holidayCount: n(c.holiday_count), dftMinUm: n(c.dft_min_um), adhesion: n(c.adhesion), visual: s(c.visual) as Coating['visual'], result: s(c.result) as Coating['result'], defects: s(c.defects), files: (c.files ?? []) as Coating['files'], note: s(c.note), createdName: s(c.created_name), removed: !!c.removed_at })).sort((a, b) => a.at.localeCompare(b.at)),
    joints: joints.map((j) => ({ weldId: j.weld_id, round: Number(j.current_round) || 0, closed: !!j.is_closed, finalStatus: j.final_status ?? null, closedAt: j.closed_at ?? null, thkMm: n(j.thk_mm), odMm: n(j.od_mm), service: s(j.service_type), note: s(j.note), filmCount: n(j.film_count), wpsId: j.wps_id ?? null, signs: (j.signs ?? {}) as Joint['signs'] })),
    films: films.map((f) => ({ id: f.id, weldId: f.weld_id, round: Number(f.round) || 0, examType: f.exam_type, attempt: Number(f.attempt) || 1, segment: s(f.segment), path: s(f.path), fileName: s(f.file_name), mime: s(f.mime), width: n(f.width), height: n(f.height), pxPerMm: n(f.px_per_mm), iqi: s(f.iqi), density: s(f.density), quality: f.quality_status, qualityNote: s(f.quality_note), qualityName: s(f.quality_name), qualityAt: f.quality_at ?? null, uploadedName: s(f.uploaded_name), createdAt: s(f.created_at), displayPath: f.display_path ?? null, origMime: s(f.orig_mime), metrics: (f.metrics ?? {}) as Partial<Metrics>, ai: (f.ai ?? null) as AiRun | null, seq: n(f.seq), startMm: n(f.start_mm), lenMm: n(f.len_mm), shotAt: f.shot_at ?? null })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    marks: marks.filter((m) => !m.removed_at).map((m) => ({ id: m.id, filmId: m.film_id, kind: m.kind, geom: m.geom, label: s(m.label) })),
    defects: defects.map((d) => ({ id: d.id, weldId: d.weld_id, filmId: d.film_id ?? null, round: Number(d.round) || 0, type: d.defect_type, lengthMm: Number(d.length_mm) || 0, depthMm: Number(d.depth_mm) || 0, positionMm: Number(d.position_mm) || 0, pass: s(d.pass) as Pass | '', welders: (d.welders ?? []) as string[], bbox: d.bbox ?? null, detectedBy: d.detected_by, confidence: n(d.confidence), verdict: d.verdict ?? null, verdictReason: s(d.verdict_reason), repairAdvice: s(d.repair_advice), note: s(d.note), removed: !!d.removed_at, createdName: s(d.created_name), createdAt: s(d.created_at), code: s(d.code) as Code | '', widthMm: n(d.width_mm), clock: n(d.clock), quadrant: n(d.quadrant), densityOver: !!d.density_over, aiAction: s(d.ai_action) as Defect['aiAction'] })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    evaluations: evals.map((e) => ({ id: e.id, weldId: e.weld_id, round: Number(e.round) || 0, overall: e.overall_status, summary: s(e.summary), thkMm: n(e.thk_mm), evaluatedName: s(e.evaluated_name), evaluatedAt: s(e.evaluated_at), signedName: s(e.signed_name), signedAt: e.signed_at ?? null, forcedCutout: !!e.forced_cutout, samePerson: !!e.same_person })).sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt)),
    repairs: repairs.map((r) => ({ id: r.id, weldId: r.weld_id, round: Number(r.round) || 0, method: s(r.method), performedBy: s(r.performed_by), approvedBy: s(r.approved_by), repairWps: s(r.repair_wps), note: s(r.note), createdName: s(r.created_name), createdAt: s(r.created_at), clockFrom: n(r.clock_from), clockTo: n(r.clock_to), repairWpsId: r.repair_wps_id ?? null })),
    vts: vts.map((v) => ({ id: v.id, weldId: v.weld_id, round: Number(v.round) || 0, result: v.result, note: s(v.note), files: (v.files ?? []) as Vt['files'], byName: s(v.by_name), at: s(v.at) })).sort((a, b) => a.at.localeCompare(b.at)),
    opinions: opinions.map((o) => ({ id: o.id, weldId: o.weld_id, targetKind: o.target_kind, targetId: o.target_id, stance: o.stance, body: s(o.body), authorName: s(o.author_name), at: s(o.at) })).sort((a, b) => a.at.localeCompare(b.at)),
    criteria: (settings.data as Row | null)?.criteria ?? null,
    wps: wpsRows.map(wpsOf), pipes,
    capa: capa.map(capaOf).sort((a, b) => b.seq - a.seq), capaAttendees: capaAtt.map(attOf).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    capaActions: capaAct.filter((a) => !a.removed_at).map(actOf).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), capaEvents: capaEv.map((e) => ({ id: Number(e.id), caseId: e.case_id, at: s(e.at), byName: s(e.by_name), kind: s(e.kind), note: s(e.note) })).sort((a, b) => a.at.localeCompare(b.at)),
    sections: ((hts.data ?? []) as Row[]).map((x) => ({ code: s(x.code), kmFrom: Number(x.km_from), kmTo: Number(x.km_to), stage: s(x.stage), failed: !!x.failed })),
  }
}

/** which module actions the signed-in person holds on this project (the database decides; this only shapes the screen) */
export async function loadCaps(pid: string): Promise<Record<'submit' | 'edit' | 'approve' | 'configure', boolean>> {
  const r = await supabase.rpc('wq_my_caps', { p_project: pid })
  const d = (r.data ?? {}) as Record<string, unknown>
  return { submit: d.submit === true, edit: d.edit === true, approve: d.approve === true, configure: d.configure === true }
}
export async function ensureJoint(weldId: string) { chk(await supabase.rpc('wq_ensure_joint', { p_weld: weldId })) }
export async function updateJoint(weldId: string, patch: { thk_mm?: number | null; od_mm?: number | null; service_type?: string; note?: string; film_count?: number | null }) {
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

export async function addFilm(row: { project_id: string; weld_id: string; round: number; exam_type: 'RT' | 'RS'; attempt: number; segment: string; path: string; file_name: string; mime: string; width: number | null; height: number | null; iqi: string; density: string; uploaded_name: string; display_path?: string | null; orig_mime?: string; metrics?: unknown; seq?: number | null; start_mm?: number | null; len_mm?: number | null; shot_at?: string | null }) {
  await ensureJoint(row.weld_id); chk(await supabase.from('wq_films').insert(row))
}
export async function updateFilm(id: string, patch: Row) { chk(await supabase.from('wq_films').update(patch).eq('id', id)) }
export async function addMark(row: { project_id: string; film_id: string; kind: Mark['kind']; geom: Mark['geom']; label: string }) { chk(await supabase.from('wq_marks').insert(row)) }
export async function removeMark(id: string) { chk(await supabase.from('wq_marks').update({ removed_at: new Date().toISOString() }).eq('id', id)) }
export async function addDefect(row: Row): Promise<string> { await ensureJoint(row.weld_id as string); const r = chk(await supabase.from('wq_defects').insert(row).select('id').single()); return (r.data as Row).id as string }
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
export async function addCrew(rows: Record<string, unknown>[]) { if (rows.length) { await ensureJoint(rows[0].weld_id as string); chk(await supabase.from('wq_crew').insert(rows)) } }
export async function removeCrew(id: string) { chk(await supabase.from('wq_crew').update({ removed_at: new Date().toISOString() }).eq('id', id)) }
export async function addCoating(row: Record<string, unknown>) { await ensureJoint(row.weld_id as string); chk(await supabase.from('wq_coating').insert(row)) }
export async function removeCoating(id: string) { chk(await supabase.from('wq_coating').update({ removed_at: new Date().toISOString() }).eq('id', id)) }
/** a person's photo (lists do not carry images) */
export async function welderPhoto(id: string): Promise<string> { const r = await supabase.from('ex_welders').select('photo').eq('id', id).maybeSingle(); return s((r.data as Row | null)?.photo) }
export async function saveCriteria(pid: string, criteria: unknown) { chk(await supabase.from('wq_settings').upsert({ project_id: pid, criteria, updated_at: new Date().toISOString() })) }

const ERR: Record<string, string> = {
  not_allowed: 'دسترسی این کار را ندارید (سطح دسترسی در «مدیریت کاربران» تعیین می‌شود).', file_closed: 'پروندهٔ این سرجوش بسته شده است.',
  film_quality_pending: 'کیفیت همهٔ فیلم‌های این راند هنوز بررسی نشده؛ ابتدا برای هر فیلم تأیید، ریتیک یا ریشوت را ثبت کنید.', same_person: 'ارزیاب و تأییدکنندهٔ نهایی نباید یک نفر باشند؛ بازرس NDT دیگری (یا مدیر کنترل کیفیت) تأیید کند.',
  no_accepted_film: 'هیچ فیلمی از این راند از نظر کیفیت تأیید نشده؛ ابتدا کیفیت فیلم را بررسی کنید.', no_evaluation: 'هنوز ارزیابی‌ای برای این راند ثبت نشده است.',
  cutout_not_allowed: 'تبدیل به «برش» فقط در راند سوم و برای نتیجهٔ «تعمیر» مجاز است.', max_repairs: 'سقف دو بار تعمیر تکمیل شده؛ طبق رویه باید برش کامل انجام شود.',
  not_repair: 'ثبت تعمیر فقط برای راندی که نتیجهٔ آن «نیاز به تعمیر» است مجاز است.', not_signed: 'پیش از ثبت تعمیر، بازرس NDT باید ارزیابی این راند را تأیید کند.',
  capa_no_containment: 'ابتدا اقدام فوری مهار را بنویسید (دست‌کم یک جمله).', capa_no_owner: 'مسئول پرونده را تعیین کنید.', capa_no_meeting: 'زمان برگزاری جلسهٔ ریشه‌یابی ثبت نشده یا هنوز نرسیده است.', capa_no_minutes: 'شرح مذاکرات جلسه نوشته نشده است.',
  capa_no_root: 'علت ریشه‌ای توافق‌شده نوشته نشده است.', capa_no_corrective: 'دست‌کم یک اقدام اصلاحی با مسئول و مهلت لازم است.', capa_no_preventive: 'دست‌کم یک اقدام پیشگیرانه با مسئول و مهلت لازم است.',
  capa_quorum: 'تعداد حاضران جلسه به حد نصاب نرسیده است.', capa_parties: 'در جلسهٔ پروندهٔ الزامی باید هم پیمانکار / کنترل کیفیت و هم نظارت / مشاور / کارفرما حاضر باشند.', capa_unsigned: 'همهٔ حاضران هنوز صورتجلسه را امضا نکرده‌اند.',
  capa_sign_self: 'هر عضو فقط خودش می‌تواند صورتجلسه را امضا کند.', capa_actions_open: 'هنوز همهٔ اقدام‌ها انجام نشده‌اند.', capa_same_person: 'سنجش اثربخشی باید توسط کسی غیر از مسئول پرونده انجام شود.', capa_locked: 'این پرونده در این مرحله قابل تغییر نیست.',
  capa_bad_step: 'این مرحله اکنون مجاز نیست.', capa_action_incomplete: 'عنوان اقدام، مسئول و مهلت را کامل کنید.', capa_dup_attendee: 'این فرد پیش‌تر به جلسه اضافه شده است.', capa_no_title: 'عنوان پرونده را بنویسید.', capa_no_name: 'نام عضو جلسه را بنویسید.', note_required: 'برای این کار نوشتن توضیح لازم است.',
  capa_required: 'این NCR نیازمند تحلیل علت ریشه‌ای است؛ تا پروندهٔ CAPA آن بسته نشود، NCR بسته نمی‌شود.',
  weld_not_found: 'این سرجوش در فهرست مرکزی جوش‌ها پیدا نشد.', 'row-level security': 'دسترسی این کار را ندارید یا پرونده بسته است.',
}
export function explain(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  for (const [k, v] of Object.entries(ERR)) if (m.includes(k)) return v
  return m
}

// ── the image assistant's learning record (append-only): what the interpreter did with each candidate, and what it missed
export interface AiSample { id: string; projectId: string; weldId: string; filmId: string; detector: string; bbox: { x: number; y: number; w: number; h: number } | null; feats: Feat | null; aiCode: string | null; confidence: number | null; action: 'accepted' | 'modified' | 'dismissed' | 'missed'; finalCode: string | null; byName: string; at: string }
/** every row the user may see (their projects): more decisions make a steadier ranking */
export async function loadAiSamples(): Promise<AiSample[]> {
  const rows = await pages((a, b) => supabase.from('wq_ai_samples').select('*').order('at').range(a, b))
  return rows.map((r) => ({ id: r.id, projectId: r.project_id, weldId: r.weld_id, filmId: r.film_id, detector: s(r.detector), bbox: r.bbox ?? null, feats: (r.feats ?? null) as Feat | null, aiCode: r.ai_code ?? null, confidence: n(r.confidence), action: r.action, finalCode: r.final_code ?? null, byName: s(r.by_name), at: s(r.at) }))
}
export async function addAiSample(row: Row) { chk(await supabase.from('wq_ai_samples').insert(row)) }

// ── approved welding procedures and their PQRs
export interface Wps { id: string; kind: 'main' | 'repair' | 'tie_in'; wpsNo: string; rev: string; process: string; filler: string; positions: string; direction: string; material: string; diaMinIn: number | null; diaMaxIn: number | null; thkMinMm: number | null; thkMaxMm: number | null; pqrNos: string; status: 'draft' | 'approved' | 'withdrawn'; approvedBy: string; approvedAt: string | null; note: string }
const wpsOf = (r: Row): Wps => ({ id: r.id, kind: r.kind, wpsNo: s(r.wps_no), rev: s(r.rev), process: s(r.process), filler: s(r.filler), positions: s(r.positions), direction: s(r.direction), material: s(r.material), diaMinIn: n(r.dia_min_in), diaMaxIn: n(r.dia_max_in), thkMinMm: n(r.thk_min_mm), thkMaxMm: n(r.thk_max_mm), pqrNos: s(r.pqr_nos), status: r.status, approvedBy: s(r.approved_by), approvedAt: r.approved_at ?? null, note: s(r.note) })
export async function saveWps(pid: string, w: Partial<Wps> & { wpsNo: string }, name: string) {
  const row = { project_id: pid, kind: w.kind ?? 'main', wps_no: w.wpsNo.trim(), rev: w.rev ?? '', process: w.process ?? '', filler: w.filler ?? '', positions: w.positions ?? '', direction: w.direction ?? '', material: w.material ?? '', dia_min_in: w.diaMinIn ?? null, dia_max_in: w.diaMaxIn ?? null, thk_min_mm: w.thkMinMm ?? null, thk_max_mm: w.thkMaxMm ?? null, pqr_nos: w.pqrNos ?? '', status: w.status ?? 'draft', approved_by: w.approvedBy ?? '', approved_at: w.approvedAt || null, note: w.note ?? '', updated_at: new Date().toISOString() }
  chk(w.id ? await supabase.from('wq_wps').update(row).eq('id', w.id) : await supabase.from('wq_wps').insert({ ...row, created_name: name }))
}
export async function removeWps(id: string) { chk(await supabase.from('wq_wps').update({ removed_at: new Date().toISOString() }).eq('id', id)) }
export async function setWps(weldId: string, wpsId: string | null) { chk(await supabase.rpc('wq_set_wps', { p_weld: weldId, p_wps: wpsId })) }
export async function repairZone(weldId: string, round: number, from: number | null, to: number | null, wpsId: string | null) { chk(await supabase.rpc('wq_repair_zone', { p_weld: weldId, p_round: round, p_from: from, p_to: to, p_wps: wpsId })) }
export async function passportSign(weldId: string, role: string, name: string | null) { chk(await supabase.rpc('wq_passport_sign', { p_weld: weldId, p_role: role, p_name: name })) }

// ── pipes as strung (the stringing reports): number, length, wall — in the order they were laid out
export interface StrungPipe { pipeNo: string; lengthM: number | null; thkIn: number | null; origin: string; date: string; reportNo: string; front: string; order: number }
async function loadStrung(pid: string): Promise<StrungPipe[]> {
  const reps = await pages((a, b) => supabase.from('ex_reports').select('id, report_date, report_no, front, status').eq('project_id', pid).eq('form_key', 'string').range(a, b))
  const live = reps.filter((r) => r.status !== 'rejected'); if (!live.length) return []
  const out: StrungPipe[] = [], by = new Map(live.map((r) => [r.id as string, r]))
  const ids = live.map((r) => r.id as string)
  for (let i = 0; i < ids.length; i += 100) {
    const r = chk(await supabase.from('ex_report_lines').select('report_id, line_no, detail').in('report_id', ids.slice(i, i + 100)))
    for (const l of (r.data ?? []) as Row[]) { const rep = by.get(l.report_id)!, d = (l.detail ?? {}) as Row; if (!s(d.pipeNo).trim()) continue; out.push({ pipeNo: s(d.pipeNo).trim(), lengthM: n(d.lengthM), thkIn: n(d.thkIn), origin: s(d.origin), date: s(rep.report_date), reportNo: s(rep.report_no), front: s(rep.front), order: Number(l.line_no) || 0 }) }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.reportNo.localeCompare(b.reportNo) || a.order - b.order).map((p, i) => ({ ...p, order: i }))
}

// ── corrective / preventive action cases (every write is a database function: the gates live there)
export interface CapaCase {
  id: string; projectId: string; seq: number; code: string; fingerprint: string | null; rule: Rule; source: 'system' | 'manual' | 'ncr'; mandatory: boolean; severity: Severity; status: CapaStatus; round: number
  title: string; problem: string; evidence: string; scope: Trigger['scope']; baseline: Partial<Metric>; containment: string; ncrId: string | null; ownerId: string | null; ownerName: string
  meetingDue: string; meetingAt: string | null; meetingPlace: string; minutes: string; whys: string[]; causes: { cat: CauseCat; text: string; root: boolean }[]; rootCause: string
  agreedAt: string | null; verifyDue: string | null; verifyResult: 'effective' | 'ineffective' | null; verifyNote: string; verifyMetric: Partial<Metric> | null; verifiedName: string; verifiedAt: string | null
  closedAt: string | null; voidReason: string; openedName: string; openedAt: string
}
export interface CapaAttendee { id: string; caseId: string; round: number; userId: string | null; name: string; party: Party; role: string; present: boolean; signedAt: string | null; paper: boolean; createdAt: string }
export interface CapaAction { id: string; caseId: string; round: number; kind: ActionKind; title: string; ownerId: string | null; ownerName: string; dueDate: string; status: 'open' | 'done'; doneAt: string | null; doneNote: string; doneName: string; createdAt: string }
export interface CapaEvent { id: number; caseId: string; at: string; byName: string; kind: string; note: string }
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const capaOf = (r: Row): CapaCase => ({ id: r.id, projectId: r.project_id, seq: Number(r.seq), code: s(r.code), fingerprint: r.fingerprint ?? null, rule: s(r.rule) as Rule, source: r.source, mandatory: !!r.mandatory, severity: r.severity, status: r.status, round: Number(r.round) || 1,
  title: s(r.title), problem: s(r.problem), evidence: s(r.evidence), scope: (r.scope ?? {}) as Trigger['scope'], baseline: (r.baseline ?? {}) as Partial<Metric>, containment: s(r.containment), ncrId: r.ncr_id ?? null, ownerId: r.owner_id ?? null, ownerName: s(r.owner_name),
  meetingDue: s(r.meeting_due), meetingAt: r.meeting_at ?? null, meetingPlace: s(r.meeting_place), minutes: s(r.minutes), whys: arr<string>(r.whys).map(s), causes: arr<CapaCase['causes'][number]>(r.causes), rootCause: s(r.root_cause),
  agreedAt: r.agreed_at ?? null, verifyDue: r.verify_due ?? null, verifyResult: r.verify_result ?? null, verifyNote: s(r.verify_note), verifyMetric: (r.verify_metric ?? null) as Partial<Metric> | null, verifiedName: s(r.verified_name), verifiedAt: r.verified_at ?? null,
  closedAt: r.closed_at ?? null, voidReason: s(r.void_reason), openedName: s(r.opened_name), openedAt: s(r.opened_at) })
const attOf = (r: Row): CapaAttendee => ({ id: r.id, caseId: r.case_id, round: Number(r.round) || 1, userId: r.user_id ?? null, name: s(r.name), party: r.party, role: s(r.role), present: !!r.present, signedAt: r.signed_at ?? null, paper: !!r.paper, createdAt: s(r.created_at) })
const actOf = (r: Row): CapaAction => ({ id: r.id, caseId: r.case_id, round: Number(r.round) || 1, kind: r.kind, title: s(r.title), ownerId: r.owner_id ?? null, ownerName: s(r.owner_name), dueDate: s(r.due_date), status: r.status, doneAt: r.done_at ?? null, doneNote: s(r.done_note), doneName: s(r.done_name), createdAt: s(r.created_at) })
export async function capaOpen(pid: string, p: Record<string, unknown>): Promise<string> { return chk(await supabase.rpc('wq_capa_open', { p_project: pid, p })).data as string }
export async function capaSave(id: string, p: Record<string, unknown>) { chk(await supabase.rpc('wq_capa_save', { p_id: id, p })) }
export async function capaAttendee(caseId: string, op: 'add' | 'remove' | 'present', p: Record<string, unknown>) { chk(await supabase.rpc('wq_capa_attendee', { p_case: caseId, p_op: op, p })) }
export async function capaSign(attendeeId: string) { chk(await supabase.rpc('wq_capa_sign', { p_attendee: attendeeId })) }
export async function capaAction(caseId: string, op: 'add' | 'remove' | 'done' | 'undo', p: Record<string, unknown>) { chk(await supabase.rpc('wq_capa_action', { p_case: caseId, p_op: op, p })) }
export async function capaAdvance(id: string, to: 'rca' | 'agreed' | 'verifying' | 'void', note = '', verifyDays = 30) { chk(await supabase.rpc('wq_capa_advance', { p_id: id, p_to: to, p_note: note, p_verify_days: verifyDays })) }
export async function capaVerify(id: string, result: 'effective' | 'ineffective', note: string, metric: unknown) { chk(await supabase.rpc('wq_capa_verify', { p_id: id, p_result: result, p_note: note, p_metric: metric })) }
