import { formatJalali } from '../../../lib/jalali'
import { computeCompletion, computeDomainScores, computeOverallPercent, domainFlags, maturityBand } from '../lib/competencyModel'
import type { CompetencyAssessment } from '../types'

/**
 * Light-mode, print/PDF-friendly rendering of the competency results report — a separate
 * component from ResultsStage's on-screen dark view (same convention as ExecutiveReportPrint.tsx
 * in the Finance module), because html2canvas captures the dark theme's actual colors verbatim
 * and a black background wastes paper/ink and reads poorly once printed.
 */
export function CompetencyPrintReport({ assessment }: { assessment: CompetencyAssessment }) {
  const domainScores = computeDomainScores(assessment.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const completion = computeCompletion(assessment.answers)
  const { strengths, weaknesses } = domainFlags(domainScores)

  const qualificationChips = [
    { label: 'مدرک تحصیلی', value: assessment.educationScore },
    { label: 'سوابق کاری مرتبط', value: assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', value: assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', value: assessment.pmCertificationScore },
    { label: 'نتایج مصاحبه', value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
  ]

  const ink = '#0f172a'
  const sub = '#475569'
  const line = '#e2e8f0'
  const accent = '#7c3aed'

  return (
    <div style={{ background: '#ffffff', color: ink, width: 900, padding: '36px 40px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>
      <div style={{ borderBottom: `2px solid ${ink}`, paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>گزارش ارزیابی شایستگی — {assessment.candidateName}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: sub, fontWeight: 600 }}>{assessment.candidatePosition}</p>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: 11, color: sub }}>تاریخ مصاحبه: {formatJalali(assessment.interviewDate)}</p>
          {assessment.isApproved && <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 800, color: '#15803d' }}>✓ تایید صلاحیت شده</p>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>مشخصات نامزد</p>
          {[
            ['کد ملی', assessment.candidateNationalId || '—'],
            ['شماره تماس', assessment.candidatePhone || '—'],
            ['ایمیل', assessment.candidateEmail || '—'],
            ['سن', assessment.candidateAge != null ? `${assessment.candidateAge} سال` : '—'],
            ['معلولیت جسمی', assessment.hasDisability ? assessment.disabilityNote || 'دارد' : 'ندارد'],
            ['سابقه کل کار', assessment.yearsExperienceTotal != null ? `${assessment.yearsExperienceTotal} سال` : '—'],
            ['سابقه اجرای خط لوله', assessment.yearsExperiencePipeline != null ? `${assessment.yearsExperiencePipeline} سال` : '—'],
            ['کارفرمای فعلی', assessment.currentEmployer || '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11.5, borderBottom: `1px solid ${line}` }}>
              <span style={{ color: sub }}>{l}</span>
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: accent }}>{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700 }}>{band.label}</p>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: sub }}>
              {completion.answered.toLocaleString('fa-IR')} از {completion.total.toLocaleString('fa-IR')} سوال پاسخ داده شده
            </p>
          </div>
          <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800 }}>تفسیر بلوغ و توصیه استفاده</p>
            <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{band.guidance}</p>
            <p style={{ margin: '6px 0 0', fontSize: 10.5, lineHeight: 1.7, color: accent, fontWeight: 600 }}>پوزیشن پیشنهادی: {band.suggestedPositions}</p>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>کارت امتیاز شایستگی</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {qualificationChips.map((c) => (
            <div key={c.label} style={{ border: `1px solid ${line}`, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: accent }}>{c.value != null ? c.value.toLocaleString('fa-IR') : '—'}</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: sub, lineHeight: 1.4 }}>{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>امتیاز به تفکیک حوزه (با وزن)</p>
        {domainScores.map((d) => (
          <div key={d.domain.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <span style={{ width: 150, flexShrink: 0, fontSize: 10.5, color: sub }}>
              {d.domain.shortTitle} <span style={{ color: '#94a3b8' }}>(٪{d.domain.weight})</span>
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 5, background: accent, width: `${d.percentScore ?? 0}%` }} />
            </div>
            <span style={{ width: 80, flexShrink: 0, textAlign: 'left', fontSize: 10.5, color: sub }}>
              {d.percentScore != null ? `٪${d.percentScore.toLocaleString('fa-IR')}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {assessment.capstoneScore != null && (
        <div style={{ marginBottom: 20, border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800 }}>امتیاز سناریوی پایانی (بحران چندوجهی)</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{assessment.capstoneScore.toLocaleString('fa-IR')} / ۵</p>
          {assessment.capstoneNote && <p style={{ margin: '4px 0 0', fontSize: 10.5, lineHeight: 1.7, color: sub }}>{assessment.capstoneNote}</p>}
        </div>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {strengths.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>نقاط قوت برجسته</p>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{strengths.map((s) => s.domain.title).join('، ')}</p>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>حوزه‌های نیازمند توسعه</p>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{weaknesses.map((s) => s.domain.title).join('، ')}</p>
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 26, fontSize: 9.5, color: '#94a3b8' }}>تهیه‌شده توسط سامانه مدیریت پروژه RASTA — ماژول ارزیابی شایستگی.</p>
    </div>
  )
}
