/** Small numeric helpers for the productivity engine — no dependencies, no randomness. */
export const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0)
export const mean = (a: number[]): number | null => (a.length ? sum(a) / a.length : null)
export function median(a: number[]): number | null {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** Sample standard deviation (n-1); null below two points. */
export function stdev(a: number[]): number | null {
  if (a.length < 2) return null
  const m = sum(a) / a.length
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1))
}
export function quantile(a: number[], q: number): number | null {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
/** Ordinary least squares y = a + b·x; r2 = coefficient of determination. */
export function linreg(xs: number[], ys: number[]): { a: number; b: number; r2: number } | null {
  const n = xs.length
  if (n < 2) return null
  const mx = sum(xs) / n, my = sum(ys) / n
  let sxx = 0, sxy = 0, syy = 0
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2 }
  if (sxx === 0) return null
  const b = sxy / sxx
  return { a: my - b * mx, b, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) }
}
/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
