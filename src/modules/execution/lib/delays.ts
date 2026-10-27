import type { Report, Stoppage, StoppageCategory } from '../types'
import { daysBetween, monthOf } from './periods'

export type Responsibility = '' | 'contractor' | 'employer' | 'force_majeure' | 'third_party' | 'shared'
export const RESPONSIBILITY_FA: Record<Responsibility, string> = { '': 'ارزیابی نشده', contractor: 'پیمانکار', employer: 'کارفرما', force_majeure: 'فورس‌ماژور', third_party: 'شخص ثالث', shared: 'مشترک' }
export const RESPONSIBILITIES: Exclude<Responsibility, ''>[] = ['employer', 'contractor', 'force_majeure', 'third_party', 'shared']

export interface DelayRow {
  id: string
  stoppage: Stoppage
  report: Report
  date: string
  hours: number
  category: StoppageCategory
  responsibility: Responsibility
  critical: boolean
  noticeDate: string | null
  /** written notice state against the contract's notice period */
  notice: 'sent' | 'late' | 'due' | 'lost' | 'na'
  /** days left to send the notice (negative = already past) */
  noticeDaysLeft: number | null
}
export interface DelaySummary {
  rows: DelayRow[]
  hours: number
  count: number
  unassessed: number
  /** hours that are the employer's / third party's / force majeure — the ones a time-extension claim can rest on */
  claimableHours: number
  criticalHours: number
  noticeLost: number
  noticeDue: number
  byCategory: { category: StoppageCategory; total: number; byResp: Record<Responsibility, number> }[]
  weatherDays: number
  /** time-extension estimate: excusable stoppage on the critical path, capped at one working day per calendar day */
  eot: { days: number; compensableDays: number; hoursPerDay: number }
  /** days on which a contractor-caused and an excusable critical stoppage overlap — the analyst must apportion them */
  concurrentDates: string[]
  /** Jalali-month windows of the stoppage hours by responsibility (`month` = the month's label) */
  windows: { key: string; month: string; total: number; excusable: number; contractor: number; unassessed: number; criticalExcusable: number }[]
}

const EXCUSABLE = new Set<Responsibility>(['employer', 'third_party', 'force_majeure'])

/** The delay & claim register built from the stoppages of the daily reports: who is responsible, whether it is on the critical path and whether the contractual notice was sent in time. */
export function buildDelays(a: { stoppages: Stoppage[]; reports: Report[]; today: string; noticeDays: number; from?: string; to?: string; hoursPerDay?: number }): DelaySummary {
  const rep = new Map(a.reports.filter((r) => r.formKey === 'work' && r.status !== 'draft' && r.status !== 'incomplete').map((r) => [r.id, r]))
  const rows: DelayRow[] = []
  for (const s of a.stoppages) {
    const r = rep.get(s.reportId)
    if (!r || s.hours <= 0) continue
    if (a.from && r.reportDate < a.from) continue
    if (a.to && r.reportDate > a.to) continue
    const age = daysBetween(r.reportDate, a.today)
    const sent = s.noticeDate
    const notice: DelayRow['notice'] = s.responsibility === 'force_majeure' && !sent ? 'due' : sent ? (daysBetween(r.reportDate, sent) > a.noticeDays ? 'late' : 'sent') : age > a.noticeDays ? 'lost' : 'due'
    rows.push({ id: s.id, stoppage: s, report: r, date: r.reportDate, hours: s.hours, category: s.category, responsibility: s.responsibility as Responsibility, critical: s.critical, noticeDate: sent, notice, noticeDaysLeft: sent ? null : a.noticeDays - age })
  }
  rows.sort((x, y) => y.date.localeCompare(x.date))
  const cats = new Map<StoppageCategory, { category: StoppageCategory; total: number; byResp: Record<Responsibility, number> }>()
  for (const x of rows) {
    const c = cats.get(x.category) ?? { category: x.category, total: 0, byResp: { '': 0, contractor: 0, employer: 0, force_majeure: 0, third_party: 0, shared: 0 } }
    c.total += x.hours; c.byResp[x.responsibility] += x.hours; cats.set(x.category, c)
  }
  const wDays = new Set<string>()
  for (const r of rep.values()) {
    if ((a.from && r.reportDate < a.from) || (a.to && r.reportDate > a.to)) continue
    const w = String(r.data.weather ?? '')
    if (w === 'rainy' || w === 'snowy' || w === 'stormy') wDays.add(r.reportDate)
  }
  // EOT: per calendar day, the excusable hours on the critical path (a day cannot give more than one working day)
  const hpd = a.hoursPerDay && a.hoursPerDay > 0 ? a.hoursPerDay : 10
  const perDay = new Map<string, { exc: number; comp: number; con: number }>()
  for (const x of rows) {
    if (!x.critical) continue
    const d = perDay.get(x.date) ?? { exc: 0, comp: 0, con: 0 }
    if (EXCUSABLE.has(x.responsibility)) d.exc += x.hours
    if (x.responsibility === 'employer') d.comp += x.hours
    if (x.responsibility === 'contractor') d.con += x.hours
    perDay.set(x.date, d)
  }
  let days = 0, comp = 0
  const concurrentDates: string[] = []
  for (const [date, d] of perDay) { days += Math.min(d.exc, hpd) / hpd; comp += Math.min(d.comp, hpd) / hpd; if (d.exc > 0 && d.con > 0) concurrentDates.push(date) }
  const win = new Map<string, { key: string; month: string; total: number; excusable: number; contractor: number; unassessed: number; criticalExcusable: number }>()
  for (const x of rows) {
    const mo = monthOf(x.date), k = mo.key, w = win.get(k) ?? { key: k, month: mo.label, total: 0, excusable: 0, contractor: 0, unassessed: 0, criticalExcusable: 0 }
    w.total += x.hours
    if (EXCUSABLE.has(x.responsibility)) { w.excusable += x.hours; if (x.critical) w.criticalExcusable += x.hours }
    if (x.responsibility === 'contractor') w.contractor += x.hours
    if (!x.responsibility) w.unassessed += x.hours
    win.set(k, w)
  }
  return {
    eot: { days, compensableDays: comp, hoursPerDay: hpd }, concurrentDates: concurrentDates.sort(), windows: [...win.values()].sort((x, y) => x.key.localeCompare(y.key)),
    rows, hours: rows.reduce((s, x) => s + x.hours, 0), count: rows.length,
    unassessed: rows.filter((x) => !x.responsibility).length,
    claimableHours: rows.filter((x) => EXCUSABLE.has(x.responsibility)).reduce((s, x) => s + x.hours, 0),
    criticalHours: rows.filter((x) => x.critical).reduce((s, x) => s + x.hours, 0),
    noticeLost: rows.filter((x) => x.notice === 'lost' || x.notice === 'late').length,
    noticeDue: rows.filter((x) => x.notice === 'due' && (x.responsibility === 'employer' || x.responsibility === 'third_party' || x.responsibility === 'force_majeure' || !x.responsibility)).length,
    byCategory: [...cats.values()].sort((x, y) => y.total - x.total), weatherDays: wDays.size,
  }
}
