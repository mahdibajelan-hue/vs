import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Brain,
  ChevronDown,
  ChevronUp,
  Compass,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { computeEvaluationStages } from '../lib/evaluationStages'
import { computeCompletion } from '../lib/competencyModel'
import { computeRoleCompletion, questionsForAssessment, resolveOfficialAnswers, usesLegacyPmRubric } from '../lib/roleCompetencyModel'
import { isAiAnalysisStale } from '../lib/competencyGap'
import type { AiCompetencyDimension, CompetencyAssessment } from '../types'

const DIMENSION_LABEL_FA: Record<string, string> = {
  technical: 'فنی/تخصصی',
  problem_solving: 'حل مسئله',
  experience: 'تجربه عملی',
  hse: 'آگاهی HSE',
  judgment: 'قضاوت حرفه‌ای',
  communication: 'ارتباطات',
  leadership: 'رهبری/کار تیمی',
  commercial: 'قراردادی/تجاری',
}

interface CandidateAiAnalysisStageProps {
  assessment: CompetencyAssessment
  nav: Partial<Record<CompetencySection, () => void>>
  onExitToHub: () => void
}

/**
 * The ONE dedicated panel for the unified candidate AI analysis (spec follow-up) — personality
 * profiling, behavioral pattern, technical/specialized evaluation and job-fit, all from a single
 * Gemini call, read in full depth here. ResultsStage only ever shows a brief excerpt of this
 * analysis plus a link into this stage; this is the only place a "تولید تحلیل"/"تولید مجدد" button
 * for it exists.
 */
export function CandidateAiAnalysisStage({ assessment, nav, onExitToHub }: CandidateAiAnalysisStageProps) {
  const analysis = useCompetencyStore((s) => s.candidateAiAnalysisByAssessment[assessment.id])
  const loading = useCompetencyStore((s) => s.candidateAiAnalysisLoading[assessment.id] ?? false)
  const fetchCandidateAiAnalysis = useCompetencyStore((s) => s.fetchCandidateAiAnalysis)
  const generateCandidateAiAnalysis = useCompetencyStore((s) => s.generateCandidateAiAnalysis)
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const competencyScores = useCompetencyStore((s) => s.competencyProfileByAssessment[assessment.id]?.scores)
  const fetchCompetencyProfile = useCompetencyStore((s) => s.fetchCompetencyProfile)
  const [error, setError] = useState<string | null>(null)
  const [expandedDim, setExpandedDim] = useState<string | null>(null)
  const [expandedFollowUp, setExpandedFollowUp] = useState<number | null>(null)

  useEffect(() => {
    if (analysis === undefined) fetchCandidateAiAnalysis(assessment.id)
    if (questionBank.length === 0) fetchQuestionBank()
    if (!competencyScores) fetchCompetencyProfile(assessment.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  // Phase 4: the analysis is grounded in the competency profile it was generated from
  // (competency_basis) — if the profile has changed since, say so rather than silently showing
  // numbers that no longer match the gap analysis on the results page.
  const stale = isAiAnalysisStale(analysis, competencyScores)

  // Same stage-strip computation ResultsStage uses — kept self-contained here too so this page never
  // depends on the wizard's own in-progress "questions" stage state (roleQuestions/domainIndex etc.).
  const isPM = usesLegacyPmRubric(assessment)
  const roleQuestions = isPM ? [] : questionsForAssessment(assessment, questionBank)
  const myPanelistScores = allPanelistScores.filter((s) => s.assessmentId === assessment.id)
  const officialAnswers = resolveOfficialAnswers(assessment.answers, myPanelistScores)
  const completion = isPM ? computeCompletion(officialAnswers) : computeRoleCompletion(roleQuestions, officialAnswers)
  const submittedScores = allPanelistScores.filter((s) => s.assessmentId === assessment.id && s.submittedAt)
  const panelists = allPanelists.filter((p) => p.assessmentId === assessment.id)
  const stageStrip = computeEvaluationStages(assessment, completion.percent, panelists.length, submittedScores.length)

  const handleGenerate = async () => {
    setError(null)
    const result = await generateCandidateAiAnalysis(assessment.id)
    if (result.error) setError(result.error)
  }

  const content = analysis?.analysis

  return (
    <CompetencySidebarShell
      active="aiAnalysis"
      nav={nav}
      title={`تحلیل جامع هوش مصنوعی — ${assessment.candidateName}`}
      stageStrip={stageStrip}
      onExitToHub={onExitToHub}
    >
      <div className="glass-panel rounded-2xl border border-indigo-400/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Brain size={16} className="text-indigo-300" /> تحلیل جامع هوش مصنوعی
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? 'در حال تحلیل…' : analysis ? 'تولید مجدد' : 'تولید تحلیل'}
          </button>
        </div>

        <p className="mb-3 text-[10.5px] leading-6 text-muted">
          این تحلیل شخصیت و رفتار، فنی/تخصصی و تطابق شغلی متقاضی را در یک نگاه جامع بررسی می‌کند — یک لایه تکمیلی مبتنی بر شواهد است و جایگزین امتیاز و
          تصمیم داوران نمی‌شود.
        </p>

        {error && (
          <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 p-2.5 text-[10.5px] text-red-200">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {stale && !loading && (
          <button
            onClick={handleGenerate}
            className="mb-3 flex w-full items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5 text-right text-[10.5px] text-amber-200 hover:bg-amber-500/20"
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-bold">تحلیل به‌روز نیست — بازتولید.</span>{' '}
              {analysis?.competencyBasis ? 'پروفایل شایستگی متقاضی پس از تولید این تحلیل تغییر کرده است.' : 'این تحلیل پیش از افزوده‌شدن تحلیل شکاف شایستگی تولید شده است.'}
            </span>
          </button>
        )}

        {!analysis && !loading && !error && <p className="text-[11px] text-muted">هنوز تحلیل جامعی برای این متقاضی تولید نشده است.</p>}
      </div>

      {content && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl border border-white/10 p-4">
            <p className="mb-1.5 text-xs font-bold text-indigo-200">خلاصه اجرایی</p>
            <p className="text-[11.5px] leading-7 text-secondary">{content.executive_summary}</p>
          </div>

          {content.competency_gap_narrative && (
            <>
              <SectionHeading icon={Target} accent="#8b5cf6">تحلیل شکاف شایستگی</SectionHeading>
              <div className="glass-panel rounded-2xl border border-violet-400/25 bg-violet-500/[0.04] p-4">
                <p className="text-[11.5px] leading-7 text-secondary">{content.competency_gap_narrative}</p>
                <p className="mt-2 text-[9.5px] text-muted">بر پایه همان اعداد جدول شکاف شایستگی در صفحه نتایج — «شواهد ناکافی» به‌عنوان نامعلوم تفسیر شده، نه ضعف.</p>
              </div>
            </>
          )}

          {/* Technical analysis */}
          <SectionHeading icon={Brain} accent="#a855f7">تحلیل فنی و تخصصی</SectionHeading>
          {content.technical_analysis.available ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(content.technical_analysis.competency_analysis).map(([key, dim]) => (
                  <DimensionRow
                    key={key}
                    label={DIMENSION_LABEL_FA[key] ?? key}
                    dim={dim}
                    expanded={expandedDim === key}
                    onToggle={() => setExpandedDim(expandedDim === key ? null : key)}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ListCard icon={<TrendingUp size={13} className="text-emerald-300" />} title="نقاط قوت" items={content.technical_analysis.strengths} tone="emerald" />
                <ListCard icon={<TrendingDown size={13} className="text-amber-300" />} title="حوزه‌های توسعه" items={content.technical_analysis.development_areas} tone="amber" />
              </div>
              {content.technical_analysis.critical_gaps.length > 0 && (
                <ListCard icon={<AlertTriangle size={13} className="text-red-300" />} title="نقاط بحرانی (Critical Gaps)" items={content.technical_analysis.critical_gaps} tone="red" />
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-4 text-center text-[11px] text-muted">
              ارزیابی فنی/تخصصی این متقاضی هنوز تکمیل یا امتیازدهی نشده است.
            </div>
          )}

          {/* Personality analysis */}
          <SectionHeading icon={Sparkles} accent="#f472b6">تحلیل شخصیت و رفتاری</SectionHeading>
          {content.personality_analysis.available ? (
            <div className="space-y-3">
              {content.personality_analysis.response_validity_interpretation && (
                <div className="glass-panel rounded-2xl border border-amber-400/20 p-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                    <AlertTriangle size={13} /> تفسیر اعتبار پاسخ‌ها
                  </p>
                  <p className="text-[11px] leading-6 text-secondary">{content.personality_analysis.response_validity_interpretation}</p>
                </div>
              )}

              {content.personality_analysis.trait_analysis.length > 0 && (
                <div className="glass-panel rounded-2xl p-4">
                  <p className="mb-2 text-xs font-bold">ویژگی‌های شخصیتی</p>
                  <div className="space-y-2.5">
                    {content.personality_analysis.trait_analysis.map((t, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="font-bold">{t.trait_key}</span>
                          <span className="num font-bold text-pink-300">
                            {Math.round(t.score).toLocaleString('fa-IR')} <span className="text-muted">— {t.range_label}</span>
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-6 text-secondary">{t.analysis}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {content.personality_analysis.behavioral_analysis.length > 0 && (
                <div className="glass-panel rounded-2xl p-4">
                  <p className="mb-2 text-xs font-bold">ابعاد رفتاری حرفه‌ای</p>
                  <div className="space-y-2.5">
                    {content.personality_analysis.behavioral_analysis.map((d, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="font-bold">{d.dimension_key}</span>
                          <span className="num font-bold text-sky-300">{Math.round(d.score).toLocaleString('fa-IR')}</span>
                        </div>
                        <p className="text-[10.5px] leading-6 text-secondary">{d.analysis}</p>
                        {d.evidence.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {d.evidence.map((e, ei) => (
                              <li key={ei} className="flex items-start gap-1.5 text-[10px] leading-5 text-muted">
                                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sky-300" /> {e}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {content.personality_analysis.strength_patterns.length > 0 && (
                  <ListCard icon={<TrendingUp size={13} className="text-emerald-300" />} title="الگوهای قوت" items={content.personality_analysis.strength_patterns} tone="emerald" />
                )}
                {content.personality_analysis.watchpoints.length > 0 && (
                  <ListCard icon={<TrendingDown size={13} className="text-amber-300" />} title="نقاط قابل توجه" items={content.personality_analysis.watchpoints} tone="amber" />
                )}
              </div>
              {content.personality_analysis.observed_patterns.length > 0 && (
                <ListCard icon={<Compass size={13} className="text-sky-300" />} title="الگوهای مشاهده‌شده" items={content.personality_analysis.observed_patterns} tone="sky" />
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-4 text-center text-[11px] text-muted">
              ارزیابی شخصیت و رفتاری این متقاضی هنوز تکمیل یا امتیازدهی نشده است.
            </div>
          )}

          {/* Job-fit */}
          <SectionHeading icon={Compass} accent="#38bdf8">تطابق با شغل</SectionHeading>
          <div className="glass-panel rounded-2xl border border-sky-400/25 bg-sky-500/[0.04] p-4">
            <p className="text-[11.5px] leading-7 text-secondary">{content.role_fit_narrative}</p>
          </div>

          {content.development_areas.length > 0 && (
            <ListCard icon={<TrendingDown size={13} className="text-amber-300" />} title="حوزه‌های توسعه (کلی)" items={content.development_areas} tone="amber" />
          )}

          {(content.training_recommendations.length > 0 || content.career_development_paths.length > 0) && (
            <div className="glass-panel rounded-2xl border border-teal-400/20 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-teal-200">
                <Compass size={14} /> توسعه و مسیر شغلی
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {content.training_recommendations.length > 0 && (
                  <div className="rounded-xl border border-teal-400/20 bg-teal-500/[0.06] p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-teal-200">
                      <GraduationCap size={12} /> پیشنهادهای آموزشی
                    </p>
                    <ul className="space-y-1">
                      {content.training_recommendations.map((t, i) => (
                        <li key={i} className="text-[11px] leading-6 text-secondary">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {content.career_development_paths.length > 0 && (
                  <div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.06] p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-purple-200">
                      <Compass size={12} /> مسیرهای توسعه شغلی
                    </p>
                    <ul className="space-y-1">
                      {content.career_development_paths.map((c, i) => (
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

          {content.follow_up_questions.length > 0 && (
            <div className="glass-panel rounded-2xl border border-purple-400/20 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-200">
                <HelpCircle size={14} /> سؤالات پیشنهادی برای مصاحبه ساختاریافته
              </p>
              <div className="space-y-1.5">
                {content.follow_up_questions.map((q, i) => {
                  const expanded = expandedFollowUp === i
                  return (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <button onClick={() => setExpandedFollowUp(expanded ? null : i)} className="flex w-full items-start justify-between gap-2 text-right">
                        <span className="text-[11px] font-medium text-primary">{q.question}</span>
                        {expanded ? <ChevronUp size={13} className="mt-0.5 shrink-0 text-muted" /> : <ChevronDown size={13} className="mt-0.5 shrink-0 text-muted" />}
                      </button>
                      {(q.competency || q.dimension_key) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {q.competency && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">{q.competency}</span>}
                          {q.dimension_key && (
                            <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">{q.dimension_key}</span>
                          )}
                        </div>
                      )}
                      {expanded && (
                        <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2 text-[10.5px]">
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

          {content.evidence.length > 0 && (
            <div className="glass-panel rounded-2xl border border-white/10 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <Lightbulb size={13} className="text-sky-300" /> مستندات و شواهد تحلیل
              </p>
              <div className="space-y-1.5">
                {content.evidence.map((e, i) => (
                  <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[10.5px] leading-6 text-secondary">
                    <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-muted">{e.source_type}</span>
                    {e.note}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <BadgeCheck size={11} /> مدل: {analysis!.model} · سطح اطمینان: {content.confidence === 'high' ? 'بالا' : content.confidence === 'medium' ? 'متوسط' : 'پایین'}
            </span>
          </div>
        </div>
      )}
    </CompetencySidebarShell>
  )
}

function SectionHeading({ icon: Icon, accent, children }: { icon: typeof Brain; accent: string; children: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${accent}22`, color: accent }}>
        <Icon size={14} />
      </span>
      <p className="text-sm font-extrabold">{children}</p>
      <div className="h-px flex-1" style={{ background: `${accent}30` }} />
    </div>
  )
}

function DimensionRow({ label, dim, expanded, onToggle }: { label: string; dim: AiCompetencyDimension; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-2 text-right">
        <span className="text-[11px] font-bold">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="num text-[11px] font-bold text-indigo-200">{Math.round(dim.score)}٪</span>
          {expanded ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
          <p className="text-[10.5px] leading-6 text-secondary">{dim.analysis}</p>
          {dim.evidence.length > 0 && (
            <ul className="space-y-0.5">
              {dim.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] leading-5 text-muted">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-300" /> {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ListCard({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: 'emerald' | 'amber' | 'red' | 'sky' }) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: 'border-emerald-400/20 bg-emerald-500/[0.06]',
    amber: 'border-amber-400/20 bg-amber-500/[0.06]',
    red: 'border-red-400/20 bg-red-500/[0.06]',
    sky: 'border-sky-400/20 bg-sky-500/[0.06]',
  }
  if (items.length === 0) return null
  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold">
        {icon} {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[10.5px] leading-6 text-secondary">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
