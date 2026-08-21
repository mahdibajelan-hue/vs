import type { Joint } from '../types'
import { jointStageStateAsOf } from './jointHistory'
import { deriveFinalStatus, jointProgressPercent } from './progressEngine'

export type TimelineGranularity = 'day' | 'week' | 'month'

export interface TimelinePoint {
  atIso: string
  overallPercent: number
  weldingPercent: number
  coatingPercent: number
  loweringPercent: number
  backfillPercent: number
}

const BUCKET_MS: Record<TimelineGranularity, number> = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 30 * 24 * 3600 * 1000,
}

/**
 * Samples real per-stage completion % at evenly spaced points between `fromIso` and `toIso` —
 * each point reconstructs every joint's stage state at that moment by replaying its own history
 * log (lib/jointHistory.ts), the same mechanism the Timeline scrub slider uses. There is no
 * separate stored snapshot, so this chart can never show progress that wasn't actually logged.
 */
export function computeTimelineSeries(joints: Joint[], fromIso: string, toIso: string, granularity: TimelineGranularity): TimelinePoint[] {
  const fromMs = new Date(fromIso).getTime()
  const toMs = new Date(toIso).getTime()
  if (joints.length === 0 || toMs <= fromMs) return []

  const step = BUCKET_MS[granularity]
  const points: TimelinePoint[] = []

  for (let t = fromMs; t <= toMs; t += step) {
    points.push(sampleAt(joints, new Date(t).toISOString()))
  }
  if (points.length === 0 || points[points.length - 1].atIso !== toIso) {
    points.push(sampleAt(joints, toIso))
  }
  return points
}

function sampleAt(joints: Joint[], atIso: string): TimelinePoint {
  let weldedSum = 0
  let coatedSum = 0
  let loweredSum = 0
  let backfilledSum = 0
  let overallSum = 0

  for (const j of joints) {
    const stage = jointStageStateAsOf(j, atIso)
    if (stage.weldingStatus === 'welded' || stage.weldingStatus === 'accepted' || stage.weldingStatus === 'repaired') weldedSum++
    if (stage.coatingStatus === 'completed') coatedSum++
    if (stage.loweringStatus === 'completed') loweredSum++
    if (stage.backfillStatus === 'completed') backfilledSum++
    overallSum += jointProgressPercent({ ...j, ...stage, finalStatus: deriveFinalStatus(stage) })
  }

  const n = joints.length
  return {
    atIso,
    weldingPercent: Math.round((weldedSum / n) * 100),
    coatingPercent: Math.round((coatedSum / n) * 100),
    loweringPercent: Math.round((loweredSum / n) * 100),
    backfillPercent: Math.round((backfilledSum / n) * 100),
    overallPercent: Math.round(overallSum / n),
  }
}
