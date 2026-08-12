import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Receipt, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { certificateGrossTotal, certificateOutstanding, certificatePaidTotal } from '../lib/financeCalc'
import { exportFinanceReportToExcel } from '../lib/financeExport'
import { exportElementToPdf } from '../../../lib/export'
import { FinanceKpiTile, fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { FIN_CERTIFICATE_TYPE_LABEL_FA } from '../types'

/**
 * Financial Reports (spec item 8): filter by Contract + date range, show Gross/Adjustments/
 * Advance Recovery/Retention/Other Deductions (tax + insurance + misc — this module tracks them
 * as one generic deduction field, see PaymentCertificatesPage)/Net Certified/Paid/Outstanding,
 * export to Excel and PDF.
 */
export function FinancialReportsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)

  const [contractId, setContractId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const contractOf = (id: string) => contracts.find((c) => c.id === id)
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'

  const filtered = certificates
    .filter((c) => contractIds.has(c.contractId))
    .filter((c) => !contractId || c.contractId === contractId)
    .filter((c) => !startDate || c.certificateDate >= startDate)
    .filter((c) => !endDate || c.certificateDate <= endDate)
    .sort((a, b) => (a.certificateDate < b.certificateDate ? -1 : 1))

  const totals = filtered.reduce(
    (acc, c) => {
      acc.gross += certificateGrossTotal(c)
      acc.adjustments += c.adjustments
      acc.advanceRecovery += c.advanceRecoveryAmount
      acc.retention += c.retentionAmount
      acc.otherDeductions += c.deductions
      acc.netCertified += c.certifiedAmount ?? 0
      acc.paid += certificatePaidTotal(c)
      acc.outstanding += certificateOutstanding(c)
      return acc
    },
    { gross: 0, adjustments: 0, advanceRecovery: 0, retention: 0, otherDeductions: 0, netCertified: 0, paid: 0, outstanding: 0 },
  )

  const handleExportExcel = async () => {
    const rows = filtered.map((c) => ({
      'شماره صورت‌وضعیت': c.certificateNumber || '-',
      'نوع': FIN_CERTIFICATE_TYPE_LABEL_FA[c.certificateType],
      'قرارداد': contractOf(c.contractId)?.title || contractOf(c.contractId)?.contractNumber || '-',
      'تاریخ': fmtDate(c.certificateDate),
      'مبلغ ناخالص (شامل ارزی)': Math.round(certificateGrossTotal(c)),
      'تعدیلات': Math.round(c.adjustments),
      'بازپرداخت پیش‌پرداخت': Math.round(c.advanceRecoveryAmount),
      'کسر حسن انجام کار': Math.round(c.retentionAmount),
      'سایر کسورات (مالیات، بیمه، متفرقه)': Math.round(c.deductions),
      'مبلغ خالص تاییدشده': Math.round(c.certifiedAmount ?? 0),
      'مبلغ پرداخت‌شده (شامل ارزی)': Math.round(certificatePaidTotal(c)),
      'مانده پرداخت‌نشده': Math.round(certificateOutstanding(c)),
    }))
    await exportFinanceReportToExcel(rows, `گزارش-مالی-${project.officialName}.xlsx`)
  }

  const handleExportPdf = async () => {
    if (!reportRef.current) return
    setExportingPdf(true)
    try {
      await exportElementToPdf(reportRef.current, `گزارش-مالی-${project.officialName}.pdf`, { orientation: 'landscape' })
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs text-muted">گزارش‌های مالی</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportExcel} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-secondary hover:bg-white/5 disabled:opacity-40">
            <FileSpreadsheet size={13} /> خروجی اکسل
          </button>
          <button
            onClick={handleExportPdf}
            disabled={filtered.length === 0 || exportingPdf}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            style={{ background: FINANCE_ACCENT }}
          >
            <Download size={13} /> {exportingPdf ? 'در حال ساخت PDF...' : 'خروجی PDF'}
          </button>
        </div>
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <label className="block">
          <span className="mb-1 block text-[10.5px] text-secondary">قرارداد</span>
          <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="input w-48">
            <option value="">همه قراردادها</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.contractNumber || 'قرارداد بدون عنوان'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] text-secondary">از تاریخ</span>
          <JalaliDateInput value={startDate} onChange={setStartDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] text-secondary">تا تاریخ</span>
          <JalaliDateInput value={endDate} onChange={setEndDate} />
        </label>
        {(startDate || endDate || contractId) && (
          <button
            onClick={() => {
              setContractId('')
              setStartDate('')
              setEndDate('')
            }}
            className="rounded-lg px-3 py-2 text-[10.5px] text-secondary hover:underline"
          >
            پاک‌کردن فیلترها
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FinanceKpiTile icon={Receipt} label="جمع ناخالص" value={fmtCurrency(totals.gross, currency)} color="#38bdf8" />
        <FinanceKpiTile icon={CheckCircle2} label="جمع خالص تاییدشده" value={fmtCurrency(totals.netCertified, currency)} color="#a78bfa" />
        <FinanceKpiTile icon={Wallet} label="جمع پرداخت‌شده" value={fmtCurrency(totals.paid, currency)} color="#2ecc71" />
        <FinanceKpiTile
          icon={AlertCircle}
          label="جمع مانده پرداخت‌نشده"
          value={fmtCurrency(totals.outstanding, currency)}
          color={totals.outstanding > 0 ? '#f59e0b' : '#2ecc71'}
          status={totals.outstanding > 0 ? 'warn' : 'good'}
        />
      </div>

      <div ref={reportRef} className="glass-panel overflow-x-auto rounded-2xl p-4">
        <p className="mb-3 text-[11px] font-bold">
          جدول صورت‌وضعیت‌ها {startDate || endDate ? `(${startDate ? fmtDate(startDate) : 'ابتدا'} تا ${endDate ? fmtDate(endDate) : 'انتها'})` : ''}
        </p>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">صورت‌وضعیتی مطابق فیلترهای انتخاب‌شده یافت نشد.</p>
        ) : (
          <table className="w-full min-w-[920px] text-right text-[11px]">
            <thead>
              <tr className="border-b text-[10px] text-muted" style={{ borderColor: 'var(--border-soft)' }}>
                <th className="pb-2 font-medium">شماره</th>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">تاریخ</th>
                <th className="pb-2 font-medium">ناخالص</th>
                <th className="pb-2 font-medium">تعدیلات</th>
                <th className="pb-2 font-medium">بازپرداخت پیش‌پرداخت</th>
                <th className="pb-2 font-medium">حسن انجام کار</th>
                <th className="pb-2 font-medium">سایر کسورات</th>
                <th className="pb-2 font-medium">خالص تاییدشده</th>
                <th className="pb-2 font-medium">پرداخت‌شده</th>
                <th className="pb-2 font-medium">مانده</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
                  <td className="num py-2 font-bold">{c.certificateNumber || '—'}</td>
                  <td className="py-2">{contractOf(c.contractId)?.title || contractOf(c.contractId)?.contractNumber || '—'}</td>
                  <td className="num py-2 text-muted">{fmtDate(c.certificateDate)}</td>
                  <td className="num py-2">{fmtCurrency(certificateGrossTotal(c))}</td>
                  <td className="num py-2">{fmtCurrency(c.adjustments)}</td>
                  <td className="num py-2">{fmtCurrency(c.advanceRecoveryAmount)}</td>
                  <td className="num py-2">{fmtCurrency(c.retentionAmount)}</td>
                  <td className="num py-2">{fmtCurrency(c.deductions)}</td>
                  <td className="num py-2 font-bold">{c.certifiedAmount != null ? fmtCurrency(c.certifiedAmount) : '—'}</td>
                  <td className="num py-2">{fmtCurrency(certificatePaidTotal(c))}</td>
                  <td className="num py-2" style={{ color: certificateOutstanding(c) > 0 ? '#f59e0b' : undefined }}>
                    {fmtCurrency(certificateOutstanding(c))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 text-xs font-bold" style={{ borderColor: 'var(--border-soft)' }}>
                <td className="py-2" colSpan={3}>
                  جمع کل
                </td>
                <td className="num py-2">{fmtCurrency(totals.gross)}</td>
                <td className="num py-2">{fmtCurrency(totals.adjustments)}</td>
                <td className="num py-2">{fmtCurrency(totals.advanceRecovery)}</td>
                <td className="num py-2">{fmtCurrency(totals.retention)}</td>
                <td className="num py-2">{fmtCurrency(totals.otherDeductions)}</td>
                <td className="num py-2" style={{ color: FINANCE_ACCENT }}>
                  {fmtCurrency(totals.netCertified)}
                </td>
                <td className="num py-2">{fmtCurrency(totals.paid)}</td>
                <td className="num py-2">{fmtCurrency(totals.outstanding)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
