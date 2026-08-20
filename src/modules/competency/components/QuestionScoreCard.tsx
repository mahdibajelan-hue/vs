import { SCORE_LABELS_FA } from '../lib/competencyModel'
import type { CompetencyAnswer, CompetencyQuestion } from '../types'

interface QuestionScoreCardProps {
  index: number
  question: CompetencyQuestion
  answer: CompetencyAnswer | undefined
  editable: boolean
  onChange: (score: number | null, note: string) => void
}

/** One interview question with a 1-5 score picker and an optional note — the interviewer reads the question aloud, listens to the candidate, then records the score here. */
export function QuestionScoreCard({ index, question, answer, editable, onChange }: QuestionScoreCardProps) {
  const score = answer?.score ?? null
  const note = answer?.note ?? ''

  return (
    <div className="rounded-xl border border-white/10 p-3.5">
      <p className="text-xs leading-6">
        <span className="num ml-1.5 text-muted">{index + 1}.</span>
        {question.text}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={!editable}
            onClick={() => onChange(score === s ? null : s, note)}
            title={SCORE_LABELS_FA[s]}
            className={`num flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors disabled:cursor-default ${
              score === s ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/15 text-secondary hover:bg-white/5'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="mr-1 text-[10px] text-muted">{score ? SCORE_LABELS_FA[score] : 'ثبت‌نشده'}</span>
      </div>
      {editable ? (
        <textarea
          defaultValue={note}
          onBlur={(e) => onChange(score, e.target.value)}
          rows={1}
          placeholder="یادداشت (اختیاری)…"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-brand-400"
        />
      ) : (
        note && <p className="mt-2 text-[11px] text-secondary">{note}</p>
      )}
    </div>
  )
}
