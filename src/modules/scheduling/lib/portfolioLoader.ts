import { supabase } from '../../../lib/supabaseClient'
import { ACT_COLS, BASE_COLS, fetchAllRows, mapAct, mapCal, mapCost, mapRel, mapVersion } from '../store/useSchedulingStore'
import { calendarMap, pickCalendar } from './schedule'
import { NO_COST_PARAMS, type CostParams, type DurationRisk, type McInput, type RiskEvent } from './monteCarlo'
import type { PortfolioDriver } from './portfolio'
import type { SchVersion } from './types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PortfolioSource { projectId: string; version: SchVersion; input: McInput; costParams: CostParams; activities: number }

/** Projects (of those the user can see) that have a schedule: the current version, or the newest approved one, with its risk inputs. Supply readiness is not applied here. */
export async function listSchedulingProjects(): Promise<string[]> {
  const { data } = await supabase.from('sch_versions').select('project_id').eq('status', 'approved')
  return [...new Set(((data ?? []) as Row[]).map((r) => r.project_id as string))]
}

export async function loadPortfolioSource(projectId: string): Promise<PortfolioSource | null> {
  const vq = await supabase.from('sch_versions').select(BASE_COLS).eq('project_id', projectId).eq('status', 'approved').order('created_at', { ascending: false })
  const versions = ((vq.data ?? []) as Row[]).map(mapVersion)
  const v = versions.find((x) => x.isCurrent) ?? versions[0]
  if (!v) return null
  const [a, r, c, d, e, cp] = await Promise.all([
    fetchAllRows('sch_activities', ACT_COLS, v.id), fetchAllRows('sch_relations', 'id, version_id, pred_id, succ_id, rel_type, lag_days', v.id),
    supabase.from('sch_calendars').select('*').eq('version_id', v.id),
    supabase.from('sch_duration_risk').select('*').eq('project_id', projectId), supabase.from('sch_risk_events').select('*').eq('project_id', projectId),
    supabase.from('sch_cost_params').select('*').eq('project_id', projectId).maybeSingle(),
  ])
  const acts = a.map(mapAct).sort((x, y) => x.sort - y.sort), cals = ((c.data ?? []) as Row[]).map(mapCal)
  const durationRisks = ((d.data ?? []) as Row[]).map((x): DurationRisk => ({ uid: x.activity_uid, min: Number(x.min_dur), likely: Number(x.likely_dur), max: Number(x.max_dur) }))
  const events = ((e.data ?? []) as Row[]).map((x): RiskEvent => ({ id: x.id, title: x.title, probability: Number(x.probability), days: { min: Number(x.days_min), likely: Number(x.days_likely), max: Number(x.days_max) }, cost: { min: Number(x.cost_min), likely: Number(x.cost_likely), max: Number(x.cost_max) }, activityUids: x.activity_uids ?? [], active: !!x.active }))
  const costParams = cp.data ? mapCost(cp.data as Row) : NO_COST_PARAMS
  const today = new Date().toISOString().slice(0, 10)
  return {
    projectId, version: v, activities: acts.length, costParams,
    input: { schedule: { activities: acts, relations: r.map(mapRel), calendar: pickCalendar(cals), calendars: calendarMap(cals), mode: 'forecast', dataDate: v.dataDate ?? today }, durationRisks, events, costParams },
  }
}

const mapDriver = (x: Row): PortfolioDriver => ({ id: x.id, title: x.title, probability: Number(x.probability), days: { min: Number(x.days_min), likely: Number(x.days_likely), max: Number(x.days_max) }, cost: { min: Number(x.cost_min), likely: Number(x.cost_likely), max: Number(x.cost_max) }, projectIds: x.project_ids ?? [], active: !!x.active })
export async function listDrivers(): Promise<PortfolioDriver[]> {
  const { data } = await supabase.from('sch_portfolio_drivers').select('*').order('created_at')
  return ((data ?? []) as Row[]).map(mapDriver)
}
export async function saveDriver(d: Omit<PortfolioDriver, 'id'> & { id?: string }): Promise<string | null> {
  const row = { title: d.title, probability: d.probability, days_min: d.days.min, days_likely: d.days.likely, days_max: d.days.max, cost_min: d.cost.min, cost_likely: d.cost.likely, cost_max: d.cost.max, project_ids: d.projectIds, active: d.active }
  const r = d.id ? await supabase.from('sch_portfolio_drivers').update(row).eq('id', d.id) : await supabase.from('sch_portfolio_drivers').insert(row)
  return r.error ? r.error.message : null
}
export async function removeDriver(id: string): Promise<string | null> { const { error } = await supabase.from('sch_portfolio_drivers').delete().eq('id', id); return error ? error.message : null }
