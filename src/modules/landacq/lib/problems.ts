import type { Analysis } from './kpis'
import { fmtKmRange } from './dates'
import { faNum, fmtDate, fmtDuration } from './fa'
import { STAGE_LABEL } from './labels'
import { currentStage, overdueStages, stageDelay } from './workflow'

export type ProblemSeverity = 'critical' | 'high' | 'medium'
export interface Reason {
  key: string
  text: string
  /** 'bad' = a real problem now; 'warn' = trending towards one. */
  level: 'bad' | 'warn'
}
export interface Draft {
  severity: ProblemSeverity
  description: string
  /** Parameters for la_transfer. */
  params: Record<string, unknown>
}
export interface ProblemReport {
  reasons: Reason[]
  issue: Draft | null
  risk: Draft | null
}

const RANK: Record<ProblemSeverity, number> = { critical: 3, high: 2, medium: 1 }

/**
 * Turns what the module already knows about a parcel (missed legal deadlines, a court stay, late steps, refusing owners, a delay forecast…)
 * into a ready-to-file Issue and Risk: severity, a written description with the facts and the suggested actions. Nothing is sent from here.
 */
export function problemsOf(a: Analysis, today: string): ProblemReport {
  const p = a.parcel
  if (a.released && !a.stay && !a.clocks.some((c) => c.status === 'overdue')) return { reasons: [], issue: null, risk: null }
  const reasons: Reason[] = []
  const actions = new Set<string>()
  let compliance = false

  for (const c of a.clocks) {
    if (c.status === 'overdue') {
      if (c.key === 'art9_compliance') compliance = true
      const late = c.key === 'art9_stay' || c.key === 'art9_stay_filed' || c.key === 'art9_compliance' ? '' : ` (${faNum(-c.daysLeft)} روز از مهلت ${fmtDate(c.due)} گذشته)`
      reasons.push({ key: `legal:${c.key}`, level: 'bad', text: `${c.article}: ${c.title}${late}` })
      actions.add(c.consequence)
    } else if (c.status === 'due_soon') {
      reasons.push({ key: `legal:${c.key}`, level: 'warn', text: `${c.article}: ${c.title}، ${faNum(c.daysLeft)} روز تا مهلت ${fmtDate(c.due)}` })
      actions.add(`پیش از ${fmtDate(c.due)}: ${c.title}`)
    }
  }
  const ea = a.early
  if (ea.state === 'action_required' && ea.startBy) {
    reasons.push({ key: 'early', level: 'bad', text: `تحصیل باید از ${fmtDate(ea.startBy)} شروع می‌شد و هنوز شروع نشده است (فعالیت اجرایی ${fmtDate(ea.needBy)} به این قطعه می‌رسد)` })
    actions.add('شروع فوری تحصیل یا استفاده از مسیر قانونی تسریع‌شده')
  } else if (ea.state === 'delay_expected' && ea.delayDays > 0) {
    reasons.push({ key: 'delay', level: ea.delayDays > 30 ? 'bad' : 'warn', text: `آزادسازی با روند فعلی حدود ${fmtDuration(ea.delayDays)} دیرتر از نیاز برنامه (${fmtDate(ea.needBy)}) پیش‌بینی می‌شود` })
    actions.add('تسریع مراحل تحصیل و هماهنگی با برنامه اجرایی')
  }
  for (const s of overdueStages(p, today)) {
    const d = stageDelay(s, today)
    reasons.push({ key: `stage:${s.key}`, level: d > 30 ? 'bad' : 'warn', text: `مرحلهٔ «${STAGE_LABEL[s.key]}» ${fmtDuration(d)} از تاریخ برنامه‌ای عقب است` })
  }
  const refusing = p.owners.filter((o) => o.agreement === 'refused' || o.agreement === 'legal')
  if (refusing.length) {
    reasons.push({ key: 'owners', level: 'bad', text: `${faNum(refusing.length)} مالک مخالف یا در پیگیری قانونی: ${refusing.map((o) => o.name).filter(Boolean).join('، ') || 'نامشخص'}` })
    actions.add('مذاکرهٔ مجدد یا ارجاع به هیئت کارشناسی / تودیع طبق ماده ۸')
  }
  if (p.acquisitionRoute === 'dispute' || (p.disputeProbability >= 60 && !a.released)) reasons.push({ key: 'dispute', level: 'warn', text: `احتمال اختلاف ${faNum(p.disputeProbability)}٪${p.acquisitionRoute === 'dispute' ? ' و مسیر «اختلاف / بحرانی»' : ''}` })
  if (p.ownershipClass === 'unknown' && !a.released) reasons.push({ key: 'unknown', level: 'warn', text: 'مالکیت زمین هنوز مشخص نشده است' })

  const bad = reasons.filter((r) => r.level === 'bad')
  const isProblem = bad.length > 0 || reasons.length >= 2
  const crit = a.crit.level
  const sev: ProblemSeverity = a.stay || compliance || crit === 'critical' ? 'critical' : bad.length > 0 || crit === 'high' ? 'high' : 'medium'
  const head = `قطعهٔ ${p.code}${p.title ? ` (${p.title})` : ''}، ${fmtKmRange(p.kmStart, p.kmEnd)}`
  const cur = currentStage(p)
  const status = `وضعیت فعلی: ${a.released ? (a.stay ? 'تصرف شده ولی عملیات متوقف است' : 'آزاد برای اجرا') : cur ? `مرحلهٔ «${STAGE_LABEL[cur.key]}»` : '—'} · Criticality ${faNum(a.crit.score)} از ۱۰۰ (${crit}) · احتمال تأخیر ${faNum(a.forecast.probability)}٪`
  const list = reasons.map((r, i) => `${faNum(i + 1)}. ${r.text}`).join('\n')
  const todo = [...actions].map((x, i) => `${faNum(i + 1)}. ${x}`).join('\n')

  const issueDesc = `${head}\n\nموارد شناسایی‌شده:\n${list}\n\n${status}${todo ? `\n\nاقدام‌های پیشنهادی:\n${todo}` : ''}`
  const delay = Math.max(ea.delayDays, a.forecast.expectedDelayDays)
  const riskDesc = `ریسک تأخیر در آزادسازی زمین مسیر: ${head}\n\nعوامل:\n${list}\n\n${status}\n\nپیامد محتمل: ${delay > 0 ? `تأخیر حدود ${fmtDuration(delay)} در رسیدن فعالیت‌های اجرایی به این قطعه` : 'توقف یا تأخیر فعالیت‌های اجرایی در این قطعه'}${a.stay ? '؛ عملیات هم‌اکنون به دستور دادگاه متوقف است' : ''}.${todo ? `\n\nواکنش پیشنهادی:\n${todo}` : ''}`
  const probability = a.stay || compliance ? 5 : Math.min(5, Math.max(2, Math.ceil(a.forecast.probability / 20)))
  const impact = a.stay ? 5 : delay >= 90 ? 5 : delay >= 45 ? 4 : delay >= 20 ? 3 : 2
  const needsRisk = a.stay || compliance || crit === 'critical' || crit === 'high' || bad.some((r) => r.key.startsWith('legal:')) || p.acquisitionRoute === 'dispute'

  return {
    reasons,
    issue: isProblem ? { severity: sev, description: issueDesc, params: { description: issueDesc, severity: sev === 'medium' ? 'medium' : sev, deadline_days: sev === 'critical' ? 3 : sev === 'high' ? 7 : 14 } } : null,
    risk: needsRisk && isProblem ? { severity: sev, description: riskDesc, params: { description: riskDesc, severity: sev, probability, impact } } : null,
  }
}

export const SEVERITY_LABEL: Record<ProblemSeverity, string> = { critical: 'بحرانی', high: 'زیاد', medium: 'متوسط' }
export const SEVERITY_RANK = RANK
