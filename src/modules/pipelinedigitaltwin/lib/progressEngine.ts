import type { Joint, JointFinalStatus } from '../types'

export const FINAL_STATUS_COLOR: Record<JointFinalStatus, string> = {
  not_started: '#6b7280',
  in_progress: '#f59e0b',
  ncr: '#e74c3c',
  completed: '#2ecc71',
}

export const FINAL_STATUS_LABEL_FA: Record<JointFinalStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال اجرا',
  ncr: 'دارای مغایرت (NCR)',
  completed: 'تکمیل شده',
}

/**
 * finalStatus is always computed from the five stage fields, never set directly — a single
 * function is the one place that state machine lives, so the joint panel, the 3D coloring, and
 * the progress engine can never disagree about what "completed" or "ncr" means.
 */
export function deriveFinalStatus(joint: Pick<Joint, 'weldingStatus' | 'ndtStatus' | 'coatingStatus' | 'loweringStatus' | 'backfillStatus'>): JointFinalStatus {
  if (joint.ndtStatus === 'failed' || joint.ndtStatus === 'repair_required') return 'ncr'
  if (joint.backfillStatus === 'completed') return 'completed'
  const started =
    joint.weldingStatus !== 'not_started' ||
    joint.ndtStatus !== 'pending' ||
    joint.coatingStatus !== 'pending' ||
    joint.loweringStatus !== 'pending' ||
    joint.backfillStatus !== 'pending'
  return started ? 'in_progress' : 'not_started'
}

const STAGE_WEIGHTS = { welding: 30, ndt: 20, coating: 20, lowering: 15, backfill: 15 } as const

/** 0-100, weighted across the five construction stages. */
export function jointProgressPercent(joint: Joint): number {
  let p = 0
  if (joint.weldingStatus === 'welded' || joint.weldingStatus === 'accepted' || joint.weldingStatus === 'repaired') p += STAGE_WEIGHTS.welding
  if (joint.ndtStatus === 'passed') p += STAGE_WEIGHTS.ndt
  if (joint.coatingStatus === 'completed') p += STAGE_WEIGHTS.coating
  if (joint.loweringStatus === 'completed') p += STAGE_WEIGHTS.lowering
  if (joint.backfillStatus === 'completed') p += STAGE_WEIGHTS.backfill
  return p
}

export interface ProjectProgress {
  totalJoints: number
  weldedCount: number
  ndtPassedCount: number
  coatedCount: number
  loweredCount: number
  backfilledCount: number
  completedCount: number
  ncrOpenCount: number
  overallProgressPercent: number
}

export function computeProjectProgress(joints: Joint[]): ProjectProgress {
  const totalJoints = joints.length
  const weldedCount = joints.filter((j) => j.weldingStatus === 'welded' || j.weldingStatus === 'accepted' || j.weldingStatus === 'repaired').length
  const ndtPassedCount = joints.filter((j) => j.ndtStatus === 'passed').length
  const coatedCount = joints.filter((j) => j.coatingStatus === 'completed').length
  const loweredCount = joints.filter((j) => j.loweringStatus === 'completed').length
  const backfilledCount = joints.filter((j) => j.backfillStatus === 'completed').length
  const completedCount = joints.filter((j) => j.finalStatus === 'completed').length
  const ncrOpenCount = joints.filter((j) => j.finalStatus === 'ncr').length
  const overallProgressPercent = totalJoints === 0 ? 0 : Math.round(joints.reduce((sum, j) => sum + jointProgressPercent(j), 0) / totalJoints)

  return { totalJoints, weldedCount, ndtPassedCount, coatedCount, loweredCount, backfilledCount, completedCount, ncrOpenCount, overallProgressPercent }
}

/**
 * Color for the pipe segment between two consecutive joints — mirrors the existing PipePulse rule
 * ("a spool only lights up once BOTH its bounding joints are completed", src/lib/model3dColoring.ts):
 * green only when both ends are fully complete, red if either end has an open NCR, amber if either
 * end has started, gray otherwise.
 */
export function segmentColor(a: JointFinalStatus, b: JointFinalStatus): string {
  if (a === 'ncr' || b === 'ncr') return FINAL_STATUS_COLOR.ncr
  if (a === 'completed' && b === 'completed') return FINAL_STATUS_COLOR.completed
  if (a !== 'not_started' || b !== 'not_started') return FINAL_STATUS_COLOR.in_progress
  return FINAL_STATUS_COLOR.not_started
}
