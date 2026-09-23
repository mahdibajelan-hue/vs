import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Wand2, X } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { PERSONALITY_COMPLEXITY_LABEL_FA, PERSONALITY_QUESTION_TYPE_LABEL_FA, type JobRole, type PersonalityComplexity, type PersonalityQuestionType } from '../types'

const ALL_TYPES: PersonalityQuestionType[] = ['LIKERT', 'FREQUENCY', 'FORCED_CHOICE', 'SJT', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']
const ALL_COMPLEXITIES: PersonalityComplexity[] = ['L1', 'L2', 'L3', 'L4']

function cellKey(t: PersonalityQuestionType, c: PersonalityComplexity) {
  return `${t}__${c}`
}

// A reasonable, evidence-diverse starting mix: mostly LIKERT/FREQUENCY trait coverage, a handful of
// SJT/forced-choice items for behavioral-dimension coverage. Admins can freely adjust before generating.
const DEFAULT_COUNTS: Record<string, number> = {
  [cellKey('LIKERT', 'L1')]: 20,
  [cellKey('FREQUENCY', 'L1')]: 8,
  [cellKey('FORCED_CHOICE', 'L1')]: 6,
  [cellKey('SJT', 'L2')]: 4,
  [cellKey('SJT', 'L3')]: 2,
}

/**
 * "طراحی آزمون شخصیت و رفتاری" — mirrors AssessmentDesignerModal's scrollable-overlay dialog
 * pattern exactly (see that file's comment on why the overlay itself scrolls rather than the modal
 * box) and the same generate-from-mix flow, adapted to the personality module's own question-type
 * set and store.
 */
export function PersonalityDesignerModal({
  personalityAssessmentId,
  jobRole,
  onClose,
  onGenerated,
}: {
  personalityAssessmentId: string
  jobRole: JobRole
  onClose: () => void
  onGenerated: () => void
}) {
  const questionBank = usePersonalityStore((s) => s.questionBank)
  const fetchQuestionBank = usePersonalityStore((s) => s.fetchQuestionBank)
  const generateFromMix = usePersonalityStore((s) => s.generateFromMix)

  const [counts, setCounts] = useState<Record<string, number>>(DEFAULT_COUNTS)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const approvedBank = useMemo(
    () => questionBank.filter((q) => q.active && q.approvalStatus === 'APPROVED' && (q.jobRole == null || q.jobRole === jobRole)),
    [questionBank, jobRole],
  )

  const availableFor = (t: PersonalityQuestionType, c: PersonalityComplexity) =>
    approvedBank.filter((q) => q.questionType === t && q.complexity === c).length

  const totalByType = (t: PersonalityQuestionType) => ALL_COMPLEXITIES.reduce((sum, c) => sum + (counts[cellKey(t, c)] ?? 0), 0)
  const grandTotal = ALL_TYPES.reduce((sum, t) => sum + totalByType(t), 0)

  const shortfalls = useMemo(() => {
    const list: { type: PersonalityQuestionType; complexity: PersonalityComplexity; required: number; available: number }[] = []
    for (const t of ALL_TYPES) {
      for (const c of ALL_COMPLEXITIES) {
        const required = counts[cellKey(t, c)] ?? 0
        if (required === 0) continue
        const available = availableFor(t, c)
        if (available < required) list.push({ type: t, complexity: c, required, available })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, approvedBank])

  const clampToAvailable = () => {
    setCounts((prev) => {
      const next = { ...prev }
      for (const s of shortfalls) next[cellKey(s.type, s.complexity)] = s.available
      return next
    })
  }

  const canGenerate = grandTotal > 0 && shortfalls.length === 0

  const handleGenerate = async () => {
    setGenerating(true)
    const mix = ALL_TYPES.flatMap((t) => ALL_COMPLEXITIES.map((c) => ({ questionType: t, complexity: c, count: counts[cellKey(t, c)] ?? 0 })).filter((cell) => cell.count > 0))
    await generateFromMix(personalityAssessmentId, jobRole, mix)
    setGenerating(false)
    onGenerated()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center py-6 sm:items-center sm:py-10">
        <div className="glass-panel w-full max-w-3xl rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Wand2 size={16} className="text-pink-300" /> طراحی آزمون شخصیت و رفتاری
            </p>
            <button onClick={onClose} className="text-muted hover:text-primary">
              <X size={16} />
            </button>
          </div>

          <p className="mb-2 text-[11px] text-muted">برای هر نوع سؤال، تعداد لازم را به تفکیک سطح پیچیدگی وارد کنید.</p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
                  <th className="p-2 text-right font-bold">نوع سؤال</th>
                  {ALL_COMPLEXITIES.map((c) => (
                    <th key={c} className="num p-2 text-center font-bold">
                      {PERSONALITY_COMPLEXITY_LABEL_FA[c]}
                    </th>
                  ))}
                  <th className="num p-2 text-center font-bold text-pink-300">جمع</th>
                </tr>
              </thead>
              <tbody>
                {ALL_TYPES.map((t) => (
                  <tr key={t} className="border-b border-white/5 last:border-0">
                    <td className="p-2 font-bold">{PERSONALITY_QUESTION_TYPE_LABEL_FA[t]}</td>
                    {ALL_COMPLEXITIES.map((c) => (
                      <td key={c} className="p-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          value={counts[cellKey(t, c)] ?? 0}
                          onChange={(e) => setCounts((prev) => ({ ...prev, [cellKey(t, c)]: Math.max(0, Number(e.target.value) || 0) }))}
                          className="num h-7 w-14 rounded-lg border border-white/10 bg-white/5 text-center outline-none focus:border-pink-400"
                        />
                      </td>
                    ))}
                    <td className="num p-2 text-center font-bold text-pink-300">{totalByType(t).toLocaleString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="num mt-2 text-left text-xs font-bold text-secondary">مجموع سؤالات: {grandTotal.toLocaleString('fa-IR')}</p>

          {shortfalls.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-[11px] text-amber-200">
              <p className="mb-1.5 flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} /> برای این ترکیب، بانک سؤال کافی نیست.
              </p>
              <ul className="mb-2 space-y-0.5 text-amber-200/80">
                {shortfalls.map((s) => (
                  <li key={cellKey(s.type, s.complexity)}>
                    {PERSONALITY_QUESTION_TYPE_LABEL_FA[s.type]} / {PERSONALITY_COMPLEXITY_LABEL_FA[s.complexity]}: نیاز به {s.required.toLocaleString('fa-IR')}، موجود{' '}
                    {s.available.toLocaleString('fa-IR')}
                  </li>
                ))}
              </ul>
              <button onClick={clampToAvailable} className="rounded-lg border border-amber-300/30 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold text-amber-100 hover:bg-amber-500/25">
                تعداد را با موجودی واقعی هماهنگ کن
              </button>
            </div>
          )}
          {shortfalls.length === 0 && grandTotal > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
              <CheckCircle2 size={15} /> بانک سؤال برای این ترکیب کافی است.
            </div>
          )}

          <div className="mt-5 flex items-center justify-end border-t border-white/10 pt-4">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-pink-400 disabled:opacity-40"
            >
              <Wand2 size={14} /> {generating ? 'در حال تولید…' : 'تولید و اعمال آزمون'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
