import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Search } from 'lucide-react'
import { REPORT_STATUSES, REPORT_STATUS_LABEL_FA, REPORT_TYPES, REPORT_TYPE_LABEL_FA, type ReportStatus, type ReportType } from '../types'
import { useReportingStore } from '../store/useReportingStore'
import { WidgetGrid } from '../components/WidgetGrid'
import { exportReportToExcel } from '../lib/reportExport'
import { exportElementToPdf } from '../../../lib/export'
import { formatJalali } from '../../../lib/jalali'

const NEXT_STATUS: Partial<Record<ReportStatus, ReportStatus>> = {
  draft: 'under_review',
  under_review: 'approved',
  approved: 'issued',
  issued: 'archived',
}

const NEXT_STATUS_LABEL_FA: Partial<Record<ReportStatus, string>> = {
  draft: 'ارسال برای بازبینی',
  under_review: 'تایید',
  approved: 'صدور',
  issued: 'بایگانی',
}

export function ReportCenterPage({ masterProjectId }: { masterProjectId: string }) {
  const snapshots = useReportingStore((s) => s.snapshotsByProject[masterProjectId] ?? [])
  const setSnapshotStatus = useReportingStore((s) => s.setSnapshotStatus)
  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () =>
      snapshots.filter(
        (s) =>
          (typeFilter === 'all' || s.reportType === typeFilter) &&
          (statusFilter === 'all' || s.status === statusFilter) &&
          (query.trim() === '' || s.reportNumber.includes(query.trim())),
      ),
    [snapshots, typeFilter, statusFilter, query],
  )

  const selected = snapshots.find((s) => s.id === selectedId) ?? filtered[0] ?? null

  const handlePdf = async () => {
    if (!viewerRef.current || !selected) return
    setExporting(true)
    await exportElementToPdf(viewerRef.current, `${selected.reportNumber}.pdf`)
    setExporting(false)
  }
  const handleExcel = async () => {
    if (!selected) return
    setExporting(true)
    await exportReportToExcel(selected.reportNumber, selected.widgetIds, selected.payload, `${selected.reportNumber}.xlsx`)
    setExporting(false)
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی شماره گزارش..."
            className="w-full rounded-lg bg-black/20 border border-white/10 px-8 py-1.5 text-xs outline-none"
          />
          <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ReportType | 'all')} className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[11px]">
            <option value="all">همه انواع</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReportStatus | 'all')} className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[11px]">
            <option value="all">همه وضعیت‌ها</option>
            {REPORT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {REPORT_STATUS_LABEL_FA[st]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          {filtered.length === 0 && <p className="py-6 text-center text-xs text-muted">گزارشی یافت نشد</p>}
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`block w-full rounded-xl border p-2.5 text-right transition-colors ${
                selected?.id === s.id ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" dir="ltr">
                  {s.reportNumber}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{REPORT_STATUS_LABEL_FA[s.status]}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                {REPORT_TYPE_LABEL_FA[s.reportType]} · نسخه {s.revision} · {formatJalali(s.createdAt.slice(0, 10))}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!selected ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted">گزارشی برای نمایش انتخاب نشده است</div>
        ) : (
          <div className="space-y-3">
            <div className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
              <div>
                <p className="text-sm font-bold" dir="ltr">
                  {selected.reportNumber} · Rev {selected.revision}
                </p>
                <p className="text-[11px] text-muted">
                  {REPORT_TYPE_LABEL_FA[selected.reportType]} · {REPORT_STATUS_LABEL_FA[selected.status]}
                  {selected.periodStart && ` · از ${formatJalali(selected.periodStart)}`}
                  {selected.periodEnd && ` تا ${formatJalali(selected.periodEnd)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {NEXT_STATUS[selected.status] && (
                  <button
                    onClick={() => setSnapshotStatus(selected.id, masterProjectId, NEXT_STATUS[selected.status]!)}
                    className="flex items-center gap-1 rounded-lg border border-green-400/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-medium text-green-300 hover:bg-green-500/20"
                  >
                    <CheckCircle2 size={12} /> {NEXT_STATUS_LABEL_FA[selected.status]}
                  </button>
                )}
                <button onClick={handlePdf} disabled={exporting} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-40">
                  {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} PDF
                </button>
                <button onClick={handleExcel} disabled={exporting} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-40">
                  {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Excel
                </button>
              </div>
            </div>

            <div ref={viewerRef} className="rounded-2xl p-2" style={{ background: 'var(--bg-panel-solid)' }}>
              <div className="mb-3 flex items-center justify-between px-2">
                <p className="text-xs font-bold" dir="ltr">
                  RASTA — {selected.reportNumber}
                </p>
                <Download size={13} className="text-muted" />
              </div>
              <WidgetGrid widgetIds={selected.widgetIds} mode="snapshot" payload={selected.payload} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
