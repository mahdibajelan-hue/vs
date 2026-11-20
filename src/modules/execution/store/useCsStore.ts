import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { explainExecutionError } from '../lib/errors'
import type { CsEquipment, CsInspection, CsLine, CsSpool, CsTestPack, CsWeld, SpoolStage } from '../lib/csCore'
import { DEFAULT_QC_RULES, withDefaults, type QcRules } from '../lib/csQc'
import type { PlotShape } from '../lib/csTwin'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const nn = (x: unknown): number | null => (x == null || x === '' ? null : Number(x))
const fail = (action: string, error: { message: string } | null) => { if (!error) return false; useSystemStore.getState().setStorageError(`خطا در ${action}: ${explainExecutionError(error)}`); return true }

const lineRow = (r: Row): CsLine => ({ id: r.id, projectId: r.project_id, lineNo: r.line_no, service: r.service ?? '', sizeIn: Number(r.size_in), specClass: r.spec_class ?? '', material: r.material ?? '', area: r.area ?? '', isoNo: r.iso_no ?? '', designPressBar: nn(r.design_press_bar), ndtPct: Number(r.ndt_pct ?? 100), testPackId: r.test_pack_id, note: r.note ?? '', archived: !!r.archived })
const spoolRow = (r: Row): CsSpool => ({ id: r.id, projectId: r.project_id, lineId: r.line_id, spoolNo: r.spool_no, isoNo: r.iso_no ?? '', sizeIn: nn(r.size_in), weightKg: nn(r.weight_kg), area: r.area ?? '', stage: r.stage, stageDates: r.stage_dates ?? {}, note: r.note ?? '', archived: !!r.archived })
const weldRow = (r: Row): CsWeld => ({ id: r.id, projectId: r.project_id, lineId: r.line_id, spoolId: r.spool_id, weldNo: r.weld_no, location: r.location, jointType: r.joint_type, sizeIn: Number(r.size_in), thkMm: nn(r.thk_mm), material: r.material ?? '', wps: r.wps ?? '', welder: r.welder ?? '', fitupDate: r.fitup_date, weldDate: r.weld_date, ndtMethod: r.ndt_method ?? '', ndtResult: r.ndt_result, ndtDate: r.ndt_date, ndtReport: r.ndt_report ?? '', repairCount: r.repair_count ?? 0, note: r.note ?? '', archived: !!r.archived, ndtSelected: !!r.ndt_selected, ndtReason: r.ndt_reason ?? '' })
const eqRow = (r: Row): CsEquipment => ({ id: r.id, projectId: r.project_id, tag: r.tag, title: r.title ?? '', kind: r.kind ?? 'other', area: r.area ?? '', weightT: nn(r.weight_t), steps: r.steps ?? {}, note: r.note ?? '', archived: !!r.archived, pssrSystemId: r.pssr_system_id ?? null })
const inspRow = (r: Row): CsInspection => ({ id: r.id, projectId: r.project_id, discipline: r.discipline, itpKey: r.itp_key, subjectType: r.subject_type, subjectId: r.subject_id, subjectLabel: r.subject_label ?? '', inspDate: r.insp_date, holdPoint: r.hold_point ?? '', values: r.values ?? {}, result: r.result, reportNo: r.report_no ?? '', inspector: r.inspector ?? '', note: r.note ?? '', archived: !!r.archived })
const plotRow = (r: Row): PlotShape => ({ id: r.id, projectId: r.project_id, kind: r.kind, refId: r.ref_id, areaName: r.area_name ?? '', label: r.label ?? '', x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h), rot: Number(r.rot ?? 0), points: Array.isArray(r.points) ? r.points : [], z: r.z ?? 0, note: r.note ?? '', archived: !!r.archived })
const packRow = (r: Row): CsTestPack => ({ id: r.id, projectId: r.project_id, packNo: r.pack_no, system: r.system ?? '', medium: r.medium, testPressBar: nn(r.test_press_bar), status: r.status, punchA: r.punch_a ?? 0, punchB: r.punch_b ?? 0, testDate: r.test_date, reinstatedDate: r.reinstated_date, note: r.note ?? '', archived: !!r.archived, pssrSystemId: r.pssr_system_id ?? null })

/** camelCase patch → the table's columns (only the keys given) */
const COLS: Record<string, string> = {
  lineNo: 'line_no', service: 'service', sizeIn: 'size_in', specClass: 'spec_class', material: 'material', area: 'area', isoNo: 'iso_no', designPressBar: 'design_press_bar', ndtPct: 'ndt_pct', testPackId: 'test_pack_id', note: 'note', archived: 'archived',
  lineId: 'line_id', spoolNo: 'spool_no', weightKg: 'weight_kg', stage: 'stage', stageDates: 'stage_dates',
  spoolId: 'spool_id', weldNo: 'weld_no', location: 'location', jointType: 'joint_type', thkMm: 'thk_mm', wps: 'wps', welder: 'welder', fitupDate: 'fitup_date', weldDate: 'weld_date', ndtMethod: 'ndt_method', ndtResult: 'ndt_result', ndtDate: 'ndt_date', ndtReport: 'ndt_report', repairCount: 'repair_count', ndtSelected: 'ndt_selected', ndtReason: 'ndt_reason',
  tag: 'tag', title: 'title', kind: 'kind', weightT: 'weight_t', steps: 'steps',
  discipline: 'discipline', itpKey: 'itp_key', subjectType: 'subject_type', subjectId: 'subject_id', subjectLabel: 'subject_label', inspDate: 'insp_date', holdPoint: 'hold_point', values: 'values', result: 'result', reportNo: 'report_no', inspector: 'inspector',
  refId: 'ref_id', areaName: 'area_name', label: 'label', x: 'x', y: 'y', w: 'w', h: 'h', rot: 'rot', points: 'points', z: 'z',
  pssrSystemId: 'pssr_system_id',
  packNo: 'pack_no', system: 'system', medium: 'medium', testPressBar: 'test_press_bar', status: 'status', punchA: 'punch_a', punchB: 'punch_b', testDate: 'test_date', reinstatedDate: 'reinstated_date',
}
const toRow = (p: Record<string, unknown>) => { const o: Row = {}; for (const [k, v] of Object.entries(p)) if (COLS[k] && v !== undefined) o[COLS[k]] = v === '' && /Date$|Id$/.test(k) ? null : v; return o }

export type CsEntity = 'lines' | 'spools' | 'welds' | 'equipment' | 'packs' | 'inspections' | 'plot'
const TABLE: Record<CsEntity, string> = { lines: 'cs_lines', spools: 'cs_spools', welds: 'cs_welds', equipment: 'cs_equipment', packs: 'cs_test_packs', inspections: 'cs_inspections', plot: 'cs_plot_shapes' }
const MAP = { lines: lineRow, spools: spoolRow, welds: weldRow, equipment: eqRow, packs: packRow, inspections: inspRow, plot: plotRow }
const FA: Record<CsEntity, string> = { lines: 'لاین', spools: 'اسپول', welds: 'سرجوش', equipment: 'تجهیز', packs: 'تست‌پک', inspections: 'بازرسی ITP', plot: 'نقشهٔ جانمایی' }

interface State {
  projectId: string | null; loading: boolean
  lines: CsLine[]; spools: CsSpool[]; welds: CsWeld[]; equipment: CsEquipment[]; packs: CsTestPack[]
  inspections: CsInspection[]; rules: QcRules; rulesSaved: boolean
  /** the QC tables of migration 051 are not on this database yet */
  qcMissing: boolean
  /** the plot plan of the digital twin (migration 052) */
  plot: PlotShape[]; plotMissing: boolean
  /** the project's QC rules (supervision / QC only; migration 051) */
  saveRules: (projectId: string, rules: QcRules) => Promise<boolean>
  load: (projectId: string, force?: boolean) => Promise<void>
  save: (e: CsEntity, projectId: string, patch: Record<string, unknown> & { id?: string }) => Promise<string | null>
  /** many rows at once (Excel import); returns how many were written */
  importRows: (e: CsEntity, projectId: string, rows: Record<string, unknown>[]) => Promise<number>
  setSpoolStage: (s: CsSpool, stage: SpoolStage, date: string) => Promise<boolean>
}

/** The compressor-station registers of one project (migration 050). Archived rows are kept and hidden by the screens. */
export const useCsStore = create<State>((set, get) => ({
  projectId: null, loading: false, lines: [], spools: [], welds: [], equipment: [], packs: [], inspections: [], rules: DEFAULT_QC_RULES, rulesSaved: false, qcMissing: false, plot: [], plotMissing: false,
  load: async (projectId, force) => {
    if (!force && get().projectId === projectId) return
    set({ loading: true, projectId })
    const q = (t: string) => supabase.from(t).select('*').eq('project_id', projectId).limit(20000)
    const [l, s, w, e, p, ins, st, pl] = await Promise.all([q('cs_lines').order('line_no'), q('cs_spools').order('spool_no'), q('cs_welds').order('weld_no'), q('cs_equipment').order('tag'), q('cs_test_packs').order('pack_no'),
      q('cs_inspections').order('insp_date', { ascending: false }), supabase.from('cs_qc_settings').select('rules').eq('project_id', projectId).maybeSingle(), q('cs_plot_shapes').order('z')])
    // the QC tables (migration 051) may not be installed yet: the registers still work without them
    const missing = (x: { code?: string; message?: string } | null) => !!x && (x.code === '42P01' || x.code === 'PGRST205' || /does not exist|schema cache/.test(x.message ?? ''))
    const qcMissing = missing(ins.error) || missing(st.error)
    const plotMissing = missing(pl.error)
    const err = l.error || s.error || w.error || e.error || p.error || (qcMissing ? null : ins.error || st.error) || (plotMissing ? null : pl.error)
    if (fail('خواندن ثبت‌های ایستگاه', err)) { set({ loading: false }); return }
    if (get().projectId !== projectId) return // the user moved on
    set({ loading: false, lines: (l.data ?? []).map(lineRow), spools: (s.data ?? []).map(spoolRow), welds: (w.data ?? []).map(weldRow), equipment: (e.data ?? []).map(eqRow), packs: (p.data ?? []).map(packRow), inspections: qcMissing ? [] : (ins.data ?? []).map(inspRow), rules: withDefaults(qcMissing ? null : (st.data as Row | null)?.rules), rulesSaved: !qcMissing && !!st.data, qcMissing, plot: plotMissing ? [] : (pl.data ?? []).map(plotRow), plotMissing })
  },
  save: async (e, projectId, patch) => {
    const { id, ...rest } = patch
    const row = toRow(rest)
    const res = id ? await supabase.from(TABLE[e]).update(row).eq('id', id).select('*').single() : await supabase.from(TABLE[e]).insert({ ...row, project_id: projectId }).select('*').single()
    if (fail(`ذخیرهٔ ${FA[e]}`, res.error)) return null
    if (!res.data) { fail(`ذخیرهٔ ${FA[e]}`, { message: 'not_found' }); return null }
    const v = (MAP[e] as (r: Row) => unknown)(res.data as Row) as { id: string }
    set((s) => ({ [e]: id ? (s[e] as { id: string }[]).map((x) => (x.id === id ? v : x)) : [...(s[e] as { id: string }[]), v] }) as Partial<State>)
    return v.id
  },
  importRows: async (e, projectId, rows) => {
    let done = 0
    for (let i = 0; i < rows.length; i += 300) {
      const chunk = rows.slice(i, i + 300).map((r) => ({ ...toRow(r), project_id: projectId }))
      const { error } = await supabase.from(TABLE[e]).insert(chunk)
      if (fail(`ورود ${FA[e]} از اکسل (ردیف ${i + 1} به بعد)`, error)) break
      done += chunk.length
    }
    await get().load(projectId, true)
    return done
  },
  saveRules: async (projectId, rules) => {
    const { error } = await supabase.from('cs_qc_settings').upsert({ project_id: projectId, rules }, { onConflict: 'project_id' })
    if (fail('ذخیرهٔ قواعد کنترل کیفیت', error)) return false
    set({ rules, rulesSaved: true }); return true
  },
  setSpoolStage: async (s, stage, date) => !!(await get().save('spools', s.projectId, { id: s.id, stage, stageDates: { ...s.stageDates, [stage]: date } })),
}))
