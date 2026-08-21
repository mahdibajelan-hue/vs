import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { exportElementToPdf } from '../../../lib/export'
import { ExecutiveReportPrint, type ExecutiveReportExtras } from './ExecutiveReportPrint'
import type { ProjectFinancialSummary } from '../lib/financeCalc'

/** Self-contained "export executive one-pager PDF" button — carries its own off-screen print ref. */
export function ExecutiveExportButton({
  scopeLabel,
  entityName,
  currency,
  summary,
  extras,
}: {
  scopeLabel: string
  entityName: string
  currency: string
  summary: ProjectFinancialSummary
  extras: ExecutiveReportExtras
}) {
  const [exporting, setExporting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const handleExport = async () => {
    if (!ref.current) return
    setExporting(true)
    try {
      await exportElementToPdf(ref.current, `گزارش-اجرایی-${entityName}.pdf`, { orientation: 'portrait', backgroundColor: '#ffffff' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
        style={{ background: '#c9a654' }}
      >
        <Download size={13} /> {exporting ? 'در حال ساخت PDF...' : 'گزارش اجرایی (مدیرعامل)'}
      </button>
      <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }} aria-hidden="true">
        <div ref={ref}>
          <ExecutiveReportPrint scopeLabel={scopeLabel} entityName={entityName} currency={currency} summary={summary} extras={extras} />
        </div>
      </div>
    </>
  )
}
