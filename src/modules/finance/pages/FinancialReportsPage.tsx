import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Receipt, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import {
  activeGuaranteesTotal,
  certificateGrossTotal,
  certificateOutstanding,
  certificatePaidTotal,
  claimsExposureTotal,
  computeProjectFinancialSummary,
  expiringGuarantees,
  retentionLiability,
} from '../lib/financeCalc'
import { exportFinanceReportToExcel } from '../lib/financeExport'
import { exportElementToPdf } from '../../../lib/export'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard } from '../components/FinanceDashboardUI'
import { ExecutiveExportButton } from '../components/ExecutiveExportButton'
import type { ExecutiveReportExtras } from '../components/ExecutiveReportPrint'
import { FINANCE_ACCENT } from '../FinanceApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { JALALI_MONTHS, todayJalali } from '../../../lib/jalali'
import { FIN_CERTIFICATE_TYPE_LABEL_FA, type FinPaymentCertificate } from '../types'

/** Full (non-abbreviated) number formatting for the printed report — a formal document reads better with exact figures than "۱۲ میلیارد". */
function fmtFull(n: number, currency = ''): string {
  const suffix = currency ? ` ${currency}` : ''
  return `${Math.round(n).toLocaleString('fa-IR')}${suffix}`
}

function fmtTodayJalaliFull(): string {
  const { jy, jm, jd } = todayJalali()
  return `${jd.toLocaleString('fa-IR')} ${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR')}`
}

const PRINT_HEADERS = ['شماره', 'قرارداد', 'تاریخ', 'ناخالص', 'تعدیلات', 'بازپرداخت پیش‌پرداخت', 'حسن انجام کار', 'مالیات', 'بیمه', 'سایر کسورات', 'خالص تاییدشده', 'پرداخت‌شده', 'مانده']

/**
 * Print-friendly report template — a dedicated white/no-shadow layout captured separately from
 * the on-screen (dark-capable) table, per spec: title carries the project name, report type and
 * generation date, fields laid out cleanly for printing. Rendered off-screen at all times so its
 * ref is always capturable without a mount-timing race.
 */
function ReportPrintTemplate({
  projectName,
  reportType,
  periodLabel,
  currency,
  rows,
  contractLabel,
  totals,
}: {
  projectName: string
  reportType: string
  periodLabel: string
  currency: string
  contractLabel: (id: string) => string
  rows: FinPaymentCertificate[]
  totals: { gross: number; adjustments: number; advanceRecovery: number; retention: number; taxDeductions: number; insuranceDeductions: number; otherDeductions: number; netCertified: number; paid: number; outstanding: number }
}) {
  return (
    <div style={{ background: '#ffffff', color: '#0f172a', width: 1180, padding: '32px 36px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 20 }}>
        <div>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{projectName}</p>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#475569', fontWeight: 600 }}>{reportType}</p>
        </div>
        <div style={{ textAlign: 'left', fontSize: 11.5, color: '#475569', lineHeight: 1.9 }}>
          <p style={{ margin: 0 }}>تاریخ گزارش: {fmtTodayJalaliFull()}</p>
          <p style={{ margin: 0 }}>{periodLabel}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: '#7c8794' }}>صورت‌وضعیتی مطابق فیلترهای انتخاب‌شده یافت نشد.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {PRINT_HEADERS.map((h) => (
                <th key={h} style={{ borderBottom: '1.5px solid #0f172a', padding: '7px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{c.certificateNumber || '—'}</td>
                <td style={{ padding: '6px 8px' }}>{contractLabel(c.contractId)}</td>
                <td style={{ padding: '6px 8px', color: '#475569' }}>{fmtDate(c.certificateDate)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(certificateGrossTotal(c))}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.adjustments)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.advanceRecoveryAmount)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.retentionAmount)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.taxDeduction)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.insuranceDeduction)}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(c.otherDeduction)}</td>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{c.certifiedAmount != null ? fmtFull(c.certifiedAmount) : '—'}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(certificatePaidTotal(c))}</td>
                <td style={{ padding: '6px 8px' }}>{fmtFull(certificateOutstanding(c))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #0f172a', fontWeight: 800 }}>
              <td style={{ padding: '8px' }} colSpan={3}>
                جمع کل ({currency})
              </td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.gross)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.adjustments)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.advanceRecovery)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.retention)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.taxDeductions)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.insuranceDeductions)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.otherDeductions)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.netCertified)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.paid)}</td>
              <td style={{ padding: '8px' }}>{fmtFull(totals.outstanding)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <p style={{ marginTop: 22, fontSize: 9.5, color: '#94a3b8' }}>تهیه‌شده توسط سامانه مدیریت پروژه RASTA — این سند جهت چاپ آماده‌سازی شده است.</p>
    </div>
  )
}

/**
 * Financial Reports (spec item 8): filter by Contract + date range, show Gross/Adjustments/
 * Advance Recovery/Retention/Tax/Insurance/Other Deductions/Net Certified/Paid/Outstanding,
 * export to Excel and PDF.
 */
export function FinancialReportsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const amendments = useFinanceStore((s) => s.amendments)
  const annualBudgets = useFinanceStore((s) => s.annualBudgets)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const claims = useFinanceStore((s) => s.claims)
  const retentionReleases = useFinanceStore((s) => s.retentionReleases)

  const [contractId, setContractId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const contractOf = (id: string) => contracts.find((c) => c.id === id)
  const contractLabel = (id: string) => contractOf(id)?.title || contractOf(id)?.contractNumber || '—'
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'

  const projectBudget = budgets.find((b) => b.masterProjectId === masterProjectId) ?? null
  const projectBudgetChanges = budgetChanges.filter((c) => c.masterProjectId === masterProjectId)
  const projectAmendments = amendments.filter((a) => contractIds.has(a.contractId))
  const projectCertificatesAll = certificates.filter((c) => contractIds.has(c.contractId))
  const projectGuarantees = guarantees.filter((g) => contractIds.has(g.contractId))
  const projectClaims = claims.filter((c) => contractIds.has(c.contractId))
  const projectRetentionReleases = retentionReleases.filter((r) => contractIds.has(r.contractId))
  const executiveSummary = computeProjectFinancialSummary(
    masterProjectId,
    project.forecastCostAtCompletion ?? null,
    projectBudget,
    projectBudgetChanges,
    contracts,
    projectAmendments,
    projectCertificatesAll,
    annualBudgets,
    projectGuarantees,
  )
  const executiveExtras: ExecutiveReportExtras = {
    claimsExposure: claimsExposureTotal(projectClaims),
    claimCount: projectClaims.length,
    retentionLiabilityAmount: retentionLiability(projectCertificatesAll, projectRetentionReleases),
    activeGuaranteesTotalAmount: activeGuaranteesTotal(projectGuarantees),
    expiringGuaranteeCount: expiringGuarantees(projectGuarantees).length,
  }

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
      acc.taxDeductions += c.taxDeduction
      acc.insuranceDeductions += c.insuranceDeduction
      acc.otherDeductions += c.otherDeduction
      acc.netCertified += c.certifiedAmount ?? 0
      acc.paid += certificatePaidTotal(c)
      acc.outstanding += certificateOutstanding(c)
      return acc
    },
    { gross: 0, adjustments: 0, advanceRecovery: 0, retention: 0, taxDeductions: 0, insuranceDeductions: 0, otherDeductions: 0, netCertified: 0, paid: 0, outstanding: 0 },
  )

  const reportType = `گزارش تفکیکی صورت‌وضعیت‌های پرداخت — ${contractId ? `قرارداد ${contractLabel(contractId)}` : 'همه قراردادها'}`
  const periodLabel = startDate || endDate ? `بازه زمانی: ${startDate ? fmtDate(startDate) : 'ابتدا'} تا ${endDate ? fmtDate(endDate) : 'انتها'}` : 'بازه زمانی: کل دوره پروژه'

  const handleExportExcel = async () => {
    const rows = filtered.map((c) => ({
      'شماره صورت‌وضعیت': c.certificateNumber || '-',
      'نوع': FIN_CERTIFICATE_TYPE_LABEL_FA[c.certificateType],
      'قرارداد': contractLabel(c.contractId),
      'تاریخ': fmtDate(c.certificateDate),
      'مبلغ ناخالص (شامل ارزی)': Math.round(certificateGrossTotal(c)),
      'تعدیلات': Math.round(c.adjustments),
      'بازپرداخت پیش‌پرداخت': Math.round(c.advanceRecoveryAmount),
      'کسر حسن انجام کار': Math.round(c.retentionAmount),
      'مالیات تکلیفی': Math.round(c.taxDeduction),
      'بیمه تامین اجتماعی': Math.round(c.insuranceDeduction),
      'سایر کسورات': Math.round(c.otherDeduction),
      'مبلغ خالص تاییدشده': Math.round(c.certifiedAmount ?? 0),
      'مبلغ پرداخت‌شده (شامل ارزی)': Math.round(certificatePaidTotal(c)),
      'مانده پرداخت‌نشده': Math.round(certificateOutstanding(c)),
    }))
    await exportFinanceReportToExcel(rows, `گزارش-مالی-${project.officialName}.xlsx`)
  }

  const handleExportPdf = async () => {
    if (!printRef.current) return
    setExportingPdf(true)
    try {
      await exportElementToPdf(printRef.current, `گزارش-مالی-${project.officialName}.pdf`, { orientation: 'landscape', backgroundColor: '#ffffff' })
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">گزارش‌های مالی — گزارش عملیاتی تفصیلی (مدیر پروژه)</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExecutiveExportButton scopeLabel="گزارش اجرایی سطح پروژه" entityName={project.officialName} currency={currency} summary={executiveSummary} extras={executiveExtras} />
          <button onClick={handleExportExcel} disabled={filtered.length === 0} className="fin-text-secondary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:opacity-70 disabled:opacity-40" style={{ borderColor: 'var(--fin-divider)' }}>
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

      <div className="fin-card flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-[10.5px]">قرارداد</span>
          <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="fin-input w-48">
            <option value="">همه قراردادها</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.contractNumber || 'قرارداد بدون عنوان'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-[10.5px]">از تاریخ</span>
          <JalaliDateInput value={startDate} onChange={setStartDate} />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-[10.5px]">تا تاریخ</span>
          <JalaliDateInput value={endDate} onChange={setEndDate} />
        </label>
        {(startDate || endDate || contractId) && (
          <button
            onClick={() => {
              setContractId('')
              setStartDate('')
              setEndDate('')
            }}
            className="fin-text-secondary rounded-lg px-3 py-2 text-[10.5px] hover:underline"
          >
            پاک‌کردن فیلترها
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Receipt} label="جمع ناخالص" value={fmtCurrency(totals.gross, currency)} color="#5c7290" />
        <MetricCard icon={CheckCircle2} label="جمع خالص تاییدشده" value={fmtCurrency(totals.netCertified, currency)} color="#8b6e9c" />
        <MetricCard icon={Wallet} label="جمع پرداخت‌شده" value={fmtCurrency(totals.paid, currency)} color="#3e7c74" />
        <MetricCard icon={AlertCircle} label="جمع مانده پرداخت‌نشده" value={fmtCurrency(totals.outstanding, currency)} color={totals.outstanding > 0 ? '#b8863b' : '#3e7c74'} />
      </div>

      <div className="fin-card overflow-x-auto p-4">
        <p className="fin-text mb-3 text-[11px] font-bold">
          جدول صورت‌وضعیت‌ها {startDate || endDate ? `(${startDate ? fmtDate(startDate) : 'ابتدا'} تا ${endDate ? fmtDate(endDate) : 'انتها'})` : ''}
        </p>
        {filtered.length === 0 ? (
          <p className="fin-text-muted py-8 text-center text-xs">صورت‌وضعیتی مطابق فیلترهای انتخاب‌شده یافت نشد.</p>
        ) : (
          <table className="w-full min-w-[1080px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted border-b text-[10px]" style={{ borderColor: 'var(--fin-divider)' }}>
                <th className="pb-2 font-medium">شماره</th>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">تاریخ</th>
                <th className="pb-2 font-medium">ناخالص</th>
                <th className="pb-2 font-medium">تعدیلات</th>
                <th className="pb-2 font-medium">بازپرداخت پیش‌پرداخت</th>
                <th className="pb-2 font-medium">حسن انجام کار</th>
                <th className="pb-2 font-medium">مالیات</th>
                <th className="pb-2 font-medium">بیمه</th>
                <th className="pb-2 font-medium">سایر کسورات</th>
                <th className="pb-2 font-medium">خالص تاییدشده</th>
                <th className="pb-2 font-medium">پرداخت‌شده</th>
                <th className="pb-2 font-medium">مانده</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--fin-divider)' }}>
                  <td className="num fin-text py-2 font-bold">{c.certificateNumber || '—'}</td>
                  <td className="fin-text py-2">{contractLabel(c.contractId)}</td>
                  <td className="num fin-text-muted py-2">{fmtDate(c.certificateDate)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(certificateGrossTotal(c))}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.adjustments)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.advanceRecoveryAmount)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.retentionAmount)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.taxDeduction)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.insuranceDeduction)}</td>
                  <td className="num fin-text py-2">{fmtCurrency(c.otherDeduction)}</td>
                  <td className="num fin-text py-2 font-bold">{c.certifiedAmount != null ? fmtCurrency(c.certifiedAmount) : '—'}</td>
                  <td className="num fin-text py-2">{fmtCurrency(certificatePaidTotal(c))}</td>
                  <td className="num py-2" style={{ color: certificateOutstanding(c) > 0 ? '#b8863b' : 'var(--fin-text)' }}>
                    {fmtCurrency(certificateOutstanding(c))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 text-xs font-bold" style={{ borderColor: 'var(--fin-divider)' }}>
                <td className="fin-text py-2" colSpan={3}>
                  جمع کل
                </td>
                <td className="num fin-text py-2">{fmtCurrency(totals.gross)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.adjustments)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.advanceRecovery)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.retention)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.taxDeductions)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.insuranceDeductions)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.otherDeductions)}</td>
                <td className="num py-2" style={{ color: FINANCE_ACCENT }}>
                  {fmtCurrency(totals.netCertified)}
                </td>
                <td className="num fin-text py-2">{fmtCurrency(totals.paid)}</td>
                <td className="num fin-text py-2">{fmtCurrency(totals.outstanding)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }} aria-hidden="true">
        <div ref={printRef}>
          <ReportPrintTemplate projectName={project.officialName} reportType={reportType} periodLabel={periodLabel} currency={currency} rows={filtered} contractLabel={contractLabel} totals={totals} />
        </div>
      </div>
    </div>
  )
}
