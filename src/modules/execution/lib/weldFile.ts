import { weldLifecycle, type WState } from './weldLifecycle'

/**
 * «پروندهٔ سرجوش» — everything known about one weld, in one record: identity and the shared facts from the central weld
 * table (pipe, size, thickness, length, bend), then one block per stage — fit-up, welding (welders' stamps, VT), RT request,
 * RT (result, defect, repair kind), repairs, field-joint coating and its test — each with the date and the form it came from.
 *
 * It is built from the central table (`ex_welds`) and the rows linked to it (`ex_line_welds`): the form rows stay the
 * evidence, the file is the one place every page reads a weld from (weld list, weld card, QC, reports), so nothing is typed
 * twice and no page derives a weld's state on its own. Rejected reports are left out; unapproved rows are counted.
 */
export interface StageRef { date: string; reportNo: string; reportId: string; lineId: string; approved: boolean }
export interface WeldFile {
  id: string; sec: string; weld: string; pipe: string
  central: Partial<Record<'pipe' | 'size' | 'thk' | 'length' | 'bend', string>>
  fitup?: StageRef & { result: string }
  welding?: StageRef & { stamps: { root: string; hot: string; fill: string; cap: string }; vt: string; tieIn: boolean }
  rtRequest?: StageRef & { reqNo: string }
  rt?: StageRef & { result: string; defect: string; repairKind: string; count: number }
  repairs: (StageRef & { defect: string; done: boolean; vt: string })[]
  coating?: StageRef & { result: string; thicknessUm: number | null }
  coatTest?: StageRef & { verdict: 'ok' | 'rej' | '' }
  state: WState; cycle: number; anomalies: string[]; next: string | null
  /** rows of this weld whose report is not approved yet (the file can still change) */
  pending: number
  lastDate: string
}

interface Weld { id: string; projectId: string; sectionRaw: string; weldRaw: string; pipeNo: string | null; status: string; central: WeldFile['central'] }
interface Link { lineId: string; weldId: string; projectId: string }
interface Line { id: string; reportId: string; detail: Record<string, unknown> }
interface Rep { id: string; formKey: string; reportDate: string; reportNo: string; status: string }

const s = (v: unknown) => String(v ?? '').trim()
const stamp = (d: Record<string, unknown>, k: string) => [s(d[k]), s(d[`${k}C`])].filter(Boolean).join(' / ')
const n = (v: unknown) => { const x = Number(String(v ?? '').replace('٫', '.')); return s(v) !== '' && Number.isFinite(x) ? x : null }
/** a coating test sheet fails when any of its checks fails — adhesion to pipe or main coating, appearance, holiday voltage, or holidays left to repair */
export function coatTestVerdict(d: Record<string, unknown>): 'ok' | 'rej' | '' {
  const checks = ['adhPipeOk', 'adhMainOk', 'appearance', 'holVolt'].map((k) => s(d[k])).filter(Boolean)
  const hol = s(d.holAction)
  if (checks.includes('rej') || hol === 'repair' || hol === 'defect') return 'rej'
  if (checks.length || hol === 'final') return 'ok'
  return s(d.result) === 'rej' ? 'rej' : s(d.result) ? 'ok' : ''
}

export function buildWeldFiles(a: { projectId: string; welds: Weld[]; links: Link[]; lines: Line[]; reports: Rep[] }): WeldFile[] {
  const lineById = new Map(a.lines.map((l) => [l.id, l])), repById = new Map(a.reports.map((r) => [r.id, r]))
  const rows = new Map<string, { l: Line; r: Rep }[]>()
  for (const k of a.links) {
    if (k.projectId !== a.projectId) continue
    const l = lineById.get(k.lineId), r = l ? repById.get(l.reportId) : undefined
    if (!l || !r || r.status === 'rejected') continue
    const x = rows.get(k.weldId) ?? []; x.push({ l, r }); rows.set(k.weldId, x)
  }
  const out: WeldFile[] = []
  for (const w of a.welds) {
    if (w.projectId !== a.projectId || w.status === 'merged') continue
    const mine = (rows.get(w.id) ?? []).sort((x, y) => x.r.reportDate.localeCompare(y.r.reportDate))
    const ref = (x: { l: Line; r: Rep }): StageRef => ({ date: x.r.reportDate, reportNo: x.r.reportNo, reportId: x.r.id, lineId: x.l.id, approved: x.r.status === 'approved' })
    const f: WeldFile = { id: w.id, sec: w.sectionRaw, weld: w.weldRaw, pipe: w.central.pipe || w.pipeNo || '', central: w.central, repairs: [], state: 'none', cycle: 0, anomalies: [], next: null, pending: mine.filter((x) => x.r.status !== 'approved').length, lastDate: mine.at(-1)?.r.reportDate ?? '' }
    let rtCount = 0
    for (const x of mine) {
      const d = x.l.detail
      switch (x.r.formKey) {
        case 'fitup': f.fitup = { ...ref(x), result: s(d.result) }; break
        case 'welding': case 'tie_in': f.welding = { ...ref(x), stamps: { root: stamp(d, 'stampRoot'), hot: stamp(d, 'stampHot'), fill: stamp(d, 'stampFill'), cap: stamp(d, 'stampCap') }, vt: s(d.vt), tieIn: x.r.formKey === 'tie_in' }; break
        case 'rt_request': case 'rt_request_rp': f.rtRequest = { ...ref(x), reqNo: s(d.reqNo) || s(d.rtReqNo) }; break
        case 'rt_report': rtCount++; f.rt = { ...ref(x), result: s(d.result), defect: s(d.defect), repairKind: s(d.repairKind), count: rtCount }; break
        case 'weld_repair': f.repairs.push({ ...ref(x), defect: [s(d.defectType), s(d.defectLoc)].filter(Boolean).join(' · '), done: s(d.repairDone) === 'done', vt: s(d.vtCheck) }); break
        case 'fj_coating': { const t = ['thk12', 'thk3', 'thk6', 'thk9'].map((k) => n(d[k])).filter((v): v is number => v != null); f.coating = { ...ref(x), result: s(d.result), thicknessUm: t.length ? Math.min(...t) : null }; break }
        case 'bond_test': f.coatTest = { ...ref(x), verdict: coatTestVerdict(d) }; break
      }
    }
    const lc = weldLifecycle(mine.map((x) => ({ formKey: x.r.formKey, date: x.r.reportDate, lineId: x.l.id, vt: s(x.l.detail.vt), repairDone: s(x.l.detail.repairDone), result: x.r.formKey === 'bond_test' ? coatTestVerdict(x.l.detail) : s(x.l.detail.result) })))
    f.state = lc.state; f.cycle = lc.cycle; f.anomalies = lc.anomalies; f.next = lc.next
    out.push(f)
  }
  return out.sort((x, y) => (x.sec + '|' + x.weld).localeCompare(y.sec + '|' + y.weld, 'fa', { numeric: true }))
}

/** Project-level counts read from the files (one definition for the weld page, the dashboard and the reports). */
export function weldFileStats(files: WeldFile[]) {
  const by = (st: WState) => files.filter((f) => f.state === st).length
  const rtDone = files.filter((f) => f.rt), firstRep = rtDone.filter((f) => f.cycle > 0 || f.rt?.result === 'rep')
  return {
    welds: files.length, welded: files.filter((f) => f.welding).length, rtDone: rtDone.length,
    withoutRt: files.filter((f) => f.welding && !f.rt).length,
    needsRepair: by('needs_repair'), repaired: by('repaired'), rtAccepted: by('rt_accepted'), coated: by('coated'), coatTested: by('coat_tested'), coatFailed: by('coat_failed'),
    /** share of radiographed welds that needed at least one repair */
    repairRate: rtDone.length ? firstRep.length / rtDone.length : null,
    anomalies: files.filter((f) => f.anomalies.length).length, pending: files.filter((f) => f.pending).length,
  }
}
