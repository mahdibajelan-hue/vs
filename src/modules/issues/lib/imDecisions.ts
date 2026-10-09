import type { ImTask } from '../types'
import { dayDiff } from './imModel'

export type DecisionStatus = 'draft' | 'pending' | 'decided' | 'deferred' | 'cancelled'
export interface ImDecisionOption { id: string; decisionId: string; title: string; pros: string; cons: string; costImpact: number | null; timeImpactDays: number | null; recommended: boolean }
export interface ImDecision {
  id: string; code: string; projectId: string; issueId: string | null; title: string; question: string; requestedBy: string | null; deciderId: string | null
  neededBy: string | null; status: DecisionStatus; chosenOption: string | null; rationale: string; decidedAt: string | null; createdAt: string
}

export const DECISION_STATUS_FA: Record<DecisionStatus, string> = { draft: 'پیش‌نویس', pending: 'منتظر تصمیم', decided: 'اتخاذ شد', deferred: 'به تعویق افتاد', cancelled: 'لغو شد' }

export type DecisionHealth = 'on_time' | 'due_soon' | 'overdue' | 'closed'
export function decisionHealth(d: Pick<ImDecision, 'status' | 'neededBy'>, today: string): DecisionHealth {
  if (d.status === 'decided' || d.status === 'cancelled') return 'closed'
  if (!d.neededBy) return 'on_time'
  const left = dayDiff(today, d.neededBy)
  return left < 0 ? 'overdue' : left <= 2 ? 'due_soon' : 'on_time'
}

/** Days a decision was (or still is) late: needed-by → decided date (or today while pending). 0 when on time. */
export function decisionLateDays(d: Pick<ImDecision, 'status' | 'neededBy' | 'decidedAt'>, today: string): number {
  if (!d.neededBy) return 0
  const end = d.status === 'decided' && d.decidedAt ? d.decidedAt.slice(0, 10) : today
  return Math.max(0, dayDiff(d.neededBy, end))
}

/** Measured cost of waiting: sum over the tasks that declared themselves blocked on this decision of the days they were blocked. */
export function delayImpact(decisionId: string, tasks: (Pick<ImTask, 'id' | 'status' | 'blockedSince'> & { blockedDecisionId?: string | null })[], today: string): { blockedTasks: number; taskDays: number } {
  const t = tasks.filter((x) => x.blockedDecisionId === decisionId && x.status === 'blocked' && x.blockedSince)
  return { blockedTasks: t.length, taskDays: t.reduce((s, x) => s + Math.max(0, dayDiff((x.blockedSince as string).slice(0, 10), today)), 0) }
}

/** Option comparison for the decision page: recommended first, then lowest time impact, then lowest cost. */
export function rankOptions(opts: ImDecisionOption[]): ImDecisionOption[] {
  const num = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v)
  return [...opts].sort((a, b) => Number(b.recommended) - Number(a.recommended) || num(a.timeImpactDays) - num(b.timeImpactDays) || num(a.costImpact) - num(b.costImpact))
}
