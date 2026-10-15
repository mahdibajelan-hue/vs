import type { GridStyle, GridTemplate } from './gridTypes'

export interface DesignInput { formKey: string; title: string; headerLabels: string[]; columns: { label: string; width?: number }[]; rows: number; signers: string[] }

const line: [string, string] = ['thin', '000000']
const base = (over: Partial<GridStyle> = {}): GridStyle => ({ f: ['Arial', 11, false, false, false, null], a: ['center', 'center', true, 0, 0], b: [null, null, null, null], bg: null, nf: null, ...over })
const boxed = (over: Partial<GridStyle> = {}) => base({ b: [line, line, line, line], ...over })

/** Builds a NEW form sheet (A4 portrait grid) for a future form: title, header fields, a numbered repeating table and signature boxes. The result is a normal draft template; it is frozen on approval like any other. */
export function designGrid(d: DesignInput): GridTemplate {
  const cols = [{ w: 40 }, ...d.columns.map((c) => ({ w: c.width ?? 90 }))]
  const n = cols.length
  const styles: GridStyle[] = [base({ f: ['Arial', 14, true, false, false, null] }), boxed(), boxed({ f: ['Arial', 11, true, false, false, null], bg: 'D9D9D9' }), base({ a: ['left', 'center', true, 0, 0] }), boxed({ a: ['left', 'center', true, 0, 0] })]
  const cells: GridTemplate['cells'] = []
  const rows: GridTemplate['rows'] = []
  const row = (h: number) => { rows.push({ h, hidden: false }); return rows.length - 1 }
  let r = row(30); cells.push({ r, c: 0, s: 0, cs: n, v: d.title })
  const per = 2
  for (let i = 0; i < d.headerLabels.length; i += per) {
    r = row(24)
    const span = Math.max(1, Math.floor(n / per))
    for (let j = 0; j < per; j++) { const lab = d.headerLabels[i + j]; if (lab == null) continue; cells.push({ r, c: j * span, s: 4, cs: j === per - 1 ? n - j * span : span, v: `${lab}:` }) }
  }
  r = row(30); cells.push({ r, c: 0, s: 2, v: 'ردیف' }); d.columns.forEach((c, i) => cells.push({ r, c: i + 1, s: 2, v: c.label }))
  for (let k = 1; k <= d.rows; k++) { r = row(24); cells.push({ r, c: 0, s: 1, v: String(k) }); for (let i = 1; i < n; i++) cells.push({ r, c: i, s: 1 }) }
  r = row(70)
  const sp = Math.max(1, Math.floor(n / Math.max(1, d.signers.length)))
  d.signers.forEach((s, i) => cells.push({ r, c: i * sp, s: 1, cs: i === d.signers.length - 1 ? n - i * sp : sp, v: s }))
  return {
    formKey: d.formKey, sheet: d.title, area: `A1:${String.fromCharCode(64 + Math.min(n, 26))}${rows.length}`,
    source: { file: 'designed-in-app', sha256: '0'.repeat(64) },
    print: { orientation: 'portrait', paperSize: 9, scale: null, fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4 }, center: true },
    rtl: true, cols: cols.map((c) => ({ w: c.w, hidden: false })), rows, styles, cells, logos: [],
    stats: { cells: cells.length, merged: cells.filter((c) => (c.cs ?? 1) > 1).length, texts: cells.filter((c) => c.v).length, hiddenCols: 0 },
  }
}

/** Structure of a designed sheet, read back from its frozen layout: header labels (in order) and table column labels. */
export function designShape(t: GridTemplate): { headers: { r: number; c: number; label: string }[]; columns: string[]; firstRow: number; rows: number } {
  const hdr = t.cells.find((c) => c.v === 'ردیف' && c.c === 0)
  if (!hdr) return { headers: [], columns: [], firstRow: 0, rows: 0 }
  const headers = t.cells.filter((c) => c.r > 0 && c.r < hdr.r && c.v?.endsWith(':')).sort((a, b) => a.r - b.r || a.c - b.c).map((c) => ({ r: c.r, c: c.c, label: (c.v as string).slice(0, -1) }))
  const columns = t.cells.filter((c) => c.r === hdr.r && c.c > 0).sort((a, b) => a.c - b.c).map((c) => c.v ?? '')
  const rows = t.cells.filter((c) => c.c === 0 && c.r > hdr.r && /^\d+$/.test(c.v ?? '')).length
  return { headers, columns, firstRow: hdr.r + 1, rows }
}

/** Cell values of a designed sheet for the entered header and rows (rows beyond the sheet are ignored). */
export function designValues(t: GridTemplate, header: string[], rows: string[][]): Record<string, string> {
  const sh = designShape(t), out: Record<string, string> = {}
  sh.headers.forEach((h, i) => { if (header[i]) out[`${colName(h.c)}${h.r + 1}`] = `${h.label}: ${header[i]}` })
  rows.slice(0, sh.rows).forEach((row, k) => row.forEach((v, i) => { if (v) out[`${colName(i + 1)}${sh.firstRow + k + 1}`] = v }))
  return out
}
const colName = (c: number): string => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
