import { AlertTriangle } from 'lucide-react'
import { CAPSTONE_QUESTION, SCORE_LABELS_FA } from '../lib/competencyModel'

interface CapstoneCardProps {
  score: number | null
  note: string
  editable: boolean
  onChange: (score: number | null, note: string) => void
}

/** The closing crisis-scenario question — asked last on purpose, scored and noted separately from the 8 weighted domains rather than folded into their average. */
export function CapstoneCard({ score, note, editable, onChange }: CapstoneCardProps) {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.04] p-3.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-300">
        <AlertTriangle size={13} /> سناریوی پایانی — این سؤال را در پایان مصاحبه بپرسید
      </p>
      <p className="text-xs leading-6">{CAPSTONE_QUESTION.text}</p>
      <p className="mt-1.5 text-[10.5px] leading-5 text-muted">راهنمای پاسخ ممتاز: {CAPSTONE_QUESTION.hint}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={!editable}
            onClick={() => onChange(score === s ? null : s, note)}
            title={SCORE_LABELS_FA[s]}
            className={`num flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors disabled:cursor-default ${
              score === s ? 'border-amber-400 bg-amber-500 text-white' : 'border-white/15 text-secondary hover:bg-white/5'
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
          rows={2}
          placeholder="یادداشت (اختیاری)…"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-amber-400"
        />
      ) : (
        note && <p className="mt-2 text-[11px] text-secondary">{note}</p>
      )}
    </div>
  )
}
