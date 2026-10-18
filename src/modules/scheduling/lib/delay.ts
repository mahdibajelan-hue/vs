import { addDays, daysBetween } from '../../execution/lib/periods'
import { computeSchedule, type ScheduleInput } from './schedule'
import type { SchActivity } from './types'

/**
 * Delay analysis: a register of delay EVENTS, each measured against the network and classified as allowable (excusable) or not, then reconciled with the contract finish.
 * Principles (all configurable through the contract terms):
 *  - only a delay that moves the project finish (critical) can justify an extension of time; a delay on a path with float only consumes float;
 *  - the party at fault decides compensation: employer → time + cost; neutral (force majeure, third party) → time only; shared/concurrent → time, cost per contract; contractor → nothing;
 *  - a written notice outside the contractual period bars the claim;
 *  - the extension actually granted is the approver's decision (approved days); the engine only measures and recommends.
 */
export type Party = 'employer' | 'contractor' | 'third_party' | 'force_majeure' | 'shared'
export const PARTY_FA: Record<Party, string> = { employer: 'کارفرما', contractor: 'پیمانکار', third_party: 'شخص ثالث', force_majeure: 'فورس‌ماژور', shared: 'مشترک / هم‌زمان' }
export const CAUSES: { key: string; label: string; party: Party }[] = [
  { key: 'drawing_approval', label: 'تأخیر در تأیید مدارک / نقشه', party: 'employer' },
  { key: 'land_handover', label: 'تأخیر در تحویل زمین / تحصیل اراضی', party: 'employer' },
  { key: 'change_order', label: 'دستور تغییر یا افزایش دامنه', party: 'employer' },
  { key: 'employer_supply', label: 'تأخیر در اقلام تحویلی کارفرما', party: 'employer' },
  { key: 'late_payment', label: 'تأخیر در پرداخت', party: 'employer' },
  { key: 'permit', label: 'تأخیر مجوز / ذی‌نفعان (شخص ثالث)', party: 'third_party' },
  { key: 'weather', label: 'شرایط جوی فراتر از معمول', party: 'force_majeure' },
  { key: 'force_majeure', label: 'فورس‌ماژور (سیل، زلزله، تحریم…)', party: 'force_majeure' },
  { key: 'productivity', label: 'بهره‌وری پایین / کمبود منابع پیمانکار', party: 'contractor' },
  { key: 'rework', label: 'اصلاح کار معیوب / رد کیفیت', party: 'contractor' },
  { key: 'procurement', label: 'تأخیر تأمین توسط پیمانکار', party: 'contractor' },
  { key: 'concurrent', label: 'تأخیر هم‌زمان کارفرما و پیمانکار', party: 'shared' },
  { key: 'other', label: 'سایر', party: 'shared' },
]
export const CAUSE_FA = Object.fromEntries(CAUSES.map((c) => [c.key, c.label])) as Record<string, string>

export interface Contract {
  contractStart: string | null; contractFinish: string | null; contractValue: number
  ldPerDay: number; ldCapPct: number; noticeDays: number; docReviewDays: number; toleranceDays: number
  concurrentCompensable: boolean; forceMajeureNotice: boolean
}
export const DEFAULT_CONTRACT: Contract = { contractStart: null, contractFinish: null, contractValue: 0, ldPerDay: 0, ldCapPct: 10, noticeDays: 14, docReviewDays: 14, toleranceDays: 0, concurrentCompensable: false, forceMajeureNotice: true }

export type EventStatus = 'draft' | 'assessed' | 'approved' | 'rejected'
export interface DelayEvent {
  id: string; title: string; cause: string; party: Party; clause: string
  eventStart: string; eventEnd: string | null; noticeDate: string | null
  activityUids: string[]; claimedDays: number; critical: boolean | null
  status: EventStatus; approvedDays: number | null; approvedCost: number | null
  sourceType: string; sourceRef: string; note: string
}

export type DelayClass = 'excusable_compensable' | 'excusable_time_only' | 'concurrent' | 'non_excusable' | 'barred_notice' | 'no_impact' | 'pending' | 'rejected'
export const CLASS_FA: Record<DelayClass, string> = {
  excusable_compensable: 'مجاز — با خسارت', excusable_time_only: 'مجاز — فقط زمان', concurrent: 'هم‌زمان', non_excusable: 'غیرمجاز (پیمانکار)',
  barred_notice: 'غیرمجاز — اخطار خارج از مهلت', no_impact: 'بدون اثر بر پایان (مصرف شناوری)', pending: 'اثر اندازه‌گیری نشده', rejected: 'ردشده',
}
export const CLASS_TONE: Record<DelayClass, 'good' | 'warn' | 'bad' | 'neutral'> = {
  excusable_compensable: 'good', excusable_time_only: 'good', concurrent: 'warn', non_excusable: 'bad', barred_notice: 'bad', no_impact: 'neutral', pending: 'neutral', rejected: 'bad',
}
export interface Classified {
  event: DelayEvent
  noticeRequired: boolean; noticeDeadline: string; noticeOk: boolean
  /** measured effect on the project finish, calendar days (null = not measured) */
  impactDays: number | null
  critical: boolean | null
  cls: DelayClass
  compensable: boolean
  allowedDays: number
  disallowedDays: number
  reason: string
}

/** Measures what the event cost the project: the forecast WITHOUT the delay (its days removed from the affected activities) against the forecast as it stands. */
export function measureImpact(sched: ScheduleInput, e: Pick<DelayEvent, 'activityUids' | 'claimedDays' | 'eventStart' | 'eventEnd'>): { finishWith: string | null; finishWithout: string | null; impactDays: number } | null {
  const days = e.claimedDays > 0 ? e.claimedDays : e.eventEnd ? Math.max(1, daysBetween(e.eventStart, e.eventEnd) + 1) : 0
  if (!days || !e.activityUids.length) return null
  const hit = new Set(e.activityUids)
  const withEvent = computeSchedule(sched)
  if (!withEvent.ok) return null
  const without: SchActivity[] = sched.activities.map((a) => {
    if (!hit.has(a.uid) || (a.type !== 'task' && a.type !== 'milestone')) return a
    if (a.actualFinish) return { ...a, actualFinish: a.actualStart && addDays(a.actualFinish, -Math.round(days)) < a.actualStart ? a.actualStart : addDays(a.actualFinish, -Math.round(days)) }
    if (a.remDuration != null) return { ...a, remDuration: Math.max(0, a.remDuration - days) }
    return { ...a, origDuration: Math.max(0, a.origDuration - days) }
  })
  const wo = computeSchedule({ ...sched, activities: without })
  if (!wo.ok || !withEvent.projectFinish || !wo.projectFinish) return null
  return { finishWith: withEvent.projectFinish, finishWithout: wo.projectFinish, impactDays: Math.max(0, daysBetween(wo.projectFinish, withEvent.projectFinish)) }
}

export function classifyEvent(e: DelayEvent, c: Contract, impactDays: number | null): Classified {
  const noticeRequired = e.party !== 'contractor' && (e.party !== 'force_majeure' || c.forceMajeureNotice)
  const noticeDeadline = addDays(e.eventStart, c.noticeDays)
  const noticeOk = !noticeRequired || (!!e.noticeDate && e.noticeDate <= noticeDeadline)
  const critical = e.critical ?? (impactDays != null ? impactDays > 0 : null)
  const claimed = e.claimedDays
  const base = { event: e, noticeRequired, noticeDeadline, noticeOk, impactDays, critical }
  if (e.status === 'rejected') return { ...base, cls: 'rejected', compensable: false, allowedDays: 0, disallowedDays: claimed, reason: 'درخواست رد شده است.' }
  if (e.party === 'contractor') {
    const d = impactDays ?? claimed
    return { ...base, cls: 'non_excusable', compensable: false, allowedDays: 0, disallowedDays: d, reason: 'علت از سوی پیمانکار است؛ تمدید و خسارت ندارد.' }
  }
  if (critical === false) return { ...base, cls: 'no_impact', compensable: false, allowedDays: 0, disallowedDays: 0, reason: 'فعالیت‌های اثرپذیر روی مسیر بحرانی نیستند؛ فقط شناوری مصرف شد (تمدید زمان لازم نیست).' }
  if (critical === null) return { ...base, cls: 'pending', compensable: false, allowedDays: 0, disallowedDays: 0, reason: 'اثر بر پایان پروژه هنوز اندازه‌گیری نشده است (فعالیت‌های اثرپذیر و روز را ثبت و «اندازه‌گیری» را بزنید).' }
  if (!noticeOk) {
    const d = Math.min(claimed || (impactDays ?? 0), impactDays ?? (claimed || 0))
    return { ...base, cls: 'barred_notice', compensable: false, allowedDays: 0, disallowedDays: d, reason: e.noticeDate ? `اخطار در ${e.noticeDate} ارسال شده، بعد از مهلت ${c.noticeDays} روزه (${noticeDeadline}).` : `اخطار کتبی ظرف ${c.noticeDays} روز (تا ${noticeDeadline}) ارسال نشده است.` }
  }
  const measured = impactDays ?? claimed
  let allowed = claimed > 0 ? Math.min(claimed, measured) : measured
  if (e.status === 'approved' && e.approvedDays != null) allowed = e.approvedDays
  const cls: DelayClass = e.party === 'employer' ? 'excusable_compensable' : e.party === 'shared' ? 'concurrent' : 'excusable_time_only'
  const compensable = cls === 'excusable_compensable' || (cls === 'concurrent' && c.concurrentCompensable)
  const why = cls === 'excusable_compensable' ? 'علت از سوی کارفرماست، روی مسیر بحرانی و اخطار به‌موقع: تمدید زمان و هزینه.'
    : cls === 'concurrent' ? `تأخیر هم‌زمان: تمدید زمان${compensable ? ' و هزینه' : '، بدون هزینه'}.` : 'علت خنثی (فورس‌ماژور/شخص ثالث): فقط تمدید زمان.'
  return { ...base, cls, compensable, allowedDays: Math.max(0, allowed), disallowedDays: claimed > measured ? claimed - measured : 0, reason: why }
}

export interface Reconciliation {
  contractFinish: string | null; forecastFinish: string | null
  /** forecast − contract finish, calendar days (positive = late) */
  totalSlip: number | null
  approvedExtension: number; revisedFinish: string | null
  /** extension the engine recommends for events not yet decided */
  pendingAllowed: number; potentialRevisedFinish: string | null
  allowedTotal: number; disallowedTotal: number
  /** slip not explained by any classified event (positive) */
  unexplained: number | null
  overlapWarning: boolean
  /** delay that stays with the contractor after the approved extension */
  contractorDelay: number | null
  ldDays: number; ldAmount: number; ldCapped: boolean
  compensableCost: number
}

export function reconcile(c: Contract, forecastFinish: string | null, rows: Classified[]): Reconciliation {
  const approved = rows.filter((r) => r.event.status === 'approved' && r.event.approvedDays != null)
  const approvedExtension = approved.reduce((s, r) => s + (r.event.approvedDays ?? 0), 0)
  const open = rows.filter((r) => r.event.status !== 'approved' && r.event.status !== 'rejected')
  const pendingAllowed = open.reduce((s, r) => s + r.allowedDays, 0)
  const allowedTotal = rows.reduce((s, r) => s + r.allowedDays, 0), disallowedTotal = rows.reduce((s, r) => s + r.disallowedDays, 0)
  const cf = c.contractFinish
  const totalSlip = cf && forecastFinish ? daysBetween(cf, forecastFinish) : null
  const revised = cf ? addDays(cf, Math.round(approvedExtension)) : null
  const contractorDelay = revised && forecastFinish ? Math.max(0, daysBetween(revised, forecastFinish)) : null
  const ldDays = contractorDelay != null ? Math.max(0, contractorDelay - c.toleranceDays) : 0
  const raw = ldDays * c.ldPerDay, cap = c.contractValue > 0 ? (c.contractValue * c.ldCapPct) / 100 : Infinity
  const explained = allowedTotal + disallowedTotal
  return {
    contractFinish: cf, forecastFinish, totalSlip, approvedExtension, revisedFinish: revised, pendingAllowed,
    potentialRevisedFinish: cf ? addDays(cf, Math.round(approvedExtension + pendingAllowed)) : null,
    allowedTotal, disallowedTotal,
    unexplained: totalSlip != null ? Math.max(0, totalSlip - explained) : null,
    overlapWarning: totalSlip != null && explained > Math.max(0, totalSlip) + 0.5,
    contractorDelay, ldDays, ldAmount: Math.min(raw, cap), ldCapped: raw > cap,
    compensableCost: rows.filter((r) => r.compensable).reduce((s, r) => s + (r.event.status === 'approved' ? r.event.approvedCost ?? 0 : 0), 0),
  }
}

export type NoticeState = 'na' | 'ok' | 'late' | 'due' | 'lost'
export function noticeState(x: Classified, today: string): { state: NoticeState; daysLeft: number | null } {
  if (!x.noticeRequired) return { state: 'na', daysLeft: null }
  if (x.event.noticeDate) return { state: x.noticeOk ? 'ok' : 'late', daysLeft: null }
  const left = daysBetween(today, x.noticeDeadline)
  return { state: left < 0 ? 'lost' : 'due', daysLeft: left }
}

/** milestone forecast against its contract date, with the delay damages that would apply */
export interface MilestoneRow { id: string; title: string; contractDate: string; forecast: string | null; lateDays: number | null; ldPerDay: number; ldAmount: number }
export function milestoneRows(ms: { id: string; title: string; contractDate: string; ldPerDay: number; activityUid: string | null }[], forecastOf: (uid: string) => string | null): MilestoneRow[] {
  return ms.map((m) => {
    const f = m.activityUid ? forecastOf(m.activityUid) : null
    const late = f ? daysBetween(m.contractDate, f) : null
    return { id: m.id, title: m.title, contractDate: m.contractDate, forecast: f, lateDays: late, ldPerDay: m.ldPerDay, ldAmount: late != null && late > 0 ? late * m.ldPerDay : 0 }
  })
}

/** one window between two consecutive schedule updates: how far the finish moved and which critical activities moved it */
export interface VersionSnapshot { label: string; dataDate: string | null; finish: string | null; acts: Map<string, { code: string; name: string; finish: string | null; critical: boolean }> }
export interface WindowRow { from: string; to: string; fromDate: string | null; toDate: string | null; finishShift: number | null; drivers: { code: string; name: string; shift: number }[] }
export function windowsAnalysis(snaps: VersionSnapshot[]): WindowRow[] {
  const out: WindowRow[] = []
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i]
    const drivers: WindowRow['drivers'] = []
    for (const [uid, x] of b.acts) {
      const p = a.acts.get(uid)
      if (!x.critical || !p || !p.finish || !x.finish) continue
      const shift = daysBetween(p.finish, x.finish)
      if (shift > 0) drivers.push({ code: x.code, name: x.name, shift })
    }
    out.push({ from: a.label, to: b.label, fromDate: a.dataDate, toDate: b.dataDate, finishShift: a.finish && b.finish ? daysBetween(a.finish, b.finish) : null, drivers: drivers.sort((p, q) => q.shift - p.shift).slice(0, 6) })
  }
  return out
}

/** suggestions taken from other modules (never saved automatically) */
export interface Suggestion { key: string; title: string; cause: string; party: Party; eventStart: string; eventEnd: string | null; noticeDate: string | null; claimedDays: number; critical: boolean | null; sourceType: string; sourceRef: string; note: string; activityUids?: string[] }

export function suggestFromStoppages(rows: { id: string; date: string; hours: number; category: string; responsibility: string; critical: boolean; noticeDate: string | null }[], hoursPerDay = 8): Suggestion[] {
  const CAUSE: Record<string, string> = { material: 'employer_supply', drawing: 'drawing_approval', land: 'land_handover', permit: 'permit', weather: 'weather', equipment: 'productivity', manpower: 'productivity', hse: 'other', other: 'other' }
  const LABEL: Record<string, string> = { material: 'مصالح', drawing: 'نقشه', land: 'زمین', permit: 'مجوز', weather: 'آب‌وهوا', equipment: 'تجهیزات', manpower: 'نیروی انسانی', hse: 'ایمنی', other: 'سایر' }
  const groups = new Map<string, typeof rows>()
  for (const r of rows) { if (!r.responsibility) continue; const k = `${r.category}|${r.responsibility}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
  return [...groups].map(([k, g]) => {
    const [cat, resp] = k.split('|'), dates = g.map((x) => x.date).sort(), hours = g.reduce((s, x) => s + x.hours, 0)
    return { key: `stoppage:${k}`, title: `توقف کار — ${LABEL[cat] ?? cat} (${g.length} گزارش)`, cause: CAUSE[cat] ?? 'other', party: resp as Party, eventStart: dates[0], eventEnd: dates[dates.length - 1], noticeDate: g.map((x) => x.noticeDate).filter((x): x is string => !!x).sort()[0] ?? null, claimedDays: Math.max(1, Math.ceil(hours / hoursPerDay)), critical: g.some((x) => x.critical) ? true : null, sourceType: 'stoppage', sourceRef: k, note: `${hours} ساعت توقف در گزارش‌های روزانه` }
  })
}

/** documents the reviewer (consultant / employer side) kept longer than the contractual review time */
export function suggestFromDocs(docs: { id: string; docNo: string; title: string; issuedDate: string | null; actualApproved: string | null; status: string; activityUids: string[] }[], reviewDays: number, today: string): Suggestion[] {
  const out: Suggestion[] = []
  for (const d of docs) {
    if (!d.issuedDate) continue
    const due = addDays(d.issuedDate, reviewDays), end = d.actualApproved ?? (d.status === 'approved' ? null : today)
    if (!end || end <= due) continue
    const days = daysBetween(due, end)
    if (days <= 0 || !d.activityUids.length) continue
    out.push({ key: `doc:${d.id}`, title: `تأخیر در بررسی مدرک ${d.docNo}`, cause: 'drawing_approval', party: 'employer', eventStart: due, eventEnd: end, noticeDate: null, claimedDays: days, critical: null, sourceType: 'doc', sourceRef: d.id, note: `${d.title} — صدور ${d.issuedDate}، مهلت بررسی ${reviewDays} روز`, activityUids: d.activityUids })
  }
  return out.sort((a, b) => b.claimedDays - a.claimedDays)
}
