import type { Activity, DetectedGap, ExSettings, Report, ReportLine, ReportResource } from '../types'
import { FORMS, FORM_BY_KEY } from './formCatalog'
import { inconsistenciesForReport, missingForReport } from './forms'
import { cumulative, isRegistered, effectiveBase } from './progress'
import type { Baseline, BaselineLine } from '../types'
import { addDays, daysBetween, jalaliText, periodsBetween, workingDays } from './periods'

export interface CompletenessInput {
  today: string; settings: ExSettings; reports: Report[]; lines: ReportLine[]; resources: ReportResource[]; activities: Activity[]; baselines: Baseline[]; blines: BaselineLine[]
}

const fp = (...p: (string | number)[]) => p.join('|')

/**
 * Finds what is missing — never invents data. Five families:
 * 1. a daily work report that was expected (working day × expected front) and never arrived,
 * 2. a report that lacks required fields / rows / resources,
 * 3. contradictions (a cumulative above the base quantity, km range reversed, a drop caused by an earlier rejected row),
 * 4. reports sent but not reviewed in time, or sent back and not corrected,
 * 5. periods (week / month) that ended while some of their reports are still not approved.
 */
export function detectGaps(c: CompletenessInput): DetectedGap[] {
  const out: DetectedGap[] = []
  const { today, settings } = c
  const due = (from: string) => addDays(from, settings.gapDueDays)
  const linesBy = new Map<string, ReportLine[]>()
  for (const l of c.lines) { const a = linesBy.get(l.reportId); if (a) a.push(l); else linesBy.set(l.reportId, [l]) }
  const resBy = new Map<string, ReportResource[]>()
  for (const r of c.resources) { const a = resBy.get(r.reportId); if (a) a.push(r); else resBy.set(r.reportId, [r]) }
  const acts = new Map(c.activities.map((a) => [a.id, a]))

  // 1. expected work reports
  const first = settings.projectStart || c.reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()[0]
  if (first && settings.expectedFronts.length) {
    const have = new Set(c.reports.filter((r) => r.formKey === 'work' && r.status !== 'rejected').map((r) => `${r.reportDate}|${r.front}`))
    const days = workingDays(first, addDays(today, -1), settings.workDays).slice(-45)
    for (const d of days) for (const f of settings.expectedFronts) {
      if (have.has(`${d}|${f}`)) continue
      out.push({ fingerprint: fp('missing', d, f), kind: 'missing_report', formKey: 'work', periodKey: d, front: f, subject: `گزارش کارکرد روزانه ${jalaliText(d)} — ${f}`, existing: { date: d, front: f }, missing: ['گزارش کارکرد روزانه'], dueDate: due(d) })
    }
  }

  // 2 + 3 per report
  for (const r of c.reports) {
    if (r.status === 'rejected' || r.completionOf && r.status === 'incomplete') continue
    const form = r.formKey === 'work' ? null : FORM_BY_KEY[r.formKey]
    if (r.formKey !== 'work' && !form) continue
    const ls = linesBy.get(r.id) ?? []
    const title = form ? form.title : 'گزارش کارکرد روزانه'
    if (r.status !== 'draft') {
      const miss = missingForReport(r, ls, form, resBy.get(r.id) ?? [])
      if (miss.length) out.push({ fingerprint: fp('inc', r.id), kind: 'incomplete', formKey: r.formKey, periodKey: r.reportDate, front: r.front, subject: `${title} ${r.reportNo} — ${jalaliText(r.reportDate)}`, existing: { reportNo: r.reportNo, status: r.status, lines: ls.length }, missing: miss, dueDate: due(r.reportDate), reportId: r.id })
    }
    if (r.formKey === 'work') {
      const bad = inconsistenciesForReport(ls, acts)
      if (bad.length) out.push({ fingerprint: fp('bad', r.id), kind: 'inconsistent', formKey: 'work', periodKey: r.reportDate, front: r.front, subject: `${title} ${r.reportNo} — ناسازگاری`, existing: { reportNo: r.reportNo }, missing: bad, dueDate: due(r.reportDate), reportId: r.id })
    }
  }

  // 3b. cumulative above base, and cumulative that dropped because an earlier row was rejected / returned
  const reg = cumulative(c.reports, c.lines, { until: today, mode: 'registered' })
  for (const a of c.activities) {
    if (a.approval !== 'approved' || !a.active) continue
    const base = effectiveBase(a, c.baselines, c.blines, today).baseQty
    const cum = reg.get(a.id) ?? 0
    if (base > 0 && cum > base + 1e-9) out.push({ fingerprint: fp('over', a.id), kind: 'inconsistent', formKey: 'work', periodKey: '', front: a.front, subject: `${a.itemNo} ${a.title} — کارکرد تجمعی بیش از مقدار مبنا`, existing: { cumulative: cum, base }, missing: [`کارکرد تجمعی ${cum} از مقدار مبنا ${base} ${a.unit} بیشتر است؛ تغییر مقدار مبنا یا اصلاح گزارش لازم است`], dueDate: due(today) })
  }
  const wr = new Map(c.reports.filter((r) => r.formKey === 'work').map((r) => [r.id, r]))
  const badLines = c.lines.filter((l) => (l.status === 'rejected' || l.status === 'returned') && l.activityId && wr.has(l.reportId))
  for (const l of badLines) {
    const r = wr.get(l.reportId)!
    const later = c.lines.some((x) => x.activityId === l.activityId && x.id !== l.id && isRegistered(wr.get(x.reportId) ?? ({ status: 'draft' } as Report)) && (wr.get(x.reportId)?.reportDate ?? '') > r.reportDate)
    if (later) { const a = acts.get(l.activityId!); out.push({ fingerprint: fp('drop', l.id), kind: 'inconsistent', formKey: 'work', periodKey: r.reportDate, front: r.front, subject: `${a?.itemNo ?? ''} ${a?.title ?? ''} — کارکرد تجمعی روز ${jalaliText(r.reportDate)} با گزارش‌های بعدی نمی‌خواند`, existing: { reportNo: r.reportNo }, missing: ['ردیف این روز رد/برگردانده شده ولی گزارش‌های بعدی ادامه یافته‌اند؛ ردیف باید اصلاح و دوباره ارسال شود'], dueDate: due(today), reportId: r.id }) }
  }

  // 4. not reviewed / not corrected
  for (const r of c.reports) {
    if (r.status === 'submitted' || r.status === 'partially_approved') {
      const since = (r.submittedAt ?? r.createdAt).slice(0, 10)
      if (daysBetween(since, today) >= settings.reviewDays) out.push({ fingerprint: fp('unrev', r.id), kind: 'unreviewed', formKey: r.formKey, periodKey: r.reportDate, front: r.front, subject: `${r.formKey === 'work' ? 'گزارش کارکرد' : FORM_BY_KEY[r.formKey]?.title ?? r.formKey} ${r.reportNo} — ${r.status === 'submitted' ? 'بررسی نشده' : 'ردیف‌های باقی‌مانده بررسی نشده'}`, existing: { sentOn: since }, missing: ['بررسی و تصمیم دستگاه نظارت'], dueDate: addDays(since, settings.reviewDays), reportId: r.id })
    }
    if (r.status === 'returned' && daysBetween((r.reviewedAt ?? r.createdAt).slice(0, 10), today) >= settings.reviewDays) out.push({ fingerprint: fp('ret', r.id), kind: 'unreviewed', formKey: r.formKey, periodKey: r.reportDate, front: r.front, subject: `${r.reportNo} — برگشت‌خورده و اصلاح‌نشده`, existing: { returnedOn: (r.reviewedAt ?? '').slice(0, 10) }, missing: ['اصلاح و ارسال مجدد توسط پیمانکار'], dueDate: due((r.reviewedAt ?? today).slice(0, 10)), reportId: r.id })
  }

  // 5. periods ended with open reports
  const dates = c.reports.map((r) => r.reportDate).sort()
  if (dates.length) {
    for (const kind of ['week', 'month'] as const) {
      for (const p of periodsBetween(kind, dates[0], today, settings.weekStart)) {
        if (p.to >= today) continue
        const inP = c.reports.filter((r) => r.reportDate >= p.from && r.reportDate <= p.to && r.status !== 'rejected')
        const open = inP.filter((r) => r.status !== 'approved')
        if (open.length) out.push({ fingerprint: fp('period', p.key), kind: 'period_open', formKey: '', periodKey: p.key, front: '', subject: `گزارش ${kind === 'week' ? 'هفتگی' : 'ماهانه'} — ${p.label}`, existing: { reports: inP.length, open: open.length }, missing: [`${open.length} گزارش از ${inP.length} هنوز تأیید نهایی نشده است`], dueDate: due(p.to) })
      }
    }
  }

  // 6. paper-form content that is not built (static, from the catalog)
  for (const f of FORMS) for (const [i, nb] of (f.notBuilt ?? []).entries()) out.push({ fingerprint: fp('form', f.key, i), kind: 'form_missing', formKey: f.key, periodKey: '', front: '', subject: `${f.title} — ${nb}`, existing: { sheet: f.sheet }, missing: [nb], dueDate: null })
  return out
}
