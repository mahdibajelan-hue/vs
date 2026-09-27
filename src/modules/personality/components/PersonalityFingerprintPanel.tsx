import { useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, ArrowLeft, Fingerprint, Gauge, Loader2, Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { jobRoleLabel } from '../../competency/lib/competencyData'
import { PersonalityPrintReport } from './PersonalityPrintReport'
import { RoleAlignmentCard } from './RoleAlignmentCard'
import { computeRoleAlignment } from '../lib/roleAlignment'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA, type PersonalityValidityResult } from '../types'

interface PersonalityFingerprintPanelProps {
  personalityAssessmentId: string
  candidateName: string
  candidatePosition?: string
  /** Shown as a trailing "continue" button when set — the dedicated wizard stage advances to the
   * next stage from here; the aggregated results view (ResultsStage) omits it entirely. */
  onContinue?: () => void
  /** The dedicated wizard stage offers its own "چاپ گزارش" (personality-only) print; the aggregated
   * results view already has a full-report print/PDF flow of its own, so it turns this off to avoid
   * two competing print affordances on the same page. Defaults to true. */
  showPrintButton?: boolean
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Fingerprint; children: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-500/15 text-pink-300">
        <Icon size={14} />
      </span>
      <p className="text-sm font-extrabold">{children}</p>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  )
}

/**
 * The scored personality/behavioral view — trait bars, behavioral-dimension bars (with job-
 * requirement threshold markers), computed patterns/watchpoints, and the deterministic role-
 * alignment card. Purely deterministic — no AI-generation UI of its own; the unified candidate AI
 * analysis (spec follow-up) now lives entirely in its own dedicated CandidateAiAnalysisStage.
 * Shared, exported body so it can be rendered both by PersonalityStage (the dedicated wizard stage,
 * which also has its own "not yet designed"/"in progress" states before this ever renders) and by
 * ResultsStage (as the aggregated "اثرانگشت رفتاری" + "ترکیب شایستگی‌های شغلی" sections of the final
 * results page) without duplicating this body.
 */
export function PersonalityFingerprintPanel({ personalityAssessmentId, candidateName, candidatePosition, onContinue, showPrintButton = true }: PersonalityFingerprintPanelProps) {
  const assessment = usePersonalityStore((s) => s.assessments.find((a) => a.id === personalityAssessmentId))
  // Select the stable store array and filter in a memo: a selector that returns a fresh array on
  // every call (`s.dimensionScores.filter(...)`) makes zustand 5's useSyncExternalStore see a new
  // snapshot each render → infinite re-render → React unmounts the whole app (black screen).
  const allDimensionScores = usePersonalityStore((s) => s.dimensionScores)
  const dimensionScores = useMemo(
    () => allDimensionScores.filter((d) => d.personalityAssessmentId === personalityAssessmentId),
    [allDimensionScores, personalityAssessmentId],
  )
  const validityResult = usePersonalityStore((s) => s.validityResults.find((v) => v.personalityAssessmentId === personalityAssessmentId))
  const fetchDimensionScores = usePersonalityStore((s) => s.fetchDimensionScores)
  const fetchValidityResult = usePersonalityStore((s) => s.fetchValidityResult)
  const traits = usePersonalityStore((s) => s.traits)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const jobRequirements = usePersonalityStore((s) => s.jobRequirements)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)

  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDimensionScores(personalityAssessmentId)
    fetchValidityResult(personalityAssessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalityAssessmentId])

  const traitScores = dimensionScores.filter((d) => d.scoreKind === 'TRAIT')
  const dimensionScoresOnly = dimensionScores.filter((d) => d.scoreKind === 'BEHAVIORAL_DIMENSION')

  const requirementsForProfile = useMemo(() => jobRequirements.filter((r) => r.profileId === assessment?.jobProfileId), [jobRequirements, assessment])
  const roleAlignment = useMemo(() => computeRoleAlignment(requirementsForProfile, dimensionScores, dimensions), [requirementsForProfile, dimensionScores, dimensions])

  const handlePrint = async () => {
    const node = printRef.current
    if (!node || !assessment) return
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)

    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) {
      frame.remove()
      return
    }

    const marginMm = 8
    doc.open()
    doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>ارزیابی شخصیت — ${candidateName}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap">
<style>
  @page { size: A4 portrait; margin: ${marginMm}mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Vazirmatn", "Segoe UI", sans-serif; }
  svg, img { break-inside: avoid; page-break-inside: avoid; }
</style></head><body><div id="fit-wrap" style="margin:0 auto;overflow:hidden;">${node.innerHTML}</div></body></html>`)
    doc.close()

    try {
      await doc.fonts?.ready
    } catch {
      /* fonts API unavailable — print with whatever is loaded */
    }

    const wrap = doc.getElementById('fit-wrap')
    const reportEl = wrap?.firstElementChild as HTMLElement | undefined
    if (wrap && reportEl) {
      const mmToPx = 96 / 25.4
      const maxWidthPx = (210 - marginMm * 2) * mmToPx
      const maxHeightPx = (297 - marginMm * 2) * mmToPx
      const naturalWidth = reportEl.scrollWidth
      const naturalHeight = reportEl.scrollHeight
      const scale = Math.min(1, maxWidthPx / naturalWidth, maxHeightPx / naturalHeight)
      reportEl.style.transformOrigin = 'top left'
      reportEl.style.transform = `scale(${scale})`
      wrap.style.width = `${naturalWidth * scale}px`
      wrap.style.height = `${naturalHeight * scale}px`
    }

    win.focus()
    win.print()
    win.addEventListener('afterprint', () => frame.remove())
    setTimeout(() => frame.remove(), 60_000)
  }

  if (!assessment) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 size={22} className="animate-spin text-pink-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showPrintButton && (
        <>
          <div className="no-print flex justify-end">
            <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
              <Printer size={14} /> چاپ گزارش
            </button>
          </div>

          <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
            <PersonalityPrintReport
              assessment={assessment}
              candidateName={candidateName}
              candidatePosition={candidatePosition}
              traitScores={traitScores}
              behavioralScores={dimensionScoresOnly}
              traits={traits}
              dimensions={dimensions}
              jobRequirements={requirementsForProfile}
              validityResult={validityResult}
              jobRoleLabel={jobRoleLabel(jobRoleConfigs, assessment.jobRole)}
            />
          </div>
        </>
      )}

      {validityResult && <ValidityBanner result={validityResult} />}

      <SectionHeading icon={Fingerprint}>اثرانگشت رفتاری</SectionHeading>

      {traitScores.length > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-xs font-bold">ویژگی‌های شخصیتی (پنج عامل بزرگ)</p>
          <div className="space-y-2.5">
            {traitScores.map((s) => {
              const trait = traits.find((t) => t.id === s.traitId)
              return <ScoreBar key={s.id} label={trait?.labelFa ?? '—'} value={s.normalizedScore} color="#f472b6" />
            })}
          </div>
        </div>
      )}

      {dimensionScoresOnly.length > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-xs font-bold">ابعاد رفتاری حرفه‌ای</p>
          <div className="space-y-2.5">
            {dimensionScoresOnly.map((s) => {
              const dim = dimensions.find((d) => d.id === s.dimensionId)
              const req = requirementsForProfile.find((r) => r.dimensionId === s.dimensionId)
              const below = req?.minThreshold != null && s.normalizedScore != null && s.normalizedScore < req.minThreshold
              return (
                <ScoreBar
                  key={s.id}
                  label={dim?.labelFa ?? '—'}
                  value={s.normalizedScore}
                  color={below ? '#f87171' : '#38bdf8'}
                  marker={req?.minThreshold ?? undefined}
                  critical={req?.isCritical}
                />
              )
            })}
          </div>
        </div>
      )}

      {(assessment.computedPatterns.length > 0 || assessment.computedWatchpoints.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {assessment.computedPatterns.length > 0 && (
            <div className="glass-panel rounded-2xl border border-emerald-400/20 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <TrendingUp size={14} /> الگوهای برجسته
              </p>
              <ul className="space-y-1.5 text-[11px] text-secondary">
                {assessment.computedPatterns.map((p, i) => (
                  <li key={i}>{p.interpretation}</li>
                ))}
              </ul>
            </div>
          )}
          {assessment.computedWatchpoints.length > 0 && (
            <div className="glass-panel rounded-2xl border border-amber-400/20 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <TrendingDown size={14} /> نقاط قابل بررسی بیشتر
              </p>
              <ul className="space-y-1.5 text-[11px] text-secondary">
                {assessment.computedWatchpoints.map((w, i) => (
                  <li key={i}>{w.topic}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <SectionHeading icon={Gauge}>ترکیب شایستگی‌های شغلی</SectionHeading>

      <RoleAlignmentCard jobRole={assessment.jobRole} hasProfile={assessment.jobProfileId != null} alignment={roleAlignment} />

      {onContinue && (
        <div className="no-print flex justify-end">
          <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
            رفتن به ارزیابی فنی <ArrowLeft size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function ScoreBar({ label, value, color, marker, critical }: { label: string; value: number | null; color: string; marker?: number; critical?: boolean }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium">
          {label} {critical && <span className="text-amber-300">★</span>}
        </span>
        <span className="num font-bold">{value != null ? Math.round(value).toLocaleString('fa-IR') : '—'}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        {marker != null && <div className="absolute top-0 h-full w-px bg-white/40" style={{ right: `${100 - marker}%` }} title={`حداقل الزام: ${marker}`} />}
      </div>
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

/** Response-validity summary (Section 54, N-3): the verdict, why a review is suggested, and every
 * index the test could support — evidence for the reviewer, never a verdict on honesty. */
function ValidityBanner({ result }: { result: PersonalityValidityResult }) {
  const review = result.overallStatus === 'REVIEW_REQUIRED'
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
  if (result.contradictionCount > 0 || result.consistencyScore != null)
    chips.push({ label: 'تناقض', value: result.contradictionCount.toLocaleString('fa-IR'), warn: result.contradictionCount >= 2 })
  if (result.socialDesirabilityScore != null)
    chips.push({
      label: 'مطلوبیت اجتماعی',
      value: `${Math.round(result.socialDesirabilityScore).toLocaleString('fa-IR')} از ۱۰۰`,
      warn: reasons.includes('SOCIAL_DESIRABILITY'),
      hint: d.socialDesirabilityItemCount != null ? `${d.socialDesirabilityItemCount.toLocaleString('fa-IR')} گویه‌ی مقیاس اعتبار` : undefined,
    })
  if (result.extremeResponseRate != null)
    chips.push({ label: 'پاسخ‌های حدی', value: pct(result.extremeResponseRate), warn: result.extremeResponseRate >= 0.8 })
  if (d.timedAnswerCount != null && d.timedAnswerCount > 0)
    chips.push({
      label: 'پاسخ‌های زیر یک ثانیه',
      value: `${(d.fastAnswerCount ?? 0).toLocaleString('fa-IR')} از ${d.timedAnswerCount.toLocaleString('fa-IR')}`,
      warn: result.randomPatternFlag,
    })
  if (result.completionSeconds != null)
    chips.push({ label: 'مدت پاسخ‌گویی', value: `${Math.max(1, Math.round(result.completionSeconds / 60)).toLocaleString('fa-IR')} دقیقه`, warn: false })

  return (
    <div className={`glass-panel space-y-2 rounded-2xl border p-3.5 text-[11px] ${review ? 'border-amber-400/25 text-amber-200' : 'border-emerald-400/25 text-emerald-200'}`}>
      <p className="flex flex-wrap items-center gap-2 font-bold">
        <AlertTriangle size={14} />
        وضعیت اعتبار پاسخ‌ها: {PERSONALITY_VALIDITY_STATUS_LABEL_FA[result.overallStatus]}
        {reasons.length > 0 && <span className="font-normal">— {reasons.map((r) => REVIEW_REASON_LABEL_FA[r] ?? r).join('، ')}</span>}
        {reasons.length === 0 && result.straightLiningFlag && <span className="font-normal">— الگوی پاسخ یکنواخت</span>}
        {reasons.length === 0 && result.missingResponseCount > 0 && (
          <span className="font-normal">— {result.missingResponseCount.toLocaleString('fa-IR')} سؤال بی‌پاسخ</span>
        )}
      </p>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              title={c.hint}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${c.warn ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/[0.03] text-secondary'}`}
            >
              {c.label}: <span className="num font-bold">{c.value}</span>
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted">این شاخص‌ها فقط برای بررسی بیشتر در مصاحبه هستند و به‌تنهایی نشانه‌ی عدم صداقت نیستند.</p>
    </div>
  )
}
