import type { Report, Stoppage, StoppageCategory } from '../types'
import { daysBetween } from './periods'

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
}

/** The delay & claim register built from the stoppages of the daily reports: who is responsible, whether it is on the critical path and whether the contractual notice was sent in time. */
export function buildDelays(a: { stoppages: Stoppage[]; reports: Report[]; today: string; noticeDays: number; from?: string; to?: string }): DelaySummary {
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
  return {
    rows, hours: rows.reduce((s, x) => s + x.hours, 0), count: rows.length,
    unassessed: rows.filter((x) => !x.responsibility).length,
    claimableHours: rows.filter((x) => x.responsibility === 'employer' || x.responsibility === 'third_party' || x.responsibility === 'force_majeure').reduce((s, x) => s + x.hours, 0),
    criticalHours: rows.filter((x) => x.critical).reduce((s, x) => s + x.hours, 0),
    noticeLost: rows.filter((x) => x.notice === 'lost' || x.notice === 'late').length,
    noticeDue: rows.filter((x) => x.notice === 'due' && (x.responsibility === 'employer' || x.responsibility === 'third_party' || x.responsibility === 'force_majeure' || !x.responsibility)).length,
    byCategory: [...cats.values()].sort((x, y) => y.total - x.total), weatherDays: wDays.size,
  }
}
