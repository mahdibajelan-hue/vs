import { SCORE_LABELS_FA } from '../lib/competencyModel'
import type { CompetencyAnswer, CompetencyQuestion } from '../types'

interface QuestionScoreCardProps {
  index: number
  question: CompetencyQuestion
  hint?: string
  answer: CompetencyAnswer | undefined
  editable: boolean
  onChange: (score: number | null, note: string) => void
  /** Optional side-note shown next to the score row (e.g. "میانگین داوران: ۳٫۲"). */
  averageHint?: string
}

/** One interview question with a 0-5 score picker and an optional note — the interviewer reads the question aloud, listens to the candidate, then records the score here. */
export function QuestionScoreCard({ index, question, hint, answer, editable, onChange, averageHint }: QuestionScoreCardProps) {
  const score = answer?.score ?? null
  const note = answer?.note ?? ''

  return (
    <div className="rounded-xl border border-white/10 p-3.5">
      <p className="text-xs leading-6">
        <span className="num ml-1.5 text-muted">{index + 1}.</span>
        {question.text}
      </p>
      {hint && <p className="mt-1 text-[10.5px] leading-5 text-muted">راهنمای پاسخ ممتاز: {hint}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={!editable}
            onClick={() => onChange(score === s ? null : s, note)}
            title={SCORE_LABELS_FA[s]}
            className={`num flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors disabled:cursor-default ${
              score === s ? 'border-purple-400 bg-purple-500 text-white' : 'border-white/15 text-secondary hover:bg-white/5'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="mr-1 text-[10px] text-muted">{score != null ? SCORE_LABELS_FA[score] : 'ثبت‌نشده'}</span>
        {averageHint && <span className="mr-auto text-[10px] text-purple-300">{averageHint}</span>}
      </div>
      {editable ? (
        <textarea
          defaultValue={note}
          onBlur={(e) => onChange(score, e.target.value)}
          rows={1}
          placeholder="یادداشت (اختیاری)…"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-purple-400"
        />
      ) : (
        note && <p className="mt-2 text-[11px] text-secondary">{note}</p>
      )}
    </div>
  )
}
