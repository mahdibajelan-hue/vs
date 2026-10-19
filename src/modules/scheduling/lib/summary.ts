import { daysBetween } from '../../execution/lib/periods'
import { classifyEvent, measureImpact, reconcile, noticeState, type Contract, type DelayEvent } from './delay'
import { computeSchedule, type ScheduleInput } from './schedule'
import { overdueActivities } from './variance'
import type { SchActivity } from './types'

/** A compact status of one project's schedule for places outside the module (Radar, executive view): forecast against baseline and contract, overdue critical work, delay-notice trouble. */
export interface ScheduleSummary {
  forecastFinish: string | null; baselineFinish: string | null; baselineSlip: number | null
  contractFinish: string | null; revisedFinish: string | null; contractorDelay: number | null; ldAmount: number
  criticalOverdue: number; overdue: number; noticesLost: number; pendingEvents: number; activities: number
  dataDate: string
}

export function summarize(o: { sched: ScheduleInput; activities: SchActivity[]; baselineFinish: string | null; contract: Contract | null; events: DelayEvent[]; today: string }): ScheduleSummary {
  const fc = computeSchedule(o.sched)
  const dataDate = o.sched.dataDate ?? o.today
  const od = overdueActivities(o.activities, dataDate, new Set(fc.criticalPath))
  const c = o.contract
  const classified = c ? o.events.map((e) => { const r = e.activityUids.length ? measureImpact(o.sched, e) : null; return classifyEvent(e, c, r ? r.impactDays : null) }) : []
  const rec = c ? reconcile(c, fc.projectFinish, classified) : null
  return {
    forecastFinish: fc.projectFinish, baselineFinish: o.baselineFinish, baselineSlip: fc.projectFinish && o.baselineFinish ? daysBetween(o.baselineFinish, fc.projectFinish) : null,
    contractFinish: c?.contractFinish ?? null, revisedFinish: rec?.revisedFinish ?? null, contractorDelay: rec?.contractorDelay ?? null, ldAmount: rec?.ldAmount ?? 0,
    criticalOverdue: od.filter((x) => x.critical).length, overdue: od.length, noticesLost: classified.filter((x) => noticeState(x, o.today).state === 'lost').length,
    pendingEvents: classified.filter((x) => x.cls === 'pending').length, activities: o.activities.filter((a) => a.type === 'task').length, dataDate,
  }
}
