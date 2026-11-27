import { registerKey, type Pipe } from './registers'

/**
 * The pipe yard as the stringing crew sees it: every registered pipe that can still be strung, with the depot it was
 * unloaded at (the delivery record's «محل دپو», else its front), so a day's pipes are picked from a filtered list instead
 * of typed one number at a time.
 */
export interface YardPipe { key: string; raw: string; lengthM: number | null; wtIn: number | null; odIn: number | null; depot: string; entryDate: string; pending: boolean }
export const NO_DEPOT = 'بدون محل دپو'

interface LineLite { id: string; reportId: string; status: string; detail: Record<string, unknown> }
interface ReportLite { id: string; formKey: string; front: string; data: Record<string, unknown> | null }

/** pipes in stock that no stringing record (other than this one's own rows) has used */
export function yardPipes(pipes: Pipe[], lines: LineLite[], reports: ReportLite[], reportId: string, rowPipes: unknown[]): YardPipe[] {
  const rep = new Map(reports.map((r) => [r.id, r]))
  const line = new Map(lines.map((l) => [l.id, l]))
  const strung = new Set<string>()
  for (const l of lines) if (l.reportId !== reportId && rep.get(l.reportId)?.formKey === 'string' && l.status !== 'rejected') { const k = registerKey(l.detail.pipeNo); if (k) strung.add(k) }
  for (const p of rowPipes) { const k = registerKey(p); if (k) strung.add(k) }
  return pipes.filter((p) => p.status === 'in_stock' && !strung.has(p.key)).map((p) => {
    const l = p.entryLineId ? line.get(p.entryLineId) : undefined
    const r = l ? rep.get(l.reportId) : undefined
    const depot = String(r?.data?.depot ?? '').trim() || String(r?.front ?? '').trim() || NO_DEPOT
    return { key: p.key, raw: p.raw, lengthM: p.lengthM, wtIn: p.wtIn, odIn: p.odIn, depot, entryDate: p.entryDate, pending: !!l && l.status === 'pending' }
  }).sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.raw.localeCompare(b.raw, 'en', { numeric: true })) // first in, first out
}

export interface YardFilter { depots: string[]; thks: number[]; sizes: number[]; q: string }
export const NO_FILTER: YardFilter = { depots: [], thks: [], sizes: [], q: '' }
export function filterYard(list: YardPipe[], f: YardFilter): YardPipe[] {
  const q = registerKey(f.q)
  return list.filter((p) => (!f.depots.length || f.depots.includes(p.depot)) && (!f.thks.length || (p.wtIn != null && f.thks.includes(p.wtIn)))
    && (!f.sizes.length || (p.odIn != null && f.sizes.includes(p.odIn))) && (!q || p.key.includes(q)))
}

export interface Facet<T> { value: T; count: number; meters: number }
function facet<T>(list: YardPipe[], of: (p: YardPipe) => T | null, order: (a: T, b: T) => number): Facet<T>[] {
  const m = new Map<T, Facet<T>>()
  for (const p of list) { const v = of(p); if (v == null) continue; const e = m.get(v) ?? { value: v, count: 0, meters: 0 }; e.count++; e.meters += p.lengthM ?? 0; m.set(v, e) }
  return [...m.values()].sort((a, b) => order(a.value, b.value))
}
/** what each filter chip would show: counts and meters of the WHOLE yard, not of the current filter */
export const yardFacets = (list: YardPipe[]) => ({
  depots: facet(list, (p) => p.depot, (a, b) => a.localeCompare(b, 'fa')),
  thks: facet(list, (p) => p.wtIn, (a, b) => a - b),
  sizes: facet(list, (p) => p.odIn, (a, b) => a - b),
})

/** the rows a pick adds to the stringing record; with a start chainage each pipe is laid end to end after the previous one */
export function stringRows(picked: YardPipe[], startKm: number | null): Record<string, unknown>[] {
  let km = startKm
  return picked.map((p) => {
    const row: Record<string, unknown> = { pipeNo: p.raw, origin: 'depot' }
    if (p.lengthM != null) row.lengthM = p.lengthM
    if (p.wtIn != null) row.thkIn = p.wtIn
    if (km != null) { row.km = Math.round(km * 1000) / 1000; km += (p.lengthM ?? 0) / 1000 }
    return row
  })
}
