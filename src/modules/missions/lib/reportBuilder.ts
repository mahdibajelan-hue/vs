import type {
  Evidence,
  Finding,
  FindingKind,
  InterviewState,
  Mission,
  Objective,
  ReportContent,
  ReportSection,
  Priority,
} from '../types'
import { OBJECTIVE_STATUS_LABEL, PRIORITY_LABEL, VISIT_TYPE_LABEL } from '../types'
import { attendanceOf } from './attendance'
import { faNum, missionDays, shamsiLong } from './fa'
import { topicTitle, type QuestionSet } from './questionSets'

/**
 * Deterministic management-report assembly. Every sentence is built from data the interview actually
 * captured — nothing is invented. An AI provider may later rewrite the executive summary and the
 * recommendations (AiReportParts), but the facts, the structure and the section list always come from here.
 */

export interface ReportInput {
  mission: Mission
  projectName: string
  objectives: Objective[]
  findings: Finding[]
  evidence: Evidence[]
  state: InterviewState | null
  set: QuestionSet
  generatedBy?: string
}

const SEV_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']
const bySeverity = (a: Finding, b: Finding) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)

function attendanceLine(evidence: Evidence[], mission: Pick<Mission, 'startDate' | 'endDate'>): string {
  const a = attendanceOf(evidence, mission)
  if (a.status === 'verified') return `حضور بازدیدکننده با ${faNum(a.verified)} عکس ثبت‌شده در بازهٔ مأموریت تأیید شده است.`
  if (a.status === 'unverified') return 'عکس بارگذاری شده است ولی تاریخ ثبت آن قابل تأیید نیست.'
  if (a.status === 'outside') return 'عکس‌های بارگذاری‌شده خارج از بازهٔ مأموریت گرفته شده‌اند.'
  return 'عکسی برای تأیید حضور در جلسه یا بازدید بارگذاری نشده است.'
}

export function liveFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.approval !== 'rejected')
}

/** What the report text, charts and quality score may use — confidential findings never go into the report body. */
export function reportFindings(findings: Finding[]): Finding[] {
  return liveFindings(findings).filter((f) => !f.confidential)
}

export function progressOf(state: InterviewState | null): { planned: number | null; actual: number | null } {
  const m = state?.topics.progress?.metrics ?? {}
  return { planned: m.planned ?? null, actual: m.actual ?? null }
}

function detailLine(f: Finding): string {
  const parts: string[] = []
  const d = f.details
  if (f.kind === 'issue') {
    if (d.cause) parts.push(`علت: ${d.cause}`)
    if (d.impact) parts.push(`اثر: ${d.impact}`)
    if (f.ownerText) parts.push(`طرف مسئول: ${f.ownerText}`)
    if (d.newDate) parts.push(`تاریخ رفع: ${/^\d{4}-/.test(d.newDate) ? shamsiLong(d.newDate) : d.newDate}`)
    if (d.needAction) parts.push(`اقدام: ${d.needAction}`)
  } else if (f.kind === 'risk') {
    if (d.impact) parts.push(`پیامد: ${d.impact}`)
    if (d.probability) parts.push(`احتمال: ${d.probability}`)
    if (d.mitigation) parts.push(`کنترل: ${d.mitigation}`)
  } else {
    if (f.ownerText) parts.push(`مسئول: ${f.ownerText}`)
    if (f.dueDate) parts.push(`موعد: ${shamsiLong(f.dueDate)}`)
  }
  return parts.join(' · ')
}

function bullet(f: Finding): string {
  const extra = detailLine(f)
  const sev = f.kind === 'issue' || f.kind === 'risk' ? ` [${PRIORITY_LABEL[f.severity]}]` : ''
  return `${f.title}${sev}${extra ? ' — ' + extra : ''}`
}

function listOf(findings: Finding[], kind: FindingKind): Finding[] {
  return reportFindings(findings).filter((f) => f.kind === kind).sort(bySeverity)
}

export function countsOf(findings: Finding[]): Record<FindingKind, number> {
  const counts = { issue: 0, risk: 0, action: 0, commitment: 0, decision: 0, progress: 0, observation: 0 } as Record<FindingKind, number>
  for (const f of reportFindings(findings)) counts[f.kind]++
  return counts
}

export function overallStatusOf(findings: Finding[], objectives: Objective[], progress: { planned: number | null; actual: number | null }): ReportContent['overallStatus'] {
  const live = reportFindings(findings).filter((f) => f.kind === 'issue' || f.kind === 'risk')
  const gap = progress.planned != null && progress.actual != null ? progress.planned - progress.actual : 0
  if (live.some((f) => f.severity === 'critical') || gap >= 15) return 'critical'
  if (live.some((f) => f.severity === 'high') || gap >= 5 || objectives.some((o) => o.status === 'not_achieved')) return 'attention'
  return 'on_track'
}

export const OVERALL_STATUS_LABEL: Record<ReportContent['overallStatus'], string> = {
  on_track: 'مطابق برنامه',
  attention: 'نیازمند توجه',
  critical: 'بحرانی',
}

/** One entry per answered line of the topic's notes ("label: value" for template answers, the sentence itself for free text). */
function noteLines(state: InterviewState | null, key: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const n of state?.topics[key]?.notes ?? []) {
    for (const raw of n.split('\n')) {
      const line = raw.trim()
      if (line.length < 3 || /^\d+\)/.test(line)) continue // numbered lines are the decisions/actions blocks → they have their own tables
      const m = line.match(/^([^:：]{1,80})[:：]\s*(.+)$/u)
      out.push({ label: m ? m[1].trim() : '', value: (m ? m[2] : line).trim() })
    }
  }
  return out
}

const NOTHING = /^(موردی|مشکلی|مانعی|ریسکی|ندارم|نداریم|ندارد|نبود|مورد دیگری|پیشنهادی ندارم|تصمیم یا توافق|مستندی ندارم|ثبت شد)/

const NUMERIC_ONLY = /^[\d٠-٩۰-۹.,٫\s٪%]+$/

function meaningfulNotes(state: InterviewState | null, key: string): string[] {
  return noteLines(state, key)
    .filter((l) => !NOTHING.test(l.value) && !NUMERIC_ONLY.test(l.value)) // metric lines are shown as numbers, «ندارم» carries nothing
    .map((l) => (l.label ? `${l.label}: ${l.value}` : l.value))
}

export function buildReport(input: ReportInput): ReportContent {
  const { mission, objectives, findings, evidence, state } = input
  const progress = progressOf(state)
  const counts = countsOf(findings)
  const overall = overallStatusOf(findings, objectives, progress)
  const achieved = objectives.filter((o) => o.status === 'achieved').length
  const partial = objectives.filter((o) => o.status === 'partial').length
  const days = missionDays(mission.startDate, mission.endDate)

  const issues = listOf(findings, 'issue')
  const risks = listOf(findings, 'risk')
  const actions = listOf(findings, 'action')
  const commitments = listOf(findings, 'commitment')
  const decisions = listOf(findings, 'decision')

  // ---- executive summary (facts only) --------------------------------------------------------------
  const sentences: string[] = []
  sentences.push(
    `مأموریت ${mission.code} با موضوع «${VISIT_TYPE_LABEL[mission.visitType]}» برای پروژه «${input.projectName}» در ${mission.destination || 'محل پروژه'} از ${shamsiLong(mission.startDate)} به مدت ${faNum(days)} روز توسط ${mission.requesterName} انجام شد.`,
  )
  if (progress.actual != null && progress.planned != null) {
    const gap = progress.planned - progress.actual
    sentences.push(
      `پیشرفت واقعی ${faNum(progress.actual)} درصد در برابر برنامه ${faNum(progress.planned)} درصد گزارش شد${gap > 0 ? ` (${faNum(gap)} واحد عقب‌تر از برنامه)` : gap < 0 ? ` (${faNum(-gap)} واحد جلوتر از برنامه)` : ' (مطابق برنامه)'}.`,
    )
  } else if (progress.actual != null) sentences.push(`پیشرفت واقعی ${faNum(progress.actual)} درصد گزارش شد.`)
  const found: string[] = []
  if (counts.issue) found.push(`${faNum(counts.issue)} مسئله`)
  if (counts.risk) found.push(`${faNum(counts.risk)} ریسک`)
  if (counts.action + counts.commitment) found.push(`${faNum(counts.action + counts.commitment)} اقدام/تعهد`)
  if (counts.decision) found.push(`${faNum(counts.decision)} تصمیم`)
  sentences.push(found.length ? `از بازدید ${found.join('، ')} استخراج شد.` : 'در این بازدید مسئله یا ریسک تازه‌ای گزارش نشد.')
  const topIssue = issues[0]
  if (topIssue && (topIssue.severity === 'high' || topIssue.severity === 'critical')) sentences.push(`مهم‌ترین موضوع: «${topIssue.title}»${topIssue.details.impact ? ` — ${topIssue.details.impact}` : ''}.`)
  if (objectives.length) sentences.push(`از ${faNum(objectives.length)} هدف مأموریت، ${faNum(achieved)} هدف کامل${partial ? ` و ${faNum(partial)} هدف نسبی` : ''} محقق شد.`)
  sentences.push(`وضعیت کلی پروژه از نگاه این بازدید: ${OVERALL_STATUS_LABEL[overall]}.`)
  const executiveSummary = sentences.join(' ')

  // ---- sections ------------------------------------------------------------------------------------
  const sections: ReportSection[] = []
  sections.push({
    key: 'mission',
    title: 'مشخصات مأموریت',
    body: '',
    bullets: [
      `کد مأموریت: ${mission.code}`,
      `بازدیدکننده: ${mission.requesterName}${mission.requesterPosition ? ` (${mission.requesterPosition})` : ''}`,
      `پروژه: ${input.projectName}`,
      `مقصد: ${mission.destination || '—'}${mission.locationDetail ? ` — ${mission.locationDetail}` : ''}`,
      `تاریخ: ${shamsiLong(mission.startDate)} تا ${shamsiLong(mission.endDate)} (${faNum(days)} روز)`,
      `نوع بازدید: ${VISIT_TYPE_LABEL[mission.visitType]}`,
      ...(mission.visitees.length ? [`ملاقات‌شوندگان: ${mission.visitees.map((v) => [v.name, v.org].filter(Boolean).join(' / ')).join('، ')}`] : []),
    ],
  })

  const overviewNotes = meaningfulNotes(state, 'overview')
  if (!state || state.plan.includes('progress')) sections.push({ key: 'progress', title: 'وضعیت پیشرفت پروژه', body: progressBody(progress, meaningfulNotes(state, 'progress')), bullets: undefined })

  const disciplines: [string, string][] = [['engineering', 'مهندسی'], ['procurement', 'خرید و تأمین'], ['construction', 'ساخت و اجرا'], ['quality', 'کیفیت'], ['hse', 'HSE']]
  const discBullets: string[] = []
  for (const [key, label] of disciplines) {
    if (!state?.plan.includes(key)) continue
    const notes = meaningfulNotes(state, key)
    const related = reportFindings(findings).filter((f) => (f.details._area ?? f.topicKey) === key && (f.kind === 'issue' || f.kind === 'risk'))
    const tp = state.topics[key]
    if (tp?.state === 'skipped') discBullets.push(`${label}: در این بازدید بررسی نشد (${tp.closedReason || 'رد شد'}).`)
    else if (notes.length) discBullets.push(`${label}: ${notes.join('؛ ')}`)
    else if (!related.length) discBullets.push(`${label}: مورد خاصی گزارش نشد.`)
    if (related.length && !notes.length) discBullets.push(`${label}: ${faNum(related.length)} موضوع ثبت شد (جزئیات در بخش مسائل و ریسک‌ها).`)
  }
  sections.push({
    key: 'findings',
    title: 'یافته‌های بازدید و وضعیت مهندسی، خرید، ساخت و اجرا',
    body: overviewNotes.join('؛ '),
    bullets: discBullets.length ? discBullets : undefined,
  })

  sections.push({ key: 'issues', title: 'مسائل و موانع', body: issues.length ? '' : 'مسئله یا مانع جدیدی گزارش نشد.', bullets: issues.map(bullet) })
  sections.push({ key: 'risks', title: 'ریسک‌ها', body: risks.length ? '' : 'ریسک جدیدی شناسایی نشد.', bullets: risks.map(bullet) })
  sections.push({ key: 'decisions', title: 'تصمیمات و توافقات', body: decisions.length ? '' : 'تصمیم یا توافق مشخصی ثبت نشد.', bullets: decisions.map(bullet) })
  sections.push({ key: 'commitments', title: 'تعهدات', body: commitments.length ? '' : 'تعهد مشخصی ثبت نشد.', bullets: commitments.map(bullet) })
  sections.push({ key: 'actions', title: 'اقدامات موردنیاز', body: actions.length ? '' : 'اقدام جدیدی ثبت نشد.', bullets: actions.map(bullet) })
  sections.push({
    key: 'objectives',
    title: 'میزان تحقق اهداف مأموریت',
    body: objectives.length ? `${faNum(achieved)} از ${faNum(objectives.length)} هدف کامل محقق شد.` : 'هدفی ثبت نشده بود.',
    bullets: objectives.map((o) => `${o.title} — ${OBJECTIVE_STATUS_LABEL[o.status]}${o.resultNote ? `: ${o.resultNote}` : ''}`),
  })

  const recommendations = buildRecommendations(input, { issues, risks, actions, commitments })
  sections.push({ key: 'recommendations', title: 'پیشنهادات', body: recommendations.length ? '' : 'پیشنهاد ویژه‌ای ثبت نشد.', bullets: recommendations })

  sections.push({
    key: 'evidence',
    title: 'مستندات و تصاویر',
    body: [evidence.length ? `${faNum(evidence.length)} مستند به این گزارش پیوست شده است.` : 'مستندی پیوست نشده است.', attendanceLine(evidence, input.mission)].filter(Boolean).join(' '),
    bullets: evidence.map((e) => `${e.title || 'بدون عنوان'}${e.topicKey ? ` (${topicTitle(input.set, e.topicKey)})` : ''}`),
  })

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy ?? 'rules',
    executiveSummary,
    overallStatus: overall,
    progress,
    sections,
    objectives: objectives.map((o) => ({ id: o.id, title: o.title, status: o.status, note: o.resultNote })),
    recommendations,
    counts,
  }
}

function progressBody(p: { planned: number | null; actual: number | null }, notes: string[]): string {
  const head =
    p.actual != null && p.planned != null
      ? `پیشرفت واقعی ${faNum(p.actual)} درصد، برنامه مصوب ${faNum(p.planned)} درصد.`
      : p.actual != null
        ? `پیشرفت واقعی ${faNum(p.actual)} درصد (عدد برنامه‌ای اعلام نشد).`
        : 'عدد پیشرفت اعلام نشد.'
  return [head, ...notes].join(' ؛ ').replace(/^(.*?\.) ؛ /, '$1 ')
}

function buildRecommendations(
  input: ReportInput,
  g: { issues: Finding[]; risks: Finding[]; actions: Finding[]; commitments: Finding[] },
): string[] {
  const out: string[] = []
  for (const f of g.issues.filter((x) => x.severity === 'critical' || x.severity === 'high')) {
    if (!f.ownerText || !f.dueDate) out.push(`برای «${f.title}» مسئول پیگیری و موعد مشخص تعیین شود.`)
    else out.push(`پیگیری «${f.title}» توسط ${f.ownerText} تا ${shamsiLong(f.dueDate)} در جلسه مدیریت پروژه رصد شود.`)
  }
  for (const f of g.risks.filter((x) => x.severity === 'critical' || x.severity === 'high')) out.push(`ریسک «${f.title}» در سامانه مدیریت ریسک ثبت و برنامه کنترل آن تدوین شود.`)
  for (const f of g.commitments.filter((x) => x.dueDate)) out.push(`تعهد ${f.ownerText || 'طرف مقابل'}: «${f.title}» — موعد ${shamsiLong(f.dueDate)} پیگیری شود.`)
  for (const o of input.objectives.filter((x) => x.status === 'not_achieved' || x.status === 'follow_up' || x.status === 'partial')) out.push(`هدف «${o.title}» کامل نشده است؛ برنامه پیگیری یا بازدید تکمیلی تعیین شود.`)
  const mine = noteLines(input.state, 'actions').filter((l) => /^پیشنهاد/.test(l.label) && !NOTHING.test(l.value)).map((l) => l.value)
  for (const n of mine.slice(0, 2)) out.push(n)
  return [...new Set(out)].slice(0, 10)
}
