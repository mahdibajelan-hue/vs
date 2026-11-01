/**
 * Stakeholder management rules, in one place and free of I/O: the power/interest quadrant, the engagement gap
 * (current vs desired level), when a stakeholder is due for contact, which stakeholders need attention, and the
 * project summary. The page and the tests use exactly these functions.
 */
import { ENGAGEMENT_ORDER, type Concern, type EngagementLog, type Quadrant, type Stakeholder } from '../types'

const DAY = 86400000
const days = (from: string, to: string) => Math.round((new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime()) / DAY)

/** 4 and 5 are «high» on the 1–5 scale */
export const isHigh = (v: number) => v >= 4
export function quadrantOf(s: Pick<Stakeholder, 'power' | 'interest'>): Quadrant {
  const p = isHigh(s.power), i = isHigh(s.interest)
  return p && i ? 'manage' : p ? 'satisfy' : i ? 'inform' : 'monitor'
}

/** steps between the current and the desired engagement level (positive: needs to rise, negative: above what is needed) */
export const engagementGap = (s: Pick<Stakeholder, 'current' | 'desired'>) => ENGAGEMENT_ORDER.indexOf(s.desired) - ENGAGEMENT_ORDER.indexOf(s.current)

export const isOpenConcern = (c: Pick<Concern, 'status'>) => c.status === 'open' || c.status === 'in_progress'
export const isOverdueFollowUp = (e: Pick<EngagementLog, 'nextAction' | 'nextDue' | 'nextDone'>, today: string) => !!e.nextAction && !e.nextDone && !!e.nextDue && e.nextDue < today
export const isOverdueConcern = (c: Pick<Concern, 'status' | 'dueDate'>, today: string) => isOpenConcern(c) && !!c.dueDate && c.dueDate < today

export interface StakeholderView {
  s: Stakeholder
  quadrant: Quadrant
  gap: number
  /** power × interest, 1–25 */
  weight: number
  lastContact: string | null
  lastSentiment: EngagementLog['sentiment'] | null
  /** days since the last contact; null if never contacted */
  sinceContact: number | null
  /** the planned contact interval has passed (or a stakeholder with a frequency was never contacted) */
  contactDue: boolean
  openConcerns: number
  criticalConcerns: number
  overdueFollowUps: number
  /** reasons this stakeholder needs attention now, most serious first */
  alerts: string[]
  /** 0–100: higher = more urgent */
  attention: number
}

export function viewOf(s: Stakeholder, logs: EngagementLog[], concerns: Concern[], today: string): StakeholderView {
  const mine = logs.filter((l) => l.stakeholderId === s.id).sort((a, b) => b.happenedOn.localeCompare(a.happenedOn))
  const last = mine[0] ?? null
  const cs = concerns.filter((c) => c.stakeholderId === s.id && isOpenConcern(c))
  const sinceContact = last ? days(last.happenedOn, today) : null
  const contactDue = s.frequencyDays != null && (sinceContact == null || sinceContact > s.frequencyDays)
  const overdueFollowUps = mine.filter((l) => isOverdueFollowUp(l, today)).length
  const gap = engagementGap(s)
  const quadrant = quadrantOf(s)
  const criticalConcerns = cs.filter((c) => c.priority === 'critical' || c.priority === 'high').length
  const hostile = s.attitude === 'blocker' || s.attitude === 'critic' || s.current === 'resistant'
  const alerts: string[] = []
  if (isHigh(s.power) && hostile) alerts.push('ذینفع پرقدرت با نگرش منفی یا مقاوم')
  if (criticalConcerns) alerts.push(`${criticalConcerns.toLocaleString('fa-IR')} نگرانی با اولویت زیاد یا بحرانی`)
  if (overdueFollowUps) alerts.push(`${overdueFollowUps.toLocaleString('fa-IR')} پیگیری سررسیدگذشته`)
  if (contactDue) alerts.push(sinceContact == null ? 'هنوز تعاملی ثبت نشده است' : `${sinceContact.toLocaleString('fa-IR')} روز از آخرین تعامل گذشته (دورهٔ برنامه: ${s.frequencyDays!.toLocaleString('fa-IR')} روز)`)
  if (last?.sentiment === 'negative') alerts.push('نتیجهٔ آخرین تعامل منفی بوده است')
  if (gap >= 2) alerts.push(`سطح تعامل ${gap.toLocaleString('fa-IR')} پله پایین‌تر از سطح مطلوب است`)
  const weight = s.power * s.interest
  const attention = !s.active ? 0 : Math.min(100, Math.round(
    weight * 1.6 + (hostile ? 15 : 0) + Math.max(0, gap) * 8 + criticalConcerns * 10 + overdueFollowUps * 8 + (contactDue ? 8 : 0) + (last?.sentiment === 'negative' ? 8 : 0),
  ))
  return { s, quadrant, gap, weight, lastContact: last?.happenedOn ?? null, lastSentiment: last?.sentiment ?? null, sinceContact, contactDue, openConcerns: cs.length, criticalConcerns, overdueFollowUps, alerts, attention }
}

export interface Summary {
  active: number
  byQuadrant: Record<Quadrant, number>
  /** share of active stakeholders at or above their desired engagement level, 0–100 (null when none) */
  alignment: number | null
  belowDesired: number
  supportive: number
  resistant: number
  openConcerns: number
  overdueConcerns: number
  overdueFollowUps: number
  contactDue: number
  /** interactions in the last 30 days, by sentiment */
  recent: { positive: number; neutral: number; negative: number }
  /** monthly interaction counts by sentiment, oldest first (last 6 months) */
  months: { month: string; positive: number; neutral: number; negative: number }[]
}

export function summarise(views: StakeholderView[], logs: EngagementLog[], concerns: Concern[], today: string): Summary {
  const act = views.filter((v) => v.s.active)
  const byQuadrant: Record<Quadrant, number> = { manage: 0, satisfy: 0, inform: 0, monitor: 0 }
  for (const v of act) byQuadrant[v.quadrant]++
  const activeIds = new Set(act.map((v) => v.s.id))
  const cs = concerns.filter((c) => activeIds.has(c.stakeholderId))
  const ls = logs.filter((l) => activeIds.has(l.stakeholderId))
  const recent = { positive: 0, neutral: 0, negative: 0 }
  for (const l of ls) if (days(l.happenedOn, today) <= 30 && days(l.happenedOn, today) >= 0) recent[l.sentiment]++
  const months: Summary['months'] = []
  const base = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)).toISOString().slice(0, 7)
    const m = { month: d, positive: 0, neutral: 0, negative: 0 }
    for (const l of ls) if (l.happenedOn.slice(0, 7) === d) m[l.sentiment]++
    months.push(m)
  }
  return {
    active: act.length,
    byQuadrant,
    alignment: act.length ? Math.round((act.filter((v) => v.gap <= 0).length / act.length) * 100) : null,
    belowDesired: act.filter((v) => v.gap > 0).length,
    supportive: act.filter((v) => v.s.current === 'supportive' || v.s.current === 'leading').length,
    resistant: act.filter((v) => v.s.current === 'resistant' || v.s.attitude === 'blocker').length,
    openConcerns: cs.filter(isOpenConcern).length,
    overdueConcerns: cs.filter((c) => isOverdueConcern(c, today)).length,
    overdueFollowUps: ls.filter((l) => isOverdueFollowUp(l, today)).length,
    contactDue: act.filter((v) => v.contactDue).length,
    recent,
    months,
  }
}

/** a starting strategy for a stakeholder, from the quadrant and the engagement gap; the user can rewrite it */
export function suggestStrategy(s: Pick<Stakeholder, 'power' | 'interest' | 'current' | 'desired' | 'attitude'>): string {
  const q = quadrantOf(s), gap = engagementGap(s)
  const base = {
    manage: 'جلسهٔ منظم و مستقیم با مدیر پروژه، مشارکت در تصمیم‌های اثرگذار و پاسخ سریع به نگرانی‌ها.',
    satisfy: 'ارسال گزارش خلاصهٔ دوره‌ای، مشورت پیش از تصمیم‌های اثرگذار بر آنان و پرهیز از درگیر کردن در جزئیات.',
    inform: 'اطلاع‌رسانی منظم از پیشرفت و برنامه‌ها، شنیدن نگرانی‌ها و پاسخ مکتوب.',
    monitor: 'پایش دوره‌ای و اطلاع‌رسانی عمومی؛ در صورت تغییر قدرت یا علاقه، بازنگری طبقه‌بندی.',
  }[q]
  const extra = gap > 0 ? ` برای رسیدن به سطح مطلوب، ${s.attitude === 'blocker' || s.attitude === 'critic' ? 'نخست علت مخالفت را در یک جلسهٔ حضوری روشن و برای نگرانی‌های اصلی پاسخ مشخص تعیین کنید.' : 'برنامهٔ تعامل را تشدید و یک نمایندهٔ ثابت برای ارتباط تعیین کنید.'}` : ''
  return base + extra
}

/** next code for a new stakeholder: SH-001, SH-002, … */
export function nextCode(existing: string[]): string {
  const n = existing.map((c) => Number(/(\d+)$/.exec(c)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)
  return `SH-${String(n + 1).padStart(3, '0')}`
}
