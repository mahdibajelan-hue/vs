import type { GridStyle, GridTemplate } from './gridTypes'

/** Small, look-only changes to a registered sheet: row heights, column widths, alignment, font size / weight, wrapping. Texts, merged ranges, borders and cell positions are never touched, so the cell mapping stays valid. Pure; every call returns a new template. */
export type Scope = 'cell' | 'row' | 'col' | 'all'
export interface StylePatch { h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; size?: number; sizeDelta?: number; bold?: boolean; wrap?: boolean }
export const LIMITS = { row: [8, 400], col: [10, 600], font: [5, 40] } as const
const clamp = (x: number, [lo, hi]: readonly [number, number] | readonly number[]) => Math.min(hi, Math.max(lo, x))
const round = (x: number) => Math.round(x * 10) / 10
const withAdj = (t: GridTemplate, op: string): GridTemplate => ({ ...t, adjusted: { fromVersion: t.adjusted?.fromVersion ?? null, ops: [...(t.adjusted?.ops ?? []), op] } })

export function setRowHeight(t: GridTemplate, rows: number[], h: number): GridTemplate {
  const v = clamp(h, LIMITS.row), set = new Set(rows)
  return withAdj({ ...t, rows: t.rows.map((r, i) => (set.has(i) ? { ...r, h: v } : r)) }, `ارتفاع ${rows.length > 1 ? `${rows.length} ردیف` : `ردیف ${rows[0] + 1}`}: ${round(v)}`)
}
export function setColWidth(t: GridTemplate, cols: number[], w: number): GridTemplate {
  const v = clamp(w, LIMITS.col), set = new Set(cols)
  return withAdj({ ...t, cols: t.cols.map((c, i) => (set.has(i) ? { ...c, w: v } : c)) }, `عرض ${cols.length > 1 ? `${cols.length} ستون` : `ستون ${cols[0] + 1}`}: ${round(v)}`)
}
export function scaleRows(t: GridTemplate, pct: number): GridTemplate {
  const k = clamp(pct, [50, 200]) / 100
  return withAdj({ ...t, rows: t.rows.map((r) => ({ ...r, h: round(clamp(r.h * k, LIMITS.row)) })) }, `مقیاس ارتفاع همهٔ ردیف‌ها: ${Math.round(k * 100)}٪`)
}
export function scaleCols(t: GridTemplate, pct: number): GridTemplate {
  const k = clamp(pct, [50, 200]) / 100
  return withAdj({ ...t, cols: t.cols.map((c) => ({ ...c, w: round(clamp(c.w * k, LIMITS.col)) })) }, `مقیاس عرض همهٔ ستون‌ها: ${Math.round(k * 100)}٪`)
}

const key = (s: GridStyle) => JSON.stringify(s)
function patched(st: GridStyle, p: StylePatch): GridStyle {
  const f = [...st.f] as GridStyle['f'], a = [...st.a] as GridStyle['a']
  if (p.h) a[0] = p.h
  if (p.v) a[1] = p.v
  if (p.wrap !== undefined) a[2] = p.wrap
  if (p.bold !== undefined) f[2] = p.bold
  if (p.size !== undefined) f[1] = clamp(p.size, LIMITS.font)
  else if (p.sizeDelta) f[1] = clamp((f[1] ?? 11) + p.sizeDelta, LIMITS.font)
  return { ...st, f, a }
}
const FA_H = { left: 'چپ‌چین', center: 'وسط‌چین', right: 'راست‌چین' } as const
const FA_V = { top: 'بالا', center: 'وسط', bottom: 'پایین' } as const
const FA_S = { cell: 'سلول', row: 'ردیف', col: 'ستون', all: 'کل فرم' } as const

/** Applies a style change to the cells of a scope. `at` is the 0-based [row, col] of the clicked cell. New styles are added to the style table (and shared when identical). */
export function styleCells(t: GridTemplate, scope: Scope, at: [number, number], p: StylePatch): GridTemplate {
  const styles = [...t.styles], index = new Map(styles.map((s, i) => [key(s), i]))
  const hit = (c: { r: number; c: number }) => scope === 'all' || (scope === 'row' && c.r === at[0]) || (scope === 'col' && c.c === at[1]) || (c.r === at[0] && c.c === at[1])
  let changed = 0
  const cells = t.cells.map((c) => {
    if (!hit(c)) return c
    const ns = patched(t.styles[c.s], p), k = key(ns)
    if (k === key(t.styles[c.s])) return c
    let i = index.get(k); if (i === undefined) { i = styles.push(ns) - 1; index.set(k, i) }
    changed++; return { ...c, s: i }
  })
  if (!changed) return t
  const what = [p.h && FA_H[p.h], p.v && `عمودی ${FA_V[p.v]}`, p.size !== undefined && `فونت ${p.size}`, p.sizeDelta && `فونت ${p.sizeDelta > 0 ? '+' : ''}${p.sizeDelta}`, p.bold !== undefined && (p.bold ? 'ضخیم' : 'غیرضخیم'), p.wrap !== undefined && (p.wrap ? 'شکستن خط' : 'بدون شکستن خط')].filter(Boolean).join('، ')
  return withAdj({ ...t, styles, cells }, `${FA_S[scope]}${scope === 'row' ? ` ${at[0] + 1}` : scope === 'col' ? ` ${at[1] + 1}` : scope === 'cell' ? ` (${at[0] + 1},${at[1] + 1})` : ''}: ${what}`)
}

/** What a change may NOT alter — used by the tests and as a last guard before saving. */
export function sameStructure(a: GridTemplate, b: GridTemplate): boolean {
  const sig = (t: GridTemplate) => JSON.stringify([t.cols.map((c) => c.hidden), t.rows.map((r) => r.hidden), t.cells.map((c) => [c.r, c.c, c.rs, c.cs, c.v, c.formula]), t.logos, t.area, t.print, t.source, t.formKey, t.sheet])
  return sig(a) === sig(b)
}
