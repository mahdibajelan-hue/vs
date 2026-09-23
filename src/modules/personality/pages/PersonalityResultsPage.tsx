import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Compass, GraduationCap, HelpCircle, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { JOB_ROLE_LABEL_FA } from '../../competency/types'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA } from '../types'

/** Staff-facing results/behavioral-fingerprint page — reads exclusively from
 * personality_dimension_scores/personality_validity_results (RLS-gated to whoever created the
 * assessment or a module admin/report-viewer), never recomputes scoring client-side. */
export function PersonalityResultsPage({ personalityAssessmentId, onBack }: { personalityAssessmentId: string; onBack: () => void }) {
  const assessment = usePersonalityStore((s) => s.assessments.find((a) => a.id === personalityAssessmentId))
  const dimensionScores = usePersonalityStore((s) => s.dimensionScores.filter((d) => d.personalityAssessmentId === personalityAssessmentId))
  const validityResult = usePersonalityStore((s) => s.validityResults.find((v) => v.personalityAssessmentId === personalityAssessmentId))
  const aiAnalysis = usePersonalityStore((s) => s.aiAnalysisByAssessment[personalityAssessmentId])
  const fetchDimensionScores = usePersonalityStore((s) => s.fetchDimensionScores)
  const fetchValidityResult = usePersonalityStore((s) => s.fetchValidityResult)
  const fetchAiAnalysis = usePersonalityStore((s) => s.fetchAiAnalysis)
  const generateAiAnalysis = usePersonalityStore((s) => s.generateAiAnalysis)
  const traits = usePersonalityStore((s) => s.traits)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const jobRequirements = usePersonalityStore((s) => s.jobRequirements)

  const candidates = useCompetencyStore((s) => s.assessments)
  const candidate = useMemo(() => candidates.find((c) => c.id === assessment?.assessmentId), [candidates, assessment])

  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [expandedFollowUp, setExpandedFollowUp] = useState<number | null>(null)

  useEffect(() => {
    fetchDimensionScores(personalityAssessmentId)
    fetchValidityResult(personalityAssessmentId)
    fetchAiAnalysis(personalityAssessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalityAssessmentId])

  const traitScores = dimensionScores.filter((d) => d.scoreKind === 'TRAIT')
  const dimensionScoresOnly = dimensionScores.filter((d) => d.scoreKind === 'BEHAVIORAL_DIMENSION')

  const requirementsForProfile = useMemo(
    () => jobRequirements.filter((r) => r.profileId === assessment?.jobProfileId),
    [jobRequirements, assessment],
  )

  const handleGenerateAi = async () => {
    setAiError(null)
    setGenerating(true)
    const result = await generateAiAnalysis(personalityAssessmentId)
    setGenerating(false)
    if (result.error) setAiError(result.error)
  }

  if (!assessment) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={24} className="animate-spin text-pink-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-4xl space-y-4">
        <button onClick={onBack} className="flex w-fit items-center gap-1.5 text-xs text-secondary hover:text-primary">
          <ArrowRight size={14} /> بازگشت به داشبورد
        </button>

        <div className="glass-panel rounded-2xl p-4">
          <p className="text-sm font-bold">{candidate?.candidateName ?? 'متقاضی'}</p>
          <p className="mt-0.5 text-[11px] text-muted">{JOB_ROLE_LABEL_FA[assessment.jobRole]} — اثرانگشت رفتاری</p>
        </div>

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

        <div className="glass-panel rounded-2xl border border-indigo-400/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Sparkles size={14} className="text-indigo-300" /> تحلیل هوشمند شخصیت
            </p>
            <button
              onClick={handleGenerateAi}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {aiAnalysis ? 'تولید مجدد' : 'تولید تحلیل'}
            </button>
          </div>
          {aiError && <p className="mb-2 text-[11px] text-red-300">{aiError}</p>}
          {aiAnalysis ? (
            <div className="space-y-3 text-[11.5px] leading-6 text-secondary">
              <p>{aiAnalysis.analysis.executive_summary}</p>
              {aiAnalysis.analysis.strength_patterns.length > 0 && (
                <div>
                  <p className="mb-1 font-bold text-emerald-300">نقاط قوت</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {aiAnalysis.analysis.strength_patterns.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.analysis.watchpoints.length > 0 && (
                <div>
                  <p className="mb-1 font-bold text-amber-300">نقاط قابل توجه</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {aiAnalysis.analysis.watchpoints.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.analysis.follow_up_questions.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 font-bold text-sky-300">
                    <HelpCircle size={13} /> سؤالات پیشنهادی برای مصاحبه ساختاریافته
                  </p>
                  <div className="space-y-1.5">
                    {aiAnalysis.analysis.follow_up_questions.map((q, i) => {
                      const dim = dimensions.find((d) => d.key === q.dimension_key)
                      const expanded = expandedFollowUp === i
                      return (
                        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                          <button
                            onClick={() => setExpandedFollowUp(expanded ? null : i)}
                            className="flex w-full items-start justify-between gap-2 text-right"
                          >
                            <span className="font-medium text-primary">{q.question}</span>
                            {expanded ? <ChevronUp size={13} className="mt-0.5 shrink-0 text-muted" /> : <ChevronDown size={13} className="mt-0.5 shrink-0 text-muted" />}
                          </button>
                          {(q.competency || dim) && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {q.competency && (
                                <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">{q.competency}</span>
                              )}
                              {dim && <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">{dim.labelFa}</span>}
                            </div>
                          )}
                          {expanded && (
                            <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                              {q.purpose && (
                                <p>
                                  <span className="font-bold text-secondary">هدف: </span>
                                  <span className="text-muted">{q.purpose}</span>
                                </p>
                              )}
                              {q.evidence_to_look_for && (
                                <p>
                                  <span className="font-bold text-secondary">شواهدی که باید دنبال شود: </span>
                                  <span className="text-muted">{q.evidence_to_look_for}</span>
                                </p>
                              )}
                              {q.positive_indicators.length > 0 && (
                                <div>
                                  <p className="mb-0.5 font-bold text-emerald-300">نشانه‌های مثبت</p>
                                  <ul className="list-inside list-disc space-y-0.5 text-muted">
                                    {q.positive_indicators.map((p, pi) => (
                                      <li key={pi}>{p}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {q.risk_indicators.length > 0 && (
                                <div>
                                  <p className="mb-0.5 font-bold text-red-300">نشانه‌های هشدار</p>
                                  <ul className="list-inside list-disc space-y-0.5 text-muted">
                                    {q.risk_indicators.map((r, ri) => (
                                      <li key={ri}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            !generating && <p className="text-[11px] text-muted">هنوز تحلیل هوشمندی برای این ارزیابی تولید نشده است.</p>
          )}
        </div>

        {aiAnalysis && (aiAnalysis.analysis.training_recommendations.length > 0 || aiAnalysis.analysis.career_development_paths.length > 0) && (
          <div className="glass-panel rounded-2xl border border-teal-400/20 p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-teal-200">
              <Compass size={14} /> توسعه و مسیر شغلی
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {aiAnalysis.analysis.training_recommendations.length > 0 && (
                <div className="rounded-xl border border-teal-400/20 bg-teal-500/[0.06] p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-teal-200">
                    <GraduationCap size={12} /> پیشنهادهای آموزشی
                  </p>
                  <ul className="space-y-1">
                    {aiAnalysis.analysis.training_recommendations.map((t, i) => (
                      <li key={i} className="text-[11px] leading-6 text-secondary">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.analysis.career_development_paths.length > 0 && (
                <div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.06] p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-purple-200">
                    <Compass size={12} /> مسیرهای توسعه شغلی
                  </p>
                  <ul className="space-y-1">
                    {aiAnalysis.analysis.career_development_paths.map((c, i) => (
                      <li key={i} className="text-[11px] leading-6 text-secondary">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
