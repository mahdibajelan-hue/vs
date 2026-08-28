import type { ApprovalTier, ChangeRequest } from '../types'

export const EXECUTOR_CEILING_PCT = 10
export const CEO_CEILING_PCT = 25

/**
 * The tier that gates approval of one change: based not on the change's own size alone, but on
 * the *cumulative* percent of contract value the project would sit at if this change were
 * approved on top of everything already approved — matching the spec's "up to 10% با مجوز مجری،
 * تا ۲۵٪ با مجوز مدیرعامل، سقف ۲۵٪" as a running ceiling, not a per-change one.
 */
export function computeApprovalTier(cumulativePercentIfApproved: number): ApprovalTier {
  if (cumulativePercentIfApproved <= EXECUTOR_CEILING_PCT) return 'executor'
  if (cumulativePercentIfApproved <= CEO_CEILING_PCT) return 'ceo'
  return 'over_ceiling'
}

/** Sum of cost_impact_amount across every change already approved for this project — the
 * baseline a new change's cumulative percent is measured against. */
export function priorApprovedTotal(requests: ChangeRequest[], excludeId?: string): number {
  return requests
    .filter((r) => r.status === 'approved' && r.id !== excludeId)
    .reduce((sum, r) => sum + r.costImpactAmount, 0)
}

export function percentOfContract(amount: number, contractValue: number): number {
  return contractValue > 0 ? (amount / contractValue) * 100 : 0
}

export interface ChangeTierPreview {
  ownPercent: number
  cumulativeApprovedPercent: number
  cumulativeIfApprovedPercent: number
  tier: ApprovalTier
}

/** Everything a review/decision screen needs to show and gate on for one change request. */
export function previewTier(request: ChangeRequest, allRequests: ChangeRequest[], contractValue: number): ChangeTierPreview {
  const priorTotal = priorApprovedTotal(allRequests, request.id)
  const ownPercent = percentOfContract(request.costImpactAmount, contractValue)
  const cumulativeApprovedPercent = percentOfContract(priorTotal, contractValue)
  const cumulativeIfApprovedPercent = percentOfContract(priorTotal + request.costImpactAmount, contractValue)
  return {
    ownPercent,
    cumulativeApprovedPercent,
    cumulativeIfApprovedPercent,
    tier: computeApprovalTier(cumulativeIfApprovedPercent),
  }
}
