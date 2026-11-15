/**
 * Film consumption of the radiography — for the material balance: how many films (and metres of film) were exposed,
 * and how many of them were repeats: retake (the employer asked for it, the employer pays), reshoot (unreadable film,
 * the RT contractor pays), RS (after a repair, the welding contractor pays).
 */
export interface UseFilm { round: number; quality: 'pending' | 'accepted' | 'retake' | 'reshoot'; lenMm: number | null; date: string; odMm: number | null }
export interface UseRow { key: string; films: number; metres: number; first: number; rs: number; retake: number; reshoot: number; pending: number; accepted: number }
const blank = (key: string): UseRow => ({ key, films: 0, metres: 0, first: 0, rs: 0, retake: 0, reshoot: 0, pending: 0, accepted: 0 })
export function filmUse(films: UseFilm[], keyOf: (f: UseFilm) => string): { rows: UseRow[]; total: UseRow } {
  const m = new Map<string, UseRow>(), total = blank('total')
  for (const f of films) {
    const k = keyOf(f); let r = m.get(k); if (!r) { r = blank(k); m.set(k, r) }
    for (const x of [r, total]) {
      x.films++; x.metres += (f.lenMm ?? 0) / 1000
      if (f.quality === 'retake') x.retake++; else if (f.quality === 'reshoot') x.reshoot++; else if (f.round > 0) x.rs++; else x.first++
      if (f.quality === 'pending') x.pending++; if (f.quality === 'accepted') x.accepted++
    }
  }
  return { rows: [...m.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })), total }
}
/** share of the exposed films that did not serve as a first, accepted record */
export const repeatRate = (r: UseRow) => (r.films ? (r.retake + r.reshoot + r.rs) / r.films : null)
