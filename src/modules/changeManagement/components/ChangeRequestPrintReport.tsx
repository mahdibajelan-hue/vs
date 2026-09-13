import { formatJalali } from '../../../lib/jalali'
import { computeChangeImpact, contractChangePercent, newContractAmount, newProjectDuration, scheduleChangePercent } from '../lib/changeCalc'
import {
  CHANGE_PRIORITY_LABEL_FA, CHANGE_STATUS_LABEL_FA, IMPACT_LEVEL_LABEL_FA, REVIEW_STAGE_LABEL_FA,
  STAGE_DECISION_LABEL_FA,
} from '../types'
import type { ChangeDocument, ChangeHistoryEntry, ChangeRequest, ReviewStage, StageReview } from '../types'

/**
 * Light-mode, print/PDF-friendly rendering of a single change request — a separate component
 * from the on-screen dark detail page, same convention as EstimatorPrintReport/
 * CompetencyPrintReport: html2canvas captures the dark theme verbatim, which prints badly and
 * wastes ink, so this is its own plain-div light template. Not fit-to-one-page — a fully-worked
 * change with all 5 stage decisions, documents and history genuinely runs long, so it paginates.
 */

const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const ACCENT = '#4338ca'

function money(n: number, currency: string): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n).toLocaleString('en-US')} ${currency}`
}
function pct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}٪`
}
function jalaliOf(iso: string | null): string {
  return iso ? formatJalali(iso.slice(0, 10)) : '—'
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 800, color: ACCENT, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4, marginTop: 18, marginBottom: 10 }}>
      {children}
    </p>
  )
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <p style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 800, color: color ?? INK }}>{value}</p>
    </div>
  )
}

export function ChangeRequestPrintReport({ request, reviews, documents, history, projectName }: {
  request: ChangeRequest; reviews: StageReview[]; documents: ChangeDocument[]; history: ChangeHistoryEntry[]; projectName: string
}) {
  const impact = computeChangeImpact(request)
  const costPct = contractChangePercent(request)
  const schedulePct = scheduleChangePercent(request)
  const reviewByStage = (stage: ReviewStage) => reviews.find((r) => r.stage === stage)

  return (
    <div style={{ width: '780px', background: '#ffffff', color: INK, fontFamily: 'Vazirmatn, sans-serif', padding: '28px 32px', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: `3px solid ${ACCENT}`, paddingBottom: 12 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 800 }}>گزارش درخواست تغییر — {request.crNumber}</p>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>EPC CHANGE REQUEST &amp; CHANGE CONTROL — {projectName}</p>
        </div>
        <p style={{ fontSize: 10, color: MUTED }}>تاریخ صدور گزارش: {jalaliOf(new Date().toISOString())}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
        <Stat label="وضعیت" value={CHANGE_STATUS_LABEL_FA[request.status]} color={ACCENT} />
        <Stat label="اولویت" value={CHANGE_PRIORITY_LABEL_FA[request.priority]} />
        <Stat label="تاریخ ثبت" value={jalaliOf(request.submittedAt)} />
        <Stat label="شدت کلی تغییر" value={IMPACT_LEVEL_LABEL_FA[impact.overallSeverity].toUpperCase()} color={impact.overallSeverity === 'critical' || impact.overallSeverity === 'high' ? '#dc2626' : '#16a34a'} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, marginTop: 14 }}>{request.title}</p>
      {request.description && <p style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.7 }}>{request.description}</p>}

      <SectionTitle>خلاصه اثر اجرایی</SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Stat label="COST IMPACT" value={pct(impact.costPercent)} color={impact.highFinancialImpact ? '#dc2626' : '#16a34a'} />
        <Stat label="TIME IMPACT" value={pct(impact.schedulePercent)} color={impact.highScheduleImpact ? '#dc2626' : '#16a34a'} />
        <Stat label="RISK" value={IMPACT_LEVEL_LABEL_FA[impact.riskLevel]} />
        <Stat label="SCOPE" value={IMPACT_LEVEL_LABEL_FA[impact.scopeLevel]} />
      </div>

      <SectionTitle>اثر مالی و زمانی</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 6px', color: MUTED, width: '25%' }}>قرارداد اصلی</td>
            <td style={{ padding: '4px 6px' }}>{Math.round(request.originalContractAmount).toLocaleString('en-US')} {request.currency}</td>
            <td style={{ padding: '4px 6px', color: MUTED, width: '25%' }}>مدت اصلی</td>
            <td style={{ padding: '4px 6px' }}>{request.originalDurationDays} روز</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 6px', color: MUTED }}>مبلغ تغییر (پیشنهادی/مصوب)</td>
            <td style={{ padding: '4px 6px' }}>{money(request.proposedChangeAmount, request.currency)} ({pct(costPct)})</td>
            <td style={{ padding: '4px 6px', color: MUTED }}>اثر زمانی (پیشنهادی/مصوب)</td>
            <td style={{ padding: '4px 6px' }}>{request.proposedScheduleImpactDays} روز ({pct(schedulePct)})</td>
          </tr>
          <tr style={{ fontWeight: 800 }}>
            <td style={{ padding: '4px 6px', color: MUTED }}>قرارداد جدید</td>
            <td style={{ padding: '4px 6px' }}>{Math.round(newContractAmount(request)).toLocaleString('en-US')} {request.currency}</td>
            <td style={{ padding: '4px 6px', color: MUTED }}>مدت جدید</td>
            <td style={{ padding: '4px 6px' }}>{newProjectDuration(request)} روز</td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>مسیر تصویب و تصمیمات</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>مرحله</th>
            <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>تصمیم</th>
            <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>تاریخ</th>
            <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>نظر</th>
          </tr>
        </thead>
        <tbody>
          {(['engineering', 'planning', 'contract', 'pm', 'ccb'] as ReviewStage[]).map((s) => {
            const r = reviewByStage(s)
            return (
              <tr key={s}>
                <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{REVIEW_STAGE_LABEL_FA[s]}</td>
                <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{STAGE_DECISION_LABEL_FA[r?.decision ?? 'pending']}</td>
                <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{jalaliOf(r?.decidedAt ?? null)}</td>
                <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{r?.comment || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {documents.length > 0 && (
        <>
          <SectionTitle>مستندات و شواهد</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>نام/شماره مدرک</th>
                <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>دسته</th>
                <th style={{ padding: '5px 6px', textAlign: 'right', border: `1px solid ${LINE}` }}>ریویژن</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{d.fileName || d.documentNumber || '—'}</td>
                  <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{d.category}</td>
                  <td style={{ padding: '5px 6px', border: `1px solid ${LINE}` }}>{d.revision || '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <SectionTitle>تاریخچه تغییر</SectionTitle>
      <div>
        {history.length === 0 && <p style={{ fontSize: 10.5, color: MUTED }}>فعالیتی ثبت نشده است.</p>}
        {history.map((h) => (
          <div key={h.id} style={{ display: 'flex', gap: 8, borderBottom: `1px solid ${LINE}`, padding: '5px 0', fontSize: 10 }}>
            <span style={{ color: MUTED, width: 90, flexShrink: 0 }}>{jalaliOf(h.createdAt)}</span>
            <span style={{ fontWeight: 700, width: 120, flexShrink: 0 }}>{h.roleLabel}</span>
            <span>{h.action}{h.comment ? ` — «${h.comment}»` : ''}</span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 20, fontSize: 8.5, color: MUTED, textAlign: 'center', borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
        این گزارش به‌صورت خودکار از ماژول مدیریت تغییرات RASTA تولید شده است — تمامی مقادیر درصدی به‌صورت زنده از داده‌های ثبت‌شده محاسبه می‌شوند و ذخیره نمی‌شوند.
      </p>
    </div>
  )
}
