/**
 * Films around the pipe. A large pipe takes several films round its girth weld; each film starts at a known distance
 * from 12 o'clock (clockwise, along the tape) and covers a known length. From the diameter and that distance the clock
 * of any point on a film follows, so the interpreter does not type it. After a repair only the repaired zone is shot.
 */
export const circOf = (odMm: number) => Math.PI * odMm
/** default number of films: strips of up to 1.5 m, three at least (the usual three exposures of a small pipe) */
export const defaultFilmCount = (odMm: number, stripMm = 1500) => Math.max(3, Math.ceil(circOf(odMm) / stripMm))
export interface Slot { seq: number; startMm: number; lenMm: number; clockFrom: number; clockTo: number }
const wrap = (v: number, c: number) => ((v % c) + c) % c
export const clockOfMm = (mm: number, circ: number) => Math.round((wrap(mm, circ) / circ) * 120) / 10
export const mmOfClock = (clock: number, circ: number) => ((clock % 12) / 12) * circ
/** n equal films from 12 o'clock */
export function plan(odMm: number, n: number): Slot[] {
  const c = circOf(odMm), len = c / n
  return Array.from({ length: n }, (_, i) => ({ seq: i + 1, startMm: Math.round(i * len), lenMm: Math.round(len), clockFrom: clockOfMm(i * len, c), clockTo: clockOfMm((i + 1) * len, c) || 12 }))
}
export interface FilmSpan { startMm: number | null; lenMm: number | null }
/** the clock of a point `x` px along a film: by the calibrated scale when there is one, else by the film's share of its length */
export function clockOnFilm(f: FilmSpan, x: number, widthPx: number, pxPerMm: number | null, odMm: number): number | null {
  if (f.startMm == null || !(odMm > 0) || !(widthPx > 0)) return null
  const along = pxPerMm ? x / pxPerMm : f.lenMm ? (x / widthPx) * f.lenMm : null
  return along == null ? null : clockOfMm(f.startMm + along, circOf(odMm))
}
/** millimetres of the circumference covered by the films, and the stretches without a film (mm from 12 o'clock) */
export function covered(films: FilmSpan[], circ: number): { mm: number; gaps: [number, number][] } {
  const N = 720, hit = new Uint8Array(N), cell = circ / N // half-degree cells
  for (const f of films) { if (f.startMm == null || !f.lenMm) continue; const a = Math.floor(wrap(f.startMm, circ) / cell), k = Math.min(N, Math.ceil(f.lenMm / cell - 1e-6)); for (let i = 0; i < k; i++) hit[(a + i) % N] = 1 }
  const n = hit.reduce((s, v) => s + v, 0), gaps: [number, number][] = []
  if (n > 0 && n < N) for (let i = 0; i < N; i++) if (!hit[i] && hit[(i + N - 1) % N]) { let j = i; while (!hit[(j + 1) % N]) j++; gaps.push([Math.round(i * cell), Math.round(((j + 1) % N) * cell) || Math.round(circ)]) }
  return { mm: Math.round(n * cell), gaps }
}
/** does a set of films cover the stretch from → to (clockwise, mm)? returns the uncovered length */
export function uncovered(films: FilmSpan[], fromMm: number, toMm: number, circ: number): number {
  const N = 720, hit = new Uint8Array(N), cell = circ / N
  for (const f of films) { if (f.startMm == null || !f.lenMm) continue; const a = Math.floor(wrap(f.startMm, circ) / cell), k = Math.min(N, Math.ceil(f.lenMm / cell - 1e-6)); for (let i = 0; i < k; i++) hit[(a + i) % N] = 1 }
  const a = Math.floor(wrap(fromMm, circ) / cell), len = wrap(toMm - fromMm, circ) || circ, k = Math.max(1, Math.round(len / cell))
  let miss = 0; for (let i = 0; i < k; i++) if (!hit[(a + i) % N]) miss++
  return Math.round(miss * cell)
}
/** the zone a repair covers: from the first to the last rejected indication, 50 mm beyond each end (clock hours) */
export function repairZone(defects: { clock: number | null; lengthMm: number }[], circ: number, marginMm = 50): { from: number; to: number } | null {
  const ds = defects.filter((d) => d.clock != null)
  if (!ds.length) return null
  // the shortest arc that holds every indication: cut the circle at the widest empty gap
  const pts = ds.map((d) => ({ a: mmOfClock(d.clock!, circ) - d.lengthMm / 2, b: mmOfClock(d.clock!, circ) + d.lengthMm / 2 })).sort((p, q) => p.a - q.a)
  let best = 0, gap = -1
  for (let i = 0; i < pts.length; i++) { const next = pts[(i + 1) % pts.length].a + (i + 1 === pts.length ? circ : 0); const g = next - Math.max(...pts.slice(0, i + 1).map((p) => p.b)); if (g > gap) { gap = g; best = (i + 1) % pts.length } }
  const order = [...pts.slice(best), ...pts.slice(0, best).map((p) => ({ a: p.a + circ, b: p.b + circ }))]
  return { from: clockOfMm(order[0].a - marginMm, circ), to: clockOfMm(Math.max(...order.map((p) => p.b)) + marginMm, circ) }
}

// ── least number of welders on a pass, by diameter (the project may change the table) ────────────────────────────────
export interface CrewMin { maxIn: number; root: number; hot: number; fill: number; cap: number }
/** up to 10″ one welder; 12″ – 30″ two; 36″ and above four on the root and hot passes — later passes may have fewer */
export const CREW_MIN_DEFAULT: CrewMin[] = [{ maxIn: 10, root: 1, hot: 1, fill: 1, cap: 1 }, { maxIn: 30, root: 2, hot: 2, fill: 1, cap: 1 }, { maxIn: 999, root: 4, hot: 4, fill: 2, cap: 2 }]
export const crewMinOf = (odIn: number | null, table: CrewMin[] = CREW_MIN_DEFAULT): CrewMin | null => (odIn == null ? null : [...table].sort((a, b) => a.maxIn - b.maxIn).find((r) => odIn <= r.maxIn) ?? null)
export function mergeCrewMin(x: unknown): CrewMin[] {
  if (!Array.isArray(x) || !x.length) return CREW_MIN_DEFAULT
  const rows = x.map((r) => ({ maxIn: Number(r?.maxIn), root: Number(r?.root), hot: Number(r?.hot), fill: Number(r?.fill), cap: Number(r?.cap) })).filter((r) => r.maxIn > 0 && [r.root, r.hot, r.fill, r.cap].every((v) => v >= 1 && v <= 8))
  return rows.length ? rows : CREW_MIN_DEFAULT
}
/** passes whose recorded welders are fewer than the least for this diameter */
export function crewShort(odIn: number | null, welders: Record<'root' | 'hot' | 'fill' | 'cap', string[]>, table?: CrewMin[]): { pass: 'root' | 'hot' | 'fill' | 'cap'; have: number; need: number }[] {
  const m = crewMinOf(odIn, table); if (!m) return []
  return (['root', 'hot', 'fill', 'cap'] as const).map((p) => ({ pass: p, have: new Set(welders[p]).size, need: m[p] })).filter((x) => x.have > 0 && x.have < x.need)
}
