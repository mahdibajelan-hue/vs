import type { Joint, JointStatusField } from '../types'

type StageState = Pick<Joint, 'weldingStatus' | 'ndtStatus' | 'coatingStatus' | 'loweringStatus' | 'backfillStatus'>

const DEFAULT_STAGE_STATE: StageState = {
  weldingStatus: 'not_started',
  ndtStatus: 'pending',
  coatingStatus: 'pending',
  loweringStatus: 'pending',
  backfillStatus: 'pending',
}

const STAGE_FIELDS: readonly JointStatusField[] = ['weldingStatus', 'ndtStatus', 'coatingStatus', 'loweringStatus', 'backfillStatus']

/**
 * Reconstructs a joint's five construction-stage fields as they stood at `asOfIso`, by replaying
 * its own append-only history log up to that moment — never a separately stored snapshot, so a
 * historical view can never drift from the live edit trail. Used for Timeline scrubbing.
 */
export function jointStageStateAsOf(joint: Joint, asOfIso: string): StageState {
  const state: StageState = { ...DEFAULT_STAGE_STATE }
  for (const entry of joint.history) {
    if (entry.at > asOfIso) continue
    switch (entry.field) {
      case 'weldingStatus':
        state.weldingStatus = entry.toValue as Joint['weldingStatus']
        break
      case 'ndtStatus':
        state.ndtStatus = entry.toValue as Joint['ndtStatus']
        break
      case 'coatingStatus':
        state.coatingStatus = entry.toValue as Joint['coatingStatus']
        break
      case 'loweringStatus':
        state.loweringStatus = entry.toValue as Joint['loweringStatus']
        break
      case 'backfillStatus':
        state.backfillStatus = entry.toValue as Joint['backfillStatus']
        break
    }
  }
  return state
}

/** True only once at least one joint has a logged status change before `asOfIso` — used to disable an empty/meaningless scrub view. */
export function hasHistoryBefore(joints: Joint[], asOfIso: string): boolean {
  return joints.some((j) => j.history.some((h) => h.at <= asOfIso && (STAGE_FIELDS as string[]).includes(h.field)))
}
