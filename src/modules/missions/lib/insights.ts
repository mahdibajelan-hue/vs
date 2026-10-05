import type { Finding, FindingKind, Mission, MissionStatus, Objective, Priority } from '../types'
import type { PortfolioData } from '../repo/types'
import { contentTokens } from './ruleAnalyzer'
import { daysBetween, faNum, isoToJalali, JALALI_MONTHS, todayIso } from './fa'
import { progressOf } from './reportBuilder'

/**
 * Dashboard analytics. Everything here answers "what should a manager do about this?" — counts are only
 * the supporting evidence for an Insight, not the point of it.
 */

export type InsightTone = 'bad' | 'warn' | 'info' | 'good'

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  detail: string
  /** Mission ids the insight refers to, so the card can deep-link. */
  missionIds: string[]
  /** What the manager should do. */
  action: string
  weight: number
}

export const ACTIVE_STATUSES: MissionStatus[] = ['ticketing', 'approved', 'debrief', 'pending_approval', 'report_review', 'ready_for_claim', 'revision_requested', 'returned']
const OPEN_FINDING = (f: Finding) => f.approval !== 'rejected'

export interface Kpis {
  active: number
  awaitingRequestApproval: number
  awaitingTicket: number
  awaitingClaim: number
  awaitingReportReview: number
  completedReports: number
  incompleteReports: number
  readyForClaim: number
  issues: number
  risks: number
  proposedPending: number
  transferred: number
  actions: number
  commitments: number
  overdue: number
  objectivesTotal: number
  objectivesAchieved: number
  avgQuality: number | null
}

export function computeKpis(p: PortfolioData, today = todayIso()): Kpis {
  const m = p.missions
  const live = p.findings.filter(OPEN_FINDING)
  const obj = p.objectives.filter((o) => m.some((x) => x.id === o.missionId && !['draft', 'pending_approval', 'cancelled', 'rejected', 'returned'].includes(x.status)))
  const scores = m.map((x) => x.qualityScore).filter((s): s is number => s != null)
  const overdue = live.filter((f) => (f.kind === 'action' || f.kind === 'commitment') && f.dueDate && f.dueDate < today && !isClosedLinked(f, p)).length
  return {
    active: m.filter((x) => ACTIVE_STATUSES.includes(x.status)).length,
    awaitingRequestApproval: m.filter((x) => x.status === 'pending_approval').length,
    awaitingTicket: m.filter((x) => x.status === 'ticketing').length,
    awaitingClaim: m.filter((x) => x.status === 'ready_for_claim').length,
    awaitingReportReview: m.filter((x) => x.status === 'report_review').length,
    completedReports: m.filter((x) => x.status === 'ready_for_claim' || x.status === 'claimed').length,
    incompleteReports: m.filter((x) => x.status === 'debrief' || x.status === 'revision_requested').length,
    readyForClaim: m.filter((x) => x.status === 'ready_for_claim').length,
    issues: live.filter((f) => f.kind === 'issue').length,
    risks: live.filter((f) => f.kind === 'risk').length,
    proposedPending: live.filter((f) => (f.kind === 'issue' || f.kind === 'risk') && f.approval === 'proposed' && missionOf(m, f)?.status === 'report_review').length,
    transferred: live.filter((f) => f.transferredId).length,
    actions: live.filter((f) => f.kind === 'action').length,
    commitments: live.filter((f) => f.kind === 'commitment').length,
    overdue,
    objectivesTotal: obj.length,
    objectivesAchieved: obj.filter((o) => o.status === 'achieved').length,
    avgQuality: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  }
}

function missionOf(missions: Mission[], f: Finding): Mission | undefined {
  return missions.find((x) => x.id === f.missionId)
}

function isClosedLinked(f: Finding, p: PortfolioData): boolean {
  const l = p.linked.find((x) => x.findingId === f.id)
  return !!l && /^(completed|cancelled|closed|approved)$/.test(l.linkedStatus)
}

export interface MonthPoint {
  key: string
  label: string
  visits: number
  findings: number
}

/** Visits and discovered findings per Jalali month for the last `months` months. */
export function trendByMonth(p: PortfolioData, months = 6, today = todayIso()): MonthPoint[] {
  const j = isoToJalali(today)
  if (!j) return []
  const slots: MonthPoint[] = []
  let y = j.jy
  let m = j.jm
  for (let i = 0; i < months; i++) {
    slots.unshift({ key: `${y}-${m}`, label: JALALI_MONTHS[m - 1], visits: 0, findings: 0 })
    m--
    if (m === 0) { m = 12; y-- }
  }
  const idx = new Map(slots.map((s) => [s.key, s]))
  const bucket = (iso: string) => {
    const jj = isoToJalali(iso.slice(0, 10))
    return jj ? idx.get(`${jj.jy}-${jj.jm}`) : undefined
  }
  for (const mi of p.missions) if (!['draft', 'cancelled', 'rejected'].includes(mi.status)) { const b = bucket(mi.startDate); if (b) b.visits++ }
  for (const f of p.findings.filter(OPEN_FINDING)) {
    if (f.kind !== 'issue' && f.kind !== 'risk') continue
    const mi = missionOf(p.missions, f)
    const b = bucket(mi ? mi.startDate : f.createdAt)
    if (b) b.findings++
  }
  return slots
}

export interface ProjectHeat {
  projectId: string
  name: string
  missions: number
  issues: number
  risks: number
  worst: Priority | null
  progressGap: number | null
  lastVisit: string | null
}

export function projectHeat(p: PortfolioData): ProjectHeat[] {
  const out = new Map<string, ProjectHeat>()
  for (const m of p.missions) {
    if (['draft', 'cancelled', 'rejected', 'pending_approval', 'returned'].includes(m.status)) continue
    const h = out.get(m.masterProjectId) ?? { projectId: m.masterProjectId, name: m.projectName, missions: 0, issues: 0, risks: 0, worst: null, progressGap: null, lastVisit: null }
    h.missions++
    if (!h.lastVisit || m.startDate > h.lastVisit) {
      h.lastVisit = m.startDate
      const st = p.interviews.find((i) => i.missionId === m.id)?.state ?? null
      const pr = progressOf(st)
      h.progressGap = pr.planned != null && pr.actual != null ? pr.planned - pr.actual : h.progressGap
    }
    out.set(m.masterProjectId, h)
  }
  const order: Priority[] = ['critical', 'high', 'medium', 'low']
  for (const f of p.findings.filter(OPEN_FINDING)) {
    if (f.kind !== 'issue' && f.kind !== 'risk') continue
    const m = missionOf(p.missions, f)
    const h = m ? out.get(m.masterProjectId) : undefined
    if (!h) continue
    if (f.kind === 'issue') h.issues++
    else h.risks++
    if (!h.worst || order.indexOf(f.severity) < order.indexOf(h.worst)) h.worst = f.severity
  }
  return [...out.values()].sort((a, b) => order.indexOf(a.worst ?? 'low') - order.indexOf(b.worst ?? 'low') || b.issues + b.risks - (a.issues + a.risks))
}

export interface ManagerQuality {
  personId: string
  name: string
  reports: number
  avg: number
  onTimeShare: number | null
}

export function managerQuality(p: PortfolioData): ManagerQuality[] {
  const by = new Map<string, Mission[]>()
  for (const m of p.missions) if (m.qualityScore != null) by.set(m.requesterId, [...(by.get(m.requesterId) ?? []), m])
  return [...by.entries()]
    .map(([id, ms]) => {
      const withDates = ms.filter((x) => x.reportSubmittedAt)
      const onTime = withDates.filter((x) => daysBetween(x.endDate, x.reportSubmittedAt!.slice(0, 10)) <= 3).length
      return { personId: id, name: ms[0].requesterName, reports: ms.length, avg: Math.round(ms.reduce((s, x) => s + (x.qualityScore ?? 0), 0) / ms.length), onTimeShare: withDates.length ? Math.round((onTime / withDates.length) * 100) : null }
    })
    .sort((a, b) => b.avg - a.avg)
}

export function objectiveStatusMix(objectives: Objective[], missions: Mission[]): Record<string, number> {
  const out: Record<string, number> = { achieved: 0, partial: 0, not_achieved: 0, follow_up: 0, pending: 0 }
  const live = new Set(missions.filter((m) => !['draft', 'pending_approval', 'cancelled', 'rejected', 'returned'].includes(m.status)).map((m) => m.id))
  for (const o of objectives) if (live.has(o.missionId)) out[o.status]++
  return out
}

/** Rule-driven management insights, ranked by how much attention they deserve. */
export function computeInsights(p: PortfolioData, today = todayIso()): Insight[] {
  const out: Insight[] = []
  const m = p.missions
  const live = p.findings.filter(OPEN_FINDING)

  const lateDebrief = m.filter((x) => x.status === 'approved' && x.endDate < today && daysBetween(x.endDate, today) >= 2)
  if (lateDebrief.length) {
    out.push({
      id: 'late-debrief', tone: 'bad', weight: 90, missionIds: lateDebrief.map((x) => x.id),
      title: `${faNum(lateDebrief.length)} مأموریت پایان یافته ولی گزارشی ثبت نشده`,
      detail: lateDebrief.slice(0, 3).map((x) => `${x.code} (${x.requesterName}، ${faNum(daysBetween(x.endDate, today))} روز پیش)`).join(' · '),
      action: 'از بازدیدکننده بخواهید گزارش‌گیری را شروع کند؛ هرچه دیرتر، جزئیات بیشتری فراموش می‌شود.',
    })
  }
  const ticketLate = m.filter((x) => x.status === 'ticketing' && x.approvedAt && daysBetween(x.approvedAt.slice(0, 10), today) >= 2 && daysBetween(today, x.startDate) <= 7)
  if (ticketLate.length) {
    out.push({
      id: 'ticket-late', tone: 'bad', weight: 92, missionIds: ticketLate.map((x) => x.id),
      title: `${faNum(ticketLate.length)} مأموریت نزدیک اعزام است و بلیط هنوز صادر نشده`,
      detail: ticketLate.slice(0, 3).map((x) => `${x.code} (${x.requesterName}، شروع ${faNum(daysBetween(today, x.startDate))} روز دیگر)`).join(' · '),
      action: 'امور اداری برای صدور بلیط اقدام کند؛ هر روز تأخیر هزینه بلیط را بالا می‌برد.',
    })
  }
  const claimLate = m.filter((x) => x.status === 'ready_for_claim' && x.finalApprovedAt && daysBetween(x.finalApprovedAt.slice(0, 10), today) >= 3)
  if (claimLate.length) {
    out.push({
      id: 'claim-late', tone: 'warn', weight: 55, missionIds: claimLate.map((x) => x.id),
      title: `${faNum(claimLate.length)} کلیم مأموریت بیش از ۳ روز منتظر تأیید امور اداری است`,
      detail: claimLate.slice(0, 3).map((x) => `${x.code} — ${x.requesterName}`).join(' · '),
      action: 'امور اداری کلیم را بررسی و تأیید کند تا حق مأموریت به‌موقع پرداخت شود.',
    })
  }
  const stuck = m.filter((x) => x.status === 'report_review' && x.reportSubmittedAt && daysBetween(x.reportSubmittedAt.slice(0, 10), today) >= 2)
  if (stuck.length) {
    out.push({
      id: 'stuck-review', tone: 'warn', weight: 80, missionIds: stuck.map((x) => x.id),
      title: `${faNum(stuck.length)} گزارش بیش از ۲ روز منتظر تأیید مجری طرح است`,
      detail: stuck.slice(0, 3).map((x) => `${x.code} — ${x.projectName}`).join(' · '),
      action: 'گزارش را مرور و Issue/Risk پیشنهادی را تأیید یا رد کنید.',
    })
  }
  const criticalProposed = live.filter((f) => (f.kind === 'issue' || f.kind === 'risk') && (f.severity === 'critical' || f.severity === 'high') && f.approval === 'proposed' && !f.transferredId && ['report_review', 'ready_for_claim', 'claimed'].includes(missionOf(m, f)?.status ?? ''))
  if (criticalProposed.length) {
    out.push({
      id: 'critical-proposed', tone: 'bad', weight: 95, missionIds: [...new Set(criticalProposed.map((f) => f.missionId))],
      title: `${faNum(criticalProposed.length)} مسئله/ریسک مهم هنوز به سامانه اصلی منتقل نشده`,
      detail: criticalProposed.slice(0, 2).map((f) => `«${f.title}»`).join(' · '),
      action: 'تأیید و انتقال به مدیریت Issue/Risk تا یافته مهم در گزارش گم نشود.',
    })
  }
  const overdue = live.filter((f) => (f.kind === 'action' || f.kind === 'commitment') && f.dueDate && f.dueDate < today && !isClosedLinked(f, p))
  if (overdue.length) {
    out.push({
      id: 'overdue', tone: 'warn', weight: 70, missionIds: [...new Set(overdue.map((f) => f.missionId))],
      title: `${faNum(overdue.length)} اقدام/تعهد از موعد گذشته`,
      detail: overdue.slice(0, 2).map((f) => `«${f.title}» (${f.ownerText || 'بدون مسئول'})`).join(' · '),
      action: 'وضعیت را از مسئول بپرسید و موعد جدید یا اقدام جایگزین ثبت کنید.',
    })
  }
  // recurring themes across different visits
  const themeMap = new Map<string, Set<string>>()
  for (const f of live.filter((x) => x.kind === 'issue' || x.kind === 'risk')) {
    for (const t of new Set(contentTokens(f.title).filter((w) => w.length > 3))) themeMap.set(t, (themeMap.get(t) ?? new Set()).add(f.missionId))
  }
  const repeated = [...themeMap.entries()].filter(([, ids]) => ids.size >= 2).sort((a, b) => b[1].size - a[1].size)[0]
  if (repeated) {
    out.push({
      id: 'repeat-theme', tone: 'info', weight: 60, missionIds: [...repeated[1]],
      title: `موضوع «${repeated[0]}» در ${faNum(repeated[1].size)} بازدید مختلف تکرار شده`,
      detail: 'یک مسئله تکراری معمولاً ریشه سیستمی دارد، نه موردی.',
      action: 'بررسی کنید آیا باید به‌جای پیگیری جداگانه، یک اقدام اصلاحی کلی تعریف شود.',
    })
  }
  const lowQ = managerQuality(p).filter((x) => x.reports >= 1 && x.avg < 60)
  if (lowQ.length) {
    out.push({
      id: 'low-quality', tone: 'info', weight: 50, missionIds: [],
      title: `کیفیت گزارش ${lowQ.map((x) => x.name).join('، ')} زیر ۶۰ است`,
      detail: lowQ.map((x) => `${x.name}: ${faNum(x.avg)}`).join(' · '),
      action: 'پیش از مأموریت بعدی، اهداف قابل اندازه‌گیری را با آنها مرور کنید.',
    })
  }
  for (const h of projectHeat(p).filter((x) => x.progressGap != null && x.progressGap >= 10).slice(0, 2)) {
    out.push({
      id: `gap-${h.projectId}`, tone: 'warn', weight: 65, missionIds: [],
      title: `«${h.name}» در آخرین بازدید ${faNum(h.progressGap!)} واحد از برنامه عقب بود`,
      detail: 'اختلاف پیشرفت واقعی و برنامه‌ای گزارش‌شده در بازدید اخیر.',
      action: 'علت و برنامه جبرانی را در جلسه بعدی کنترل پروژه بررسی کنید.',
    })
  }
  if (!out.length) out.push({ id: 'ok', tone: 'good', weight: 1, missionIds: [], title: 'مورد فوری برای مدیریت وجود ندارد', detail: 'گزارش‌ها به‌موقع، یافته‌های مهم منتقل‌شده و اقدام‌ها در موعد هستند.', action: '' })
  return out.sort((a, b) => b.weight - a.weight)
}

export const KIND_ORDER_FOR_FEED: FindingKind[] = ['issue', 'risk', 'commitment', 'action', 'decision']
