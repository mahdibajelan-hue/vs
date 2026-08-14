import { JALALI_MONTHS, todayJalali } from '../../../lib/jalali'
import type { ProjectFinancialSummary } from '../lib/financeCalc'

function fmtFull(n: number, currency = ''): string {
  const suffix = currency ? ` ${currency}` : ''
  return `${Math.round(n).toLocaleString('fa-IR')}${suffix}`
}

function fmtTodayJalaliFull(): string {
  const { jy, jm, jd } = todayJalali()
  return `${jd.toLocaleString('fa-IR')} ${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR')}`
}

export interface ExecutiveReportExtras {
  claimsExposure: number
  claimCount: number
  retentionLiabilityAmount: number
  activeGuaranteesTotalAmount: number
  expiringGuaranteeCount: number
}

/**
 * One-page executive print template for the CEO/board — a handful of headline numbers, no
 * line-item detail (that's the PM-facing operational report on the Reports page). Rendered
 * off-screen and captured via exportElementToPdf, same pattern as ReportPrintTemplate.
 */
export function ExecutiveReportPrint({
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
  const rows: { label: string; value: string; emphasize?: boolean; warn?: boolean }[] = [
    { label: 'بودجه مصوب', value: fmtFull(summary.approvedBudget, currency) },
    { label: 'بودجه جاری', value: fmtFull(summary.currentBudgetAmount, currency) },
    { label: 'ارزش کل قراردادها (جاری)', value: fmtFull(summary.currentContractValueTotal, currency) },
    { label: 'هزینه متعهدشده (Committed)', value: fmtFull(summary.committedCost, currency) },
    { label: 'جذب بودجه', value: `${summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪`, warn: summary.budgetAbsorptionPct > 100 },
    { label: 'مبلغ تاییدشده (Certified)', value: fmtFull(summary.certifiedTotal, currency), emphasize: true },
    { label: 'مبلغ پرداخت‌شده', value: fmtFull(summary.paidTotal, currency) },
    { label: 'مانده پرداخت‌نشده', value: fmtFull(summary.outstandingTotal, currency), warn: summary.outstandingTotal > 0 },
    { label: 'پیش‌بینی هزینه در تکمیل (EAC)', value: summary.eac != null ? fmtFull(summary.eac, currency) : 'ثبت نشده' },
    { label: 'انحراف بودجه (Variance)', value: fmtFull(summary.budgetVariance, currency), warn: summary.budgetVariance < 0 },
    { label: 'میانگین تاخیر پرداخت', value: summary.avgPaymentDelayDays != null ? `${summary.avgPaymentDelayDays.toLocaleString('fa-IR')} روز` : '—', warn: (summary.avgPaymentDelayDays ?? 0) > 30 },
    { label: 'مانده معوق (بیش از ۳۰ روز)', value: fmtFull(summary.overduePayableTotal, currency), warn: summary.overduePayableTotal > 0 },
    { label: 'ضمانت‌نامه‌های فعال', value: fmtFull(extras.activeGuaranteesTotalAmount, currency) },
    { label: 'ضمانت‌نامه‌های نزدیک به انقضا', value: `${extras.expiringGuaranteeCount.toLocaleString('fa-IR')} مورد`, warn: extras.expiringGuaranteeCount > 0 },
    { label: 'ریسک کلایم باز (Claims Exposure)', value: `${fmtFull(extras.claimsExposure, currency)} (${extras.claimCount.toLocaleString('fa-IR')} مورد)`, warn: extras.claimsExposure > 0 },
    { label: 'بدهی حسن انجام کار باقی‌مانده', value: fmtFull(extras.retentionLiabilityAmount, currency) },
  ]

  return (
    <div style={{ background: '#ffffff', color: '#0f172a', width: 900, padding: '36px 40px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>
      <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{entityName}</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569', fontWeight: 600 }}>{scopeLabel}</p>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>تاریخ گزارش: {fmtTodayJalaliFull()}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '8px 0' }}>
            <span style={{ fontSize: 12, color: '#475569' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: r.emphasize ? 800 : 700, color: r.warn ? '#b5573a' : '#0f172a' }}>{r.value}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 26, fontSize: 9.5, color: '#94a3b8' }}>تهیه‌شده توسط سامانه مدیریت پروژه RASTA — گزارش اجرایی خلاصه، جهت ارائه به مدیرعامل/هیئت‌مدیره.</p>
    </div>
  )
}
