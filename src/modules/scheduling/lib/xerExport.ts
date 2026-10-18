import type { CalendarDef } from './calendar'
import type { SchActivity, SchCalendar, SchRelation } from './types'

/** Primavera P6 XER export of one schedule version (activities, WBS, calendars, relations, constraints, actuals). Resources, costs and codes are not written. */
const CSTR: Record<string, string> = { SNET: 'CS_MSOA', SNLT: 'CS_MSOB', FNET: 'CS_MEOA', FNLT: 'CS_MEOB', MSO: 'CS_MANDSTART', MFO: 'CS_MANDFIN', ALAP: 'CS_ALAP' }
const serial = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000)
const dt = (d: string | null, t = '08:00') => (d ? `${d} ${t}` : '')
const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ')

function calendarData(c: CalendarDef): string {
  const p6 = (d: number) => (d === 0 ? 7 : d) // Saturday 0 → 7
  const days = [1, 2, 3, 4, 5, 6, 7].map((n) => { const ours = n === 7 ? 0 : n; return c.workDays.includes(ours) ? `(0||${n}()((0||0(s|08:00)(f|16:00)())))` : `(0||${n}()())` })
  void p6
  const ex = c.holidays.map((h) => `(0||0(d|${serial(h)})())`).join('')
  return `(0||CalendarData()((0||DaysOfWeek()(${days.join('')}))(0||Exceptions()(${ex}))))`
}

export function exportXer(o: { projectName: string; dataDate: string | null; activities: SchActivity[]; relations: SchRelation[]; calendars: SchCalendar[] }): string {
  const L: string[] = ['ERMHDR\t19.12\t2026-01-01\tProject\tFARIN\tfarin\tdbxDatabaseNoName\tProject Management\tUSD']
  const table = (name: string, fields: string[], rows: (string | number)[][]) => { L.push(`%T\t${name}`, `%F\t${fields.join('\t')}`); for (const r of rows) L.push(`%R\t${r.map((x) => clean(String(x))).join('\t')}`); L.push('%E') }
  const defCal = o.calendars.find((c) => c.isDefault) ?? o.calendars[0]
  const dates = o.activities.flatMap((a) => [a.plannedStart]).filter((x): x is string => !!x).sort()
  table('PROJECT', ['proj_id', 'proj_short_name', 'clndr_id', 'last_recalc_date', 'plan_start_date'], [[1, o.projectName || 'PROJECT', defCal?.id ?? '', dt(o.dataDate, '00:00'), dt(dates[0] ?? null)]])
  table('CALENDAR', ['clndr_id', 'clndr_name', 'day_hr_cnt', 'clndr_data'], o.calendars.map((c) => [c.id, c.name || c.code, c.hoursPerDay, calendarData({ workDays: c.workDays, holidays: c.holidays, hoursPerDay: c.hoursPerDay })]))
  const wbsIds = new Map<string, number>(), wbsRows: (string | number)[][] = []
  const wbsOf = (path: string): number => {
    const parts = path.split(/\s*[>/]\s*/).filter(Boolean); let parent = 0, key = ''
    for (const p of parts) { key += '/' + p; if (!wbsIds.has(key)) { const id = wbsIds.size + 1; wbsIds.set(key, id); wbsRows.push([id, 1, parent || '', p, p]) } parent = wbsIds.get(key)! }
    return parent || (wbsIds.get('/') ?? (() => { wbsIds.set('/', wbsIds.size + 1); const id = wbsIds.get('/')!; wbsRows.push([id, 1, '', 'WBS', 'WBS']); return id })())
  }
  const tasks = o.activities.filter((a) => a.type === 'task' || a.type === 'milestone')
  const wbsOfAct = new Map(tasks.map((a) => [a.id, wbsOf(a.wbsPath)]))
  table('PROJWBS', ['wbs_id', 'proj_id', 'parent_wbs_id', 'wbs_short_name', 'wbs_name'], wbsRows)
  const hpd = (id: string | null) => o.calendars.find((c) => c.id === id)?.hoursPerDay ?? defCal?.hoursPerDay ?? 8
  const idOf = new Map(tasks.map((a, i) => [a.id, i + 1]))
  table('TASK', ['task_id', 'proj_id', 'wbs_id', 'clndr_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt', 'remain_drtn_hr_cnt', 'target_start_date', 'target_end_date', 'act_start_date', 'act_end_date', 'complete_pct_type', 'phys_complete_pct', 'cstr_type', 'cstr_date'],
    tasks.map((a) => [idOf.get(a.id)!, 1, wbsOfAct.get(a.id)!, a.calendarId ?? defCal?.id ?? '', a.code, a.name, a.type === 'milestone' ? 'TT_Mile' : 'TT_Task', a.type === 'milestone' ? 0 : a.origDuration * hpd(a.calendarId), a.remDuration == null ? '' : a.remDuration * hpd(a.calendarId), dt(a.plannedStart), dt(a.plannedFinish, '16:00'), dt(a.actualStart), dt(a.actualFinish, '16:00'), 'CP_Phys', a.actualFinish ? 100 : a.pctComplete ?? '', CSTR[a.constraintType] ?? '', a.constraintDate && CSTR[a.constraintType] ? dt(a.constraintDate) : '']))
  const byId = new Map(tasks.map((a) => [a.id, a]))
  const PT: Record<string, string> = { FS: 'PR_FS', SS: 'PR_SS', FF: 'PR_FF', SF: 'PR_SF' }
  table('TASKPRED', ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt'],
    o.relations.filter((r) => idOf.has(r.predId) && idOf.has(r.succId)).map((r, i) => [i + 1, idOf.get(r.succId)!, idOf.get(r.predId)!, 1, 1, PT[r.type], r.lag * hpd(byId.get(r.succId)?.calendarId ?? null)]))
  return L.join('\r\n') + '\r\n'
}
