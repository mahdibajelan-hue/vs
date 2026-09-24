import { formatJalali } from '../../../lib/jalali'
import { JOB_ROLE_LABEL_FA } from '../../competency/types'
import { computeRoleAlignment } from '../lib/roleAlignment'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA } from '../types'
import type {
  PersonalityAiAnalysis,
  PersonalityAssessment,
  PersonalityBehavioralDimension,
  PersonalityDimensionScore,
  PersonalityJobBehavioralRequirement,
  PersonalityTrait,
  PersonalityValidityResult,
  PersonalityValidityStatus,
} from '../types'

/**
 * Light-mode, print-friendly rendering of a single candidate's personality/behavioral results —
 * a separate component from PersonalityResultsPage's on-screen dark view, same convention as
 * CompetencyPrintReport.tsx: this markup is cloned into a blank print iframe (see
 * PersonalityResultsPage.handlePrint), where the app's dark theme and CSS custom properties don't
 * exist, so every color here is a literal rather than a var(--...) reference.
 */

const VALIDITY_TONE: Record<PersonalityValidityStatus, string> = {
  VALID: '#15803d',
  ACCEPTABLE: '#0369a1',
  REVIEW_REQUIRED: '#b45309',
  INVALID: '#b91c1c',
}

interface PersonalityPrintReportProps {
  assessment: PersonalityAssessment
  candidateName: string
  candidatePosition?: string | null
  traitScores: PersonalityDimensionScore[]
  behavioralScores: PersonalityDimensionScore[]
  traits: PersonalityTrait[]
  dimensions: PersonalityBehavioralDimension[]
  jobRequirements: PersonalityJobBehavioralRequirement[]
  validityResult?: PersonalityValidityResult
  aiAnalysis?: PersonalityAiAnalysis
}

export function PersonalityPrintReport({
  assessment,
  candidateName,
  candidatePosition,
  traitScores,
  behavioralScores,
  traits,
  dimensions,
  jobRequirements,
  validityResult,
  aiAnalysis,
}: PersonalityPrintReportProps) {
  const ink = '#0f172a'
  const sub = '#475569'
  const line = '#e2e8f0'
  const accent = '#db2777'

  const validityColor = validityResult ? VALIDITY_TONE[validityResult.overallStatus] : sub
  const validityReasons: string[] = []
  if (validityResult?.straightLiningFlag) validityReasons.push('الگوی پاسخ یکنواخت (straight-lining) مشاهده شد')
  if (validityResult?.randomPatternFlag) validityReasons.push('الگوی پاسخ تصادفی محتمل است')
  if (validityResult?.missingResponseCount) validityReasons.push(`${validityResult.missingResponseCount.toLocaleString('fa-IR')} سؤال بی‌پاسخ مانده`)
  if (validityResult?.contradictionCount) validityReasons.push(`${validityResult.contradictionCount.toLocaleString('fa-IR')} مورد تناقض در پاسخ‌ها`)
  if (validityResult?.extremeResponseRate != null && validityResult.extremeResponseRate > 40)
    validityReasons.push(`نرخ پاسخ‌های حدی: ٪${Math.round(validityResult.extremeResponseRate).toLocaleString('fa-IR')}`)

  const alignment = computeRoleAlignment(jobRequirements, behavioralScores, dimensions)

  return (
    <div style={{ background: '#ffffff', color: ink, width: 900, padding: '36px 40px', fontFamily: '"Vazirmatn", "Segoe UI", sans-serif', direction: 'rtl' }}>
      <div style={{ borderBottom: `2px solid ${ink}`, paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>گزارش ارزیابی شخصیت و رفتاری — {candidateName}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: sub, fontWeight: 600 }}>
            {candidatePosition || JOB_ROLE_LABEL_FA[assessment.jobRole]}
          </p>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: 11, color: sub }}>تاریخ ایجاد ارزیابی: {formatJalali(assessment.createdAt)}</p>
          {assessment.submittedAt && <p style={{ margin: '4px 0 0', fontSize: 11, color: sub }}>تاریخ ثبت پاسخ‌ها: {formatJalali(assessment.submittedAt)}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        <div
          style={{
            flex: 1,
            border: `1px solid ${line}`,
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: sub }}>وضعیت اعتبار پاسخ‌ها</p>
          <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, color: validityColor }}>
            {validityResult ? PERSONALITY_VALIDITY_STATUS_LABEL_FA[validityResult.overallStatus] : '—'}
          </p>
          {validityResult?.completionSeconds != null && (
            <p style={{ margin: '4px 0 0', fontSize: 10, color: sub }}>
              زمان تکمیل: {Math.round(validityResult.completionSeconds / 60).toLocaleString('fa-IR')} دقیقه
            </p>
          )}
        </div>
        <div style={{ flex: 2, border: `1px solid ${line}`, borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800 }}>ملاحظات اعتبارسنجی</p>
          {validityReasons.length > 0 ? (
            <ul style={{ margin: 0, paddingRight: 16, fontSize: 10.5, lineHeight: 1.8, color: sub }}>
              {validityReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 10.5, color: sub }}>موردی خاص در بررسی اعتبار پاسخ‌ها ثبت نشده است.</p>
          )}
        </div>
      </div>

      {jobRequirements.length > 0 && (
        <div style={{ marginBottom: 20, border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>تطابق با الزامات رفتاری شغل «{JOB_ROLE_LABEL_FA[assessment.jobRole]}»</p>
            {alignment.overallAlignmentPercent != null && (
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: alignment.criticalGapCount > 0 ? '#dc2626' : accent }}>
                ٪{alignment.overallAlignmentPercent.toLocaleString('fa-IR')}
              </p>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 10.5, color: sub }}>
            {alignment.criticalGapCount > 0
              ? `${alignment.criticalGapCount.toLocaleString('fa-IR')} مورد از الزامات حیاتی این شغل هنوز برآورده نشده است.`
              : 'الزامات حیاتی این شغل بر اساس شواهد ثبت‌شده برآورده شده‌اند.'}
          </p>
        </div>
      )}

      {traitScores.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>ویژگی‌های شخصیتی (پنج عامل بزرگ)</p>
          {traitScores.map((s) => {
            const trait = traits.find((t) => t.id === s.traitId)
            const pct = Math.max(0, Math.min(100, s.normalizedScore ?? 0))
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 10.5, color: sub }}>{trait?.labelFa ?? '—'}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 5, background: accent, width: `${pct}%` }} />
                </div>
                <span style={{ width: 50, flexShrink: 0, textAlign: 'left', fontSize: 10.5, color: sub }}>
                  {s.normalizedScore != null ? Math.round(s.normalizedScore).toLocaleString('fa-IR') : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {behavioralScores.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>ابعاد رفتاری حرفه‌ای (با الزام شغلی)</p>
          {behavioralScores.map((s) => {
            const dim = dimensions.find((d) => d.id === s.dimensionId)
            const req = jobRequirements.find((r) => r.dimensionId === s.dimensionId)
            const pct = Math.max(0, Math.min(100, s.normalizedScore ?? 0))
            const below = req?.minThreshold != null && s.normalizedScore != null && s.normalizedScore < req.minThreshold
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 10.5, color: sub }}>
                  {dim?.labelFa ?? '—'} {req?.isCritical && <span style={{ color: '#b45309' }}>★</span>}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', borderRadius: 5, background: below ? '#dc2626' : '#0284c7', width: `${pct}%` }} />
                  {req?.minThreshold != null && (
                    <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: '#94a3b8', right: `${req.minThreshold}%` }} />
                  )}
                </div>
                <span style={{ width: 50, flexShrink: 0, textAlign: 'left', fontSize: 10.5, color: sub }}>
                  {s.normalizedScore != null ? Math.round(s.normalizedScore).toLocaleString('fa-IR') : '—'}
                </span>
              </div>
            )
          })}
          <p style={{ margin: '6px 0 0', fontSize: 9.5, color: '#94a3b8' }}>خط عمودی: حداقل الزام شغلی — ★: بعد حیاتی برای این شغل</p>
        </div>
      )}

      {(assessment.computedPatterns.length > 0 || assessment.computedWatchpoints.length > 0) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {assessment.computedPatterns.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>الگوهای برجسته</p>
              <ul style={{ margin: 0, paddingRight: 16, fontSize: 10.5, lineHeight: 1.7, color: sub }}>
                {assessment.computedPatterns.map((p, i) => (
                  <li key={i}>{p.interpretation}</li>
                ))}
              </ul>
            </div>
          )}
          {assessment.computedWatchpoints.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#b45309' }}>نقاط قابل بررسی بیشتر</p>
              <ul style={{ margin: 0, paddingRight: 16, fontSize: 10.5, lineHeight: 1.7, color: sub }}>
                {assessment.computedWatchpoints.map((w, i) => (
                  <li key={i}>{w.topic}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {aiAnalysis && (
        <div style={{ marginBottom: 20, border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800 }}>خلاصه تحلیل هوشمند</p>
          <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.8, color: sub }}>{aiAnalysis.analysis.executive_summary}</p>
          {aiAnalysis.analysis.role_fit_narrative && (
            <>
              <p style={{ margin: '10px 0 4px', fontSize: 11, fontWeight: 800 }}>تحلیل جامع تطابق با شغل</p>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.8, color: sub }}>{aiAnalysis.analysis.role_fit_narrative}</p>
            </>
          )}
        </div>
      )}

      <p style={{ marginTop: 26, fontSize: 9.5, color: '#94a3b8' }}>تهیه‌شده توسط سامانه مدیریت پروژه RASTA — ماژول ارزیابی شخصیت و رفتاری.</p>
    </div>
  )
}
