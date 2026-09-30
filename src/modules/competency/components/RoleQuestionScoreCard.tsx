import { useState } from 'react'
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { SCORE_COLOR, SCORE_GUIDE, SCORE_LABELS_FA } from '../lib/competencyModel'
import { hasPanelDivergence } from '../lib/roleCompetencyModel'
import { QUESTION_DIFFICULTY_COLOR, QUESTION_DIFFICULTY_LABEL_FA, QUESTION_TYPE_LABEL_FA, type CompetencyAnswer, type CompQuestionBankItem } from '../types'

/** One panelist's recorded opinion on a single question, shown to the assessment lead — same shape as QuestionScoreCard's PanelVote. */
export interface RolePanelVote {
  name: string
  score: number | null
  note: string
}

interface RoleQuestionScoreCardProps {
  index: number
  question: CompQuestionBankItem
  answer: CompetencyAnswer | undefined
  editable: boolean
  onChange: (score: number | null, note: string, candidateAnswer: string) => void
  panelVotes?: RolePanelVote[]
}

/**
 * The DB-backed question-bank equivalent of QuestionScoreCard, implementing spec §17's judge
 * panel: the reference answer (key points, excellent-answer indicators, common mistakes,
 * standard) sits behind a "نمایش پاسخ مرجع" toggle so it doesn't clutter the card by default, but
 * an evaluator can open it at any time — including right when the question is asked, before the
 * candidate's answer is typed in — since that's exactly when they need it to score confidently.
 */
export function RoleQuestionScoreCard({ index, question: q, answer, editable, onChange, panelVotes }: RoleQuestionScoreCardProps) {
  const score = answer?.score ?? null
  const note = answer?.note ?? ''
  const candidateAnswer = answer?.candidateAnswer ?? ''
  const [revealed, setRevealed] = useState(false)

  const votes = panelVotes?.filter((v) => v.score != null) ?? []
  const average = votes.length > 0 ? Math.round((votes.reduce((sum, v) => sum + (v.score ?? 0), 0) / votes.length) * 10) / 10 : null
  const diverged = panelVotes ? hasPanelDivergence(panelVotes.map((v) => v.score)) : false

  const criteria = score != null ? SCORE_GUIDE.find((g) => g.score === score)?.criteria : null

  return (
    <div className="rounded-xl border-[1.5px] border-white/15 bg-white/[0.02] p-3.5 shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] font-bold"
          style={{ background: `${QUESTION_DIFFICULTY_COLOR[q.difficulty]}1c`, color: QUESTION_DIFFICULTY_COLOR[q.difficulty] }}
        >
          {QUESTION_DIFFICULTY_LABEL_FA[q.difficulty]}
        </span>
        <span className="rounded-full bg-purple-500/12 px-2 py-0.5 text-[9.5px] font-bold text-purple-200">{QUESTION_TYPE_LABEL_FA[q.category]}</span>
        {q.subCategory && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">{q.subCategory}</span>}
      </div>

      <p className="text-xs leading-6">
        <span className="num ml-1.5 text-muted">{index + 1}.</span>
        {q.questionText}
      </p>

      {editable ? (
        <textarea
          defaultValue={candidateAnswer}
          onBlur={(e) => onChange(score, note, e.target.value)}
          rows={2}
          placeholder="پاسخ متقاضی را اینجا یادداشت کنید…"
          className="mt-2.5 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] outline-none focus:border-purple-400"
        />
      ) : (
        candidateAnswer && <p className="mt-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-6 text-secondary">{candidateAnswer}</p>
      )}

      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-purple-400/25 bg-purple-500/10 px-2.5 py-1.5 text-[10.5px] font-bold text-purple-200 hover:bg-purple-500/20"
      >
        <BookOpenCheck size={12} /> {revealed ? 'پنهان‌کردن پاسخ مرجع' : 'نمایش پاسخ مرجع'}
        {revealed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {revealed && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-purple-400/20 bg-purple-500/[0.06] p-3">
          <p className="text-[11px] leading-6 text-secondary">{q.referenceAnswer}</p>
          {q.keyPoints.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold text-purple-200">نکات کلیدی مورد انتظار</p>
              <ul className="space-y-0.5">
                {q.keyPoints.map((k, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-5 text-secondary">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-purple-300" /> {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.excellentAnswerIndicators.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                <Sparkles size={11} /> نشانه‌های پاسخ ممتاز (۵)
              </p>
              <ul className="space-y-0.5">
                {q.excellentAnswerIndicators.map((k, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-5 text-secondary">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-300" /> {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.commonMistakes.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-300">
                <XCircle size={11} /> خطاهای رایج
              </p>
              <ul className="space-y-0.5">
                {q.commonMistakes.map((k, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-5 text-secondary">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-300" /> {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.standardReference && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted">
              <ShieldAlert size={11} /> مرجع/استاندارد: <span className="font-bold text-secondary">{q.standardReference}</span>
            </p>
          )}
        </div>
      )}

      {panelVotes && panelVotes.length > 0 && (
        <div className={`mt-2.5 rounded-lg border p-2.5 ${diverged ? 'border-amber-400/30 bg-amber-500/[0.08]' : 'border-purple-400/20 bg-purple-500/[0.06]'}`}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={`flex items-center gap-1 text-[10px] font-bold ${diverged ? 'text-amber-200' : 'text-purple-200'}`}>
              {diverged && <AlertTriangle size={11} />} نظر داوران {diverged && '— اختلاف نظر قابل توجه'}
            </span>
            <span className="num text-[10px] text-purple-200">میانگین: {average != null ? average.toLocaleString('fa-IR') : '—'}</span>
          </div>
          <div className="space-y-1">
            {panelVotes.map((v) => (
              <div key={v.name} className="flex items-baseline gap-2 text-[10.5px]">
                <span className="num w-5 shrink-0 text-center font-bold text-purple-200">{v.score != null ? v.score.toLocaleString('fa-IR') : '—'}</span>
                <span className="shrink-0 text-secondary">{v.name}</span>
                {v.note && <span className="truncate text-muted">— {v.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={!editable}
            onClick={() => onChange(score === s ? null : s, note, candidateAnswer)}
            title={SCORE_LABELS_FA[s]}
            className={`num flex h-9 w-9 items-center justify-center rounded-xl border-2 text-sm font-extrabold backdrop-blur-sm transition-all disabled:cursor-default ${
              score === s ? 'scale-105 text-white shadow-lg' : 'hover:-translate-y-0.5'
            }`}
            style={{
              borderColor: score === s ? SCORE_COLOR[s] : `${SCORE_COLOR[s]}45`,
              background: score === s ? SCORE_COLOR[s] : `${SCORE_COLOR[s]}16`,
              color: score === s ? '#fff' : SCORE_COLOR[s],
            }}
          >
            {s}
          </button>
        ))}
        <span className="mr-1 text-[10px] text-muted">{score != null ? SCORE_LABELS_FA[score] : 'ثبت‌نشده'}</span>
        {score != null && <CheckCircle2 size={12} className="text-emerald-300" />}
      </div>
      {criteria && (
        <p
          className="mt-2 rounded-lg border p-2 text-[10.5px] leading-5 text-secondary"
          style={{ borderColor: `${SCORE_COLOR[score!]}35`, background: `${SCORE_COLOR[score!]}0f` }}
        >
          <span className="font-bold" style={{ color: SCORE_COLOR[score!] }}>
            {SCORE_LABELS_FA[score!]}:{' '}
          </span>
          {criteria}
        </p>
      )}
      {editable ? (
        <textarea
          defaultValue={note}
          onBlur={(e) => onChange(score, e.target.value, candidateAnswer)}
          rows={1}
          placeholder="یادداشت داور (اختیاری)…"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-purple-400"
        />
      ) : (
        note && <p className="mt-2 text-[11px] text-secondary">{note}</p>
      )}
    </div>
  )
}
