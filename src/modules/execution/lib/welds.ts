/**
 * Weld identity from the technical forms — pure functions, no database.
 * The weld registry is only an INDEX over the forms: the original text of every form row is never changed.
 *  - N1 normalisation (safe) builds the matching key: exact equality after N1 ⇒ same weld.
 *  - N2 normalisation (risky) is used ONLY to flag "possibly the same weld"; it never merges anything.
 */

const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩'
const DASHES = /[‐-―−﹘﹣－]/g
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g

/** N1: trim, collapse spaces, drop zero-width/direction marks, Persian/Arabic digits → Latin, Arabic ي/ك → ی/ک, dash variants → '-', Latin letters upper-case. */
export function normN1(v: unknown): string {
  return String(v ?? '')
    .replace(INVISIBLE, '')
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ').trim()
    .toUpperCase()
}

/** N2 (suspicion only): N1 without spaces and punctuation, and without leading zeros inside digit runs — `W-04`, `W4`, `w 4` all give `W4`. */
export function normN2(v: unknown): string {
  return normN1(v).replace(/[^\p{L}\p{N}]/gu, '').replace(/\d+/g, (d) => String(Number(d)))
}

export interface WeldRowInput { lineId: string; reportId: string; formKey: string; front?: string; section: unknown; weld: unknown; pipe?: unknown; sizeIn?: unknown; thkIn?: unknown; result?: unknown }
export type WeldStage = 'fitup' | 'weld' | 'vt' | 'rt_request' | 'rt' | 'repair' | 'coating'
export const STAGE_OF_FORM: Record<string, WeldStage> = { fitup: 'fitup', welding: 'weld', tie_in: 'weld', rt_request: 'rt_request', rt_request_rp: 'rt_request', rt_report: 'rt', weld_repair: 'repair', fj_coating: 'coating', coating_line: 'coating', coating_daily: 'coating', bond_test: 'coating' }

export interface WeldConflict { kind: 'pipe' | 'size' | 'thickness' | 'front'; values: string[]; lineIds: string[] }
export interface WeldGroup { key: string; section: string; weld: string; lines: WeldRowInput[]; stages: Partial<Record<WeldStage, number>>; pipe: string | null; conflicts: WeldConflict[] }
export interface Suspect { n2: string; keys: string[] }
export interface WeldAnalysis { welds: WeldGroup[]; invalid: WeldRowInput[]; suspects: Suspect[]; stats: { rows: number; weldRows: number; welds: number; invalid: number; withConflicts: number; suspectGroups: number } }

/** The matching key, or null when the section or the weld number is empty (such a row is never attached to a weld). */
export function weldKey(section: unknown, weld: unknown): string | null {
  const s = normN1(section), w = normN1(weld)
  return s && w ? `${s}|${w}` : null
}

const distinct = (xs: string[]) => [...new Set(xs.filter((x) => x !== ''))]
const num = (v: unknown): string => { const n = Number(String(v ?? '').replace(',', '.').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? String(n) : '' }

/** Groups form rows by exact N1 key; reports conflicts instead of overwriting; flags — never merges — groups that differ only by N2. */
export function analyseWelds(rows: WeldRowInput[]): WeldAnalysis {
  const weldRows = rows.filter((r) => r.formKey in STAGE_OF_FORM)
  const groups = new Map<string, WeldGroup>()
  const invalid: WeldRowInput[] = []
  for (const r of weldRows) {
    const key = weldKey(r.section, r.weld)
    if (!key) { invalid.push(r); continue }
    let g = groups.get(key)
    if (!g) { g = { key, section: normN1(r.section), weld: normN1(r.weld), lines: [], stages: {}, pipe: null, conflicts: [] }; groups.set(key, g) }
    g.lines.push(r)
    const st = STAGE_OF_FORM[r.formKey]
    g.stages[st] = (g.stages[st] ?? 0) + 1
  }
  for (const g of groups.values()) {
    const pipes = distinct(g.lines.map((l) => normN1(l.pipe)))
    g.pipe = pipes.length === 1 ? pipes[0] : null // a pipe number is shown only when every row agrees
    const add = (kind: WeldConflict['kind'], pick: (l: WeldRowInput) => string) => {
      const vals = distinct(g.lines.map(pick))
      if (vals.length > 1) g.conflicts.push({ kind, values: vals, lineIds: g.lines.filter((l) => pick(l) !== '').map((l) => l.lineId) })
    }
    add('pipe', (l) => normN1(l.pipe)); add('size', (l) => num(l.sizeIn)); add('thickness', (l) => num(l.thkIn)); add('front', (l) => normN1(l.front))
  }
  const byN2 = new Map<string, Set<string>>()
  for (const g of groups.values()) { const n2 = `${normN2(g.section)}|${normN2(g.weld)}`; const s = byN2.get(n2) ?? new Set<string>(); s.add(g.key); byN2.set(n2, s) }
  const suspects: Suspect[] = [...byN2.entries()].filter(([, s]) => s.size > 1).map(([n2, s]) => ({ n2, keys: [...s].sort() }))
  const welds = [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  return { welds, invalid, suspects, stats: { rows: rows.length, weldRows: weldRows.length, welds: welds.length, invalid: invalid.length, withConflicts: welds.filter((w) => w.conflicts.length).length, suspectGroups: suspects.length } }
}
