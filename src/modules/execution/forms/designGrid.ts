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
