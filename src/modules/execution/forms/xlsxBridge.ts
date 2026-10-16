import { addr, type CellBinding, type Edge, type GridStyle, type GridTemplate } from './gridTypes'

/** Round trip between a frozen grid template and an Excel workbook, so a form can be opened in Office, changed there and brought back as a NEW draft version (or as a brand-new form).
 *  Export keeps widths, heights, merges, fonts, alignment, borders, fills, texts and page setup. Import reads the same things back. Formulas are not evaluated (kept as formula text, printed blank); logos stay as the system has them. */
type Excel = typeof import('exceljs')
const load = async (): Promise<Excel> => { const m = (await import('exceljs')) as unknown as { default?: Excel } & Excel; return m.default ?? m }

const THEME = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646']
const tint = (hex: string, t: number) => { const f = (c: number) => Math.max(0, Math.min(255, Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t))); return [0, 2, 4].map((i) => f(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('').toUpperCase() }
type XColor = { argb?: string; theme?: number; tint?: number } | undefined
const colorOf = (c: XColor): string | null => { if (!c) return null; if (c.argb && c.argb.length >= 6) return c.argb.slice(-6).toUpperCase(); if (c.theme !== undefined && c.theme < THEME.length) return tint(THEME[c.theme], c.tint ?? 0); return null }
const argb = (hex: string | null | undefined) => (hex ? { argb: `FF${hex}` } : undefined)
const colName = (n: number) => addr(0, n - 1).replace(/\d+/, '')

// ---------- grid → workbook ----------
export async function gridToWorkbook(tpl: GridTemplate, meta: { title: string; version: number | null }): Promise<ArrayBuffer> {
  const X = await load(), wb = new X.Workbook()
  wb.title = `FARIN-FORM:${tpl.formKey}`; wb.subject = meta.title; wb.keywords = meta.version ? `v${meta.version}` : ''; wb.creator = 'Farin'
  const ws = wb.addWorksheet((tpl.sheet || tpl.formKey).slice(0, 31), { views: [{ rightToLeft: tpl.rtl, showGridLines: true }] })
  tpl.cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(0.5, (c.w - 5) / 7); col.hidden = c.hidden })
  tpl.rows.forEach((r, i) => { const row = ws.getRow(i + 1); row.height = r.h * 0.75; row.hidden = r.hidden })
  const edges = (st: GridStyle, rr: number, cc: number, r0: number, c0: number, r1: number, c1: number) => {
    const e = (x: Edge) => (x ? { style: x[0] as never, color: argb(x[1] === 'None' ? '000000' : x[1]) } : undefined)
    return { top: rr === r0 ? e(st.b[0]) : undefined, right: cc === c1 ? e(st.b[1]) : undefined, bottom: rr === r1 ? e(st.b[2]) : undefined, left: cc === c0 ? e(st.b[3]) : undefined }
  }
  const apply = (rr: number, cc: number, st: GridStyle, box: [number, number, number, number]) => {
    const cell = ws.getCell(rr + 1, cc + 1), [name, sz, b, i, u, col] = st.f, [h, v, wrap, rot] = st.a
    cell.font = { name: name ?? undefined, size: sz ?? undefined, bold: b, italic: i, underline: u, color: argb(col) }
    cell.alignment = { horizontal: h && h !== 'general' ? (h as never) : undefined, vertical: v ? ((v === 'center' ? 'middle' : v) as never) : undefined, wrapText: wrap, textRotation: rot === 255 ? 'vertical' : rot > 90 ? 90 - rot : rot || undefined }
    cell.border = { ...edges(st, rr, cc, box[0], box[1], box[2], box[3]), ...(st.dg && rr === box[0] && cc === box[1] ? { diagonal: { up: st.dg.up, down: st.dg.down, style: st.dg.e[0] as never, color: argb(st.dg.e[1] === 'None' ? '000000' : st.dg.e[1]) } } : {}) }
    if (st.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(st.bg) }
    if (st.nf) cell.numFmt = st.nf
    return cell
  }
  for (const c of tpl.cells) {
    const r1 = c.r + (c.rs ?? 1) - 1, c1 = c.c + (c.cs ?? 1) - 1, st = tpl.styles[c.s]
    for (let rr = c.r; rr <= r1; rr++) for (let cc = c.c; cc <= c1; cc++) apply(rr, cc, st, [c.r, c.c, r1, c1])
    const cell = ws.getCell(c.r + 1, c.c + 1)
    if (c.formula) cell.value = { formula: c.formula.replace(/^=/, '') }
    else if (c.v) cell.value = c.v
    if (r1 > c.r || c1 > c.c) (ws as unknown as { mergeCellsWithoutStyle: typeof ws.mergeCells }).mergeCellsWithoutStyle(c.r + 1, c.c + 1, r1 + 1, c1 + 1) // keeps the per-cell borders written above
  }
  ws.pageSetup = { orientation: tpl.print.orientation, paperSize: (tpl.print.paperSize ?? 9) as never, scale: tpl.print.scale ?? undefined, fitToPage: tpl.print.fitToPage, fitToWidth: tpl.print.fitToPage ? 1 : undefined, fitToHeight: tpl.print.fitToPage ? 0 : undefined,
    margins: { left: tpl.print.margins.left, right: tpl.print.margins.right, top: tpl.print.margins.top, bottom: tpl.print.margins.bottom, header: 0.3, footer: 0.3 }, horizontalCentered: tpl.print.center, printArea: `A1:${colName(tpl.cols.length)}${tpl.rows.length}` }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

// ---------- workbook → grid ----------
export interface ImportResult { layout: GridTemplate; warnings: string[] }
const sha256 = async (buf: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')
const textOf = (v: unknown): { v: string | null; formula?: string } => {
  if (v == null || v === '') return { v: null }
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; formula?: string; sharedFormula?: string; text?: string; result?: unknown }
    if (o.richText) return { v: o.richText.map((t) => t.text).join('') }
    if (o.formula || o.sharedFormula) return { v: null, formula: `=${o.formula ?? o.sharedFormula}` }
    if (v instanceof Date) return { v: v.toISOString().slice(0, 10) }
    if (o.text) return { v: String(o.text) }
    return { v: null }
  }
  return { v: String(v) }
}
const parseRange = (s: string) => { const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(s.replace(/^.*!/, '').trim()); if (!m) return null; const n = (x: string) => [...x].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0); return { c0: n(m[1]), r0: Number(m[2]), c1: n(m[3] ?? m[1]), r1: Number(m[4] ?? m[2]) } }

export async function workbookToGrid(buf: ArrayBuffer, fileName: string, opts: { formKey: string; base?: GridTemplate }): Promise<ImportResult> {
  const X = await load(), wb = new X.Workbook(), warnings: string[] = []
  await wb.xlsx.load(buf)
  const ws = wb.worksheets.find((w) => w.state !== 'hidden') ?? wb.worksheets[0]
  if (!ws) throw new Error('فایل هیچ برگه‌ای ندارد')
  if (wb.worksheets.filter((w) => w.state !== 'hidden').length > 1) warnings.push(`فایل بیش از یک برگه دارد؛ فقط برگهٔ «${ws.name}» خوانده شد.`)
  const pa = ws.pageSetup.printArea ? parseRange(String(ws.pageSetup.printArea).split(',')[0]) : null
  const dim = ws.dimensions
  const area = pa ?? (dim ? { c0: dim.left || 1, r0: dim.top || 1, c1: dim.right || 1, r1: dim.bottom || 1 } : { c0: 1, r0: 1, c1: 1, r1: 1 })
  if (opts.base) { area.c0 = 1; area.r0 = 1 } // a form that came from the system keeps its A1 origin so cell addresses (and the mapping) stay put
  const dw = ws.properties.defaultColWidth ?? 8.43, dh = ws.properties.defaultRowHeight ?? 15
  const cols = Array.from({ length: area.c1 - area.c0 + 1 }, (_, i) => { const col = ws.getColumn(area.c0 + i); return { w: Math.round((col.width ?? dw) * 7 + 5), hidden: !!col.hidden } })
  const rows = Array.from({ length: area.r1 - area.r0 + 1 }, (_, i) => { const row = ws.getRow(area.r0 + i); return { h: Math.round((row.height ?? dh) * 96 / 72), hidden: !!row.hidden } })
  const merged = new Map<string, { rs: number; cs: number }>(), covered = new Set<string>()
  for (const m of (ws.model.merges ?? []) as string[]) {
    const g = parseRange(m); if (!g || g.c1 < area.c0 || g.c0 > area.c1 || g.r1 < area.r0 || g.r0 > area.r1) continue
    merged.set(`${g.r0},${g.c0}`, { rs: Math.min(g.r1, area.r1) - g.r0 + 1, cs: Math.min(g.c1, area.c1) - g.c0 + 1 })
    for (let r = g.r0; r <= Math.min(g.r1, area.r1); r++) for (let c = g.c0; c <= Math.min(g.c1, area.c1); c++) if (r !== g.r0 || c !== g.c0) covered.add(`${r},${c}`)
  }
  const styles: GridStyle[] = [], sidx = new Map<string, number>()
  const edge = (b: { style?: string; color?: XColor } | undefined): Edge => (b && b.style ? [b.style, colorOf(b.color) ?? '000000'] : null)
  const styleOf = (r: number, c: number, span: { rs: number; cs: number }): number => {
    const cell = ws.getCell(r, c), f = cell.font ?? {}, al = cell.alignment ?? {}, fl = cell.fill as { type?: string; pattern?: string; fgColor?: XColor } | undefined
    const top = cell.border?.top, left = cell.border?.left, right = ws.getCell(r, c + span.cs - 1).border?.right, bottom = ws.getCell(r + span.rs - 1, c).border?.bottom
    const st: GridStyle = {
      f: [f.name ?? null, f.size ?? null, !!f.bold, !!f.italic, !!f.underline, colorOf(f.color as XColor)],
      a: [al.horizontal ?? null, al.vertical ? (al.vertical === 'middle' ? 'center' : al.vertical) : null, !!al.wrapText, al.textRotation === 'vertical' ? 255 : typeof al.textRotation === 'number' ? (al.textRotation < 0 ? 90 - al.textRotation : al.textRotation) : 0, 0],
      b: [edge(top as never), edge(right as never), edge(bottom as never), edge(left as never)],
      ...(cell.border?.diagonal?.style && (cell.border.diagonal.up || cell.border.diagonal.down) ? { dg: { up: !!cell.border.diagonal.up, down: !!cell.border.diagonal.down, e: [cell.border.diagonal.style as string, colorOf(cell.border.diagonal.color as XColor) ?? '000000'] as [string, string] } } : {}),
      bg: fl && fl.type === 'pattern' && fl.pattern === 'solid' ? colorOf(fl.fgColor) : null,
      nf: cell.numFmt && cell.numFmt !== 'General' ? cell.numFmt : null,
    }
    const k = JSON.stringify(st); let i = sidx.get(k); if (i === undefined) { i = styles.push(st) - 1; sidx.set(k, i) }
    return i
  }
  styleOf(area.r0, area.c0, { rs: 1, cs: 1 }) // style 0 = the plain default, as in the converter used for the original sheets
  const cells: GridTemplate['cells'] = []
  for (let r = area.r0; r <= area.r1; r++) for (let c = area.c0; c <= area.c1; c++) {
    if (covered.has(`${r},${c}`)) continue
    const span = merged.get(`${r},${c}`) ?? { rs: 1, cs: 1 }, cell = ws.getCell(r, c), t = textOf(cell.value), s = styleOf(r, c, span), st = styles[s]
    if (t.v == null && !t.formula && span.rs === 1 && span.cs === 1 && !st.bg && !st.b.some(Boolean)) continue
    const item: GridTemplate['cells'][number] = { r: r - area.r0, c: c - area.c0, s }
    if (span.rs > 1) item.rs = span.rs
    if (span.cs > 1) item.cs = span.cs
    if (t.v != null) item.v = t.v
    if (t.formula) item.formula = t.formula
    cells.push(item)
  }
  const pics: GridTemplate['logos'] = ws.getImages().map((im) => { const tl = im.range.tl as { nativeRow?: number; nativeCol?: number; row?: number; col?: number }, br = im.range.br as typeof tl | undefined
    const rr = (x: typeof tl) => Math.floor(x.nativeRow ?? x.row ?? 0) - (area.r0 - 1), cc = (x: typeof tl) => Math.floor(x.nativeCol ?? x.col ?? 0) - (area.c0 - 1)
    return { kind: 'pic' as const, media: null as string | null, from: [rr(tl), cc(tl)] as [number, number], to: br ? ([rr(br), cc(br)] as [number, number]) : null, text: null } })
  let logos: GridTemplate['logos'] = pics
  if (opts.base) { logos = opts.base.logos; if (pics.length) warnings.push('تصاویر داخل فایل نادیده گرفته شد؛ لوگوها همان‌گونه که در سامانه تعریف شده‌اند می‌مانند.') }
  const pm = ws.pageSetup.margins
  const layout: GridTemplate = {
    formKey: opts.formKey, sheet: ws.name, area: `${addr(0, 0)}:${addr(rows.length - 1, cols.length - 1)}`, source: { file: fileName, sha256: await sha256(buf) },
    print: { orientation: ws.pageSetup.orientation === 'landscape' ? 'landscape' : 'portrait', paperSize: ws.pageSetup.paperSize ? Number(ws.pageSetup.paperSize) : 9, scale: ws.pageSetup.scale ?? null, fitToPage: !!ws.pageSetup.fitToPage, margins: { left: pm?.left ?? 0.5, right: pm?.right ?? 0.5, top: pm?.top ?? 0.5, bottom: pm?.bottom ?? 0.5 }, center: !!ws.pageSetup.horizontalCentered },
    rtl: !!ws.views?.[0]?.rightToLeft, cols, rows, styles, cells, logos,
    stats: { cells: cells.length, merged: merged.size, texts: cells.filter((c) => c.v).length, hiddenCols: cols.filter((c) => c.hidden).length },
  }
  if (opts.base) layout.adjusted = { fromVersion: opts.base.adjusted?.fromVersion ?? null, ops: [...(opts.base.adjusted?.ops ?? []), `ویرایش در Excel: ${fileName}`] }
  return { layout, warnings }
}

// ---------- comparison with the version the file came from ----------
export interface Diff { rowsDelta: number; colsDelta: number; mergedDelta: number; textChanges: string[]; bindingIssues: string[]; structural: boolean }
/** What changed against the base version. `structural` = rows/columns were added or removed (cell addresses move, the mapping and the built-in print layouts of that form can no longer be trusted). */
export function compareLayouts(base: GridTemplate, next: GridTemplate, bindings: CellBinding[]): Diff {
  const txt = (t: GridTemplate) => new Map(t.cells.map((c) => [addr(c.r, c.c), (c.v ?? '').replace(/\s+/g, ' ').trim()]))
  const a = txt(base), b = txt(next), changes: string[] = []
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? '') !== (b.get(k) ?? '')) changes.push(k)
  const issues = bindings.filter((x) => (a.get(x.cell) ?? '') !== (b.get(x.cell) ?? '')).map((x) => `${x.cell}: متن سلولِ نگاشت‌شده تغییر کرده (${x.source})`)
  const rowsDelta = next.rows.length - base.rows.length, colsDelta = next.cols.length - base.cols.length
  return { rowsDelta, colsDelta, mergedDelta: next.stats.merged - base.stats.merged, textChanges: changes, bindingIssues: issues, structural: rowsDelta !== 0 || colsDelta !== 0 }
}
