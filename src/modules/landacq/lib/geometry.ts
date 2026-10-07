export type LonLat = [number, number]

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface Polyline {
  points: LonLat[]
  /** cumulative metres at each vertex */
  cum: number[]
  length: number
}
export function polyline(points: LonLat[]): Polyline {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]))
  return { points, cum, length: cum[cum.length - 1] ?? 0 }
}

/**
 * Chainage → position. The nominal route length (km) is mapped linearly onto the drawn geometry, so a hand-drawn or
 * simplified polyline still lines up with the engineering chainage at both ends.
 */
export function pointAt(line: Polyline, frac: number): LonLat {
  const pts = line.points
  if (pts.length === 0) return [0, 0]
  if (pts.length === 1 || line.length === 0) return pts[0]
  const target = Math.max(0, Math.min(1, frac)) * line.length
  let i = 1
  while (i < line.cum.length - 1 && line.cum[i] < target) i++
  const seg = line.cum[i] - line.cum[i - 1] || 1
  const t = (target - line.cum[i - 1]) / seg
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
}

/** A sub-polyline between two chainage fractions (inclusive), including the original vertices in between. */
export function slice(line: Polyline, f0: number, f1: number): LonLat[] {
  if (line.points.length === 0) return []
  const a = Math.max(0, Math.min(1, f0))
  const b = Math.max(0, Math.min(1, f1))
  const out: LonLat[] = [pointAt(line, a)]
  for (let i = 0; i < line.points.length; i++) {
    const f = line.length === 0 ? 0 : line.cum[i] / line.length
    if (f > a && f < b) out.push(line.points[i])
  }
  out.push(pointAt(line, b))
  return out
}

export interface Projector {
  (p: LonLat): [number, number]
  width: number
  height: number
}
/** Equirectangular projection fitted into a box (cos-latitude corrected), y grows downward, north up. */
export function fit(points: LonLat[], width: number, height: number, pad = 24): Projector {
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const k = Math.cos(rad((minLat + maxLat) / 2))
  const w = Math.max((maxLon - minLon) * k, 1e-9)
  const h = Math.max(maxLat - minLat, 1e-9)
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h)
  const offX = (width - w * scale) / 2
  const offY = (height - h * scale) / 2
  const proj = ((p: LonLat) => [offX + (p[0] - minLon) * k * scale, offY + (maxLat - p[1]) * scale]) as Projector
  proj.width = width
  proj.height = height
  return proj
}

/** Pull every `<coordinates>` list out of a KML text (LineString / MultiGeometry) and join them into one route. */
export function parseKml(text: string): LonLat[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const out: LonLat[] = []
  doc.querySelectorAll('LineString > coordinates, coordinates').forEach((el) => {
    for (const tok of (el.textContent ?? '').trim().split(/\s+/)) {
      const [lon, lat] = tok.split(',').map(Number)
      if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([lon, lat])
    }
  })
  // de-duplicate nodes that the same geometry repeated back-to-back
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1])
}

/** A gently meandering stand-in when a project has no coordinates yet — the chainage model still gets a map. */
export function schematicGeometry(totalKm: number): LonLat[] {
  const n = Math.max(6, Math.ceil(totalKm / 8))
  return Array.from({ length: n + 1 }, (_, i) => [i * 0.075, Math.sin(i * 0.8) * 0.045 + Math.sin(i * 0.31) * 0.03] as LonLat)
}
