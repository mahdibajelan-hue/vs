import type { ProfilePoint } from './htCore'

/**
 * Ground elevations along a route whose KMZ / KML has none (a path drawn «clamped to ground» in Google Earth is saved
 * with altitude 0 at every vertex). The route is resampled at an even spacing, the ground height of each sample is read
 * from a public digital elevation model — Copernicus GLO-90 (90 m grid) through the Open-Meteo elevation service, no key —
 * and the result is the km / elevation profile the hydrotest sectioning needs. Only coordinates are sent, nothing else.
 *
 * A 90 m model is good enough to find the high and low points of a test section; for the final test pressures the
 * surveyed as-built profile (or survey KMZ with heights) should replace it — importing one in «تنظیمات» does that.
 */

export interface RoutePoint { lon: number; lat: number }
export const DEM_SOURCE_FA = 'مدل رقومی ارتفاع Copernicus (شبکهٔ ۹۰ متری)'
const ENDPOINT = 'https://api.open-meteo.com/v1/elevation'
const BATCH = 100 // the service takes up to 100 coordinates per request

const R = 6371008.8, rad = Math.PI / 180
export function haversineM(a: RoutePoint, b: RoutePoint): number {
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** points every `stepM` along the line (and its last vertex), each with its distance from the start; at most `maxPts` */
export function resample(pts: RoutePoint[], stepM = 100, maxPts = 1500): { p: RoutePoint; d: number }[] {
  if (pts.length < 2) return pts.map((p) => ({ p, d: 0 }))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]))
  const total = cum[cum.length - 1]
  const step = Math.max(stepM, total / (maxPts - 1))
  const out: { p: RoutePoint; d: number }[] = []
  let seg = 1
  for (let d = 0; d < total; d += step) {
    while (seg < pts.length - 1 && cum[seg] < d) seg++
    const a = pts[seg - 1], b = pts[seg], L = cum[seg] - cum[seg - 1], f = L > 0 ? (d - cum[seg - 1]) / L : 0
    out.push({ p: { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f }, d })
  }
  out.push({ p: pts[pts.length - 1], d: total })
  return out
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** the ground profile of the route (km from `startKm`) */
export async function demProfile(pts: RoutePoint[], startKm = 0, opts: { stepM?: number; fetcher?: Fetcher; onProgress?: (done: number, total: number) => void } = {}): Promise<ProfilePoint[]> {
  const samples = resample(pts, opts.stepM ?? 100)
  const get: Fetcher = opts.fetcher ?? ((u) => fetch(u))
  const out: ProfilePoint[] = []
  for (let i = 0; i < samples.length; i += BATCH) {
    const chunk = samples.slice(i, i + BATCH)
    const url = `${ENDPOINT}?latitude=${chunk.map((s) => s.p.lat.toFixed(6)).join(',')}&longitude=${chunk.map((s) => s.p.lon.toFixed(6)).join(',')}`
    let res
    try { res = await get(url) } catch { throw new Error('ارتباط با سرویس مدل رقومی ارتفاع برقرار نشد (اینترنت یا فایروال سرور را بررسی کنید). می‌توانید پروفیل را به‌صورت جدول وارد کنید.') }
    if (!res.ok) throw new Error(`سرویس مدل رقومی ارتفاع پاسخ نداد (کد ${res.status}). کمی بعد دوباره امتحان کنید یا پروفیل را به‌صورت جدول وارد کنید.`)
    const body = (await res.json()) as { elevation?: unknown }
    const el = Array.isArray(body.elevation) ? body.elevation : []
    if (el.length !== chunk.length) throw new Error('پاسخ سرویس مدل رقومی ارتفاع ناقص بود.')
    chunk.forEach((s, k) => { const e = Number(el[k]); if (Number.isFinite(e)) out.push({ km: startKm + s.d / 1000, elev: Math.round(e * 10) / 10 }) })
    opts.onProgress?.(Math.min(samples.length, i + BATCH), samples.length)
  }
  return out
}
