import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, ListChecks, Loader2, RotateCw, ShieldAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'

interface CandidateOption {
  key: number
  text: string
}
interface CandidateQuestion {
  id: string
  stem: string
  options: CandidateOption[]
}
interface CandidateAnswer {
  option: number
  timeMs: number | null
}
interface CandidateState {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'SCORED'
  locked: boolean
  candidateName: string
  jobRoleLabel: string
  questionCount: number
  timeLimitMinutes: number
  startedAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  serverNow: string
  questions: CandidateQuestion[]
  answers: Record<string, CandidateAnswer>
}

/**
 * Public, unauthenticated online technical MCQ test («آزمون تستی آنلاین», schema.sql Section 56) —
 * the candidate's second ONLINE part next to the personality test, reached via its own link
 * (?mcq=<token>), mirroring PersonalityCandidatePage's token-scoped pattern exactly. Every read/write
 * goes through comp_mcq_candidate_* SECURITY DEFINER RPCs, which never return the correct option,
 * the explanation, the topic or the category — before or after submit — and enforce the time limit
 * server-side (comp_mcq_finalize_if_expired), so a client-side clock cannot extend it.
 */
export function McqCandidatePage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [state, setState] = useState<CandidateState | null>(null)
  const [starting, setStarting] = useState(false)
  const [index, setIndex] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveErrors, setSaveErrors] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  // Client clock vs server clock offset (serverNow − Date.now() at fetch time) so the countdown is
  // correct even when the candidate's device clock is off; the server is the only real authority
  // (comp_mcq_finalize_if_expired scores as TIMEOUT regardless of what the client displays).
  const clockOffsetRef = useRef(0)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const shownAtRef = useRef<Record<string, number>>({})

  const applyState = useCallback((s: CandidateState) => {
    clockOffsetRef.current = new Date(s.serverNow).getTime() - Date.now()
    setState(s)
    if (s.status === 'IN_PROGRESS' && s.questions.length > 0) {
      const firstUnanswered = s.questions.findIndex((q) => s.answers[q.id] == null)
      setIndex(firstUnanswered === -1 ? s.questions.length - 1 : firstUnanswered)
      setReviewing(false)
    }
  }, [])

  const load = useCallback(
    async (rpc: 'comp_mcq_candidate_get' | 'comp_mcq_candidate_start') => {
      const { data, error } = await supabase.rpc(rpc, { p_token: token })
      if (error || data == null) {
        setNotFound(true)
        setLoading(false)
        return
      }
      applyState(data as CandidateState)
      setLoading(false)
    },
    [token, applyState],
  )

  useEffect(() => {
    load('comp_mcq_candidate_get')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live countdown tick — also drives the auto-submit-at-zero check below.
  useEffect(() => {
    if (state?.status !== 'IN_PROGRESS') return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state?.status])

  const remainingMs = useMemo(() => {
    if (!state?.deadlineAt) return null
    return new Date(state.deadlineAt).getTime() - (nowTick + clockOffsetRef.current)
  }, [state?.deadlineAt, nowTick])

  const autoSubmittingRef = useRef(false)
  useEffect(() => {
    if (state?.status !== 'IN_PROGRESS' || remainingMs == null) return
    if (remainingMs > 0 || autoSubmittingRef.current) return
    autoSubmittingRef.current = true
    ;(async () => {
      await supabase.rpc('comp_mcq_candidate_submit', { p_token: token })
      await load('comp_mcq_candidate_get')
    })()
  }, [remainingMs, state?.status, token, load])

  useEffect(() => {
    if (state?.status === 'IN_PROGRESS' && state.questions[index]) {
      const qid = state.questions[index].id
      if (shownAtRef.current[qid] == null) shownAtRef.current[qid] = Date.now()
    }
  }, [state, index])

  const currentQuestion = state?.questions[index] ?? null

  const submitAnswer = async (questionId: string, option: number) => {
    if (!state) return
    setState({ ...state, answers: { ...state.answers, [questionId]: { option, timeMs: null } } })
    setSaving((p) => ({ ...p, [questionId]: true }))
    const startedAt = shownAtRef.current[questionId] ?? Date.now()
    const responseTimeMs = Math.max(0, Date.now() - startedAt)
    const { data, error } = await supabase.rpc('comp_mcq_candidate_answer', {
      p_token: token,
      p_question_id: questionId,
      p_option: option,
      p_response_time_ms: responseTimeMs,
    })
    setSaving((p) => ({ ...p, [questionId]: false }))
    const timedOut = !error && data && (data as { saved: boolean; reason?: string }).reason === 'TIME_OVER'
    if (error || timedOut) {
      setSaveErrors((p) => ({ ...p, [questionId]: option }))
      if (timedOut) await load('comp_mcq_candidate_get')
      return
    }
    setSaveErrors((p) => {
      const next = { ...p }
      delete next[questionId]
      return next
    })
  }

  const answeredCount = state ? state.questions.filter((q) => state.answers[q.id] != null && saveErrors[q.id] == null).length : 0
  const totalCount = state?.questions.length ?? 0
  const pendingSaves = Object.values(saving).some(Boolean)
  const failedCount = Object.keys(saveErrors).length
  const allAnswered = totalCount > 0 && answeredCount === totalCount && !pendingSaves

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    const { error } = await supabase.rpc('comp_mcq_candidate_submit', { p_token: token })
    setSubmitting(false)
    setConfirmingSubmit(false)
    if (error) {
      setSubmitError('ثبت نهایی انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید؛ پاسخ‌های ذخیره‌شده‌ی شما از بین نمی‌روند.')
      return
    }
    await load('comp_mcq_candidate_get')
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={26} className="animate-spin text-teal-400" />
      </div>
    )
  }

  if (notFound || !state) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <p className="max-w-sm text-sm text-secondary">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
      </div>
    )
  }

  if (state.locked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="glass-panel max-w-sm rounded-2xl p-6">
          <ShieldAlert size={28} className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm font-bold">این ارزیابی بسته شده است.</p>
          <p className="mt-1.5 text-[11px] leading-6 text-muted">این ارزیابی ثبت نهایی شده و امکان تغییر یا پاسخ‌گویی دیگر وجود ندارد.</p>
        </div>
      </div>
    )
  }

  if (state.status === 'SUBMITTED' || state.status === 'SCORED') {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="glass-panel max-w-sm rounded-2xl p-6">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-bold">پاسخ‌های شما با موفقیت ثبت شد.</p>
          <p className="mt-1.5 text-[11px] leading-6 text-muted">از وقتی که برای پاسخ به آزمون تستی گذاشتید سپاسگزاریم. نتیجه توسط تیم ارزیابی بررسی خواهد شد.</p>
        </div>
      </div>
    )
  }

  if (state.status === 'NOT_STARTED') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="glass-panel w-full max-w-sm space-y-4 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-teal-300">
            <ListChecks size={18} />
            <p className="text-sm font-bold text-primary">آزمون تستی فنی — {state.jobRoleLabel}</p>
          </div>
          <div className="space-y-2 text-[11.5px] leading-6 text-secondary">
            <p>سلام {state.candidateName || 'همکار گرامی'}، پیش از شروع این نکات را بخوانید:</p>
            <ul className="list-disc space-y-1.5 pr-4">
              <li>این آزمون <span className="num font-bold text-primary">{state.questionCount.toLocaleString('fa-IR')}</span> سؤال چهارگزینه‌ای دارد.</li>
              <li>
                زمان کل آزمون <span className="num font-bold text-primary">{state.timeLimitMinutes.toLocaleString('fa-IR')}</span> دقیقه است و از لحظه‌ی
                شروع شمارش می‌شود؛ با پایان زمان، آزمون به‌صورت خودکار ثبت می‌شود.
              </li>
              <li>سؤالات یکی‌یکی نمایش داده می‌شوند و می‌توانید بین آن‌ها جابه‌جا شوید.</li>
              <li>در صورت بستن یا رفرش صفحه، از همان جایی که بودید ادامه می‌دهید؛ زمان اما متوقف نمی‌شود.</li>
              <li>پس از پاسخ به همه‌ی سؤالات، صفحه‌ی بازبینی را می‌بینید و باید ثبت نهایی را تأیید کنید.</li>
            </ul>
          </div>
          <button
            onClick={async () => {
              setStarting(true)
              await load('comp_mcq_candidate_start')
              setStarting(false)
            }}
            disabled={starting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3 text-sm font-bold text-white shadow-lg hover:bg-teal-400 disabled:opacity-40"
          >
            {starting ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
            شروع آزمون
          </button>
        </div>
      </div>
    )
  }

  // IN_PROGRESS
  const minutes = remainingMs != null ? Math.max(0, Math.floor(remainingMs / 60000)) : 0
  const seconds = remainingMs != null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : 0
  const timeLow = remainingMs != null && remainingMs < 5 * 60 * 1000

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-primary">
              <ListChecks size={15} className="text-teal-300" /> آزمون تستی فنی
            </p>
            <span
              className={`num flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                timeLow ? 'bg-red-500/15 text-red-300' : 'bg-teal-500/15 text-teal-200'
              }`}
            >
              <Clock size={12} />
              {minutes.toLocaleString('fa-IR')}:{seconds.toString().padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%` }} />
          </div>
          <p className="num mt-1.5 text-[10px] text-muted">
            {answeredCount.toLocaleString('fa-IR')} از {totalCount.toLocaleString('fa-IR')} پاسخ داده‌شده — سؤال {(index + 1).toLocaleString('fa-IR')} از{' '}
            {totalCount.toLocaleString('fa-IR')}
          </p>
        </div>

        {!reviewing && currentQuestion && (
          <div className={`glass-panel rounded-2xl p-4 ${saveErrors[currentQuestion.id] != null ? 'border border-red-400/40' : ''}`}>
            <p className="mb-3 text-[13px] font-bold leading-7">
              {(index + 1).toLocaleString('fa-IR')}. {currentQuestion.stem}
            </p>
            <div className="space-y-1.5">
              {currentQuestion.options.map((opt, i) => {
                const selected = state.answers[currentQuestion.id]?.option === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => submitAnswer(currentQuestion.id, opt.key)}
                    className={`block w-full rounded-xl border p-2.5 text-right text-[12px] leading-6 transition-colors ${
                      selected ? 'border-teal-400 bg-teal-500/20 text-teal-200' : 'border-white/10 bg-white/[0.02] text-secondary hover:bg-white/5'
                    }`}
                  >
                    <span className="ml-2 inline-block w-4 text-center text-[10px] text-muted">{'ابجد'[i]}.</span>
                    {opt.text}
                  </button>
                )
              })}
            </div>
            {saving[currentQuestion.id] && <p className="mt-2 text-[9.5px] text-muted">در حال ذخیره…</p>}
            {!saving[currentQuestion.id] && saveErrors[currentQuestion.id] != null && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-red-300">
                <AlertTriangle size={12} /> این پاسخ ذخیره نشد.
                <button
                  onClick={() => submitAnswer(currentQuestion.id, saveErrors[currentQuestion.id])}
                  className="flex items-center gap-1 rounded-lg border border-red-400/30 px-2 py-0.5 font-bold text-red-200 hover:bg-red-500/10"
                >
                  <RotateCw size={11} /> تلاش دوباره
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-30"
              >
                <ChevronRight size={13} /> قبلی
              </button>
              {index < totalCount - 1 ? (
                <button
                  onClick={() => setIndex((i) => Math.min(totalCount - 1, i + 1))}
                  className="flex items-center gap-1 rounded-xl bg-teal-500 px-4 py-2 text-[11px] font-bold text-white hover:bg-teal-400"
                >
                  بعدی <ChevronLeft size={13} />
                </button>
              ) : (
                <button
                  onClick={() => setReviewing(true)}
                  className="flex items-center gap-1 rounded-xl bg-teal-500 px-4 py-2 text-[11px] font-bold text-white hover:bg-teal-400"
                >
                  بازبینی و ثبت نهایی <ChevronLeft size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {reviewing && (
          <div className="glass-panel space-y-3 rounded-2xl p-4">
            <p className="text-[12.5px] font-bold text-primary">بازبینی پاسخ‌ها</p>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {state.questions.map((q, i) => {
                const answered = state.answers[q.id] != null && saveErrors[q.id] == null
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setIndex(i)
                      setReviewing(false)
                    }}
                    className={`num rounded-lg py-1.5 text-[10.5px] font-bold ${
                      answered ? 'bg-teal-500/20 text-teal-200' : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {(i + 1).toLocaleString('fa-IR')}
                  </button>
                )
              })}
            </div>
            {(failedCount > 0 || submitError) && (
              <p className="rounded-xl border border-red-400/30 bg-red-500/15 p-2.5 text-center text-[11px] leading-6 text-red-100">
                {submitError ?? `${failedCount.toLocaleString('fa-IR')} پاسخ ذخیره نشده است؛ روی سؤال مربوطه برگردید و دوباره تلاش کنید.`}
              </p>
            )}
            {!allAnswered && !submitError && (
              <p className="text-center text-[11px] text-amber-300/90">
                {(totalCount - answeredCount).toLocaleString('fa-IR')} سؤال بدون پاسخ باقی مانده است. سؤالات قرمز‌رنگ را کامل کنید.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setReviewing(false)}
                className="flex-1 rounded-xl border border-white/10 px-3 py-2.5 text-[11.5px] text-secondary hover:bg-white/5"
              >
                بازگشت به سؤالات
              </button>
              <button
                onClick={() => setConfirmingSubmit(true)}
                disabled={!allAnswered || submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-3 py-2.5 text-[11.5px] font-bold text-white hover:bg-teal-400 disabled:opacity-40"
              >
                <CheckCircle2 size={14} /> ثبت نهایی پاسخ‌ها
              </button>
            </div>
          </div>
        )}

        {confirmingSubmit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" style={{ colorScheme: 'dark' }}>
            <div className="glass-panel w-full max-w-xs space-y-3 rounded-2xl p-5 text-center">
              <ShieldAlert size={24} className="mx-auto text-amber-400" />
              <p className="text-[12.5px] font-bold text-primary">پس از ثبت نهایی، امکان تغییر پاسخ‌ها وجود نخواهد داشت. مطمئن هستید؟</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingSubmit(false)}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-[11.5px] text-secondary hover:bg-white/5"
                >
                  انصراف
                </button>
                <button
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-3 py-2 text-[11.5px] font-bold text-white hover:bg-teal-400 disabled:opacity-40"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  بله، ثبت نهایی
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
