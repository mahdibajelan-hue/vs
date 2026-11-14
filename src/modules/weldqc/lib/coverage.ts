/** Film segments written as clock hours («12-3», «۳ تا ۶», «9–12») and how much of the circumference they cover. */
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
export function segmentHours(segment: string): [number, number] | null {
  const m = /^\s*(?:ساعت\s*)?(\d{1,2})\s*(?:-|–|تا)\s*(\d{1,2})\s*$/.exec(latin(segment))
  if (!m) return null
  const p = Number(m[1]), q = Number(m[2])
  // «0-1», «12-13» … are tape-measure marks along the weld, not hours: a clock has no 0 and nothing above 12
  return p < 1 || q < 1 || p > 12 || q > 12 ? null : [p % 12, q % 12]
}
/** hours of the 12 covered by the segments (each runs clockwise from its first hour to its second); null = none is written as hours */
export function coveredHours(segments: string[]): { hours: number; gaps: [number, number][] } | null {
  const spans = segments.map(segmentHours).filter((x): x is [number, number] => !!x)
  // one film numbered by the tape (0-1) means the whole set is: «1-2» beside it is not an hour either
  if (!spans.length || segments.some((x) => /^\s*\d+\s*(?:-|–|تا)\s*\d+\s*$/.test(latin(x)) && !segmentHours(x))) return null
  const hit = new Array(24).fill(false) // half-hour cells
  for (const [a, b] of spans) { const len = ((b - a + 12) % 12) || 12; for (let k = 0; k < len * 2; k++) hit[(a * 2 + k) % 24] = true }
  const gaps: [number, number][] = []
  for (let i = 0; i < 24; i++) if (!hit[i] && hit[(i + 23) % 24]) { let j = i; while (!hit[(j + 1) % 24] && j - i < 24) j++; gaps.push([(i / 2) || 12, (((j + 1) % 24) / 2) || 12]) }
  return { hours: hit.filter(Boolean).length / 2, gaps }
}
/** film density (H&D) written as «2.4» or «2.0-3.5»: outside API 1104's 1.8 – 4.0 for the area of interest? */
export function densityIssue(density: string): string | null {
  const nums = (latin(density).replace(/٫/g, '.').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((x) => x > 0 && x < 10)
  if (!nums.length) return null
  const lo = Math.min(...nums), hi = Math.max(...nums)
  return lo < 1.8 ? `دانسیتهٔ ${lo} کمتر از حداقل ۱٫۸ است` : hi > 4 ? `دانسیتهٔ ${hi} بیشتر از حداکثر ۴٫۰ است` : null
}
