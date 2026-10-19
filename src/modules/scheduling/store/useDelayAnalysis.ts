import { useEffect, useMemo } from 'react'
import { classifyEvent, measureImpact, reconcile, type Classified } from '../lib/delay'
import { useDelayStore } from './useDelayStore'
import type { LiveModel } from './useScheduleModel'

/** The delay register measured and classified against the live network, and reconciled with the contract — shared by the delay page and the dashboard alerts. */
export function useDelayAnalysis(projectId: string, m: LiveModel) {
  const ds = useDelayStore()
  useEffect(() => { if (ds.projectId !== projectId) void ds.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const sched = useMemo(() => ({ activities: m.cur!.activities, relations: m.cur!.relations, calendar: m.calendar, calendars: m.calendars, mode: 'forecast' as const, dataDate: m.dataDate, progressMode: m.progressMode }), [m.cur, m.calendar, m.calendars, m.dataDate, m.progressMode])
  const classified: Classified[] = useMemo(() => ds.events.map((e) => { const r = e.activityUids.length ? measureImpact(sched, e) : null; return classifyEvent(e, ds.contract, r ? r.impactDays : null) }), [ds.events, sched, ds.contract])
  const recon = useMemo(() => reconcile(ds.contract, m.forecast.projectFinish, classified), [ds.contract, m.forecast.projectFinish, classified])
  return { ds, sched, classified, recon }
}
