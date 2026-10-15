import { addr, type GridTemplate } from './gridTypes'
import { weldingValues, type WeldingValuesInput } from './weldingBindings'

export const ROWS_PER_PAGE = 20
/** Where the 20 welds of a page sit in the approved «WELDING» sheet (0-based rows). The pipe/lengths/stamps/VT block of weld k starts one row above its number, exactly as the approved sheet is built. */
const W = { numRow: (k: number) => 9 + 2 * k, dataRow: (k: number) => 8 + 2 * k, thkHeaderRow: 7, totals: { head: 49, today: 50, until: 51 } }
export const COL = { row: 0, sec: 1, weld: 2, pipe: 4, thk0: 6, size: 10, bend: 11, stamp0: 13, vt: 17, remark: 18 }
/** the four thickness cells of the totals blocks (column F is hidden in the approved sheet) */
const LEN_COLS = [4, 6, 7, 8], JNT_COLS = [13, 14, 15, 16], LEN_TOTAL = 9, JNT_TOTAL = 18

export interface WeldRow { sec: string; weldNo: string; pipeNo: string; lengthM: number | null; thkIn: number | null; sizeIn: string; bendDeg: string; stampsL: [string, string, string, string]; stampsR: [string, string, string, string]; vt: string; remark: string }
export interface WeldingGridInput { header: Omit<WeldingValuesInput, 'page' | 'pages'>; thk: number[]; rows: WeldRow[]; prior: { len: number[]; joints: number[] } }
export interface PageResult { values: Record<string, string>; missing: string[] }

const f2 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const th = (t: number) => (t ? `${t.toFixed(3)}"` : '')
const near = (a: number | null, b: number) => a != null && b > 0 && Math.abs(a - b) < 0.0005

/** Cell values for page `p` (0-based). Everything not listed here keeps the approved sheet's own text. */
export function weldingGridPage(tpl: GridTemplate, inp: WeldingGridInput, p: number): PageResult {
  const fixed = Object.fromEntries(tpl.cells.filter((c) => c.v).map((c) => [addr(c.r, c.c), c.v as string]))
  const pages = Math.max(1, Math.ceil(inp.rows.length / ROWS_PER_PAGE))
  const out: Record<string, string> = { ...weldingValues({ ...inp.header, page: p + 1, pages }, fixed) }
  const slice = inp.rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE), before = inp.rows.slice(0, p * ROWS_PER_PAGE)
  const set = (r: number, c: number, v: string) => { if (v !== '') out[addr(r, c)] = v }
  inp.thk.slice(0, 4).forEach((t, i) => set(W.thkHeaderRow, COL.thk0 + i, th(t)))
  slice.forEach((w, k) => {
    if (p > 0) set(W.numRow(k), COL.row, String(p * ROWS_PER_PAGE + k + 1)) // the sheet prints 1–20; later pages continue the numbering
    set(W.numRow(k), COL.sec, w.sec); set(W.numRow(k), COL.weld, w.weldNo)
    set(W.dataRow(k), COL.pipe, w.pipeNo)
    const ci = inp.thk.findIndex((t) => near(w.thkIn, t))
    if (ci >= 0 && ci < 4 && w.lengthM != null) set(W.dataRow(k), COL.thk0 + ci, f2(w.lengthM))
    set(W.dataRow(k), COL.size, w.sizeIn); set(W.dataRow(k), COL.bend, w.bendDeg)
    w.stampsL.forEach((s, i) => set(W.dataRow(k), COL.stamp0 + i, s)); w.stampsR.forEach((s, i) => set(W.dataRow(k) + 1, COL.stamp0 + i, s))
    set(W.dataRow(k), COL.vt, w.vt); set(W.dataRow(k), COL.remark, w.remark)
  })
  // totals blocks: «Today» = this page, «Until now» = previous days + earlier pages + this page
  const sumLen = (rs: WeldRow[]) => inp.thk.slice(0, 4).map((t) => rs.filter((r) => near(r.thkIn, t)).reduce((s, r) => s + (r.lengthM ?? 0), 0))
  const cnt = (rs: WeldRow[]) => inp.thk.slice(0, 4).map((t) => rs.filter((r) => near(r.thkIn, t)).length)
  const today = sumLen(slice), until = sumLen(before).map((x, i) => x + (inp.prior.len[i] ?? 0) + today[i])
  const tj = cnt(slice), uj = cnt(before).map((x, i) => x + (inp.prior.joints[i] ?? 0) + tj[i])
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
  inp.thk.slice(0, 4).forEach((t, i) => { set(W.totals.head, LEN_COLS[i], th(t)); set(W.totals.head, JNT_COLS[i], th(t)); set(W.totals.today, LEN_COLS[i], f2(today[i])); set(W.totals.until, LEN_COLS[i], f2(until[i])); set(W.totals.today, JNT_COLS[i], String(tj[i])); set(W.totals.until, JNT_COLS[i], String(uj[i])) })
  set(W.totals.today, LEN_TOTAL, f2(sum(today))); set(W.totals.until, LEN_TOTAL, f2(sum(until))); set(W.totals.today, JNT_TOTAL, String(sum(tj))); set(W.totals.until, JNT_TOTAL, String(sum(uj)))
  const have = new Set(tpl.cells.map((c) => addr(c.r, c.c)))
  return { values: out, missing: Object.keys(out).filter((a) => !have.has(a)) }
}
