import { SCORE_LABELS_FA } from '../lib/competencyModel'
import type { CompetencyAnswer, CompetencyQuestion } from '../types'

/** One panelist's recorded opinion on a single question, shown to the assessment lead. */
export interface PanelVote {
  name: string
  score: number | null
  note: string
}

interface QuestionScoreCardProps {
  index: number
  question: CompetencyQuestion
  hint?: string
  answer: CompetencyAnswer | undefined
  editable: boolean
  onChange: (score: number | null, note: string) => void
  /**
   * The three interviewers' scores for this question. Only passed on the lead's final-verdict
   * screen, where the lead reads what each panelist recorded before setting the final score.
   */
  panelVotes?: PanelVote[]
}

/** One interview question with a 0-5 score picker and an optional note — the interviewer reads the question aloud, listens to the candidate, then records the score here. */
export function QuestionScoreCard({ index, question, hint, answer, editable, onChange, panelVotes }: QuestionScoreCardProps) {
  const score = answer?.score ?? null
  const note = answer?.note ?? ''

  const votes = panelVotes?.filter((v) => v.score != null) ?? []
  const average = votes.length > 0 ? Math.round((votes.reduce((sum, v) => sum + (v.score ?? 0), 0) / votes.length) * 10) / 10 : null

  return (
    <div className="rounded-xl border border-white/10 p-3.5">
      <p className="text-xs leading-6">
        <span className="num ml-1.5 text-muted">{index + 1}.</span>
        {question.text}
      </p>
      {hint && <p className="mt-1 text-[10.5px] leading-5 text-muted">راهنمای پاسخ ممتاز: {hint}</p>}

      {panelVotes && panelVotes.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-purple-400/20 bg-purple-500/[0.06] p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-200">نظر داوران</span>
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
