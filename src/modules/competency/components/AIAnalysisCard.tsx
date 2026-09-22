import { useEffect, useState } from 'react'
import { AlertTriangle, BadgeCheck, Brain, ChevronDown, ChevronUp, HelpCircle, Lightbulb, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import type { AiCompetencyDimension } from '../types'

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

/**
 * Gemini AI Analysis card (spec section 18-27) — an evidence-based, complementary analytical layer
 * over the judges' own recorded scores, never a replacement for them (spec section 24: AI is an
 * ASSISTANT, not the final decision maker — that stays with the judges/Rule Engine). Only supported
 * for DB-backed role assessments; project_manager's fixed rubric isn't wired to this yet (the Edge
 * Function itself refuses it with a clear message).
 */
export function AIAnalysisCard({ assessmentId, isPM }: { assessmentId: string; isPM: boolean }) {
  const analysis = useCompetencyStore((s) => s.aiAnalysisByAssessment[assessmentId])
  const loading = useCompetencyStore((s) => s.aiAnalysisLoading[assessmentId] ?? false)
  const fetchAiAnalysis = useCompetencyStore((s) => s.fetchAiAnalysis)
  const generateAiAnalysis = useCompetencyStore((s) => s.generateAiAnalysis)
  const [error, setError] = useState<string | null>(null)
  const [expandedDim, setExpandedDim] = useState<string | null>(null)

  useEffect(() => {
    if (analysis === undefined && !isPM) fetchAiAnalysis(assessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, isPM])

  if (isPM) return null

  const handleGenerate = async () => {
    setError(null)
    const result = await generateAiAnalysis(assessmentId)
    if (result.error) setError(result.error)
  }

  return (
    <div className="glass-panel rounded-2xl border border-indigo-400/20 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Brain size={16} className="text-indigo-300" /> تحلیل هوشمند شایستگی (AI)
        </p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
        >
          <Sparkles size={12} /> {loading ? 'در حال تحلیل…' : analysis ? 'تولید تحلیل جدید' : 'تولید تحلیل هوشمند'}
        </button>
      </div>

      <p className="mb-3 text-[10.5px] leading-6 text-muted">
        این تحلیل صرفاً یک لایه تکمیلی مبتنی بر شواهد است و جایگزین امتیاز و تصمیم داوران نمی‌شود — امتیاز رسمی همان چیزی است که داوران ثبت کرده‌اند.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 p-2.5 text-[10.5px] text-red-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {!analysis && !loading && !error && <p className="text-[11px] text-muted">هنوز تحلیلی برای این ارزیابی تولید نشده است.</p>}

      {analysis && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-1 text-[10px] font-bold text-indigo-200">خلاصه اجرایی</p>
            <p className="text-[11px] leading-6 text-secondary">{analysis.analysis.executive_summary}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(analysis.analysis.competency_analysis).map(([key, dim]) => (
              <DimensionRow key={key} label={DIMENSION_LABEL_FA[key] ?? key} dim={dim} expanded={expandedDim === key} onToggle={() => setExpandedDim(expandedDim === key ? null : key)} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ListCard icon={<TrendingUp size={13} className="text-emerald-300" />} title="نقاط قوت" items={analysis.analysis.strengths} tone="emerald" />
            <ListCard icon={<TrendingDown size={13} className="text-amber-300" />} title="حوزه‌های توسعه" items={analysis.analysis.development_areas} tone="amber" />
          </div>

          {analysis.analysis.critical_gaps.length > 0 && (
            <ListCard icon={<AlertTriangle size={13} className="text-red-300" />} title="نقاط بحرانی (Critical Gaps)" items={analysis.analysis.critical_gaps} tone="red" />
          )}

          {analysis.analysis.recommended_training.length > 0 && (
            <ListCard icon={<Lightbulb size={13} className="text-sky-300" />} title="پیشنهاد توسعه/آموزش" items={analysis.analysis.recommended_training} tone="sky" />
          )}

          {analysis.analysis.follow_up_questions.length > 0 && (
            <div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.06] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-purple-200">
                <HelpCircle size={12} /> سؤالات پیگیری پیشنهادی
              </p>
              <div className="space-y-1.5">
                {analysis.analysis.follow_up_questions.map((f, i) => (
                  <div key={i} className="text-[10.5px] leading-6 text-secondary">
                    <span className="font-bold text-purple-200">{f.question}</span> — <span className="text-muted">{f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <BadgeCheck size={11} /> مدل: {analysis.model} · اطمینان مدل: {Math.round((analysis.analysis.confidence ?? 0) <= 1 ? (analysis.analysis.confidence ?? 0) * 100 : analysis.analysis.confidence ?? 0)}٪
            </span>
          </div>
        </div>
      )}
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
