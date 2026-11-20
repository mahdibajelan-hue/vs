import { addr, type GridTemplate } from './gridTypes.ts'

export type PartyKey = 'employer' | 'consultant' | 'contractor'
export type PartyBrand = Partial<Record<PartyKey, { name?: string; logo?: string }>>

/**
 * The approved sheets keep empty merged boxes in their top rows for the parties' logos. They are found here: an empty
 * cell in the first three rows spanning at least two columns. Read right to left (the sheets are Persian): the right-most
 * box is the employer's, the left-most the contractor's, a middle one the consultant's. A sheet that places its own logo
 * images (template `logos`) is left alone. Returns image + caption by cell address, for GridSheet's in-cell images.
 */
export function partyLogoCells(tpl: GridTemplate, parties: PartyBrand): Record<string, { image: string; caption: string }> {
  if (tpl.logos?.some((l) => l.kind === 'pic')) return {}
  const boxes = tpl.cells.filter((c) => c.r <= 2 && !(c.v ?? '').trim() && (c.cs ?? 1) >= 2 && !tpl.cols[c.c]?.hidden).sort((a, b) => b.c - a.c || a.r - b.r)
  // one box per column band: a box under another box of the same columns is the same slot
  const slots = boxes.filter((b, i) => !boxes.slice(0, i).some((o) => o.c === b.c))
  if (!slots.length) return {}
  const order: PartyKey[] = slots.length === 1 ? ['employer'] : slots.length === 2 ? ['employer', 'contractor'] : ['employer', 'consultant', 'contractor']
  const out: Record<string, { image: string; caption: string }> = {}
  slots.slice(0, 3).forEach((c, i) => { const p = parties[order[i]]; if (p?.logo) out[addr(c.r, c.c)] = { image: p.logo, caption: p.name ?? '' } })
  return out
}
