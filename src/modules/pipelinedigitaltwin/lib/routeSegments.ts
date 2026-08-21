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
