import type { ReportPayload } from '../types'
import { getWidget } from './widgetRegistry'

/**
 * Generic Excel export of a report snapshot: one row per widget with its label and computed
 * data flattened to JSON. A richer per-widget-type tabular export (separate sheet per widget
 * category) is future work — this keeps every widget exportable today without hand-writing a
 * bespoke sheet layout per widget.
 */
export async function exportReportToExcel(reportNumber: string, widgetIds: string[], payload: ReportPayload, filename: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
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
