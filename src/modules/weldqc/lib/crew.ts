import type { Pass } from './rules'

/**
 * Who welded which part of a weld. Three sources, the most precise one wins for each pass:
 *   1. the crew recorded in this module — pass × quadrant (1 = 12–3, 2 = 3–6, 3 = 6–9, 4 = 9–12 o'clock), or the whole pass (0);
 *   2. the halves of the daily welding report — «R» (route side) and «C» (canal side) columns of the welding form, the
 *      0–180 / 180–0 columns of the tie-in form; route side is taken as quadrants 1–2, canal side as 3–4;
 *   3. otherwise every welder stamped on that pass.
 * A defect at a clock position is charged to the welders of its pass in its quadrant.
 */

export const PASSES: Pass[] = ['root', 'hot', 'fill', 'cap']
export type Quadrant = 0 | 1 | 2 | 3 | 4
export const QUAD_FA: Record<Quadrant, string> = { 0: 'کل محیط', 1: 'ساعت ۱۲ تا ۳', 2: 'ساعت ۳ تا ۶', 3: 'ساعت ۶ تا ۹', 4: 'ساعت ۹ تا ۱۲' }
export const QUAD_SHORT: Record<Quadrant, string> = { 0: 'همه', 1: '۱۲–۳', 2: '۳–۶', 3: '۶–۹', 4: '۹–۱۲' }

export interface Sides { R: string[]; C: string[] }
export type PassSides = Record<Pass, Sides>
export interface CrewRow { id: string; pass: Pass; quadrant: Quadrant; welderKey: string; position: string; direction: '' | 'uphill' | 'downhill'; process: string; startedAt: string | null; finishedAt: string | null; vt: '' | 'accept' | 'reject'; note: string; removed: boolean }
export type Source = 'crew' | 'half' | 'pass' | 'none'

export const emptySides = (): PassSides => ({ root: { R: [], C: [] }, hot: { R: [], C: [] }, fill: { R: [], C: [] }, cap: { R: [], C: [] } })

/** the halves of each pass from the report rows of a weld (welding: stampX / stampXC; tie-in: wid1–wid4) */
export function sidesFromRows(rows: { formKey: string; detail: Record<string, unknown> }[], split: (v: unknown) => string[]): PassSides {
  const out = emptySides()
  const add = (p: Pass, side: 'R' | 'C', v: unknown) => { for (const k of split(v)) if (!out[p][side].includes(k)) out[p][side].push(k) }
  for (const r of rows) {
    const d = r.detail
    if (r.formKey === 'welding') for (const p of PASSES) { const k = `stamp${p[0].toUpperCase()}${p.slice(1)}`; add(p, 'R', d[k]); add(p, 'C', d[`${k}C`]) }
    if (r.formKey === 'tie_in') { add('root', 'R', d.wid1); add('hot', 'R', d.wid1); add('root', 'C', d.wid2); add('hot', 'C', d.wid2); add('fill', 'R', d.wid3); add('cap', 'R', d.wid3); add('fill', 'C', d.wid4); add('cap', 'C', d.wid4) }
  }
  return out
}

/** the welders of one pass in one quadrant (0 / unknown → the whole pass) and where that answer came from */
export function weldersAt(pass: Pass, quadrant: Quadrant | null, crew: CrewRow[], sides: PassSides): { keys: string[]; source: Source } {
  const live = crew.filter((c) => !c.removed && c.pass === pass)
  if (live.length) {
    const q = quadrant ? live.filter((c) => c.quadrant === quadrant || c.quadrant === 0) : live
    const keys = [...new Set((q.length ? q : live).map((c) => c.welderKey))]
    return { keys, source: 'crew' }
  }
  const s = sides[pass]
  if (quadrant && (s.R.length || s.C.length)) {
    const half = quadrant <= 2 ? s.R : s.C
    if (half.length) return { keys: half, source: 'half' }
  }
  const all = [...new Set([...s.R, ...s.C])]
  return { keys: all, source: all.length ? 'pass' : 'none' }
}

/** pass × quadrant grid of the weld (for the passport and the weld log) */
export function crewGrid(crew: CrewRow[], sides: PassSides): Record<Pass, Record<1 | 2 | 3 | 4, { keys: string[]; source: Source; row?: CrewRow }>> {
  const g = {} as Record<Pass, Record<1 | 2 | 3 | 4, { keys: string[]; source: Source; row?: CrewRow }>>
  for (const p of PASSES) {
    g[p] = {} as Record<1 | 2 | 3 | 4, { keys: string[]; source: Source; row?: CrewRow }>
    for (const q of [1, 2, 3, 4] as const) { const w = weldersAt(p, q, crew, sides); g[p][q] = { ...w, row: crew.find((c) => !c.removed && c.pass === p && (c.quadrant === q || c.quadrant === 0)) } }
  }
  return g
}

/** every welder of the weld, any pass, any quadrant */
export const allWelders = (crew: CrewRow[], sides: PassSides) => [...new Set([...crew.filter((c) => !c.removed).map((c) => c.welderKey), ...PASSES.flatMap((p) => [...sides[p].R, ...sides[p].C])])]
