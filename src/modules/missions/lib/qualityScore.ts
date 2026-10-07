import type { Evidence, Finding, InterviewState, Mission, Objective, QualityCriterion, ReportContent } from '../types'
import { reportFindings, progressOf } from './reportBuilder'
import { wordCount } from './fa'
import { ATTENDANCE_TEXT, attendanceOf, attendanceScore } from './attendance'

/**
 * Report Quality Score (0-100). Nine weighted criteria, each scored 0-100 from what the interview and
 * report actually contain, with a Persian hint on how to improve any weak one. Fully deterministic so the
 * same report always gets the same score and a manager can see exactly why. Also feeds the
 * "gaps before you send it" checklist (reportGaps).
 */

export interface QualityInput {
  mission: Mission
  objectives: Objective[]
  findings: Finding[]
  evidence: Evidence[]
  state: InterviewState | null
  content: ReportContent
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function slotCompleteness(f: Finding): number {
  const need = f.kind === 'issue' ? ['cause', 'impact', 'party', 'newDate'] : f.kind === 'risk' ? ['impact', 'probability', 'mitigation'] : ['owner', 'due']
  const filled = need.filter((s) => {
    if (s === 'owner' || s === 'party') return !!(f.details[s] || f.ownerText)
    if (s === 'due' || s === 'newDate') return !!(f.details[s] || f.dueDate)
    return !!f.details[s]
  }).length
  return filled / need.length
}

export function scoreReport(input: QualityInput): { score: number; criteria: QualityCriterion[] } {
  const { objectives, evidence, state, content } = input
  const findings = reportFindings(input.findings)
  const issues = findings.filter((f) => f.kind === 'issue')
  const risks = findings.filter((f) => f.kind === 'risk')
  const acts = findings.filter((f) => f.kind === 'action' || f.kind === 'commitment')
  const progress = progressOf(state)
  const plan = state?.plan ?? []

  // 1. completeness — topics closed (not skipped) out of the plan
  const closed = plan.filter((k) => state?.topics[k]?.state === 'complete').length
  const skipped = plan.filter((k) => state?.topics[k]?.state === 'skipped').length
  const completeness = plan.length ? (closed / plan.length) * 100 - skipped * 4 : 0

  // 2. objectives coverage
  const reviewed = objectives.filter((o) => o.status !== 'pending').length
  const objectivesScore = objectives.length ? (reviewed / objectives.length) * 100 : 60

  // 3. progress report quality
  const progressScore = state && !state.plan.includes('progress') ? 100 : progress.actual != null && progress.planned != null ? 100 : progress.actual != null ? 65 : (state?.topics.progress?.notes.length ?? 0) > 0 ? 35 : 0

  // 4/5. issue & risk identification quality
  const thorough = plan.length > 0 && closed >= Math.ceil(plan.length * 0.8)
  const issueScore = issues.length ? (issues.reduce((s, f) => s + slotCompleteness(f), 0) / issues.length) * 100 : thorough ? 75 : 45
  const riskScore = risks.length ? (risks.reduce((s, f) => s + slotCompleteness(f), 0) / risks.length) * 100 : thorough ? 70 : 40

  // 6. actions defined
  const actionsScore = acts.length ? 100 : issues.length + risks.length > 0 ? 25 : 70

  // 7. owner & due on actions/commitments and serious issues
  const accountable = findings.filter((f) => f.kind === 'action' || f.kind === 'commitment' || ((f.kind === 'issue' || f.kind === 'risk') && (f.severity === 'high' || f.severity === 'critical')))
  const ownerDue = accountable.length ? (accountable.filter((f) => !!f.ownerText && !!f.dueDate).length / accountable.length) * 100 : 70

  // 8. evidence
  const evidenceScore = evidence.length >= 3 ? 100 : evidence.length === 2 ? 85 : evidence.length === 1 ? 65 : 20

  // 9. attendance proof: a photo of the meeting / site taken during the mission
  const attendance = attendanceOf(evidence, input.mission)
  const attendanceScoreValue = attendanceScore(attendance)

  // 10. management summary quality
  const summaryLen = content.executiveSummary.length
  const summaryScore = clamp(
    (summaryLen >= 250 ? 40 : (summaryLen / 250) * 40) +
      (/\d/.test(content.executiveSummary) ? 15 : 0) +
      (content.recommendations.length ? 25 : 0) +
      (wordCount(state?.topics.overview?.notes.join(' ') ?? '') >= 8 ? 20 : 8),
  )

  const c = (key: string, label: string, weight: number, score: number, hint: string, topicKey?: string): QualityCriterion => ({ key, label, weight, score: clamp(score), hint, topicKey })
  const criteria: QualityCriterion[] = [
    c('completeness', 'کامل بودن گزارش', 13, completeness, 'موضوع‌های باز یا ردشده را تکمیل کنید.', plan.find((k) => state?.topics[k]?.state !== 'complete')),
    c('objectives', 'پوشش اهداف مأموریت', 13, objectivesScore, 'وضعیت تحقق همه اهداف را مشخص کنید.', 'objectives'),
    c('progress', 'کیفیت گزارش پیشرفت', 9, progressScore, 'درصد پیشرفت واقعی و برنامه‌ای را هر دو بگویید.', 'progress'),
    c('issues', 'شناسایی و تکمیل Issueها', 9, issueScore, 'برای هر مسئله علت، اثر، طرف مسئول و تاریخ رفع را مشخص کنید.', issues[0]?.topicKey ?? 'issues_risks'),
    c('risks', 'شناسایی و تکمیل ریسک‌ها', 9, riskScore, 'برای هر ریسک پیامد، احتمال و راهکار کنترل را بنویسید.', risks[0]?.topicKey ?? 'issues_risks'),
    c('actions', 'مشخص بودن اقدامات', 9, actionsScore, 'برای مسائل و ریسک‌های ثبت‌شده اقدام بعدی تعریف کنید.', 'actions'),
    c('ownerDue', 'مشخص بودن مسئول و موعد', 9, ownerDue, 'اقدام‌ها، تعهدها و مسائل مهم باید مسئول و موعد داشته باشند.', 'actions'),
    c('evidence', 'شواهد و مستندات', 10, evidenceScore, 'حداقل یک عکس یا صورتجلسه پیوست کنید.', 'evidence'),
    c('attendance', 'عکس حضور در جلسه یا بازدید', 10, attendanceScoreValue, ATTENDANCE_TEXT[attendance.status === 'verified' ? 'none' : attendance.status], 'evidence'),
    c('summary', 'کیفیت جمع‌بندی مدیریتی', 9, summaryScore, 'در جمع‌بندی کلی، وضعیت، عدد و پیشنهاد مشخص بیان کنید.', 'overview'),
  ]
  const total = criteria.reduce((s, x) => s + (x.score * x.weight) / 100, 0)
  return { score: clamp(total), criteria }
}

export interface ReportGap {
  severity: 'blocker' | 'warning'
  text: string
  topicKey?: string
}

/** What is still missing before the report should be sent to the manager. */
export function reportGaps(input: QualityInput, mandatoryTopics: string[]): ReportGap[] {
  const gaps: ReportGap[] = []
  const state = input.state
  for (const k of mandatoryTopics) {
    const tp = state?.topics[k]
    if (tp?.state === 'open') gaps.push({ severity: 'blocker', text: 'موضوع اجباری هنوز تکمیل نشده است.', topicKey: k })
    else if (tp?.state === 'skipped') gaps.push({ severity: 'warning', text: 'موضوع اجباری رد شده است.', topicKey: k })
  }
  for (const o of input.objectives.filter((x) => x.status === 'pending')) gaps.push({ severity: 'blocker', text: `وضعیت تحقق هدف «${o.title}» مشخص نیست.`, topicKey: 'objectives' })
  for (const f of reportFindings(input.findings)) {
    if ((f.kind === 'action' || f.kind === 'commitment') && (!f.ownerText || !f.dueDate)) {
      gaps.push({ severity: 'warning', text: `«${f.title}» ${!f.ownerText ? 'مسئول' : 'موعد'} ندارد.`, topicKey: f.topicKey })
    }
    if ((f.kind === 'issue' || f.kind === 'risk') && (f.severity === 'high' || f.severity === 'critical') && !f.ownerText) {
      gaps.push({ severity: 'warning', text: `مسئله/ریسک مهم «${f.title}» طرف مسئول ندارد.`, topicKey: f.topicKey })
    }
  }
  if (!input.evidence.length) gaps.push({ severity: 'warning', text: 'هیچ مستند یا عکسی پیوست نشده است.', topicKey: 'evidence' })
  const att = attendanceOf(input.evidence, input.mission)
  if (att.status === 'none' || att.status === 'outside') gaps.push({ severity: 'warning', text: ATTENDANCE_TEXT[att.status], topicKey: 'evidence' })
  const prog = progressOf(state)
  if (state?.plan.includes('progress') && prog.actual == null) gaps.push({ severity: 'warning', text: 'درصد پیشرفت پروژه اعلام نشده است.', topicKey: 'progress' })
  return gaps
}
