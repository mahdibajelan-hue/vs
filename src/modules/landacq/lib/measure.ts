import { haversine, type LonLat } from './geometry'

/** Approximate length (m) of a polyline, optionally closed. */
export function pathLength(pts: LonLat[], closed = false): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i])
  if (closed && pts.length > 2) d += haversine(pts[pts.length - 1], pts[0])
  return d
}

/** Approximate area (m²) of a polygon: local equirectangular projection + shoelace — good to a fraction of a percent for plot-sized shapes. */
export function polygonAreaLonLat(pts: LonLat[]): number {
  if (pts.length < 3) return 0
  const lat0 = (pts.reduce((s, p) => s + p[1], 0) / pts.length) * (Math.PI / 180)
  const R = 6371008.8
  const xy = pts.map((p) => [p[0] * (Math.PI / 180) * R * Math.cos(lat0), p[1] * (Math.PI / 180) * R])
  let a = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export const fmtLength = (m: number): string => (m >= 1000 ? `${(m / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 3 })} کیلومتر` : `${Math.round(m).toLocaleString('fa-IR')} متر`)
export const fmtAreaM2 = (m2: number): string => (m2 >= 1_000_000 ? `${(m2 / 1_000_000).toLocaleString('fa-IR', { maximumFractionDigits: 3 })} کیلومتر مربع` : m2 >= 10_000 ? `${(m2 / 10_000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} هکتار` : `${Math.round(m2).toLocaleString('fa-IR')} متر مربع`)
