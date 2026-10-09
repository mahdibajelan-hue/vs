import type { ImIssue } from '../types'
import { dayDiff, effectiveDue, isActiveIssue, priorityRank } from './imModel'
import { IM_CATEGORY_FA } from './imModel'
import type { ImDecision } from './imDecisions'
import { decisionLateDays } from './imDecisions'

export type Level = 'bad' | 'warn' | 'ok'

export interface ProjectHealth { projectId: string; active: number; overdue: number; critical: number; blocked: number; stale: number; unassigned: number; avgLate: number; risk: number; level: Level }

const STALE_DAYS = 14

/** Per-project pressure score 0–100 (higher = needs attention). Transparent weights, no hidden model. */
export function projectHealth(issues: ImIssue[], projectIds: string[], today: string): ProjectHealth[] {
  return projectIds.map((projectId) => {
    const act = issues.filter((i) => i.projectId === projectId && isActiveIssue(i))
    const late = act.map((i) => Math.max(0, dayDiff(effectiveDue(i), today)))
    const overdue = late.filter((d) => d > 0).length
    const critical = act.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length
    const blocked = act.filter((i) => !!i.blockedSince).length
    const stale = act.filter((i) => dayDiff(i.updatedAt.slice(0, 10), today) >= STALE_DAYS).length
    const unassigned = act.filter((i) => !i.pursuerId).length
    const n = Math.max(1, act.length)
    const avgLate = overdue ? Math.round(late.filter((d) => d > 0).reduce((a, b) => a + b, 0) / overdue) : 0
    const risk = act.length === 0 ? 0 : Math.min(100, Math.round(45 * (overdue / n) + 25 * (critical / n) + 15 * (blocked / n) + 10 * (stale / n) + 5 * (unassigned / n) + Math.min(10, avgLate / 3)))
    return { projectId, active: act.length, overdue, critical, blocked, stale, unassigned, avgLate, risk, level: (risk >= 50 ? 'bad' : risk >= 25 ? 'warn' : 'ok') as Level }
  }).sort((a, b) => b.risk - a.risk)
}

export interface CategoryShare { category: string; label: string; active: number; overdue: number; share: number }

export function categoryShare(issues: ImIssue[], today: string): CategoryShare[] {
  const act = issues.filter(isActiveIssue)
  const m = new Map<string, CategoryShare>()
  for (const i of act) {
    const k = i.category ?? 'none'
    const c = m.get(k) ?? { category: k, label: k === 'none' ? 'بدون دسته' : IM_CATEGORY_FA[k] ?? k, active: 0, overdue: 0, share: 0 }
    c.active++
    if (dayDiff(effectiveDue(i), today) > 0) c.overdue++
    m.set(k, c)
  }
  return [...m.values()].map((c) => ({ ...c, share: act.length ? c.active / act.length : 0 })).sort((a, b) => b.active - a.active)
}

export interface Advice { id: string; level: Level; title: string; why: string; todo: string; issueIds: string[]; projectId?: string }

/** Rule-based, explainable advice: every item says what was seen, why it matters and the concrete next step. */
export function advise(issues: ImIssue[], decisions: ImDecision[], projectName: (id: string) => string, today: string): Advice[] {
  const out: Advice[] = []
  const act = issues.filter(isActiveIssue)
  const critLate = act.filter((i) => priorityRank(i.severity ?? i.priority) >= 4 && dayDiff(effectiveDue(i), today) > 0)
  if (critLate.length) out.push({ id: 'crit-late', level: 'bad', title: `${critLate.length} مسئلهٔ بحرانی از سررسید گذشته`, why: 'مسائل بحرانی تأخیردار بیشترین اثر را بر زمان و هزینهٔ پروژه دارند.', todo: 'در جلسهٔ این هفته با مدیر پروژه بررسی و در صورت نیاز سطح بالاتر تشدید شوند.', issueIds: critLate.map((i) => i.id) })

  const stale = act.filter((i) => dayDiff(i.updatedAt.slice(0, 10), today) >= STALE_DAYS)
  if (stale.length) out.push({ id: 'stale', level: 'warn', title: `${stale.length} مسئله بیش از ${STALE_DAYS} روز بدون هیچ به‌روزرسانی`, why: 'مسئلهٔ رهاشده معمولاً صاحب ندارد و بی‌صدا تأخیردار می‌شود.', todo: 'از مسئول انجام وضعیت بگیرید یا در صورت بی‌اعتباری مسئله را لغو کنید.', issueIds: stale.map((i) => i.id) })

  const orphan = act.filter((i) => !i.pursuerId)
  if (orphan.length) out.push({ id: 'orphan', level: 'warn', title: `${orphan.length} مسئلهٔ فعال بدون مسئول انجام`, why: 'تا مسئول مشخص نباشد اعلان و تشدید به کسی نمی‌رسد.', todo: 'برای هر مورد یک مسئول انجام تعیین کنید.', issueIds: orphan.map((i) => i.id) })

  const blocked = act.filter((i) => !!i.blockedSince)
  if (blocked.length) out.push({ id: 'blocked', level: 'warn', title: `${blocked.length} مسئله مسدود است`, why: 'مانع‌ها معمولاً منتظر تصمیم، مدرک یا منبع‌اند و خودبه‌خود باز نمی‌شوند.', todo: 'علت انسداد هر مورد را به یک تصمیم یا اقدام مشخص با سررسید تبدیل کنید.', issueIds: blocked.map((i) => i.id) })

  const lateDec = decisions.filter((d) => decisionLateDays(d, today) > 0 && d.status !== 'decided' && d.status !== 'cancelled')
  if (lateDec.length) out.push({ id: 'decisions', level: 'bad', title: `${lateDec.length} تصمیم از موعد گذشته`, why: 'تصمیم معوق اقدام‌های وابسته را متوقف می‌کند و تأخیر زنجیره‌ای می‌سازد.', todo: 'تصمیم‌گیرنده را مطلع کنید و در صورت لزوم گزینهٔ پیش‌فرض را اعلام کنید.', issueIds: [...new Set(lateDec.map((d) => d.issueId).filter(Boolean) as string[])] })

  const cats = categoryShare(issues, today)
  const top = cats[0]
  if (top && act.length >= 5 && top.category !== 'none' && top.share >= 0.4) out.push({ id: 'cat-' + top.category, level: 'warn', title: `${Math.round(top.share * 100)}٪ مسائل فعال در یک دسته: «${top.label}»`, why: 'تمرکز زیاد در یک دسته نشانهٔ علت سیستمی است، نه چند اتفاق جدا.', todo: `یک جلسهٔ تحلیل علت ریشه‌ای برای دستهٔ «${top.label}» برگزار و نتیجه در «دانش» ثبت شود.`, issueIds: act.filter((i) => (i.category ?? 'none') === top.category).map((i) => i.id) })

  for (const h of projectHealth(issues, [...new Set(act.map((i) => i.projectId))], today).filter((x) => x.level === 'bad' && x.active >= 2).slice(0, 3)) {
    out.push({ id: 'proj-' + h.projectId, level: 'bad', title: `«${projectName(h.projectId)}» در وضعیت پرفشار است (شاخص ${h.risk})`, why: `${h.overdue} تأخیردار از ${h.active} مسئلهٔ فعال${h.avgLate ? `، میانگین تأخیر ${h.avgLate} روز` : ''}.`, todo: 'مدیر پروژه را برای یک برنامهٔ بازیابی کوتاه (۷ روزه) دعوت کنید.', issueIds: act.filter((i) => i.projectId === h.projectId && dayDiff(effectiveDue(i), today) > 0).map((i) => i.id), projectId: h.projectId })
  }
  const order = { bad: 0, warn: 1, ok: 2 } as const
  return out.sort((a, b) => order[a.level] - order[b.level])
}
