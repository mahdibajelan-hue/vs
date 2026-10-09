import { useEffect, useRef, useState } from 'react'

/** Counts a number up once on mount / when the target changes. Skipped entirely under reduced motion. */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(target)) { setV(target); from.current = target; return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(a + (target - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return Math.round(v)
}
