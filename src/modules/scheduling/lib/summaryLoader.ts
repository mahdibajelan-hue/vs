import { supabase } from '../../../lib/supabaseClient'
import { mapContract, mapEvent } from '../store/useDelayStore'
import { ACT_COLS, BASE_COLS, fetchAllRows, mapAct, mapCal, mapRel, mapVersion } from '../store/useSchedulingStore'
import { calendarMap, pickCalendar } from './schedule'
import { summarize, type ScheduleSummary } from './summary'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Compact schedule status of one project for the Radar and the executive view: the current (or newest approved) version, forecast from its own data date,
 * measured against the baseline and the contract. Execution actuals are not applied here (the module's «live status» switch does that inside the module).
 */
export async function loadScheduleSummary(projectId: string): Promise<ScheduleSummary | null> {
  const vq = await supabase.from('sch_versions').select(BASE_COLS).eq('project_id', projectId).neq('status', 'draft').order('created_at', { ascending: false })
  const versions = ((vq.data ?? []) as Row[]).map(mapVersion)
  const v = versions.find((x) => x.isCurrent) ?? versions[0]
  if (!v) return null
  const baseline = versions.find((x) => x.isBaseline)
  const [a, r, c, ct, ev] = await Promise.all([
    fetchAllRows('sch_activities', ACT_COLS, v.id), fetchAllRows('sch_relations', 'id, version_id, pred_id, succ_id, rel_type, lag_days', v.id),
    supabase.from('sch_calendars').select('*').eq('version_id', v.id),
    supabase.from('sch_contract').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('sch_delay_events').select('*').eq('project_id', projectId),
  ])
  const acts = a.map(mapAct).sort((x, y) => x.sort - y.sort), cals = ((c.data ?? []) as Row[]).map(mapCal)
  const today = new Date().toISOString().slice(0, 10)
  return summarize({
    sched: { activities: acts, relations: r.map(mapRel), calendar: pickCalendar(cals), calendars: calendarMap(cals), mode: 'forecast', dataDate: v.dataDate ?? today },
    activities: acts, baselineFinish: baseline?.projectFinish ?? null, contract: ct.data ? mapContract(ct.data as Row) : null, events: ((ev.data ?? []) as Row[]).map(mapEvent), today,
  })
}

/** every project of the user with an approved schedule, with its summary (a few light parallel loads) */
export async function loadAllScheduleSummaries(projectIds: string[]): Promise<Map<string, ScheduleSummary>> {
  const out = new Map<string, ScheduleSummary>()
  await Promise.all(projectIds.map(async (id) => { try { const s = await loadScheduleSummary(id); if (s) out.set(id, s) } catch { /* one project failing must not hide the others */ } }))
  return out
}
