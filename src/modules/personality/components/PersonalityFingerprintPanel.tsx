import { useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, ArrowLeft, Fingerprint, Gauge, Loader2, Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { jobRoleLabel } from '../../competency/lib/competencyData'
import { PersonalityPrintReport } from './PersonalityPrintReport'
import { RoleAlignmentCard } from './RoleAlignmentCard'
import { computeRoleAlignment } from '../lib/roleAlignment'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA } from '../types'

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
  const dimensionScores = usePersonalityStore((s) => s.dimensionScores.filter((d) => d.personalityAssessmentId === personalityAssessmentId))
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

      {validityResult && (
        <div
          className={`glass-panel flex flex-wrap items-center gap-2 rounded-2xl border p-3.5 text-[11px] ${
            validityResult.overallStatus === 'REVIEW_REQUIRED' ? 'border-amber-400/25 text-amber-200' : 'border-emerald-400/25 text-emerald-200'
          }`}
        >
          <AlertTriangle size={14} />
          وضعیت اعتبار پاسخ‌ها: {PERSONALITY_VALIDITY_STATUS_LABEL_FA[validityResult.overallStatus]}
          {validityResult.straightLiningFlag && ' — الگوی پاسخ یکنواخت مشاهده شد'}
          {validityResult.missingResponseCount > 0 && ` — ${validityResult.missingResponseCount.toLocaleString('fa-IR')} سؤال بی‌پاسخ`}
        </div>
      )}

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
