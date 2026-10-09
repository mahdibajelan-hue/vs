import type { ImExtension, ImIssue, ImTask } from '../types'
import { dayDiff, effectiveDue, isActiveIssue, isClosedIssue, isTaskOpen, stageOf } from './imModel'

export interface KpiDef { key: string; titleFa: string; formulaFa: string; unit: '%' | 'روز' | 'عدد'; good: 'high' | 'low'; descriptionFa: string }

/** Single source of truth for KPI semantics — rendered verbatim in the reports page «تعریف شاخص‌ها». */
export const KPI_DEFS: KpiDef[] = [
  { key: 'onTimeClosure', titleFa: 'نرخ بستن به‌موقع', formulaFa: 'مسائل بسته‌شده تا سررسید مؤثر ÷ کل مسائل بسته‌شده × ۱۰۰', unit: '%', good: 'high', descriptionFa: 'سررسید مؤثر = سررسید پس از تمدید تأییدشده؛ برای شفافیت، نرخ نسبت به سررسید اولیه هم جدا گزارش می‌شود.' },
  { key: 'onTimeClosureOriginal', titleFa: 'نرخ بستن به‌موقع (نسبت به سررسید اولیه)', formulaFa: 'مسائل بسته‌شده تا سررسید اولیه ÷ کل بسته‌شده‌ها × ۱۰۰', unit: '%', good: 'high', descriptionFa: 'تمدیدها پنهان نمی‌شوند: اختلاف این شاخص با نرخ مؤثر، اثر تمدیدهاست.' },
  { key: 'overdueRate', titleFa: 'نرخ تأخیر فعال', formulaFa: 'مسائل فعالِ گذشته از سررسید مؤثر ÷ کل مسائل فعال × ۱۰۰', unit: '%', good: 'low', descriptionFa: 'مسائل فعال = همه به‌جز بسته‌شده، ابطال و تکراری.' },
  { key: 'avgResolutionDays', titleFa: 'میانگین زمان رفع (MTTR)', formulaFa: 'میانگین (تاریخ بسته‌شدن − تاریخ ثبت) برای مسائل بسته‌شده', unit: 'روز', good: 'low', descriptionFa: '' },
  { key: 'avgAgeOpen', titleFa: 'میانگین سن مسائل باز', formulaFa: 'میانگین (امروز − تاریخ ثبت) برای مسائل فعال', unit: 'روز', good: 'low', descriptionFa: '' },
  { key: 'reopenRate', titleFa: 'نرخ بازگشایی', formulaFa: 'مسائل بسته‌شده‌ای که حداقل یک‌بار بازگشایی شده‌اند ÷ کل مسائل بسته‌شده (یا بازگشایی‌شده) × ۱۰۰', unit: '%', good: 'low', descriptionFa: 'نشانهٔ بستن زودهنگام یا رفع غیرریشه‌ای.' },
  { key: 'extensionRate', titleFa: 'نرخ تمدید', formulaFa: 'مسائلی با حداقل یک تمدید تأییدشده ÷ کل مسائل × ۱۰۰', unit: '%', good: 'low', descriptionFa: '' },
  { key: 'rootCauseCoverage', titleFa: 'پوشش علت ریشه‌ای', formulaFa: 'مسائل بسته‌شده با علت ریشه‌ای تأییدشده ÷ کل بسته‌شده‌ها × ۱۰۰', unit: '%', good: 'high', descriptionFa: '' },
  { key: 'blockedCount', titleFa: 'اقدامات مسدود', formulaFa: 'تعداد اقدامات با وضعیت «مسدود»', unit: 'عدد', good: 'low', descriptionFa: '' },
  { key: 'pendingVerification', titleFa: 'انجام‌شده‌های منتظر تأیید', formulaFa: 'تعداد اقدامات با وضعیت «منتظر تأیید»', unit: 'عدد', good: 'low', descriptionFa: 'اقدام تا تأیید مستقل، «انجام‌شده» محسوب نمی‌شود.' },
  { key: 'taskOnTime', titleFa: 'نرخ اقدامات به‌موقع', formulaFa: 'اقدامات تأییدشده تا سررسید ÷ کل اقدامات تأییدشده × ۱۰۰', unit: '%', good: 'high', descriptionFa: '' },
  { key: 'backlogNetFlow', titleFa: 'جریان خالص (۳۰ روز)', formulaFa: 'مسائل بسته‌شده در ۳۰ روز اخیر − مسائل ثبت‌شده در ۳۰ روز اخیر', unit: 'عدد', good: 'high', descriptionFa: 'مثبت = بک‌لاگ در حال کاهش.' },
]

export interface KpiValues {
  total: number
  active: number
  closed: number
  onTimeClosure: number | null
  onTimeClosureOriginal: number | null
  overdueRate: number | null
  overdueCount: number
  avgResolutionDays: number | null
  avgAgeOpen: number | null
  reopenRate: number | null
  extensionRate: number | null
  rootCauseCoverage: number | null
  blockedCount: number
  pendingVerification: number
  taskOnTime: number | null
  backlogNetFlow: number
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)
const closedDay = (i: ImIssue) => (i.closedAt ?? i.updatedAt).slice(0, 10)

export function computeKpis(issues: ImIssue[], tasks: ImTask[], today: string): KpiValues {
  const closed = issues.filter(isClosedIssue)
  const active = issues.filter(isActiveIssue)
  const overdue = active.filter((i) => effectiveDue(i) < today)
  const onTimeEff = closed.filter((i) => closedDay(i) <= effectiveDue(i)).length
  const onTimeOrig = closed.filter((i) => closedDay(i) <= (i.originalDueDate ?? i.deadlineDate)).length
  const everReopened = issues.filter((i) => (i.reopenCount ?? 0) > 0)
  const verified = tasks.filter((t) => t.status === 'done' && t.verifiedAt)
  const created30 = issues.filter((i) => dayDiff(i.createdAt.slice(0, 10), today) <= 30).length
  const closed30 = closed.filter((i) => dayDiff(closedDay(i), today) <= 30).length
  return {
    total: issues.length,
    active: active.length,
    closed: closed.length,
    onTimeClosure: pct(onTimeEff, closed.length),
    onTimeClosureOriginal: pct(onTimeOrig, closed.length),
    overdueRate: pct(overdue.length, active.length),
    overdueCount: overdue.length,
    avgResolutionDays: avg(closed.map((i) => dayDiff((i.identifiedAt ?? i.createdAt).slice(0, 10), closedDay(i)))),
    avgAgeOpen: avg(active.map((i) => dayDiff(i.createdAt.slice(0, 10), today))),
    reopenRate: pct(everReopened.length, closed.length + everReopened.filter((i) => !isClosedIssue(i)).length),
    extensionRate: pct(issues.filter((i) => (i.extensionCount ?? 0) > 0).length, issues.length),
    rootCauseCoverage: pct(closed.filter((i) => i.rootCauseConfirmed).length, closed.length),
    blockedCount: tasks.filter((t) => t.status === 'blocked').length,
    pendingVerification: tasks.filter((t) => t.status === 'pending_verification').length,
    taskOnTime: pct(verified.filter((t) => !t.dueDate || (t.verifiedAt as string).slice(0, 10) <= t.dueDate).length, verified.length),
    backlogNetFlow: closed30 - created30,
  }
}

export const AGING_BUCKETS = [
  { key: '0-7', label: '۰ تا ۷ روز', min: 0, max: 7 },
  { key: '8-14', label: '۸ تا ۱۴ روز', min: 8, max: 14 },
  { key: '15-30', label: '۱۵ تا ۳۰ روز', min: 15, max: 30 },
  { key: '31-60', label: '۳۱ تا ۶۰ روز', min: 31, max: 60 },
  { key: '60+', label: 'بیش از ۶۰ روز', min: 61, max: Infinity },
] as const

export function agingBuckets(issues: ImIssue[], today: string): { key: string; label: string; count: number }[] {
  const act = issues.filter(isActiveIssue)
  return AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: act.filter((i) => { const d = dayDiff(i.createdAt.slice(0, 10), today); return d >= b.min && d <= b.max }).length }))
}

export function stageDistribution(issues: ImIssue[]): { stage: string; count: number }[] {
  const m = new Map<string, number>()
  for (const i of issues) m.set(stageOf(i), (m.get(stageOf(i)) ?? 0) + 1)
  return [...m.entries()].map(([stage, count]) => ({ stage, count }))
}

/** Extension discipline: how much of «on-time» is real vs. produced by moving the deadline. */
export function extensionImpact(issues: ImIssue[], exts: ImExtension[]): { approved: number; pending: number; rejected: number; avgShiftDays: number | null; repeatOffenders: string[] } {
  const approved = exts.filter((e) => e.status === 'approved')
  const byIssue = new Map<string, number>()
  for (const e of approved) byIssue.set(e.issueId, (byIssue.get(e.issueId) ?? 0) + 1)
  return {
    approved: approved.length,
    pending: exts.filter((e) => e.status === 'pending').length,
    rejected: exts.filter((e) => e.status === 'rejected').length,
    avgShiftDays: avg(approved.map((e) => dayDiff(e.fromDue, e.toDue))),
    repeatOffenders: [...byIssue.entries()].filter(([, n]) => n >= 2).map(([id]) => id).filter((id) => issues.some((i) => i.id === id)),
  }
}

export function workload(issues: ImIssue[], tasks: ImTask[], today: string): { userId: string; open: number; overdue: number; blocked: number }[] {
  const m = new Map<string, { open: number; overdue: number; blocked: number }>()
  const get = (u: string) => { let r = m.get(u); if (!r) { r = { open: 0, overdue: 0, blocked: 0 }; m.set(u, r) } return r }
  for (const t of tasks) {
    if (!t.executorId || !isTaskOpen(t)) continue
    const r = get(t.executorId)
    r.open++
    if (t.dueDate && t.dueDate < today) r.overdue++
    if (t.status === 'blocked') r.blocked++
  }
  for (const i of issues) {
    if (!isActiveIssue(i) || !i.pursuerId) continue
    const r = get(i.pursuerId)
    r.open++
    if (effectiveDue(i) < today) r.overdue++
  }
  return [...m.entries()].map(([userId, v]) => ({ userId, ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open)
}

/** Weekly flow for the last `weeks` weeks (oldest first): issues created vs closed. Week = 7 days ending on `today - 7*k`. */
export function weeklyTrend(issues: ImIssue[], today: string, weeks = 8): { labels: string[]; created: number[]; closed: number[] } {
  const labels: string[] = [], created: number[] = [], closed: number[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const endOff = w * 7
    const inWeek = (iso: string) => { const d = dayDiff(iso, today); return d >= endOff && d < endOff + 7 }
    created.push(issues.filter((i) => inWeek(i.createdAt.slice(0, 10))).length)
    closed.push(issues.filter((i) => isClosedIssue(i) && inWeek(closedDay(i))).length)
    const d = new Date(Date.parse(today) - endOff * 86400000)
    labels.push(d.toISOString().slice(5, 10))
  }
  return { labels, created, closed }
}

export function severityDistribution(issues: ImIssue[]): { severity: string; count: number }[] {
  const act = issues.filter(isActiveIssue)
  return (['critical', 'high', 'medium', 'low'] as const).map((s) => ({ severity: s, count: act.filter((i) => (i.severity ?? i.priority) === s).length }))
}

export function taskStatusDistribution(tasks: ImTask[]): { status: string; count: number }[] {
  const keys = ['not_started', 'in_progress', 'blocked', 'pending_verification', 'done', 'cancelled'] as const
  return keys.map((status) => ({ status, count: tasks.filter((t) => t.status === status).length }))
}
