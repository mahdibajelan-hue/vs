import type { Joint, JointStatusField, Pipe, Route } from '../types'
import { computeRouteLength } from './chainage'
import { generateJointsForRoute } from './jointGeneration'
import { deriveFinalStatus } from './progressEngine'

/**
 * A synthetic, clearly-fictional ~50km route (gentle meander, mild elevation change) for the demo
 * project — the spec explicitly requires the demo to carry no real project's real data. Coordinates
 * are an arbitrary generated squiggle, not traced from any real pipeline.
 */
export function generateDemoRoute(): Route {
  const segments = 60
  const points: Route['points'] = []
  let lon = 52.0
  let lat = 32.0
  let heading = 0.4
  for (let i = 0; i <= segments; i++) {
    heading += Math.sin(i * 0.35) * 0.12
    const stepDeg = 0.0075
    lon += Math.cos(heading) * stepDeg
    lat += Math.sin(heading) * stepDeg * 0.75
    const elevation = 1250 + Math.sin(i * 0.22) * 90 + i * 1.1
    points.push({ lon, lat, elevation })
  }
  return {
    points,
    hasElevationData: true,
    lengthMeters: computeRouteLength(points),
    source: 'demo',
    fileName: null,
  }
}

export const DEMO_PIPE: Pipe = {
  id: 'demo-pipe-1',
  diameterInch: 30,
  wallThicknessMm: 9.5,
  material: 'API 5L X60',
}

/** The demo project's fictional "project start" — 45 days before this module was loaded, purely so Timeline scrubbing has a real (if synthetic) date range to move across. */
export const DEMO_PROJECT_CREATED_AT = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString()

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
}

function setStage<F extends JointStatusField>(joint: Joint, field: F, value: Joint[F], atIso: string) {
  const fromValue = String(joint[field])
  joint[field] = value
  joint.history.push({ id: `${joint.id}-${field}-${atIso}`, at: atIso, field, fromValue, toValue: String(value) })
}

/**
 * Overlays a realistic-looking (but explicitly synthetic — this is the 'demo' route, never a real
 * project's data) construction-progress pattern onto freshly generated not-started joints: a
 * completed front from the start, a small open-NCR cluster, a partially-worked front, then
 * untouched joints — the shape real pipeline construction actually takes, not random noise.
 */
export function generateDemoJoints(route: Route): Joint[] {
  const joints = generateJointsForRoute(route)
  const n = joints.length
  if (n === 0) return joints

  const completedEnd = Math.floor(n * 0.55)
  const ncrEnd = completedEnd + Math.max(2, Math.floor(n * 0.03))
  const inProgressEnd = ncrEnd + Math.floor(n * 0.2)

  for (let i = 0; i < n; i++) {
    const joint = joints[i]
    // Earlier joints (closer to the start of construction) were worked earlier — spread their
    // completion dates across the project's 45-day fictional history, oldest first.
    const daysAgo = 40 - Math.floor((i / Math.max(1, completedEnd)) * 35)

    if (i < completedEnd) {
      setStage(joint, 'weldingStatus', 'accepted', daysAgoIso(daysAgo + 6))
      setStage(joint, 'ndtStatus', 'passed', daysAgoIso(daysAgo + 4))
      setStage(joint, 'coatingStatus', 'completed', daysAgoIso(daysAgo + 3))
      setStage(joint, 'loweringStatus', 'completed', daysAgoIso(daysAgo + 2))
      setStage(joint, 'backfillStatus', 'completed', daysAgoIso(daysAgo + 1))
    } else if (i < ncrEnd) {
      setStage(joint, 'weldingStatus', 'welded', daysAgoIso(9))
      setStage(joint, 'ndtStatus', 'failed', daysAgoIso(7))
      joint.notes = 'رادیوگرافی مردود — نیاز به تعمیر و تست مجدد'
    } else if (i < inProgressEnd) {
      const stageRoll = (i - ncrEnd) % 4
      setStage(joint, 'weldingStatus', 'welded', daysAgoIso(5))
      if (stageRoll >= 1) setStage(joint, 'ndtStatus', 'passed', daysAgoIso(4))
      if (stageRoll >= 2) setStage(joint, 'coatingStatus', 'completed', daysAgoIso(3))
      if (stageRoll >= 3) setStage(joint, 'loweringStatus', 'completed', daysAgoIso(1))
    }
    // remaining joints stay at their generated not_started defaults

    joint.finalStatus = deriveFinalStatus(joint)
  }

  return joints
}
