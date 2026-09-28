import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Link2, ListChecks, Loader2, RotateCw, Wand2 } from 'lucide-react'
import type { CompetencyAssessment } from '../types'
import { fetchMcqTestDetail, generateMcqTest, mcqCandidateUrl, mcqErrorFa, MCQ_TEST_STATUS_LABEL_FA, type McqTestDetail } from '../lib/mcqData'
import { McqResultsSection } from '../components/results/McqResultsSection'

interface McqStageProps {
  assessment: CompetencyAssessment
  /** Only an ASSESSMENT_DESIGNER (or module admin) may generate/regenerate the test — everyone else
   * sees the same status read-only, same gating as the other exam-design controls. */
  isDesigner: boolean
  /** Advances the wizard to the next stage (ارزیابی فنی تخصصی). */
  onContinue: () => void
}

/**
 * «آزمون تستی آنلاین» wizard stage — its own dedicated stage between "شخصیت و رفتاری" and "ارزیابی
 * فنی تخصصی", mirroring how the personality assessment gets its own stage: the exam-design toggle
 * ("needsOnlineMcq") only decides whether the online MCQ test is part of this candidate's plan (that
 * toggle stays in the merged panel/exam-design screen), while designing/generating the actual test
 * and reviewing its result happens here. The per-question review inside McqResultsSection is already
 * gated to module admins only by comp_mcq_get_test_detail (schema.sql) — see that RPC's `items`
 * column — so this stage never needs its own extra role check for it.
 */
export function McqStage({ assessment, isDesigner, onContinue }: McqStageProps) {
  const [mcqTest, setMcqTest] = useState<McqTestDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const { data } = await fetchMcqTestDetail(assessment.id)
    setMcqTest(data)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  if (!assessment.needsOnlineMcq) {
    return (
      <div className="glass-panel space-y-3 rounded-2xl p-6 text-center">
        <p className="text-xs text-secondary">آزمون تستی آنلاین در طرح ارزیابی این متقاضی قرار ندارد.</p>
        <button
          onClick={onContinue}
          className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
        >
          ارزیابی فنی تخصصی <ArrowLeft size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <ListChecks size={15} className="text-teal-300" /> آزمون تستی آنلاین
          </p>
          {mcqTest && (
            <span className="rounded-full bg-teal-500/15 px-2.5 py-1 text-[10.5px] font-bold text-teal-200">
              {MCQ_TEST_STATUS_LABEL_FA[mcqTest.status]}
              {mcqTest.status === 'SCORED' && mcqTest.scorePercent != null && <span className="num"> — {mcqTest.scorePercent.toLocaleString('fa-IR')}٪</span>}
            </span>
          )}
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-muted" />
        ) : isDesigner ? (
          <McqGeneratePanel assessment={assessment} mcqTest={mcqTest} onGenerated={refresh} />
        ) : (
          <p className="text-[11px] text-muted">طراحی و تولید آزمون فقط توسط طراح آزمون انجام می‌شود.</p>
        )}
      </div>

      <McqResultsSection assessmentId={assessment.id} />

      <div className="flex justify-end">
        <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
          ارزیابی فنی تخصصی <ArrowLeft size={13} />
        </button>
      </div>
    </div>
  )
}

/**
 * Generate/regenerate button (with a configurable question count + time limit) and the candidate's
 * copyable link for the online MCQ test — mirrors PersonalityStage's copy-link card. A test the
 * candidate has already started can only be regenerated with an explicit discard confirmation
 * (comp_mcq_generate_test's p_discard_existing), matching the technical designer's own pattern.
 */
function McqGeneratePanel({ assessment, mcqTest, onGenerated }: { assessment: CompetencyAssessment; mcqTest: McqTestDetail | null; onGenerated: () => void }) {
  const [questionCount, setQuestionCount] = useState(30)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(45)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const started = mcqTest != null && mcqTest.status !== 'NOT_STARTED'

  const handleGenerate = async (discardExisting: boolean) => {
    setError(null)
    setGenerating(true)
    const { error: err } = await generateMcqTest(assessment.id, questionCount, timeLimitMinutes, discardExisting)
    setGenerating(false)
    if (err) {
      setError(mcqErrorFa(err))
      return
    }
    onGenerated()
  }

  const handleGenerateClick = () => {
    if (started && !window.confirm('متقاضی این آزمون را شروع کرده یا به پایان رسانده است. با تولید آزمون جدید، پاسخ‌های فعلی کنار گذاشته می‌شوند (در گزارش ممیزی بایگانی می‌مانند). ادامه می‌دهید؟')) {
      return
    }
    handleGenerate(started)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">تعداد سؤال</span>
          <input
            type="number"
            min={5}
            max={100}
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.min(100, Math.max(5, Number(e.target.value) || 0)))}
            className="num input w-24 !py-1.5 text-center text-[11px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">زمان (دقیقه)</span>
          <input
            type="number"
            min={5}
            max={240}
            value={timeLimitMinutes}
            onChange={(e) => setTimeLimitMinutes(Math.min(240, Math.max(5, Number(e.target.value) || 0)))}
            className="num input w-24 !py-1.5 text-center text-[11px]"
          />
        </label>
        <button
          onClick={handleGenerateClick}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : started ? <RotateCw size={13} /> : <Wand2 size={13} />}
          {started ? 'تولید مجدد آزمون' : 'تولید آزمون'}
        </button>
      </div>
      {mcqTest && (
        <p className="text-[10.5px] text-muted">
          {mcqTest.questionCount != null && (
            <>
              آخرین آزمون تولیدشده: <span className="num font-bold text-secondary">{mcqTest.questionCount.toLocaleString('fa-IR')}</span> سؤال، زمان{' '}
              <span className="num font-bold text-secondary">{mcqTest.timeLimitMinutes.toLocaleString('fa-IR')}</span> دقیقه
              {mcqTest.generation.poolSize != null && (
                <>
                  {' '}
                  (از میان <span className="num">{mcqTest.generation.poolSize.toLocaleString('fa-IR')}</span> سؤال تأییدشده‌ی بانک)
                </>
              )}
              .
            </>
          )}
        </p>
      )}
      {error && <p className="text-[10.5px] text-red-300">{error}</p>}

      {mcqTest?.candidateToken && (
        <div className="space-y-1.5 rounded-xl border border-teal-400/20 bg-teal-500/[0.05] p-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-teal-200">
            <Link2 size={12} /> لینک آزمون تستی متقاضی
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly dir="ltr" value={mcqCandidateUrl(mcqTest.candidateToken)} className="input flex-1 text-[11px]" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(mcqCandidateUrl(mcqTest.candidateToken!))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-400"
            >
              <Copy size={12} /> {copied ? 'کپی شد' : 'کپی لینک'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
