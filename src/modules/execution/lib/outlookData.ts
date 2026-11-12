import type { ExecutionModel } from './useExecutionModel'
import { isRegistered, lineValue, type EmployerMode } from './progress'
import { WX_OF, worstGround, worstWx, type DayObs, type GroundState, type OutlookActivity } from './engine/outlook'

const GROUNDS = new Set(['dry', 'wet', 'mud', 'frozen', 'snow'])
const REVIEWED = new Set(['approved', 'partially_approved'])

/**
 * The forecast's inputs, read from the project's daily work reports: one observation per reported day (a day counts
 * only once the supervision has reviewed at least one of its work reports, so an unreviewed day is not mistaken for a
 * day without output), and every approved activity with its weight, base and approved cumulative quantity.
 */
export function outlookInputs(m: ExecutionModel): { days: DayObs[]; activities: OutlookActivity[] } {
  const employer: EmployerMode = (m.settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off'
  const work = m.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && r.reportDate <= m.today)
  const byDate = new Map<string, typeof work>()
  for (const r of work) { const l = byDate.get(r.reportDate); if (l) l.push(r); else byDate.set(r.reportDate, [r]) }
  const resByReport = new Map<string, { man: number; equip: number; any: boolean }>()
  for (const x of m.resources) {
    const t = resByReport.get(x.reportId) ?? { man: 0, equip: 0, any: false }
    if (x.kind === 'man') t.man += x.activeQty; else t.equip += x.activeQty
    t.any = true; resByReport.set(x.reportId, t)
  }
  const days: DayObs[] = []
  for (const [date, reps] of [...byDate].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!reps.some((r) => REVIEWED.has(r.status))) continue
    const out: Record<string, number> = {}
    let man = 0, equip = 0, anyRes = false
    let wx: DayObs['wx'] = null, ground: GroundState | null = null
    for (const r of reps) {
      for (const l of m.linesByReport.get(r.id) ?? []) {
        if (!l.activityId) continue
        const v = lineValue(l, 'approved', employer)
        if (v > 0) out[l.activityId] = (out[l.activityId] ?? 0) + v
      }
      const t = resByReport.get(r.id)
      if (t) { man += t.man; equip += t.equip; anyRes = anyRes || t.any }
      const w = WX_OF[String(r.data.weather ?? '')] ?? null
      wx = worstWx(wx, w)
      const g = String(r.data.groundStatus ?? '')
      ground = worstGround(ground, GROUNDS.has(g) ? (g as GroundState) : null)
      // a site closed for the day by weather reads as the worst of its weather
      if (r.data.siteStatus === 'stopped' && !w) wx = worstWx(wx, 'storm')
    }
    days.push({ date, man: anyRes && man > 0 ? man : null, equip: anyRes && equip > 0 ? equip : null, wx, ground, out })
  }
  const activities: OutlookActivity[] = m.approved.rows.map((r) => ({
    id: r.activity.id, title: r.activity.title, unit: r.activity.unit, group: r.activity.weightGroup,
    weight: r.base.weight, baseQty: r.base.baseQty, doneQty: r.cum, plannedStart: r.activity.plannedStart, plannedEnd: r.activity.plannedEnd,
  }))
  return { days, activities }
}
