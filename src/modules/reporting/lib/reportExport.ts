import type { ReportPayload } from '../types'
import { getWidget } from './widgetRegistry'
import type { EvidenceReport } from './evidenceReport'

/**
 * Generic Excel export of a report snapshot: one row per widget with its label and computed
 * data flattened to JSON. A richer per-widget-type tabular export (separate sheet per widget
 * category) is future work — this keeps every widget exportable today without hand-writing a
 * bespoke sheet layout per widget.
 */
export async function exportReportToExcel(reportNumber: string, widgetIds: string[], payload: ReportPayload, filename: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ev = payload['evidence-report'] as EvidenceReport | undefined
  if (ev) {
    const src = (l: { source: string; ref?: string; asOf: string | null }[]) => l.map((e) => [e.source, e.ref, e.asOf].filter(Boolean).join(' · ')).join(' | ')
    const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '—': 'موردی نیست' }]), name)
    add('یافته‌ها', ev.findings.map((f) => ({ 'یافته': f.title, 'اهمیت': f.materiality, 'شرح': f.statement, 'شواهد': src(f.evidence) })))
    add('علت‌ها', ev.causes.map((c) => ({ 'نوع': c.strength, 'شرح': c.text, 'شواهد': src(c.evidence) })))
    add('روندها', ev.trends.map((t) => ({ 'شاخص': t.label, 'جهت': t.direction, 'شیب ماهانه': t.slopePerMonth, 'شرح': t.statement })))
    add('پیش‌بینی', ev.projections.map((p) => ({ 'شاخص': p.label, 'مقدار': p.value, 'روش': p.method, 'فرض': p.assumption, 'اطمینان': p.confidence })))
    add('اقدام‌ها', ev.recommendations.map((r) => ({ 'اقدام': r.text, 'فوریت': r.urgency, 'مسئول': r.owner ?? '' })))
    add('تصمیم‌ها', ev.decisions.map((d) => ({ 'تصمیم': d.title, 'سطح': d.level, 'مرجع': d.owner ?? '', 'موعد': d.dueBy ?? '', 'موعد گذشته': d.overdue ? 'بله' : '' })))
    add('اثر اقدام‌ها', ev.effects.map((e) => ({ 'اقدام': e.title, 'برای': e.target, 'داوری': e.verdict, 'شرح': e.statement })))
    add('کیفیت داده', ev.quality.map((q) => ({ 'منبع': q.source, 'آخرین ثبت': q.lastUpdate ?? '', 'وضعیت': q.note })))
    XLSX.writeFile(wb, filename)
    return
  }
  const rows = widgetIds.map((id) => {
    const widget = getWidget(id)
    return {
      'ویجت': widget?.label ?? id,
      'دسته': widget?.category ?? '',
      'داده (JSON)': JSON.stringify(payload[id] ?? null),
    }
  })
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, sheet, `گزارش ${reportNumber}`.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

/** Excel export of a composed report: a cover sheet (title, scope, period, caveats) then one sheet per section with its blocks stacked. */
export async function exportComposedReport(r: import('./composerCore').ComposedReport, filename: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const cover = [[r.title], ['محدوده', r.scopeLabel], ['دوره', r.periodLabel], ['تعداد پروژه', r.projects], ['تاریخ تهیه', r.generatedAt], [], ['ملاحظات'], ...r.caveats.map((c) => [c])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), 'مشخصات')
  const used = new Set<string>()
  for (const s of r.sections) {
    const aoa: (string | number)[][] = [[s.title]]
    if (s.empty) aoa.push([s.empty])
    for (const b of s.blocks) {
      aoa.push([], [b.title])
      if (b.kind === 'kpis') for (const k of b.items) aoa.push([k.label, k.value])
      else if (b.kind === 'table') { aoa.push(b.head); for (const row of b.rows) aoa.push(row) }
      else for (const it of b.items) aoa.push([it.text, it.tag ?? '', it.sub ?? ''])
      if (b.note) aoa.push([b.note])
    }
    // sheet names: max 31 chars, unique
    let name = s.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
    for (let i = 2; used.has(name); i++) name = `${s.title.slice(0, 27)} ${i}`
    used.add(name)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}
