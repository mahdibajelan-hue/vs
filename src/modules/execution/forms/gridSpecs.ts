import { addr, type GridTemplate } from './gridTypes'

/** Declarative cell mapping of an approved sheet: header cells (by address) and the repeating row block. Anything not listed stays exactly as the approved sheet has it. All addresses are PROPOSED until the form owner confirms them. */
export interface HeaderBind { cell: string; key: string; mode?: 'replace' | 'append' }
export interface RowCol { c: number; get: ((d: Record<string, string>) => string) & { key?: string }; dr?: number }
export interface ThkTotals { headerRow: number; thk0: number; head: number; today: number; until: number; lenCols: number[]; jntCols: number[]; lenTotal: number; jntTotal: number }
export interface GridSpec {
  formKey: string
  headers: HeaderBind[]
  /** `first` = 0-based row of the first record, `step` rows per record, `per` records per page, `numCol` = column that prints the running number (continued on later pages) */
  rows: { first: number; step: number; per: number; numCol: number; numDr?: number; cols: RowCol[] }
  thk?: ThkTotals
}
export interface SpecInput { header: Record<string, string>; rows: Record<string, string>[]; thk?: number[]; prior?: { len: number[]; joints: number[] } }
export interface SpecPage { values: Record<string, string>; missing: string[]; pages: number }

/** a plain field of the row; `.key` lets the sheet-entry screen map a clicked cell back to the field */
const k = (key: string): RowCol['get'] => Object.assign((d: Record<string, string>) => d[key] ?? '', { key })
const mark = (key: string, eq: string): RowCol['get'] => (d) => (d[key] === eq ? '✓' : '')
const both = (a: string, b: string): RowCol['get'] => (d) => [d[a], d[b]].filter(Boolean).join('  ')


export const GRID_SPECS: Record<string, GridSpec> = {
  bend: {
    formKey: 'bend',
    headers: [{ cell: 'C4', key: 'date' }, { cell: 'J4', key: 'reportNo' }, { cell: 'A5', key: 'machine', mode: 'append' }],
    rows: { first: 20, step: 1, per: 14, numCol: 0, cols: [{ c: 1, get: k('km') }, { c: 2, get: k('pipeNo') }, { c: 3, get: k('wtMm') }, { c: 4, get: k('lengthM') }, { c: 5, get: k('diaIn') }, { c: 6, get: k('dirSO') }, { c: 7, get: k('dirLR') }, { c: 8, get: k('ovalMm') }, { c: 9, get: k('ovalPct') }, { c: 10, get: mark('result', 'acc') }, { c: 11, get: mark('result', 'rej') }] },
  },
  fitup: {
    formKey: 'fitup',
    headers: [{ cell: 'A4', key: 'pipeSpec' }, { cell: 'K4', key: 'wps', mode: 'append' }, { cell: 'D5', key: 'reportNo' }, { cell: 'H5', key: 'page' }, { cell: 'K5', key: 'pages' }, { cell: 'Q5', key: 'date' }],
    rows: { first: 8, step: 2, per: 20, numCol: 0, numDr: 1, cols: [{ c: 1, get: k('sec'), dr: 1 }, { c: 2, get: k('jointNo'), dr: 1 }, { c: 4, get: k('pipeNo') }, { c: 10, get: k('sizeIn') }, { c: 11, get: k('bendDeg') }, { c: 12, get: (d) => ({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d.result] ?? d.result ?? '' }, { c: 15, get: k('remark') }] },
    thk: { headerRow: 7, thk0: 6, head: 49, today: 50, until: 51, lenCols: [4, 6, 7, 8], jntCols: [14, 15, 16, 17], lenTotal: 9, jntTotal: 18 },
  },
  weld_repair: {
    formKey: 'weld_repair',
    headers: [{ cell: 'A4', key: 'date', mode: 'append' }, { cell: 'E4', key: 'reportNo', mode: 'append' }],
    rows: { first: 6, step: 1, per: 25, numCol: 0, cols: [{ c: 1, get: k('sec') }, { c: 2, get: k('weldNo') }, { c: 3, get: k('stamp') }, { c: 4, get: both('defectType', 'defectLoc') }, { c: 6, get: mark('repairDone', 'notdone') }, { c: 7, get: mark('repairDone', 'done') }, { c: 8, get: (d) => ({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d.vtCheck] ?? d.vtCheck ?? '' }, { c: 10, get: k('rtReqNo') }] },
  },
  tie_in: {
    formKey: 'tie_in',
    headers: [{ cell: 'C4', key: 'date', mode: 'append' }, { cell: 'N4', key: 'reportNo', mode: 'append' }, { cell: 'K5', key: 'workPlace', mode: 'append' }, { cell: 'O5', key: 'km', mode: 'append' }, { cell: 'O6', key: 'workType', mode: 'append' }, { cell: 'O8', key: 'weldersCount', mode: 'append' }, { cell: 'H12', key: 'wid1' }, { cell: 'J12', key: 'wid2' }, { cell: 'L12', key: 'wid3' }, { cell: 'N12', key: 'wid4' }],
    rows: { first: 14, step: 1, per: 4, numCol: 7, cols: [{ c: 8, get: k('sec') }, { c: 9, get: k('weldNo') }, { c: 10, get: k('pipeNo') }, { c: 11, get: k('lengthM') }, { c: 13, get: k('thkIn') }, { c: 14, get: k('bendDeg') }] },
  },
  rt_request: {
    formKey: 'rt_request',
    headers: [{ cell: 'G3', key: 'pipeSpec' }, { cell: 'C4', key: 'date' }, { cell: 'H4', key: 'reqNo' }, { cell: 'J4', key: 'page' }, { cell: 'L4', key: 'pages' }],
    rows: { first: 7, step: 2, per: 20, numCol: 0, cols: [{ c: 1, get: k('sec') }, { c: 2, get: k('weldNo') }, { c: 3, get: k('thkIn') }, { c: 4, get: k('odIn') }, { c: 6, get: k('stampRoot') }, { c: 7, get: k('stampHot') }, { c: 8, get: k('stampFill') }, { c: 9, get: k('stampCap') }, { c: 6, dr: 1, get: k('stampRootC') }, { c: 7, dr: 1, get: k('stampHotC') }, { c: 8, dr: 1, get: k('stampFillC') }, { c: 9, dr: 1, get: k('stampCapC') }, { c: 10, get: k('remark') }] },
  },
  rt_request_rp: {
    formKey: 'rt_request_rp',
    headers: [{ cell: 'G3', key: 'pipeSpec' }, { cell: 'C4', key: 'date' }, { cell: 'H4', key: 'page' }],
    rows: { first: 5, step: 1, per: 20, numCol: 0, cols: [{ c: 1, get: k('sec') }, { c: 2, get: k('weldNo') }, { c: 3, get: k('thkIn') }, { c: 4, get: k('odIn') }, { c: 5, get: k('stNo') }, { c: 6, get: k('segment') }, { c: 7, get: k('remark') }] },
  },
  rt_report: {
    formKey: 'rt_report',
    headers: [{ cell: 'F4', key: 'date' }, { cell: 'T4', key: 'page' }, { cell: 'U4', key: 'reportNo', mode: 'append' }, { cell: 'P5', key: 'code', mode: 'append' }, { cell: 'O6', key: 'iqi', mode: 'append' }, { cell: 'A7', key: 'focal', mode: 'append' }, { cell: 'H7', key: 'strength', mode: 'append' }, { cell: 'O7', key: 'sensitivity', mode: 'append' }, { cell: 'R7', key: 'groove', mode: 'append' }, { cell: 'U7', key: 'sfd', mode: 'append' }, { cell: 'A9', key: 'isotope', mode: 'append' }, { cell: 'H9', key: 'exposure', mode: 'append' }, { cell: 'O9', key: 'film', mode: 'append' }, { cell: 'R9', key: 'process', mode: 'append' }, { cell: 'U9', key: 'ug', mode: 'append' }],
    rows: { first: 11, step: 1, per: 20, numCol: 0, cols: [{ c: 1, get: k('rtReqNo') }, { c: 2, get: k('sec') }, { c: 3, get: k('weldNo') }, { c: 5, get: k('odIn') }, { c: 6, get: k('thkIn') }, { c: 8, get: mark('result', 'acc') }, { c: 9, get: mark('result', 'rep') }, { c: 10, get: mark('repairKind', 'RS') }, { c: 11, get: mark('repairKind', 'RT') }, { c: 12, get: mark('repairKind', 'CO') }, { c: 13, get: mark('repairKind', 'RC') }, { c: 14, get: k('defect') }] },
  },
}

const f2 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const th = (t: number) => (t ? `${t.toFixed(3)}"` : '')
const near = (a: number, b: number) => b > 0 && Math.abs(a - b) < 0.0005

export const specPages = (spec: GridSpec, n: number) => Math.max(1, Math.ceil(n / spec.rows.per))

/** Cell values for page `p` (0-based) of a sheet mapped by `spec`. */
export function specPage(spec: GridSpec, tpl: GridTemplate, inp: SpecInput, p: number): SpecPage {
  const fixed = Object.fromEntries(tpl.cells.filter((c) => c.v).map((c) => [addr(c.r, c.c), c.v as string]))
  const pages = specPages(spec, inp.rows.length), out: Record<string, string> = {}
  const set = (r: number, c: number, v: string) => { if (v !== '') out[addr(r, c)] = v }
  const hv: Record<string, string> = { ...inp.header, page: String(p + 1), pages: String(pages) }
  for (const h of spec.headers) { const v = hv[h.key] ?? ''; if (!v) continue; out[h.cell] = h.mode === 'append' ? `${(fixed[h.cell] ?? '').trim()} ${v}` : v }
  const R = spec.rows, slice = inp.rows.slice(p * R.per, (p + 1) * R.per), before = inp.rows.slice(0, p * R.per)
  slice.forEach((row, i) => {
    const base = R.first + R.step * i
    if (p > 0) set(base + (R.numDr ?? 0), R.numCol, String(p * R.per + i + 1))
    for (const c of R.cols) set(base + (c.dr ?? 0), c.c, c.get(row))
  })
  const T = spec.thk, thk = (inp.thk ?? []).slice(0, 4)
  if (T) {
    const sumLen = (rs: Record<string, string>[]) => thk.map((t) => rs.filter((r) => near(Number(r.thkIn), t)).reduce((s, r) => s + (Number(r.lengthM) || 0), 0))
    const cnt = (rs: Record<string, string>[]) => thk.map((t) => rs.filter((r) => near(Number(r.thkIn), t)).length)
    const today = sumLen(slice), until = sumLen(before).map((x, i) => x + (inp.prior?.len[i] ?? 0) + today[i])
    const tj = cnt(slice), uj = cnt(before).map((x, i) => x + (inp.prior?.joints[i] ?? 0) + tj[i])
    const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
    thk.forEach((t, i) => { set(T.headerRow, T.thk0 + i, th(t)); set(T.head, T.lenCols[i], th(t)); set(T.head, T.jntCols[i], th(t)); set(T.today, T.lenCols[i], f2(today[i])); set(T.until, T.lenCols[i], f2(until[i])); set(T.today, T.jntCols[i], String(tj[i])); set(T.until, T.jntCols[i], String(uj[i])) })
    set(T.today, T.lenTotal, f2(sum(today))); set(T.until, T.lenTotal, f2(sum(until))); set(T.today, T.jntTotal, String(sum(tj))); set(T.until, T.jntTotal, String(sum(uj)))
    // each weld's length goes under its thickness column
    slice.forEach((row, i) => { const ci = thk.findIndex((t) => near(Number(row.thkIn), t)); if (ci >= 0 && row.lengthM) set(R.first + R.step * i, T.thk0 + ci, f2(Number(row.lengthM))) })
  }
  const have = new Set(tpl.cells.map((c) => addr(c.r, c.c)))
  return { values: out, missing: Object.keys(out).filter((a) => !have.has(a)), pages }
}

/** Which field a cell of the sheet edits: a header field, or a plain field of record `row`. Derived/composite cells (page numbers, ticks, totals) are not editable. */
export type CellTarget = { kind: 'header'; key: string } | { kind: 'row'; row: number; key: string }
export const DERIVED_HEADER = new Set(['date', 'reportNo', 'page', 'pages'])
export function cellTarget(spec: GridSpec, address: string, page: number): CellTarget | null {
  const h = spec.headers.find((x) => x.cell === address)
  if (h) return DERIVED_HEADER.has(h.key) ? null : { kind: 'header', key: h.key }
  const R = spec.rows
  for (let i = 0; i < R.per; i++) for (const c of R.cols) {
    if (addr(R.first + R.step * i + (c.dr ?? 0), c.c) === address && c.get.key) return { kind: 'row', row: page * R.per + i, key: c.get.key }
  }
  return null
}
/** every editable cell of page `page` (used to outline them on the sheet) */
export function editableCells(spec: GridSpec, page: number): Set<string> {
  const out = new Set<string>(spec.headers.filter((h) => !DERIVED_HEADER.has(h.key)).map((h) => h.cell)), R = spec.rows
  for (let i = 0; i < R.per; i++) for (const c of R.cols) if (c.get.key) out.add(addr(R.first + R.step * i + (c.dr ?? 0), c.c))
  void page
  return out
}
