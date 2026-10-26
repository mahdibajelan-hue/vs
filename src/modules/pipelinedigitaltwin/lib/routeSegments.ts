import type { Joint } from '../types'
import { FINAL_STATUS_COLOR } from './progressEngine'

export interface ProgressSpan {
  startMeters: number
  endMeters: number
  color: string
}

/**
 * Merges consecutive joints that share the same status color into contiguous colored spans along
 * the route. A real pipeline can have thousands of joints (one every ~12m stock length) — coloring
 * the 3D pipe per-joint would mean thousands of imperceptibly-short tube entities. Real
 * construction progress moves as a handful of contiguous fronts anyway, so this renders one tube
 * per front instead of one per joint.
 */
export function computeProgressSpans(joints: Joint[], routeLengthMeters: number): ProgressSpan[] {
  if (joints.length === 0) return [{ startMeters: 0, endMeters: routeLengthMeters, color: FINAL_STATUS_COLOR.not_started }]

  const sorted = [...joints].sort((a, b) => a.chainageMeters - b.chainageMeters)
  const spans: ProgressSpan[] = []
  let spanStart = 0
  let spanColor = FINAL_STATUS_COLOR[sorted[0].finalStatus]

  for (const joint of sorted) {
    const color = FINAL_STATUS_COLOR[joint.finalStatus]
    if (color !== spanColor) {
      spans.push({ startMeters: spanStart, endMeters: joint.chainageMeters, color: spanColor })
      spanStart = joint.chainageMeters
      spanColor = color
    }
  }
  spans.push({ startMeters: spanStart, endMeters: routeLengthMeters, color: spanColor })
  return spans
}

/**
 * Flattens possibly overlapping layer spans into contiguous, non-overlapping ones over [0, length]: where spans overlap
 * the later one in the list wins (so a station drawn after the stretch it sits in stays visible), uncovered stretches get
 * `gapColor` (or stay undrawn when it is null), and touching pieces of one colour merge. Overlapping tubes would z-fight.
 */
export function paintSpans(spans: ProgressSpan[], lengthMeters: number, gapColor: string | null): ProgressSpan[] {
  const clip = (m: number) => Math.min(Math.max(m, 0), lengthMeters)
  const cuts = [...new Set([0, lengthMeters, ...spans.flatMap((s) => [clip(s.startMeters), clip(s.endMeters)])])].sort((a, b) => a - b)
  const out: ProgressSpan[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]
    if (b - a <= 0) continue
    const mid = (a + b) / 2
    let color = gapColor
    for (const s of spans) if (s.startMeters <= mid && mid < s.endMeters) color = s.color
    if (color == null) continue
    const last = out.at(-1)
    if (last && last.color === color && last.endMeters === a) last.endMeters = b
    else out.push({ startMeters: a, endMeters: b, color })
  }
  return out
}
