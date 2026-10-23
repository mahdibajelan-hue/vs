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
