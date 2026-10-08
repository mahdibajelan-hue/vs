import { haversine, type LonLat } from './geometry'

/** What a KML file says about the route: the line itself, and — when the file has kilometre posts — the chainage it uses. */
export interface KmlRoute {
  points: LonLat[]
  /** Length of the line (km), measured along the ground. */
  lengthKm: number
  /** Lines in the file that were not part of the route (side roads, other pipelines, the same line twice …). */
  ignoredLines: number
  /** Kilometre posts found (Placemarks named like «KM 12+500») and how the chainage was derived from them. */
  posts: number
  startKm: number | null
  endKm: number | null
  /** Chainage length minus ground length, in metres, when posts disagree with the line (large values = suspicious file). */
  postMismatchM: number | null
}

const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
const faDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g, '.')

function coordsOf(text: string): LonLat[] {
  const out: LonLat[] = []
  for (const tok of text.trim().split(/\s+/)) {
    const [lon, lat] = tok.split(',').map(Number)
    if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) out.push([lon, lat])
  }
  return out
}
const lineLen = (pts: LonLat[]): number => pts.reduce((n, p, i) => (i ? n + haversine(pts[i - 1], p) : 0), 0)
const dedupe = (pts: LonLat[]): LonLat[] => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])

/** «KM 12+500», «12+500», «KP 12.5», «km12» → 12.5 (null when the name is not a kilometre post). */
export function kmFromName(name: string): number | null {
  const t = faDigits(name).trim()
  let m = /^(?:km|kp|k\.?m\.?|کیلومتر|ک\.?م)?\s*[:\-]?\s*(\d{1,4})\s*\+\s*(\d{1,3})\s*$/i.exec(t)
  if (m) return Number(m[1]) + Number(m[2].padEnd(3, '0')) / 1000
  m = /^(?:km|kp|k\.?m\.?|کیلومتر|ک\.?م)\s*[:\-]?\s*(\d{1,4}(?:\.\d+)?)\s*$/i.exec(t)
  if (m) return Number(m[1])
  m = /^(\d{1,4}(?:\.\d+)?)\s*(?:km|کیلومتر)$/i.exec(t)
  return m ? Number(m[1]) : null
}

/** Distance along `line` (m) of the point nearest to `p`, projecting onto segments (local flat approximation). */
function alongLine(line: LonLat[], cum: number[], p: LonLat): { d: number; off: number } {
  let best = { d: 0, off: Infinity }
  const k = Math.cos((p[1] * Math.PI) / 180)
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = [line[i - 1][0] * k, line[i - 1][1]]
    const [bx, by] = [line[i][0] * k, line[i][1]]
    const [px, py] = [p[0] * k, p[1]]
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    const q: LonLat = [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
    const off = haversine(p, q)
    if (off < best.off) best = { d: cum[i - 1] + haversine(line[i - 1], q), off }
  }
  return best
}

/** Joins lines end to end (within `tol` metres), starting from the longest; returns the chain and how many lines were left out. */
function chain(lines: LonLat[][], tol = 150): { pts: LonLat[]; used: number } {
  const pool = lines.filter((l) => l.length >= 2).sort((a, b) => lineLen(b) - lineLen(a))
  if (!pool.length) return { pts: [], used: 0 }
  let pts = [...pool.shift()!]
  let used = 1
  let grew = true
  while (grew && pool.length) {
    grew = false
    for (let i = 0; i < pool.length; i++) {
      const l = pool[i]
      const [h, t] = [pts[0], pts[pts.length - 1]]
      const [lh, lt] = [l[0], l[l.length - 1]]
      let next: LonLat[] | null = null
      if (haversine(t, lh) <= tol) next = [...pts, ...l]
      else if (haversine(t, lt) <= tol) next = [...pts, ...[...l].reverse()]
      else if (haversine(lt, h) <= tol) next = [...l, ...pts]
      else if (haversine(lh, h) <= tol) next = [...[...l].reverse(), ...pts]
      if (next) { pts = next; pool.splice(i, 1); used++; grew = true; break }
    }
  }
  return { pts: dedupe(pts), used }
}

/**
 * Reads a KML: only LineStrings make the route (Points, Polygons and folders are not mistaken for it), pieces that join end to end are
 * chained into one line, and kilometre posts, when present, give the chainage (start km) so «KM 0+000» in the file is KM 0 in the system.
 */
export function parseKmlRoute(kml: string): KmlRoute {
  const text = unCdata(kml)
  const lines: LonLat[][] = []
  const posts: { km: number; at: LonLat }[] = []
  for (const pm of text.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const name = (/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1] ?? '').trim()
    const isPoint = /<Point>/.test(pm) && !/<LineString>/.test(pm)
    if (isPoint) {
      const km = kmFromName(name)
      const c = coordsOf(/<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1] ?? '')[0]
      if (km != null && c) posts.push({ km, at: c })
      continue
    }
    for (const m of pm.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/g)) {
      const pts = dedupe(coordsOf(m[1]))
      if (pts.length >= 2) lines.push(pts)
    }
    const track = [...pm.matchAll(/<gx:coord>([\s\S]*?)<\/gx:coord>/g)].map((m) => m[1].trim().split(/\s+/).map(Number)).filter((v) => v.length >= 2 && v.every(Number.isFinite)).map((v) => [v[0], v[1]] as LonLat)
    if (track.length >= 2) lines.push(dedupe(track))
  }
  // a file with bare <coordinates> outside any Placemark (rare) still works
  if (!lines.length && !/<Placemark/.test(text)) {
    for (const m of text.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) lines.push(dedupe(coordsOf(m[1])))
  }
  const { pts: joined, used } = chain(lines)
  const cumOf = (l: LonLat[]) => l.reduce<number[]>((a, p, i) => (a.push(i ? a[i - 1] + haversine(l[i - 1], p) : 0), a), [])
  let pts = joined
  let cum = cumOf(pts)
  // the posts decide which end is KM 0: if kilometres fall along the line, walk it the other way round
  if (pts.length >= 2) {
    const probe = posts.map((p) => ({ km: p.km, ...alongLine(pts, cum, p.at) })).filter((p) => p.off <= 300).sort((a, b) => a.d - b.d)
    if (probe.length >= 2 && probe[probe.length - 1].km < probe[0].km) { pts = [...pts].reverse(); cum = cumOf(pts) }
  }
  const lengthM = cum[cum.length - 1] ?? 0
  let startKm: number | null = null
  let endKm: number | null = null
  let mismatch: number | null = null
  // posts that sit on the line (within 300 m) place the line on the chainage
  const on = pts.length >= 2 ? posts.map((p) => ({ km: p.km, ...alongLine(pts, cum, p.at) })).filter((p) => p.off <= 300) : []
  if (on.length >= 2) {
    const offs = on.map((p) => p.km * 1000 - p.d).sort((a, b) => a - b)
    const mid = offs.length >> 1
    startKm = Math.round(offs.length % 2 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2) / 1000
    startKm = Math.max(0, +startKm.toFixed(3))
    endKm = +(startKm + lengthM / 1000).toFixed(3)
    const kms = on.map((p) => p.km)
    mismatch = Math.round((Math.max(...kms) - Math.min(...kms)) * 1000 - (Math.max(...on.map((p) => p.d)) - Math.min(...on.map((p) => p.d))))
  }
  return { points: pts, lengthKm: lengthM / 1000, ignoredLines: lines.length - used, posts: on.length, startKm, endKm, postMismatchM: mismatch }
}
