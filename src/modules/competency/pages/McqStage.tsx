import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Layers, Link2, Loader2, RotateCw, Sparkles, Wand2 } from 'lucide-react'
import type { CompetencyAssessment } from '../types'
import { tone } from '../lib/tone'
import { fetchMcqTestDetail, generateMcqTest, mcqCandidateUrl, mcqErrorFa, MCQ_TEST_STATUS_LABEL_FA, type McqTestDetail } from '../lib/mcqData'
import { tierColor } from '../lib/competencyModel'
import { McqResultsSection } from '../components/results/McqResultsSection'
import { RingChart } from '../components/DonutChart'
import '../styles/farinTheme.css'

const STATUS_TONE: Record<McqTestDetail['status'], string> = { NOT_STARTED: '#94a3b8', IN_PROGRESS: '#0ea5e9', SUBMITTED: '#f59e0b', SCORED: '#10b981' }

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
      <div className="fx fx-remap">
        <div className="fx-card flex flex-col items-center gap-3 p-8 text-center" style={tone('#94a3b8')}>
          <span className="fx-tone-bg-strong fx-tone-text flex h-14 w-14 items-center justify-center rounded-2xl">
            <Layers size={26} />
          </span>
          <p className="text-[13px] text-secondary">آزمون تستی آنلاین در طرح ارزیابی این متقاضی قرار ندارد.</p>
          <button
            onClick={onContinue}
            className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
          >
            ارزیابی فنی تخصصی <ArrowLeft size={13} />
          </button>
        </div>
      </div>
    )
  }

  const statusColor = mcqTest ? STATUS_TONE[mcqTest.status] : '#94a3b8'
  const scoreColor = mcqTest?.scorePercent != null ? tierColor(mcqTest.scorePercent) : statusColor

  return (
    <div className="fx fx-remap space-y-4">
      <div className="fx-card fx-tone-wash overflow-hidden p-4 sm:p-5" style={tone(statusColor)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="fx-tone-bg-strong fx-tone-text flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <Sparkles size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-black">آزمون تستی آنلاین</p>
              <p className="fx-tone-bg fx-tone-text mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                {mcqTest ? MCQ_TEST_STATUS_LABEL_FA[mcqTest.status] : '—'}
              </p>
            </div>
          </div>
          {mcqTest?.status === 'SCORED' && mcqTest.scorePercent != null && (
            <RingChart value={mcqTest.scorePercent} color={scoreColor} size={72} strokeWidth={8} label="درصد کل آزمون تستی">
              <span className="num text-base font-black leading-none" style={{ color: scoreColor }}>
                {mcqTest.scorePercent.toLocaleString('fa-IR')}
              </span>
              <span className="fx-muted text-[8px]">از ۱۰۰</span>
            </RingChart>
          )}
        </div>
      </div>

      <div className="fx-card p-4">
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
        <p className="fx-muted text-[10.5px]">
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
      {error && (
        <p className="fx-tone-text text-[10.5px]" style={tone('#ef4444')}>
          {error}
        </p>
      )}

      {mcqTest?.candidateToken && (
        <div className="fx-sub space-y-1.5 p-3" style={tone('#14b8a6')}>
          <p className="fx-tone-text flex items-center gap-1.5 text-[10.5px] font-bold">
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
