import type { ExecutionModel } from './useExecutionModel'
import { isRegistered, lineValue, type EmployerMode } from './progress'
import { median } from './engine/stats'
import { WX_OF, completeCrews, isSupportSection, suggestCrews, worstGround, worstWx, type DayObs, type GroundState, type OutlookActivity } from './engine/outlook'

const GROUNDS = new Set(['dry', 'wet', 'mud', 'frozen', 'snow'])
const REVIEWED = new Set(['approved', 'partially_approved'])

export interface CrewSection {
  name: string
  support: boolean
  /** resources recorded under the section: name, kind and usual (median) active units on a reported day */
  items: { name: string; kind: 'man' | 'equip'; usual: number }[]
  /** the composition of one complete crew as saved in the project settings (null = not defined yet) */
  composition: Record<string, number> | null
}
export interface OutlookInputs {
  days: DayObs[]
  activities: OutlookActivity[]
  sections: CrewSection[]
  /** where each activity's crew type comes from */
  crewSource: Record<string, 'set' | 'suggested' | 'none'>
}

/**
 * The forecast's inputs, read from the project's daily work reports: one observation per reported day (a day counts only
 * once the supervision has reviewed at least one of its work reports, so an unreviewed day is not mistaken for a day
 * without output) with the complete crews of every work section, and every approved activity with its crew type.
 */
export function outlookInputs(m: ExecutionModel): OutlookInputs {
  const employer: EmployerMode = (m.settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off'
  const comp = m.settings.crewComposition ?? {}
  const work = m.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && r.reportDate <= m.today)
  const repIds = new Set(work.map((r) => r.id))
  const byDate = new Map<string, typeof work>()
  for (const r of work) { const l = byDate.get(r.reportDate); if (l) l.push(r); else byDate.set(r.reportDate, [r]) }

  // active units per report → per section → per resource name
  const resByReport = new Map<string, Map<string, Map<string, number>>>()
  const kindOf = new Map<string, 'man' | 'equip'>()
  for (const x of m.resources) {
    if (!repIds.has(x.reportId)) continue
    const sec = x.section.trim() || (x.kind === 'man' ? 'نیروی انسانی (بدون بخش)' : 'ماشین‌آلات (بدون بخش)')
    const rm = resByReport.get(x.reportId) ?? new Map(); resByReport.set(x.reportId, rm)
    const sm = rm.get(sec) ?? new Map<string, number>(); rm.set(sec, sm)
    sm.set(x.name, (sm.get(x.name) ?? 0) + x.activeQty)
    kindOf.set(`${sec}|${x.name}`, x.kind)
  }

  // per reviewed day: output, weather, ground, and active units per section
  const raw: { date: string; out: Record<string, number>; wx: DayObs['wx']; ground: GroundState | null; act: Map<string, Record<string, number>> }[] = []
  for (const [date, reps] of [...byDate].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!reps.some((r) => REVIEWED.has(r.status))) continue
    const out: Record<string, number> = {}
    let wx: DayObs['wx'] = null, ground: GroundState | null = null
    const act = new Map<string, Record<string, number>>()
    for (const r of reps) {
      for (const l of m.linesByReport.get(r.id) ?? []) {
        if (!l.activityId) continue
        const v = lineValue(l, 'approved', employer)
        if (v > 0) out[l.activityId] = (out[l.activityId] ?? 0) + v
      }
      for (const [sec, sm] of resByReport.get(r.id) ?? []) {
        const t = act.get(sec) ?? {}; act.set(sec, t)
        for (const [n, q] of sm) t[n] = (t[n] ?? 0) + q
      }
      const w = WX_OF[String(r.data.weather ?? '')] ?? null
      wx = worstWx(wx, w)
      const g = String(r.data.groundStatus ?? '')
      ground = worstGround(ground, GROUNDS.has(g) ? (g as GroundState) : null)
      if (r.data.siteStatus === 'stopped' && !w) wx = worstWx(wx, 'storm')
    }
    raw.push({ date, out, wx, ground, act })
  }

  // sections, their usual complement, and complete crews per day
  const names = new Map<string, Set<string>>()
  for (const d of raw) for (const [sec, t] of d.act) { const s = names.get(sec) ?? new Set(); for (const n of Object.keys(t)) s.add(n); names.set(sec, s) }
  const sections: CrewSection[] = [...names].map(([name, set]) => ({
    name, support: isSupportSection(name),
    items: [...set].map((n) => ({ name: n, kind: kindOf.get(`${name}|${n}`) ?? 'man', usual: median(raw.map((d) => d.act.get(name)?.[n] ?? 0).filter((v) => v > 0)) ?? 0 })).sort((a, b) => (a.kind === b.kind ? b.usual - a.usual : a.kind === 'equip' ? -1 : 1)),
    composition: comp[name] && Object.values(comp[name]).some((v) => v > 0) ? comp[name] : null,
  })).sort((a, b) => Number(a.support) - Number(b.support) || a.name.localeCompare(b.name, 'fa'))
  const usualTotal = new Map(sections.map((s) => [s.name, median(raw.map((d) => Object.values(d.act.get(s.name) ?? {}).reduce((x, y) => x + y, 0)).filter((v) => v > 0))]))
  const days: DayObs[] = raw.map((d) => ({
    date: d.date, out: d.out, wx: d.wx, ground: d.ground,
    crews: Object.fromEntries(sections.map((s) => [s.name, d.act.has(s.name) ? completeCrews(d.act.get(s.name)!, s.composition, usualTotal.get(s.name) ?? null) : null])),
  }))

  // the crew type of each activity: the saved choice, else a suggestion from the words of its title
  const saved = m.settings.activityCrew ?? {}
  const secNames = new Set(sections.map((s) => s.name))
  const sugg = suggestCrews(m.approved.rows.map((r) => ({ id: r.activity.id, title: r.activity.title, chapter: r.activity.chapter, parentId: r.activity.parentActivityId })), [...secNames])
  const crewSource: OutlookInputs['crewSource'] = {}
  const activities: OutlookActivity[] = m.approved.rows.map((r) => {
    const id = r.activity.id
    let crew: string | null
    if (id in saved && (saved[id] === '' || secNames.has(saved[id]))) { crew = saved[id] || null; crewSource[id] = crew ? 'set' : 'none' }
    else { crew = sugg[id] ?? null; crewSource[id] = crew ? 'suggested' : 'none' }
    return {
      id, title: r.activity.title, unit: r.activity.unit, group: r.activity.weightGroup, weight: r.base.weight, baseQty: r.base.baseQty, doneQty: r.cum,
      plannedStart: r.activity.plannedStart, plannedEnd: r.activity.plannedEnd, crew,
    }
  })
  return { days, activities, sections, crewSource }
}
