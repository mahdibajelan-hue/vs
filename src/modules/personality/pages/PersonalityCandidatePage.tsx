import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { FARIN_NAME_FA } from '../../../components/common/Logo'

interface CandidateGetRow {
  id: string
  status: string
  selected_question_ids: string[]
  started_at: string | null
  submitted_at: string | null
}

interface PublicQuestionRow {
  id: string
  question_type: string
  question_text: string
  scenario_context: string
  scale_id: string | null
  options: { key: string; label_fa: string }[]
  complexity: string
  scale_key: string | null
  scale_min_value: number | null
  scale_max_value: number | null
  scale_labels: { value: number; label_fa: string }[] | null
}

type ResponseDraft = { selected?: number; selected_option?: string }

const TERMINAL_STATUSES = ['SUBMITTED', 'VALIDITY_CHECK', 'SCORING', 'FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']
const SCALE_TYPES = new Set(['LIKERT', 'FREQUENCY'])

/**
 * Public, unauthenticated candidate-taking flow (?p_candidate=<token>) — mirrors
 * CandidateSelfServicePage's token-scoped, unauthenticated pattern exactly. Every read/write goes
 * through personality_candidate_* SECURITY DEFINER RPCs, which only ever touch the one assessment
 * matching this token, and questions are read exclusively via personality_question_public() so
 * scoring metadata (dimension_key, score, which trait an item measures) never reaches the candidate.
 */
export function PersonalityCandidatePage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [row, setRow] = useState<CandidateGetRow | null>(null)
  const [questions, setQuestions] = useState<PublicQuestionRow[]>([])
  const [answers, setAnswers] = useState<Record<string, ResponseDraft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  // N-2: per-question save failures (shown with a retry) and the finalize error.
  const [saveErrors, setSaveErrors] = useState<Record<string, ResponseDraft>>({})
  const [finishError, setFinishError] = useState<string | null>(null)
  // When each question first became visible on screen (≥60% in view) — response_time_ms is measured
  // from then to the answer, so the engine's fast-answer (random pattern) check has real timings.
  const shownAt = useRef<Record<string, number>>({})
  const observer = useRef<IntersectionObserver | null>(null)
  const pageShownAt = useRef<number>(Date.now())

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.qid
          if (id && e.isIntersecting && shownAt.current[id] == null) shownAt.current[id] = Date.now()
        }
      },
      { threshold: 0.6 },
    )
    return () => observer.current?.disconnect()
  }, [])

  const observe = useCallback((el: HTMLDivElement | null) => {
    if (el) observer.current?.observe(el)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.rpc('personality_candidate_get', { p_token: token })
      if (!active) return
      if (error || !data || data.length === 0) {
        setLoading(false)
        setNotFound(true)
        return
      }
      const r = (Array.isArray(data) ? data[0] : data) as CandidateGetRow
      setRow(r)
      const terminal = TERMINAL_STATUSES.includes(r.status)
      setDone(terminal)

      if (!terminal) await supabase.rpc('personality_candidate_start', { p_token: token })

      const ids: string[] = r.selected_question_ids ?? []
      if (ids.length > 0) {
        const [{ data: qData }, { data: rData }] = await Promise.all([
          supabase.rpc('personality_question_public', { p_ids: ids }),
          supabase.rpc('personality_candidate_get_responses', { p_token: token }),
        ])
        const qRows = (qData ?? []) as PublicQuestionRow[]
        // Preserve the assessment's own frozen order (selected_question_ids) rather than whatever
        // order the RPC happens to return in.
        const byId = new Map(qRows.map((q) => [q.id, q]))
        setQuestions(ids.map((id) => byId.get(id)).filter((q): q is PublicQuestionRow => q != null))

        const prefill: Record<string, ResponseDraft> = {}
        for (const resp of (rData ?? []) as { question_id: string; response_value: ResponseDraft }[]) {
          prefill[resp.question_id] = resp.response_value
        }
        setAnswers(prefill)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [token])

  const answeredCount = useMemo(() => questions.filter((q) => answers[q.id] != null && saveErrors[q.id] == null).length, [questions, answers, saveErrors])
  const pendingSaves = Object.values(saving).some(Boolean)
  const failedCount = Object.keys(saveErrors).length
  const allAnswered = questions.length > 0 && answeredCount === questions.length && !pendingSaves

  const submitAnswer = async (questionId: string, value: ResponseDraft) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setSaving((prev) => ({ ...prev, [questionId]: true }))
    const startedAt = shownAt.current[questionId] ?? pageShownAt.current
    const responseTimeMs = Math.max(0, Math.min(Date.now() - startedAt, 2_000_000_000))
    const { error } = await supabase.rpc('personality_candidate_submit_response', {
      p_token: token,
      p_question_id: questionId,
      p_response: value,
      p_response_time_ms: responseTimeMs,
    })
    setSaving((prev) => ({ ...prev, [questionId]: false }))
    setSaveErrors((prev) => {
      const next = { ...prev }
      if (error) next[questionId] = value
      else delete next[questionId]
      return next
    })
    // The test was already submitted/closed elsewhere (e.g. a second tab) — show the closing screen.
    if (error && /already submitted/.test(error.message)) setDone(true)
  }

  const handleFinish = async () => {
    setSubmitting(true)
    setFinishError(null)
    const { error } = await supabase.rpc('personality_candidate_finalize', { p_token: token })
    setSubmitting(false)
    if (error && !/personality_not_in_progress/.test(error.message)) {
      setFinishError('ثبت نهایی انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید؛ پاسخ‌های ذخیره‌شده‌ی شما از بین نمی‌روند.')
      return
    }
    setDone(true)
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={26} className="animate-spin text-pink-400" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <p className="max-w-sm text-sm text-secondary">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="glass-panel max-w-sm rounded-2xl p-6">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-bold">پاسخ‌های شما با موفقیت ثبت شد.</p>
          <p className="mt-1.5 text-[11px] text-muted">از وقتی که برای تکمیل این ارزیابی گذاشتید سپاسگزاریم.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="glass-panel rounded-2xl p-4 text-center">
          <div className="mb-1.5 flex items-center justify-center gap-1.5 text-pink-300">
            <BrainCircuit size={16} />
            <p className="text-sm font-bold text-primary">ارزیابی شخصیت و رفتاری {FARIN_NAME_FA}</p>
          </div>
          <p className="text-[11px] text-muted">برای هر گویه، گزینه‌ای را انتخاب کنید که بیشترین شباهت را به شما دارد. پاسخ درست یا غلط وجود ندارد.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-pink-400 transition-all" style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }} />
          </div>
          <p className="num mt-1.5 text-[10px] text-muted">
            {answeredCount.toLocaleString('fa-IR')} از {questions.length.toLocaleString('fa-IR')} پاسخ داده‌شده
          </p>
        </div>

        {questions.map((q, i) => (
          <div key={q.id} ref={observe} data-qid={q.id} className={`glass-panel rounded-2xl p-4 ${saveErrors[q.id] ? 'border border-red-400/40' : ''}`}>
            <p className="mb-3 text-[12.5px] font-bold leading-6">
              {(i + 1).toLocaleString('fa-IR')}. {q.question_text}
            </p>
            {q.scenario_context && <p className="mb-3 rounded-lg bg-white/[0.03] p-2.5 text-[11px] leading-6 text-secondary">{q.scenario_context}</p>}

            {SCALE_TYPES.has(q.question_type) && q.scale_labels ? (
              <div className="flex flex-wrap gap-1.5">
                {q.scale_labels.map((opt) => {
                  const selected = answers[q.id]?.selected === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => submitAnswer(q.id, { selected: opt.value })}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-medium transition-colors ${
                        selected ? 'border-pink-400 bg-pink-500/20 text-pink-200' : 'border-white/10 bg-white/[0.02] text-secondary hover:bg-white/5'
                      }`}
                    >
                      {opt.label_fa}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                {q.options.map((opt) => {
                  const selected = answers[q.id]?.selected_option === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => submitAnswer(q.id, { selected_option: opt.key })}
                      className={`block w-full rounded-xl border p-2.5 text-right text-[11.5px] leading-6 transition-colors ${
                        selected ? 'border-pink-400 bg-pink-500/20 text-pink-200' : 'border-white/10 bg-white/[0.02] text-secondary hover:bg-white/5'
                      }`}
                    >
                      {opt.label_fa}
                    </button>
                  )
                })}
              </div>
            )}
            {saving[q.id] && <p className="mt-1.5 text-[9.5px] text-muted">در حال ذخیره…</p>}
            {!saving[q.id] && saveErrors[q.id] && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-red-300">
                <AlertTriangle size={12} /> این پاسخ ذخیره نشد.
                <button
                  onClick={() => submitAnswer(q.id, saveErrors[q.id])}
                  className="flex items-center gap-1 rounded-lg border border-red-400/30 px-2 py-0.5 font-bold text-red-200 hover:bg-red-500/10"
                >
                  <RotateCw size={11} /> تلاش دوباره
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="sticky bottom-4 space-y-2">
          {(failedCount > 0 || finishError) && (
            <p className="rounded-xl border border-red-400/30 bg-red-500/15 p-2.5 text-center text-[11px] leading-6 text-red-100">
              {finishError ?? `${failedCount.toLocaleString('fa-IR')} پاسخ ذخیره نشده است؛ روی «تلاش دوباره» زیر همان سؤال بزنید.`}
            </p>
          )}
          <button
            onClick={handleFinish}
            disabled={!allAnswered || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 text-sm font-bold text-white shadow-lg hover:bg-pink-400 disabled:opacity-40"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {allAnswered
              ? 'ثبت نهایی پاسخ‌ها'
              : pendingSaves
                ? 'در حال ذخیره‌ی پاسخ‌ها…'
                : `ابتدا به همه سؤالات پاسخ دهید (${answeredCount.toLocaleString('fa-IR')}/${questions.length.toLocaleString('fa-IR')})`}
          </button>
        </div>
      </div>
    </div>
  )
}
