import type { ChangeRequest, ImpactLevel } from '../types'

export const HIGH_FINANCIAL_IMPACT_PCT = 5
export const HIGH_SCHEDULE_IMPACT_PCT = 5

/** Change % = Change Amount / Original Contract Amount × 100 (spec §4/§15). */
export function contractChangePercent(request: Pick<ChangeRequest, 'proposedChangeAmount' | 'originalContractAmount'>): number {
  return request.originalContractAmount > 0 ? (request.proposedChangeAmount / request.originalContractAmount) * 100 : 0
}

/** New Contract Amount = Original + Approved Change (falls back to the proposed amount before
 * a decision exists, so the preview always has a number to show). */
export function newContractAmount(request: Pick<ChangeRequest, 'originalContractAmount' | 'proposedChangeAmount' | 'approvedChangeAmount'>): number {
  const change = request.approvedChangeAmount ?? request.proposedChangeAmount
  return request.originalContractAmount + change
}

/** Schedule Change % = Schedule Impact Days / Original Project Duration × 100 (spec §7/§15). */
export function scheduleChangePercent(request: Pick<ChangeRequest, 'proposedScheduleImpactDays' | 'originalDurationDays'>): number {
  return request.originalDurationDays > 0 ? (request.proposedScheduleImpactDays / request.originalDurationDays) * 100 : 0
}

/** New Project Duration = Original + Approved Schedule Impact. */
export function newProjectDuration(request: Pick<ChangeRequest, 'originalDurationDays' | 'proposedScheduleImpactDays' | 'approvedScheduleImpactDays'>): number {
  const impact = request.approvedScheduleImpactDays ?? request.proposedScheduleImpactDays
  return request.originalDurationDays + impact
}

export interface ChangeImpactSummary {
  costPercent: number
  schedulePercent: number
  riskLevel: ImpactLevel
  scopeLevel: ImpactLevel
  overallSeverity: ImpactLevel
  highFinancialImpact: boolean
  highScheduleImpact: boolean
  isCritical: boolean
  ccbReviewRequired: boolean
}

const IMPACT_RANK: Record<ImpactLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/** Risk severity from a simple new-risks count — informational until real Risk-module
 * linkage exists (see module scoping notes): 0 -> low, 1-2 -> medium, 3+ -> high. */
function riskLevelFromCount(count: number): ImpactLevel {
  if (count >= 3) return 'high'
  if (count >= 1) return 'medium'
  return 'low'
}

/** Smart validation (spec §16): flags unusually large changes and recommends CCB review
 * whenever either dimension crosses the threshold, or escalates to CRITICAL when both do. */
export function computeChangeImpact(request: ChangeRequest): ChangeImpactSummary {
  const costPercent = Math.abs(contractChangePercent(request))
  const schedulePercent = Math.abs(scheduleChangePercent(request))
  const highFinancialImpact = costPercent > HIGH_FINANCIAL_IMPACT_PCT
  const highScheduleImpact = schedulePercent > HIGH_SCHEDULE_IMPACT_PCT
  const isCritical = highFinancialImpact && highScheduleImpact
  const riskLevel = riskLevelFromCount(request.newRisksCount)

  let overallSeverity: ImpactLevel = 'low'
  if (isCritical) overallSeverity = 'critical'
  else if (highFinancialImpact || highScheduleImpact) overallSeverity = 'high'
  else if (costPercent > 2 || schedulePercent > 2) overallSeverity = 'medium'
  overallSeverity = IMPACT_RANK[request.scopeImpactLevel] > IMPACT_RANK[overallSeverity] ? request.scopeImpactLevel : overallSeverity
  overallSeverity = IMPACT_RANK[riskLevel] > IMPACT_RANK[overallSeverity] ? riskLevel : overallSeverity

  return {
    costPercent,
    schedulePercent,
    riskLevel,
    scopeLevel: request.scopeImpactLevel,
    overallSeverity,
    highFinancialImpact,
    highScheduleImpact,
    isCritical,
    ccbReviewRequired: highFinancialImpact || highScheduleImpact,
  }
}
