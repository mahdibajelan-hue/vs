import { pickCalendar, calendarMap, computeSchedule, type ScheduleResult } from './schedule'
import { integrateActivity, supplyDelayImpact, type ActivityIntegration, type LinkSources } from './integration'
import { activitySlips, finishVariance, lookahead, overdueActivities, progressAt, type ActualPct } from './variance'
import type { SchActivity, SchCalendar, SchLink, SchRelation, SchVersion } from './types'

export interface VersionBundleLite { activities: SchActivity[]; relations: SchRelation[]; calendars: SchCalendar[] }
export interface ModelInput { projectId: string; today: string; currentV: SchVersion; baselineV?: SchVersion; cur: VersionBundleLite; base: VersionBundleLite | null; links: SchLink[]; sources: LinkSources }

/** Every derived figure of one project's schedule (pure; the hook only feeds it). Nothing derived is stored. */
export function buildLiveModel(i: ModelInput) {
  const { today, currentV, baselineV, cur, base, sources } = i
  const calendar = pickCalendar(cur.calendars)
  const calendars = calendarMap(cur.calendars)
  const dataDate = currentV.dataDate ?? today
  const plan = computeSchedule({ activities: cur.activities, relations: cur.relations, calendar, calendars, mode: 'plan' })
  const links = i.links.filter((l) => l.projectId === i.projectId)
  const idOfUid = new Map(cur.activities.map((a) => [a.uid, a.id])), codeOf = new Map(cur.activities.map((a) => [a.id, a.code]))
  const integration = new Map<string, ActivityIntegration>()
  const forecast: ScheduleResult = computeSchedule({ activities: cur.activities, relations: cur.relations, calendar, calendars, mode: 'forecast', dataDate })
  for (const uid of new Set(links.map((l) => l.activityUid))) {
    const id = idOfUid.get(uid); const fs = id ? forecast.byId.get(id)?.start ?? null : null
    integration.set(uid, integrateActivity(uid, links, sources, { today, forecastStart: fs }))
  }
  // late supply is tested against the logic: only what really moves the finish counts as a project delay
  const impact = supplyDelayImpact({ activities: cur.activities, relations: cur.relations, calendar, calendars, mode: 'forecast', dataDate }, integration, idOfUid, codeOf)
  const baselineActs = base?.activities ?? cur.activities
  const baselineSched = base ? computeSchedule({ activities: base.activities, relations: base.relations, calendar: pickCalendar(base.calendars), calendars: calendarMap(base.calendars), mode: 'plan' }) : plan
  // actual % per BASELINE activity: approved execution progress, reported (pending) and the figure in the file
  const curByUid = new Map(cur.activities.map((a) => [a.uid, a]))
  const actual = new Map<string, ActualPct>()
  for (const b of baselineActs) {
    const c = curByUid.get(b.uid) ?? (base ? undefined : b)
    if (!c) continue
    const ig = integration.get(c.uid)
    const file = c.actualFinish ? 100 : c.pctComplete
    actual.set(b.id, { approved: ig?.execApproved ?? null, reported: ig?.execReported ?? null, file: file ?? null })
  }
  const progress = progressAt(baselineActs, dataDate, calendar, actual)
  const finish = finishVariance(baselineSched, forecast)
  const overdue = overdueActivities(cur.activities, dataDate, new Set(forecast.criticalPath))
  const slips = activitySlips(baselineActs, cur.activities, forecast)
  const look = lookahead(cur.activities, forecast, dataDate, 3)
  const blocked = [...integration.values()].filter((x) => x.readiness === 'blocked').length
  return { today, baselineV, currentV, base, cur, calendar, calendars, dataDate, plan, forecast, baselineSched, links, integration, impact, progress, finish, overdue, slips, look, blocked, idOfUid, codeOf, sources }
}
