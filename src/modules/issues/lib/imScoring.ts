import type { ImIssuePriority } from '../types'
import { priorityRank, rankToPriority } from './imModel'

export type ImpactLevel = 0 | 1 | 2 | 3 | 4
export interface ImpactInput { time: ImpactLevel; cost: ImpactLevel; quality: ImpactLevel; safety: ImpactLevel; contract: ImpactLevel; objectives: ImpactLevel }

export const IMPACT_LABEL_FA: Record<keyof ImpactInput, string> = { time: 'زمان', cost: 'هزینه', quality: 'کیفیت', safety: 'ایمنی', contract: 'قرارداد', objectives: 'اهداف پروژه' }

/** Severity = worst impact dimension, bumped one level when ≥3 dimensions are impacted at level ≥2. Explainable. */
export function suggestSeverity(imp: ImpactInput): { severity: ImIssuePriority; reasons: string[] } {
  const dims = (Object.keys(imp) as (keyof ImpactInput)[]).map((k) => ({ k, v: imp[k] }))
  const max = Math.max(0, ...dims.map((d) => d.v))
  const heavy = dims.filter((d) => d.v >= 2)
  let rank = max === 0 ? 1 : max
  const reasons: string[] = []
  const top = dims.filter((d) => d.v === max && max > 0)
  if (top.length) reasons.push(`بیشترین اثر: ${top.map((d) => IMPACT_LABEL_FA[d.k]).join('، ')}`)
  if (imp.safety >= 3) { rank = 4; reasons.push('اثر ایمنی بالا → حداقل بحرانی') }
  if (heavy.length >= 3 && rank < 4) { rank += 1; reasons.push(`${heavy.length} بُعد با اثر متوسط یا بیشتر → یک سطح افزایش`) }
  return { severity: rankToPriority(rank), reasons }
}

/** Priority = f(severity, urgency); urgency derived from days to the next dependent milestone when known. */
export function derivePriority(severity: ImIssuePriority, urgency: ImIssuePriority): ImIssuePriority {
  return rankToPriority(Math.round(priorityRank(severity) * 0.6 + priorityRank(urgency) * 0.4))
}

export function urgencyFromDays(daysToImpact: number | null): ImIssuePriority {
  if (daysToImpact === null) return 'medium'
  return daysToImpact <= 2 ? 'critical' : daysToImpact <= 7 ? 'high' : daysToImpact <= 21 ? 'medium' : 'low'
}

/** Escalation ladder: which level an overdue / blocked item has reached, driving notification recipients. */
export function escalationLevel(input: { daysOverdue: number; severity: ImIssuePriority; blockedDays: number }): 0 | 1 | 2 | 3 {
  const mult = priorityRank(input.severity) >= 3 ? 0.5 : 1
  const d = Math.max(input.daysOverdue, input.blockedDays)
  if (d <= 0) return 0
  if (d <= 2 * mult + 1) return 1
  if (d <= 7 * mult + 1) return 2
  return 3
}
