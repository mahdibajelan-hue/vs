import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Compass, Fingerprint, Gauge, Loader2, Printer, ShieldCheck, ShieldQuestion, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { jobRoleLabel } from '../../competency/lib/competencyData'
import { tone } from '../../competency/lib/tone'
import { printReportNode } from '../../competency/lib/reportExport'
import { PersonalityPrintReport } from './PersonalityPrintReport'
import { RoleAlignmentCard, ThresholdBar } from './RoleAlignmentCard'
import { RingChart } from '../../competency/components/DonutChart'
import { buildFingerprintSnapshot, scoreBandFa, type FingerprintDimensionRow, type FingerprintTraitRow } from '../lib/fingerprintModel'
import { overallVerdict } from '../lib/roleAlignment'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA, type PersonalityValidityResult, type PersonalityValidityStatus } from '../types'
import '../../competency/styles/farinTheme.css'

interface PersonalityFingerprintPanelProps {
  personalityAssessmentId: string
  candidateName: string
  candidatePosition?: string
  /** Shown as a trailing "continue" button when set — the dedicated wizard stage advances to the
   * next stage from here; the aggregated results view (ResultsStage) omits it entirely. */
  onContinue?: () => void
  /** The dedicated wizard stage offers its own "چاپ گزارش" (personality-only) print; the aggregated
   * results view already has a full-report print/PDF flow of its own. Defaults to true. */
  showPrintButton?: boolean
}

const VALIDITY_TONE: Record<PersonalityValidityStatus, string> = { VALID: '#10b981', ACCEPTABLE: '#0ea5e9', REVIEW_REQUIRED: '#f59e0b', INVALID: '#ef4444' }

function SectionHeading({ icon: Icon, color, en, fa, subtitle }: { icon: typeof Fingerprint; color: string; en: string; fa: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-1" style={tone(color)}>
      <span className="fx-tone-bg-strong fx-tone-text flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-extrabold leading-6">
          <bdi dir="ltr">{en}</bdi> <span className="fx-text-2">({fa})</span>
        </p>
        {subtitle && <p className="fx-muted text-[11px]">{subtitle}</p>}
      </div>
      <div className="fx-tone-bg-strong h-px flex-1" />
    </div>
  )
}

/**
 * The scored behavioral fingerprint — hero summary (role fit, validity, top strengths and
 * watchpoints), Big Five traits as a radar + colored trait cards, the professional behavioral
 * dimensions grouped by family with job thresholds, computed patterns/watchpoints and the role
 * alignment card. Every trait/dimension is named bilingually «English (فارسی)». Deterministic —
 * no AI generation here. Rendered by PersonalityStage (wizard stage) and ResultsStage (results).
 */
export function PersonalityFingerprintPanel({ personalityAssessmentId, candidateName, candidatePosition, onContinue, showPrintButton = true }: PersonalityFingerprintPanelProps) {
  // Stable store references only; everything derived in memos (a selector returning a fresh array
  // makes zustand 5 loop forever — the black-screen bug).
  const assessments = usePersonalityStore((s) => s.assessments)
  const allDimensionScores = usePersonalityStore((s) => s.dimensionScores)
  const validityResults = usePersonalityStore((s) => s.validityResults)
  const fetchDimensionScores = usePersonalityStore((s) => s.fetchDimensionScores)
  const fetchValidityResult = usePersonalityStore((s) => s.fetchValidityResult)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)
  const traits = usePersonalityStore((s) => s.traits)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const jobRequirements = usePersonalityStore((s) => s.jobRequirements)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)

  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDimensionScores(personalityAssessmentId)
    fetchValidityResult(personalityAssessmentId)
    // Labels come from the catalog — the results page can be the first personality view opened.
    if (traits.length === 0 || dimensions.length === 0) fetchCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalityAssessmentId])

  const assessment = useMemo(() => assessments.find((a) => a.id === personalityAssessmentId), [assessments, personalityAssessmentId])
  const dimensionScores = useMemo(() => allDimensionScores.filter((d) => d.personalityAssessmentId === personalityAssessmentId), [allDimensionScores, personalityAssessmentId])
  const validityResult = useMemo(() => validityResults.find((v) => v.personalityAssessmentId === personalityAssessmentId), [validityResults, personalityAssessmentId])
  const requirementsForProfile = useMemo(() => jobRequirements.filter((r) => r.profileId === assessment?.jobProfileId), [jobRequirements, assessment])
  const snapshot = useMemo(
    () =>
      assessment
        ? buildFingerprintSnapshot({ assessment, scores: dimensionScores, traits, dimensions, requirements: jobRequirements, validity: validityResult })
        : null,
    [assessment, dimensionScores, traits, dimensions, jobRequirements, validityResult],
  )

  if (!assessment || !snapshot) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 size={22} className="animate-spin text-pink-400" />
      </div>
    )
  }

  const roleLabel = jobRoleLabel(jobRoleConfigs, assessment.jobRole)
  const families = [...new Set(snapshot.dimensions.map((d) => d.familyKey))]
  const verdict = overallVerdict(snapshot.alignment.overallAlignmentPercent, snapshot.alignment.criticalGapCount)
  const watchTexts = [...snapshot.watchDimensions.map((d) => `${d.label.en} (${d.label.fa})${d.minThreshold != null && d.score != null && d.score < d.minThreshold ? ' — زیر حداقل الزام' : ''}`), ...snapshot.watchpoints]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 4)

  return (
    <div className="fx fx-remap space-y-4">
      {showPrintButton && (
        <>
          <div className="no-print flex justify-end">
            <button
              onClick={() => printRef.current && printReportNode(printRef.current, `گزارش-شخصیت-${candidateName}`)}
              className="fx-sub flex min-h-10 items-center gap-1.5 px-3.5 py-2 text-xs font-bold hover:brightness-110"
            >
              <Printer size={14} /> چاپ / PDF گزارش شخصیت
            </button>
          </div>
          <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
            <PersonalityPrintReport
              assessment={assessment}
              candidateName={candidateName}
              candidatePosition={candidatePosition}
              traitScores={dimensionScores.filter((d) => d.scoreKind === 'TRAIT')}
              behavioralScores={dimensionScores.filter((d) => d.scoreKind === 'BEHAVIORAL_DIMENSION')}
              traits={traits}
              dimensions={dimensions}
              jobRequirements={requirementsForProfile}
              validityResult={validityResult}
              jobRoleLabel={roleLabel}
            />
          </div>
        </>
      )}

      {/* Hero summary */}
      <div className="fx-card fx-tone-wash overflow-hidden p-4 sm:p-5" style={tone('#ec4899')}>
        <div className="mb-3 flex items-center gap-2">
          <Fingerprint size={18} className="fx-tone-text" />
          <p className="text-[15px] font-black">
            Behavioral Fingerprint <span className="fx-text-2 font-bold">(اثرانگشت رفتاری)</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HeroTile color={verdict.color} icon={Gauge} title="Role Fit (تطابق شغلی)">
            <p className="num fx-tone-text text-3xl font-black leading-9">
              {snapshot.alignment.overallAlignmentPercent != null ? `٪${snapshot.alignment.overallAlignmentPercent.toLocaleString('fa-IR')}` : '—'}
            </p>
            <p className="fx-text-2 text-[11.5px] leading-5">{snapshot.hasJobProfile ? verdict.label : `نیم‌رخ رفتاری «${roleLabel}» تعریف نشده`}</p>
          </HeroTile>
          <HeroTile
            color={validityResult ? VALIDITY_TONE[validityResult.overallStatus] : '#94a3b8'}
            icon={validityResult && (validityResult.overallStatus === 'VALID' || validityResult.overallStatus === 'ACCEPTABLE') ? ShieldCheck : ShieldQuestion}
            title="Validity (اعتبار پاسخ‌ها)"
          >
            <p className="fx-tone-text text-xl font-black leading-9">{validityResult ? PERSONALITY_VALIDITY_STATUS_LABEL_FA[validityResult.overallStatus] : 'محاسبه نشده'}</p>
            {validityResult?.consistencyScore != null && (
              <p className="fx-text-2 num text-[11.5px]">سازگاری پاسخ‌ها ٪{Math.round(validityResult.consistencyScore * 100).toLocaleString('fa-IR')}</p>
            )}
          </HeroTile>
          <HeroTile color="#10b981" icon={TrendingUp} title="Top Strengths (نقاط قوت)">
            {snapshot.topStrengths.length === 0 ? (
              <p className="fx-muted text-[11.5px]">بعدی با امتیاز ۶۰+ ثبت نشده</p>
            ) : (
              <ul className="space-y-1">
                {snapshot.topStrengths.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="truncate">
                      <b dir="ltr">{d.label.en}</b> <span className="fx-text-2">({d.label.fa})</span>
                    </span>
                    <span className="num fx-tone-text shrink-0 font-black">{Math.round(d.score ?? 0).toLocaleString('fa-IR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </HeroTile>
          <HeroTile color="#f59e0b" icon={AlertTriangle} title="Watchpoints (نقاط قابل بررسی)">
            {watchTexts.length === 0 ? (
              <p className="fx-muted text-[11.5px]">موردی برای بررسی بیشتر ثبت نشده</p>
            ) : (
              <ul className="fx-text-2 list-disc space-y-1 pr-4 text-[11.5px] leading-5">
                {watchTexts.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </HeroTile>
        </div>
      </div>

      {validityResult && <ValidityBanner result={validityResult} />}

      {/* Big Five */}
      {snapshot.traits.length > 0 && (
        <>
          <SectionHeading icon={Sparkles} color="#8b5cf6" en="Big Five Personality Traits" fa="ویژگی‌های شخصیتی — پنج عامل بزرگ" subtitle="امتیاز ۰ تا ۱۰۰؛ هر ویژگی رنگ مخصوص خود را دارد" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.15fr]">
            <div className="fx-card p-3">
              <TraitRadar traits={snapshot.traits} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {snapshot.traits.map((t) => (
                <TraitCard key={t.id} trait={t} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Behavioral dimensions */}
      {snapshot.dimensions.length > 0 && (
        <>
          <SectionHeading icon={Gauge} color="#0ea5e9" en="Professional Behavioral Dimensions" fa="ابعاد رفتاری حرفه‌ای" subtitle="گروه‌بندی بر اساس خانواده رفتاری؛ خط تیره = حداقل الزام شغل" />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {families.map((fk) => {
              const rows = snapshot.dimensions.filter((d) => d.familyKey === fk)
              const head = rows[0]
              return (
                <div key={fk} className="fx-card overflow-hidden p-4" style={tone(head.tone)}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[13px] font-extrabold">
                      <span className="fx-tone-text" dir="ltr">
                        {head.familyLabelEn}
                      </span>{' '}
                      <span className="fx-text-2">({head.familyLabelFa})</span>
                    </p>
                    <span className="fx-tone-bg fx-tone-text num rounded-full px-2 py-0.5 text-[10.5px] font-bold">{rows.length.toLocaleString('fa-IR')} بعد</span>
                  </div>
                  <div className="space-y-3">
                    {rows.map((d) => (
                      <DimensionRow key={d.id} dim={d} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {(snapshot.patterns.length > 0 || snapshot.watchpoints.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {snapshot.patterns.length > 0 && (
            <div className="fx-card fx-accent-bar p-4" style={tone('#10b981')}>
              <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                <TrendingUp size={14} /> الگوهای برجسته
              </p>
              <ul className="fx-text-2 list-disc space-y-1.5 pr-4 text-[12px] leading-6">
                {snapshot.patterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {snapshot.watchpoints.length > 0 && (
            <div className="fx-card fx-accent-bar p-4" style={tone('#f59e0b')}>
              <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                <TrendingDown size={14} /> نقاط قابل بررسی بیشتر در مصاحبه
              </p>
              <ul className="fx-text-2 list-disc space-y-1.5 pr-4 text-[12px] leading-6">
                {snapshot.watchpoints.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <SectionHeading icon={Compass} color="#10b981" en="Role Alignment" fa="ترکیب شایستگی‌های شغلی و تطابق با شغل" />
      <RoleAlignmentCard jobRole={assessment.jobRole} hasProfile={assessment.jobProfileId != null} alignment={snapshot.alignment} />

      {onContinue && (
        <div className="no-print flex justify-end">
          <button onClick={onContinue} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500">
            رفتن به ارزیابی فنی <ArrowLeft size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function HeroTile({ color, icon: Icon, title, children }: { color: string; icon: typeof Gauge; title: string; children: ReactNode }) {
  return (
    <div className="fx-sub fx-accent-bar p-3.5" style={tone(color)}>
      <p className="fx-muted mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
        <Icon size={13} className="fx-tone-text" /> {title}
      </p>
      {children}
    </div>
  )
}

function TraitRadar({ traits }: { traits: FingerprintTraitRow[] }) {
  const data = traits.map((t) => ({ trait: t.label.en, fa: t.label.fa, score: Math.round(t.score ?? 0) }))
  return (
    // dir="ltr": SVG text-anchor start/end flips under RTL and the axis labels collide.
    <div dir="ltr" role="img" aria-label={`نمودار راداری پنج عامل: ${traits.map((t) => `${t.label.fa} ${Math.round(t.score ?? 0)}`).join('، ')}`}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="60%" margin={{ top: 10, right: 34, bottom: 10, left: 34 }}>
          <defs>
            <radialGradient id="traitRadarFill">
              <stop offset="0%" stopColor="#ec4899" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.15} />
            </radialGradient>
          </defs>
          <PolarGrid stroke="var(--fx-grid)" />
          <PolarAngleAxis dataKey="trait" tick={RadarTick} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--fx-chart-muted)', fontSize: 9 }} tickCount={5} axisLine={false} />
          <Radar name="امتیاز" dataKey="score" stroke="#a855f7" strokeWidth={2.5} fill="url(#traitRadarFill)" dot={{ r: 4, fill: '#ec4899', strokeWidth: 0 }} isAnimationActive={false} />
          <Tooltip
            contentStyle={{ background: 'var(--fx-tooltip-bg)', border: '1px solid var(--fx-border-strong)', borderRadius: 10, fontSize: 12, color: 'var(--text-primary)' }}
            formatter={(value, _name, item) => [`${Number(value)} از ۱۰۰`, (item?.payload as { fa?: string } | undefined)?.fa ?? '']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Axis label: the English trait name on up to two lines + its score, so long names never clip. */
function RadarTick(props: { x?: number | string; y?: number | string; textAnchor?: string; payload?: { value: string; index?: number } }) {
  const { x = 0, y = 0, textAnchor = 'middle', payload } = props
  const words = (payload?.value ?? '').split(' ')
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words
  return (
    <text x={Number(x)} y={Number(y)} textAnchor={textAnchor as 'start' | 'middle' | 'end'} fill="var(--fx-chart-label)" fontSize={11} fontWeight={700}>
      {lines.map((l, i) => (
        <tspan key={i} x={Number(x)} dy={i === 0 ? (lines.length > 1 ? -4 : 4) : 13}>
          {l}
        </tspan>
      ))}
    </text>
  )
}

function TraitCard({ trait: t }: { trait: FingerprintTraitRow }) {
  const pct = Math.max(0, Math.min(100, t.score ?? 0))
  return (
    <div className="fx-sub p-3" style={tone(t.tone)}>
      <div className="flex items-center gap-3">
        <RingChart value={t.score} color={t.tone} size={46} strokeWidth={6} label={t.label.fa}>
          <span className="num fx-tone-text text-[13px] font-black leading-none">{t.score != null ? Math.round(t.score).toLocaleString('fa-IR') : '—'}</span>
        </RingChart>
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-[12.5px] font-bold">
            <span className="fx-tone-text" dir="ltr">
              {t.label.en}
            </span>{' '}
            <span className="fx-text-2 font-medium">({t.label.fa})</span>
          </p>
          <p className="fx-muted text-[10.5px]">{scoreBandFa(t.score)}</p>
          <div className="fx-track mt-1.5 h-2 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, marginInlineStart: 0, background: `linear-gradient(270deg, color-mix(in srgb, ${t.tone} 45%, transparent), ${t.tone})` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DimensionRow({ dim: d }: { dim: FingerprintDimensionRow }) {
  const below = d.status === 'BELOW_MIN' || d.status === 'BELOW_PREFERRED'
  const color = below ? '#ef4444' : d.tone
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-2 text-[12px]">
        <span className="min-w-0 leading-5">
          <b dir="ltr">{d.label.en}</b> <span className="fx-text-2">({d.label.fa})</span>
          {d.isCritical && (
            <span title="الزام حیاتی برای این شغل" style={{ color: '#f59e0b' }}>
              {' '}
              ★
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {below && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={tone('#ef4444')}>
              <span className="fx-tone-text">زیر حداقل</span>
            </span>
          )}
          <span className="num fx-tone-text text-[14px] font-black" style={tone(color)}>
            {d.score != null ? Math.round(d.score).toLocaleString('fa-IR') : '—'}
          </span>
        </span>
      </div>
      <ThresholdBar value={d.score} color={color} min={d.minThreshold} preferredMin={d.preferredMin} preferredMax={d.preferredMax} height={9} />
      {d.minThreshold != null && <p className="fx-muted num mt-0.5 text-[10px]">حداقل الزام شغل: {d.minThreshold.toLocaleString('fa-IR')}</p>}
    </div>
  )
}

const REVIEW_REASON_LABEL_FA: Record<string, string> = {
  STRAIGHT_LINING: 'الگوی پاسخ یکنواخت',
  MISSING_RESPONSES: 'سؤال بی‌پاسخ',
  RANDOM_PATTERN: 'الگوی پاسخ تصادفی/شتاب‌زده',
  CONTRADICTIONS: 'پاسخ‌های متناقض',
  SOCIAL_DESIRABILITY: 'تمایل بالا به ارائه‌ی تصویر مطلوب',
}

const pct = (v: number) => `${Math.round(v * 100).toLocaleString('fa-IR')}٪`

/** Response-validity indices (Section 54, N-3) — evidence for the reviewer, never a verdict on honesty. */
function ValidityBanner({ result }: { result: PersonalityValidityResult }) {
  const color = VALIDITY_TONE[result.overallStatus]
  const d = result.details ?? {}
  const reasons = d.reviewReasons ?? []
  const chips: { label: string; value: string; warn: boolean; hint?: string }[] = []
  if (result.consistencyScore != null)
    chips.push({
      label: 'سازگاری پاسخ‌ها',
      value: pct(result.consistencyScore),
      warn: result.consistencyScore < 0.5,
      hint: d.reversePairCount != null ? `بر اساس ${d.reversePairCount.toLocaleString('fa-IR')} گویه‌ی معکوس` : undefined,
    })
  if (result.contradictionCount > 0 || result.consistencyScore != null) chips.push({ label: 'تناقض', value: result.contradictionCount.toLocaleString('fa-IR'), warn: result.contradictionCount >= 2 })
  if (result.socialDesirabilityScore != null)
    chips.push({
      label: 'مطلوبیت اجتماعی',
      value: `${Math.round(result.socialDesirabilityScore).toLocaleString('fa-IR')} از ۱۰۰`,
      warn: reasons.includes('SOCIAL_DESIRABILITY'),
      hint: d.socialDesirabilityItemCount != null ? `${d.socialDesirabilityItemCount.toLocaleString('fa-IR')} گویه‌ی مقیاس اعتبار` : undefined,
    })
  if (result.extremeResponseRate != null) chips.push({ label: 'پاسخ‌های حدی', value: pct(result.extremeResponseRate), warn: result.extremeResponseRate >= 0.8 })
  if (d.timedAnswerCount != null && d.timedAnswerCount > 0)
    chips.push({ label: 'پاسخ‌های زیر یک ثانیه', value: `${(d.fastAnswerCount ?? 0).toLocaleString('fa-IR')} از ${d.timedAnswerCount.toLocaleString('fa-IR')}`, warn: result.randomPatternFlag })
  if (result.completionSeconds != null) chips.push({ label: 'مدت پاسخ‌گویی', value: `${Math.max(1, Math.round(result.completionSeconds / 60)).toLocaleString('fa-IR')} دقیقه`, warn: false })
  if (result.missingResponseCount > 0) chips.push({ label: 'بی‌پاسخ', value: result.missingResponseCount.toLocaleString('fa-IR'), warn: true })

  return (
    <div className="fx-card fx-accent-bar space-y-2.5 p-4" style={tone(color)}>
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold">
        <ShieldCheck size={15} className="fx-tone-text" />
        <span>Validity Indices (شاخص‌های اعتبار پاسخ‌ها):</span>
        <span className="fx-tone-bg fx-tone-text rounded-full px-2.5 py-0.5">{PERSONALITY_VALIDITY_STATUS_LABEL_FA[result.overallStatus]}</span>
        {reasons.length > 0 && <span className="fx-text-2 font-normal">— {reasons.map((r) => REVIEW_REASON_LABEL_FA[r] ?? r).join('، ')}</span>}
        {reasons.length === 0 && result.straightLiningFlag && <span className="fx-text-2 font-normal">— الگوی پاسخ یکنواخت</span>}
      </p>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.label} title={c.hint} className="fx-sub px-2.5 py-1 text-[11px]" style={c.warn ? tone('#f59e0b') : undefined}>
              <span className={c.warn ? 'fx-tone-text' : 'fx-text-2'}>{c.label}:</span> <span className="num font-bold">{c.value}</span>
            </span>
          ))}
        </div>
      )}
      <p className="fx-muted text-[10.5px]">این شاخص‌ها فقط برای بررسی بیشتر در مصاحبه هستند و به‌تنهایی نشانه‌ی عدم صداقت نیستند.</p>
    </div>
  )
}
