/**
 * One good location fix for a check-in. GPS needs a few seconds to settle, so instead of taking the first reading
 * we watch the position and keep the most accurate one until it is good enough (≤ `target` m) or time runs out.
 */
export const APPROXIMATE_M = 1000 // iOS «Precise Location» off / Android «approximate»: a fixed point ±3–10 km

export async function bestFix(opts: { target?: number; maxMs?: number; onProgress?: (accuracy: number) => void } = {}): Promise<GeolocationPosition> {
  const target = opts.target ?? 50, maxMs = opts.maxMs ?? 15000
  if (!('geolocation' in navigator)) throw new Error('unsupported')
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let done = false
    const finish = (err?: unknown) => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      if (best) resolve(best)
      else reject(err ?? { code: 3 })
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p
        opts.onProgress?.(best.coords.accuracy)
        // a first reading from cell towers can be kilometres off and improve within seconds, so only a good fix stops early
        if (best.coords.accuracy <= target) finish()
      },
      (e) => { if (e.code === 1 || !best) finish(e) },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    )
    const timer = setTimeout(() => finish(), maxMs)
  })
}

export const isApproximate = (accuracy: number) => accuracy >= APPROXIMATE_M

function networkFix(timeout: number): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, maximumAge: 60000, timeout })
  })
}

/**
 * GPS first; when it does not get precise (indoors, no sky), also ask the phone for its network position — cell towers
 * and Wi-Fi — and keep whichever is more accurate. A browser cannot read cell-tower IDs itself; this is the phone's own
 * cell/Wi-Fi location. The server accepts a network fix within the project's limit and marks it as such.
 */
export async function fixWithNetworkFallback(opts: { target?: number; maxMs?: number; onProgress?: (accuracy: number) => void } = {}): Promise<GeolocationPosition> {
  let gps: GeolocationPosition | null = null
  let gpsErr: unknown = null
  try { gps = await bestFix(opts) } catch (e) { gpsErr = e }
  if ((gpsErr as GeolocationPositionError | null)?.code === 1) throw gpsErr
  if (gps && gps.coords.accuracy <= (opts.target ?? 50)) return gps
  const net = await networkFix(10000)
  if (net && (!gps || net.coords.accuracy < gps.coords.accuracy)) { opts.onProgress?.(net.coords.accuracy); return net }
  if (gps) return gps
  throw gpsErr ?? { code: 2 }
}
