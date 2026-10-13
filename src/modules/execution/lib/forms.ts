import type { Activity, Report, ReportLine, ReportResource } from '../types'
import type { FormDef, MetricDef } from './formCatalog'
import { isRegistered } from './progress'

const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[٫]/g, '.')); return Number.isFinite(n) ? n : 0 }
export const filled = (v: unknown): boolean => str(v) !== ''

export interface MetricResult { metric: MetricDef; group: string; value: number }

/** The counters printed at the bottom of a paper form, computed from its lines. */
export function computeMetrics(form: FormDef, lines: Pick<ReportLine, 'detail'>[]): MetricResult[] {
  const out: MetricResult[] = []
  for (const m of form.metrics) {
    const rows = lines.filter((l) => !m.where || str(l.detail[m.where.field]) === m.where.eq)
    const groups = new Map<string, number>()
    for (const l of rows) {
      const g = m.groupBy ? str(l.detail[m.groupBy]) || '—' : ''
      const v = m.op === 'count' ? 1 : (m.fields ?? []).reduce((s, k) => s + num(l.detail[k]), 0)
      groups.set(g, (groups.get(g) ?? 0) + v)
    }
    if (!groups.size) groups.set('', 0)
    for (const [group, value] of groups) out.push({ metric: m, group, value })
  }
  return out
}

export interface MetricRow { metric: MetricDef; group: string; today: number; prior: number; total: number }
/** Today / until-now / total for a technical form: «تا امروز» comes from the other registered reports of the same form on or before the date. */
export function cumulativeMetrics(form: FormDef, current: Report, currentLines: ReportLine[], reports: Report[], lines: ReportLine[]): MetricRow[] {
  const today = computeMetrics(form, currentLines)
  const ids = new Set(reports.filter((r) => r.projectId === current.projectId && r.formKey === form.key && isRegistered(r) && r.id !== current.id && r.reportDate <= current.reportDate).map((r) => r.id))
  const prior = computeMetrics(form, lines.filter((l) => ids.has(l.reportId)))
  const key = (r: MetricResult) => `${r.metric.key}|${r.group}`
  const pm = new Map(prior.map((r) => [key(r), r.value]))
  const seen = new Set<string>(), out: MetricRow[] = []
  for (const t of today) { seen.add(key(t)); const p = pm.get(key(t)) ?? 0; out.push({ metric: t.metric, group: t.group, today: t.value, prior: p, total: p + t.value }) }
  for (const p of prior) if (!seen.has(key(p)) && p.value > 0) out.push({ metric: p.metric, group: p.group, today: 0, prior: p.value, total: p.value })
  return out
}

/** What a report still lacks before it is complete — shown inline, enforced on send, and used by the completeness check. */
export function missingForReport(report: Pick<Report, 'formKey' | 'front' | 'contractorOrgId' | 'data'>, lines: ReportLine[], form: FormDef | null, resources: ReportResource[] = []): string[] {
  const miss: string[] = []
  if (!report.contractorOrgId) miss.push('پیمانکار')
  if (!filled(report.front)) miss.push('جبهه کاری')
  if (!filled(report.data.weather)) miss.push('وضعیت آب‌وهوا')
  if (!form) {
    if (!lines.length) miss.push('جدول کارکرد (حداقل یک ردیف)')
    lines.forEach((l, i) => { if (!l.activityId) miss.push(`ردیف ${i + 1}: فعالیت`); if (!(l.qty > 0)) miss.push(`ردیف ${i + 1}: مقدار کارکرد`) })
    if (!resources.some((r) => r.kind === 'man' && (r.totalQty > 0 || r.activeQty > 0 || r.idleQty > 0))) miss.push('نیروی انسانی')
    return miss
  }
  for (const h of form.header) if (h.req && !filled(report.data[h.key])) miss.push(h.label)
  if (!form.noLines && !lines.length) miss.push('جدول ردیف‌ها (حداقل یک ردیف)')
  lines.forEach((l, i) => { for (const c of form.columns) if (c.req && !filled(l.detail[c.key])) miss.push(`ردیف ${i + 1}: ${c.label}`) })
  return miss
}

/** Internal contradictions inside one work report (the cross-report ones are found by the completeness check). */
export function inconsistenciesForReport(lines: ReportLine[], acts: Map<string, Activity>): string[] {
  const out: string[] = []
  lines.forEach((l, i) => {
    if (l.qty < 0) out.push(`ردیف ${i + 1}: مقدار منفی`)
    if (l.kmFrom != null && l.kmTo != null && l.kmFrom > l.kmTo) out.push(`ردیف ${i + 1}: کیلومتر شروع بزرگ‌تر از پایان است`)
    const a = l.activityId ? acts.get(l.activityId) : undefined
    if (a && a.kmFrom != null && a.kmTo != null && l.kmFrom != null && (l.kmFrom < a.kmFrom - 1e-9 || (l.kmTo ?? l.kmFrom) > a.kmTo + 1e-9)) out.push(`ردیف ${i + 1}: محدودهٔ کیلومتری بیرون از محدودهٔ فعالیت (${a.kmFrom}–${a.kmTo}) است`)
  })
  return out
}
