import type { Joint, Route } from '../types'

/** Standard line-pipe stock length used elsewhere in RASTA (PipePulse's Schedule module) — kept consistent across modules. */
export const DEFAULT_STOCK_LENGTH_M = 12

/**
 * Places one joint at every stock-length interval along the route — this is a geometric fact
 * (where a girth weld physically has to be, given standard pipe joint lengths), not a claim about
 * construction progress: every generated joint starts at `not_started` on every stage, which is
 * honestly "nothing tracked yet" rather than a fabricated status. Real per-joint status only ever
 * comes from a user editing a joint via the detail panel (Phase 7/8), or — for the demo project
 * only — from demoData.ts's clearly-labeled synthetic overrides.
 */
export function generateJointsForRoute(route: Route, stockLengthMeters: number = DEFAULT_STOCK_LENGTH_M): Joint[] {
  const joints: Joint[] = []
  const count = Math.max(0, Math.floor(route.lengthMeters / stockLengthMeters))
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(3, '0')
    joints.push({
      id: `joint-${n}`,
      jointNumber: `J-${n}`,
      chainageMeters: i * stockLengthMeters,
      weldingStatus: 'not_started',
      ndtStatus: 'pending',
      coatingStatus: 'pending',
      loweringStatus: 'pending',
      backfillStatus: 'pending',
      finalStatus: 'not_started',
      welders: [],
      notes: '',
      history: [],
    })
  }
  return joints
}
