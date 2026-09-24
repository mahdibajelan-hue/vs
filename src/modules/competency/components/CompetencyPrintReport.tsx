import { formatJalali } from '../../../lib/jalali'
import { computeCompletion, computeDomainScores, computeOverallPercent, domainFlags, maturityBand } from '../lib/competencyModel'
import { usesLegacyPmRubric, type RoleRecommendation, ROLE_RECOMMENDATION_LABEL_FA } from '../lib/roleCompetencyModel'
import { formatLevel, GAP_CONFIDENCE_META, GAP_STATUS_META, sortGapRows, type GapRow } from '../lib/competencyGap'
import { ACTION_STATUS_META, ACTION_TYPE_LABEL_FA, PLAN_STATUS_META, PRIORITY_META, planProgress } from '../lib/developmentPlan'
import type { CompDevelopmentAction, CompDevelopmentPlan, CompetencyAnswers, CompetencyAssessment, DomainScore } from '../types'

/**
 * Light-mode, print/PDF-friendly rendering of the competency results report — a separate
 * component from ResultsStage's on-screen dark view (same convention as ExecutiveReportPrint.tsx
 * in the Finance module), because html2canvas captures the dark theme's actual colors verbatim
 * and a black background wastes paper/ink and reads poorly once printed.
 */
/**
 * Radar plot of the eight domain scores, drawn as plain SVG with fixed coordinates.
 *
 * Deliberately not the Recharts chart used on screen: that one animates its shape in on mount and
 * sizes itself by measuring its container, and html2canvas rasterises whatever happens to be on
 * the page at capture time — so it lands in the PDF half-drawn or not at all. Static geometry has
 * neither problem, and prints crisply.
 */
function PrintRadar({ domainScores }: { domainScores: DomainScore[] }) {
  // The box is wider than the plot on purpose: Persian domain labels sit outside the outermost
  // ring and run 60-70px long, so a box sized to the plot alone clips them.
  const width = 360
  const height = 300
  const cx = width / 2
  const cy = height / 2
  const radius = 84
  const n = domainScores.length
  const rings = [25, 50, 75, 100]
  const accent = '#7c3aed'

  const pointAt = (index: number, percent: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n
    const r = (radius * percent) / 100
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  }

  const shape = domainScores.map((d, i) => pointAt(i, d.percentScore ?? 0).join(',')).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', margin: '0 auto' }}>
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={domainScores.map((_, i) => pointAt(i, ring).join(',')).join(' ')}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {domainScores.map((_, i) => {
        const [x, y] = pointAt(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />
      })}
      <polygon points={shape} fill={accent} fillOpacity={0.18} stroke={accent} strokeWidth={2} />
      {domainScores.map((d, i) => {
        const [x, y] = pointAt(i, d.percentScore ?? 0)
        return <circle key={d.domain.key} cx={x} cy={y} r={2.5} fill={accent} />
      })}
      {domainScores.map((d, i) => {
        const [x, y] = pointAt(i, 118)
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end'
        return (
          <text key={d.domain.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={8} fill="#475569">
            {d.domain.shortTitle}
          </text>
        )
      })}
    </svg>
  )
}

/** One interviewer's overall contribution, summarised for the report's panel section. */
export interface PanelSummaryRow {
  name: string
  overallPercent: number | null
  submitted: boolean
}

interface CompetencyPrintReportProps {
  assessment: CompetencyAssessment
  panel?: PanelSummaryRow[]
  /** Pre-computed by ResultsStage for role-based (non project-manager) assessments — this
   * component has no access to comp_question_bank itself, so it never recomputes these for a role
   * assessment and falls back to the fixed PM rubric only when both are omitted. */
  domainScoresOverride?: DomainScore[]
  /** The official (panel-averaged) answers ResultsStage already resolved — used only for the PM
   * completion count so it matches the on-screen page instead of recounting the lead's raw entry. */
  answersOverride?: CompetencyAnswers
  /** The official (panel-averaged) qualification scores ResultsStage already resolved. */
  qualificationOverride?: {
    educationScore: number | null
    experienceScore: number | null
    pmTrainingScore: number | null
    pmCertificationScore: number | null
  }
  roleRecommendation?: RoleRecommendation | null
  /** This component has no store access of its own by design (see the note on domainScoresOverride
   * above) — the caller resolves the job-role catalog label and passes it down, same convention as
   * every other value this report renders. */
  jobRoleLabel: string
  /** Phase 4 gap-analysis rows (Competency Engine output) — rendered as one compact table; omitted
   * when the candidate's competency profile hasn't been computed. */
  competencyGapRows?: GapRow[]
  /** Phase 5 Individual Development Plan summary — omitted when no plan exists. */
  developmentPlan?: {
    plan: CompDevelopmentPlan
    actions: CompDevelopmentAction[]
    competencyLabel: (competencyId: string) => string
    ownerName: string | null
  } | null
}

export function CompetencyPrintReport({
  assessment,
  panel = [],
  domainScoresOverride,
  answersOverride,
  qualificationOverride,
  roleRecommendation,
  jobRoleLabel,
  competencyGapRows = [],
  developmentPlan = null,
}: CompetencyPrintReportProps) {
  const isPM = usesLegacyPmRubric(assessment)
  const domainScores = domainScoresOverride ?? computeDomainScores(assessment.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  // domainScores already reflects whichever scoring model ResultsStage actually used (the fixed PM
  // rubric or the DB-backed question bank — a PM candidate can now be either, see
  // usesLegacyPmRubric), so its own answered/total counts are always correct; only the no-override
  // fallback (never hit by the real caller, which always passes one) still needs the fixed rubric's
  // own counter.
  const completion = domainScoresOverride
    ? { answered: domainScores.reduce((s, d) => s + d.answeredCount, 0), total: domainScores.reduce((s, d) => s + d.totalCount, 0) }
    : isPM
      ? computeCompletion(answersOverride ?? assessment.answers)
      : { answered: domainScores.reduce((s, d) => s + d.answeredCount, 0), total: domainScores.reduce((s, d) => s + d.totalCount, 0) }
  const { strengths, weaknesses } = domainFlags(domainScores)

  const submittedPanelPercents = panel.filter((p) => p.submitted && p.overallPercent != null).map((p) => p.overallPercent as number)
  const panelAverage = submittedPanelPercents.length > 0 ? Math.round(submittedPanelPercents.reduce((a, b) => a + b, 0) / submittedPanelPercents.length) : null

  const qualificationChips = [
    { label: 'مدرک تحصیلی', value: qualificationOverride?.educationScore ?? assessment.educationScore },
    { label: 'سوابق کاری مرتبط', value: qualificationOverride?.experienceScore ?? assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', value: qualificationOverride?.pmTrainingScore ?? assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', value: qualificationOverride?.pmCertificationScore ?? assessment.pmCertificationScore },
    { label: 'نتایج مصاحبه', value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
  ]

  const ink = '#0f172a'
  const sub = '#475569'
  const line = '#e2e8f0'
  const accent = '#7c3aed'

  return (
    // Font named explicitly rather than via var(--font-sans): this markup is also cloned into a
    // blank print iframe, where the app's CSS custom properties don't exist.
    <div style={{ background: '#ffffff', color: ink, width: 900, padding: '36px 40px', fontFamily: '"Vazirmatn", "Segoe UI", sans-serif', direction: 'rtl' }}>
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
            <p style={{ margin: '6px 0 0', fontSize: 10.5, lineHeight: 1.7, color: accent, fontWeight: 600 }}>سمت شغلی پیشنهادی: {band.suggestedPositions}</p>
          </div>
        </div>
      </div>

      {qualificationChips.some((c) => c.value != null) && (
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
      )}

      {!isPM && roleRecommendation && (
        <div style={{ marginBottom: 20, border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800 }}>
            {jobRoleLabel} — پیشنهاد نهایی: <span style={{ color: accent }}>{ROLE_RECOMMENDATION_LABEL_FA[roleRecommendation.grade]}</span>
          </p>
          {roleRecommendation.hasCriticalGap && <p style={{ margin: '4px 0 0', fontSize: 10, lineHeight: 1.7, color: '#b91c1c' }}>{roleRecommendation.reason}</p>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, marginBottom: 20, alignItems: 'flex-start' }}>
        <div style={{ width: 366, flexShrink: 0 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 800 }}>نمودار رادار بلوغ شایستگی</p>
          <PrintRadar domainScores={domainScores} />
        </div>
        <div style={{ flex: 1 }}>
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
      </div>

      {panel.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>پنل مصاحبه‌گران</p>
            <p style={{ margin: 0, fontSize: 10.5 }}>
              میانگین امتیاز داوران:{' '}
              <span style={{ fontWeight: 800, color: accent }}>{panelAverage != null ? `٪${panelAverage.toLocaleString('fa-IR')}` : '—'}</span>
            </p>
          </div>
          {panel.map((p) => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, borderBottom: `1px solid ${line}` }}>
              <span style={{ color: sub }}>{p.name}</span>
              <span style={{ fontWeight: 700 }}>
                {p.submitted ? (p.overallPercent != null ? `٪${p.overallPercent.toLocaleString('fa-IR')}` : 'ثبت نهایی — بدون امتیاز') : 'ثبت نهایی نشده'}
              </span>
            </div>
          ))}
          <p style={{ margin: '6px 0 0', fontSize: 9.5, color: '#94a3b8' }}>امتیاز کلی بالای این گزارش میانگین امتیازات همهٔ داورانی است که ثبت نهایی کرده‌اند.</p>
        </div>
      )}

      {competencyGapRows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800 }}>تحلیل شکاف شایستگی</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: sub }}>
                {['شایستگی', 'الزامی', 'واقعی', 'شکاف', 'اطمینان', 'شواهد', 'وضعیت'].map((h) => (
                  <th key={h} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${line}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortGapRows(competencyGapRows, 'severity').map((r) => {
                const status = GAP_STATUS_META[r.score.status]
                const insufficient = r.score.status === 'INSUFFICIENT_EVIDENCE'
                return (
                  <tr key={r.competencyId} style={{ borderBottom: `1px solid ${line}`, color: insufficient ? '#94a3b8' : undefined }}>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>
                      {r.labelFa}
                      {r.score.isCritical ? ' ★' : ''}
                    </td>
                    <td style={{ padding: '3px 6px' }}>{formatLevel(r.score.requiredLevel)}</td>
                    <td style={{ padding: '3px 6px' }}>{insufficient ? 'نامعلوم' : formatLevel(r.score.actualLevel)}</td>
                    <td style={{ padding: '3px 6px' }}>{r.score.gap == null ? 'نامعلوم' : r.score.gap > 0 ? `${formatLevel(r.score.gap)}−` : r.score.gap < 0 ? `${formatLevel(-r.score.gap)}+` : '۰'}</td>
                    <td style={{ padding: '3px 6px' }}>{GAP_CONFIDENCE_META[r.score.confidence].label}</td>
                    <td style={{ padding: '3px 6px' }}>{r.score.evidenceCount.toLocaleString('fa-IR')}</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, color: insufficient ? '#64748b' : status.color === '#fbbf24' ? '#b45309' : status.color === '#f87171' ? '#b91c1c' : '#15803d' }}>
                      {status.label}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ margin: '4px 0 0', fontSize: 9, color: '#94a3b8' }}>★ شایستگی حیاتی · «شواهد ناکافی» یعنی هنوز داده‌ای ثبت نشده — نه ضعف متقاضی.</p>
        </div>
      )}

      {developmentPlan && (
        <div style={{ marginBottom: 20 }}>
          {(() => {
            const progress = planProgress(developmentPlan.actions)
            const rows = [...developmentPlan.actions].filter((a) => a.status !== 'CANCELLED').sort((a, b) => a.sortOrder - b.sortOrder)
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>برنامه توسعه فردی — {PLAN_STATUS_META[developmentPlan.plan.status].label}</p>
                  <p style={{ margin: 0, fontSize: 10, color: sub }}>
                    پیشرفت: {progress.done.toLocaleString('fa-IR')} از {progress.total.toLocaleString('fa-IR')} اقدام (٪{progress.percent.toLocaleString('fa-IR')})
                    {developmentPlan.ownerName ? ` · مسئول پیگیری: ${developmentPlan.ownerName}` : ''}
                    {developmentPlan.plan.targetReviewDate ? ` · بازبینی: ${formatJalali(developmentPlan.plan.targetReviewDate)}` : ''}
                  </p>
                </div>
                {developmentPlan.plan.summary && <p style={{ margin: '0 0 6px', fontSize: 10, lineHeight: 1.7, color: sub }}>{developmentPlan.plan.summary}</p>}
                {rows.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: sub }}>
                        {['شایستگی', 'اقدام', 'نوع', 'اولویت', 'سطح فعلی ← هدف', 'مهلت', 'وضعیت'].map((h) => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${line}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id} style={{ borderBottom: `1px solid ${line}` }}>
                          <td style={{ padding: '3px 6px', fontWeight: 700 }}>{a.competencyId ? developmentPlan.competencyLabel(a.competencyId) : 'عمومی'}</td>
                          <td style={{ padding: '3px 6px' }}>{a.title}</td>
                          <td style={{ padding: '3px 6px' }}>{ACTION_TYPE_LABEL_FA[a.actionType]}</td>
                          <td style={{ padding: '3px 6px' }}>{PRIORITY_META[a.priority].label.replace('اولویت ', '')}</td>
                          <td style={{ padding: '3px 6px' }}>
                            {a.actionType === 'EVIDENCE_COLLECTION' ? 'گردآوری شواهد' : `${formatLevel(a.currentLevel)} ← ${formatLevel(a.targetLevel)}`}
                          </td>
                          <td style={{ padding: '3px 6px' }}>{a.dueDate ? formatJalali(a.dueDate) : '—'}</td>
                          <td style={{ padding: '3px 6px', fontWeight: 700, color: a.status === 'DONE' ? '#15803d' : a.status === 'IN_PROGRESS' ? '#0369a1' : sub }}>
                            {ACTION_STATUS_META[a.status].label}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 9, color: '#94a3b8' }}>«ارزیابی تکمیلی» برای شایستگی‌های فاقد شواهد است — نه برنامه آموزشی برای ضعف.</p>
              </>
            )
          })()}
        </div>
      )}

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
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>نقاط قوت برجسته (بر اساس امتیاز حوزه‌ها)</p>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{strengths.map((s) => s.domain.title).join('، ')}</p>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>حوزه‌های نیازمند توسعه (بر اساس امتیاز حوزه‌ها)</p>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{weaknesses.map((s) => s.domain.title).join('، ')}</p>
            </div>
          )}
        </div>
      )}

      {(assessment.strengths || assessment.developmentAreas) && (
        <div style={{ marginBottom: 20, border: `1px solid ${line}`, borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800 }}>جمع‌بندی مسئول ارزیابی</p>
          <div style={{ display: 'flex', gap: 16 }}>
            {assessment.strengths && (
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#15803d' }}>نقاط قوت</p>
                <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{assessment.strengths}</p>
              </div>
            )}
            {assessment.developmentAreas && (
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#b45309' }}>زمینه‌های قابل بهبود</p>
                <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.7, color: sub }}>{assessment.developmentAreas}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <p style={{ marginTop: 26, fontSize: 9.5, color: '#94a3b8' }}>تهیه‌شده توسط سامانه مدیریت پروژه RASTA — ماژول ارزیابی شایستگی.</p>
    </div>
  )
}
