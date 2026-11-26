import { FORM_BY_KEY } from './formCatalog'
import { computeMetrics } from './forms'
import type { FormMap, Report, ReportLine } from '../types'

/**
 * Executed quantities are entered only in the site minutes (صورتجلسات کارگاهی). This turns each minute's counters
 * (metres strung, joints welded, metres backfilled …) into work-report rows on the price-list activity the project mapped
 * them to («تنظیمات ← اتصال فرم فنی به فعالیت»), so physical progress, cumulative figures and the S-curve read them like
 * any daily work report. Approved rows count as approved, rows still awaiting supervision as registered; rejected or
 * returned rows count for nothing. A minute whose figures an older work report already copied in (pre-fill), or whose
 * activity an older work report of the same day and front already carries, is skipped, so nothing is counted twice. Pure: no row is stored.
 */
export function formWorkRows(reports: Report[], lines: ReportLine[], maps: FormMap[]): { reports: Report[]; lines: ReportLine[] } {
  const copied = new Set(lines.map((l) => l.sourceReportId).filter(Boolean) as string[])
  // rows typed straight into an older daily work report (before quantities moved to the site minutes) win for their day,
  // front and activity, so the same work is never counted twice
  const workOf = new Map(reports.filter((r) => r.formKey === 'work' && r.status !== 'rejected').map((r) => [r.id, r]))
  const typed = new Set(lines.filter((l) => l.activityId && l.status !== 'rejected' && workOf.has(l.reportId)).map((l) => { const w = workOf.get(l.reportId)!; return `${w.reportDate}|${w.front ?? ''}|${l.activityId}` }))
  const byReport = new Map<string, ReportLine[]>()
  for (const l of lines) { const a = byReport.get(l.reportId); if (a) a.push(l); else byReport.set(l.reportId, [l]) }
  const outR: Report[] = [], outL: ReportLine[] = []
  for (const r of reports) {
    if (r.formKey === 'work' || copied.has(r.id)) continue
    const f = FORM_BY_KEY[r.formKey]; if (!f?.metrics.length) continue
    const mine = maps.filter((m) => m.formKey === r.formKey); if (!mine.length) continue
    const ls = byReport.get(r.id) ?? []
    const approved = computeMetrics(f, ls.filter((l) => l.status === 'approved')), pending = computeMetrics(f, ls.filter((l) => l.status === 'pending'))
    const id = `form:${r.id}`
    let n = 0
    const add = (res: typeof approved, status: 'approved' | 'pending') => {
      for (const mr of res) {
        const map = mine.find((x) => x.metricKey === mr.metric.key && (x.groupValue === mr.group || x.groupValue === ''))
        if (!map || !(mr.value > 0) || typed.has(`${r.reportDate}|${r.front ?? ''}|${map.activityId}`)) continue
        n += 1
        outL.push({ id: `${id}:${status}:${mr.metric.key}:${mr.group}`, reportId: id, lineNo: n, activityId: map.activityId, qty: mr.value, kmFrom: null, kmTo: null, location: '', note: `${f.title} ${r.reportNo}${mr.group ? ` (${mr.group})` : ''}`, detail: { fromForm: r.formKey }, status, approvedQty: status === 'approved' ? mr.value : null, reviewNote: '', sourceReportId: r.id })
      }
    }
    add(approved, 'approved'); add(pending, 'pending')
    if (n) outR.push({ ...r, id, formKey: 'work' })
  }
  return { reports: outR, lines: outL }
}
