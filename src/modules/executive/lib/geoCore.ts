import { IRAN_PROVINCES, type Province } from './iranProvinces'
import type { Status } from './dashboardCore'

/* Province-level geography for the portfolio map: which province a point or a route lies in, the totals per province,
   and the class breaks the choropleth is coloured by. Pure, so it is tested without a browser. */

type Ring = [number, number][]

function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** the province a point (lng, lat) falls in; the simplified borders leave slivers, so a miss falls back to the nearest label */
export function provinceAt(lng: number, lat: number, provinces: Province[] = IRAN_PROVINCES): string | null {
  for (const p of provinces) if (p.rings.some((r) => inRing([lng, lat], r))) return p.name
  let best: string | null = null, bestD = 0.6 // ~60 km: beyond that the point is not in Iran
  for (const p of provinces) {
    const d = Math.hypot(p.label[0] - lng, p.label[1] - lat)
    if (d < bestD) { bestD = d; best = p.name }
  }
  return best
}

/** the provinces a route crosses, each with its share of the route's sampled points (shares sum to 1) */
export function routeProvinces(points: [number, number][], provinces: Province[] = IRAN_PROVINCES): { name: string; share: number }[] {
  const counts = new Map<string, number>()
  let n = 0
  for (const [lng, lat] of points) {
    const name = provinceAt(lng, lat, provinces)
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1); n++
  }
  return [...counts].map(([name, c]) => ({ name, share: c / n })).sort((a, b) => b.share - a.share)
}

export interface GeoItem { id: string; status: Status; budget: number | null; provinces: { name: string; share: number }[] }
export interface ProvinceStat { name: string; count: number; budget: number; worst: Status | null; byStatus: Record<Status, number>; ids: string[] }

const SEVERITY: Record<Status, number> = { critical: 3, attention: 2, good: 1, unknown: 0 }

/** totals per province: a project counts once in every province it touches; its budget is split by route share */
export function provinceStats(items: GeoItem[]): Map<string, ProvinceStat> {
  const out = new Map<string, ProvinceStat>()
  for (const it of items) {
    for (const { name, share } of it.provinces) {
      const s = out.get(name) ?? { name, count: 0, budget: 0, worst: null, byStatus: { critical: 0, attention: 0, good: 0, unknown: 0 }, ids: [] }
      s.count++
      s.budget += (it.budget ?? 0) * share
      s.byStatus[it.status]++
      if (!s.worst || SEVERITY[it.status] > SEVERITY[s.worst]) s.worst = it.status
      s.ids.push(it.id)
      out.set(name, s)
    }
  }
  return out
}

/** five classes from 0 to the maximum, with round upper bounds; `classOf` returns 0 for no value and 1–5 otherwise */
export function classBreaks(max: number): number[] {
  if (!(max > 0)) return [1, 2, 3, 4, 5]
  if (max <= 5) return [1, 2, 3, 4, 5].map((i) => Math.ceil((max * i) / 5))
  const step = max / 5
  const mag = 10 ** Math.floor(Math.log10(step))
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= step) ?? step
  return [1, 2, 3, 4, 5].map((i) => nice * i)
}
export function classOf(value: number, breaks: number[]): number {
  if (!(value > 0)) return 0
  const i = breaks.findIndex((b) => value <= b)
  return i < 0 ? breaks.length : i + 1
}

/** bounding box [minLng, minLat, maxLng, maxLat] of one province */
export function provinceBox(name: string, provinces: Province[] = IRAN_PROVINCES): [number, number, number, number] | null {
  const p = provinces.find((x) => x.name === name)
  if (!p) return null
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of p.rings) for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y) }
  return [a, b, c, d]
}
