/** WGS84 <-> UTM (Krüger series, sub-millimetre accuracy within a zone). Pure; used for the cadastral plot corners. */
const A = 6378137
const F = 1 / 298.257223563
const K0 = 0.9996
const N = F / (2 - F)
const AA = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64)
const ALPHA = [N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16, (13 * N ** 2) / 48 - (3 * N ** 3) / 5, (61 * N ** 3) / 240]
const BETA = [N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96, N ** 2 / 48 + N ** 3 / 15, (17 * N ** 3) / 480]
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15]
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export const utmZoneOf = (lon: number): number => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1))
const centralMeridian = (zone: number) => zone * 6 - 183

export interface Utm {
  zone: number
  north: boolean
  e: number
  n: number
}

export function toUtm(lat: number, lon: number, zone = utmZoneOf(lon)): Utm {
  const phi = rad(lat)
  const lam = rad(lon - centralMeridian(zone))
  const c = (2 * Math.sqrt(N)) / (1 + N)
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)))
  const xi0 = Math.atan2(t, Math.cos(lam))
  const eta0 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t))
  let xi = xi0
  let eta = eta0
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1)
    xi += a * Math.sin(j * xi0) * Math.cosh(j * eta0)
    eta += a * Math.cos(j * xi0) * Math.sinh(j * eta0)
  })
  const north = lat >= 0
  return { zone, north, e: 500000 + K0 * AA * eta, n: K0 * AA * xi + (north ? 0 : 10000000) }
}

export function fromUtm(e: number, n: number, zone: number, north = true): [number, number] {
  const xi = (north ? n : n - 10000000) / (K0 * AA)
  const eta = (e - 500000) / (K0 * AA)
  let xi0 = xi
  let eta0 = eta
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1)
    xi0 -= b * Math.sin(j * xi) * Math.cosh(j * eta)
    eta0 -= b * Math.cos(j * xi) * Math.sinh(j * eta)
  })
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0))
  let phi = chi
  DELTA.forEach((d, i) => (phi += d * Math.sin(2 * (i + 1) * chi)))
  const lam = Math.atan2(Math.sinh(eta0), Math.cos(xi0))
  return [centralMeridian(zone) + deg(lam), deg(phi)]
}

/** Area (m²) and perimeter (m) of a polygon given in UTM metres (shoelace; exact enough for a plot inside one zone). */
export function polygonMetrics(corners: [number, number][]): { area: number; perimeter: number } {
  if (corners.length < 3) return { area: 0, perimeter: corners.length === 2 ? Math.hypot(corners[0][0] - corners[1][0], corners[0][1] - corners[1][1]) * 2 : 0 }
  let a = 0
  let per = 0
  for (let i = 0; i < corners.length; i++) {
    const [x1, y1] = corners[i]
    const [x2, y2] = corners[(i + 1) % corners.length]
    a += x1 * y2 - x2 * y1
    per += Math.hypot(x2 - x1, y2 - y1)
  }
  return { area: Math.abs(a) / 2, perimeter: per }
}
