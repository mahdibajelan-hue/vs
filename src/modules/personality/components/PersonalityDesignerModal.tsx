import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Wand2, X } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { MIN_ITEMS_PER_DIMENSION, VALIDITY_ITEMS_PER_TEST } from '../lib/personalitySelection'
import {
  PERSONALITY_COMPLEXITY_LABEL_FA,
  PERSONALITY_QUESTION_TYPE_LABEL_FA,
  type JobRole,
  type PersonalityAssessmentStatus,
  type PersonalityComplexity,
  type PersonalityQuestionType,
} from '../types'

const ALL_TYPES: PersonalityQuestionType[] = ['LIKERT', 'FREQUENCY', 'FORCED_CHOICE', 'SJT', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']
const ALL_COMPLEXITIES: PersonalityComplexity[] = ['L1', 'L2', 'L3', 'L4']

// Statuses in which the candidate has (or may have) already answered — regenerating then discards
// those responses and any scores, so it needs explicit confirmation (the server enforces the same
// rule and reports 'responses_exist' for anything this list misses).
const PROGRESS_STATUSES: PersonalityAssessmentStatus[] = [
  'IN_PROGRESS',
  'SUBMITTED',
  'VALIDITY_CHECK',
  'SCORING',
  'FINGERPRINT',
  'AI_ANALYSIS',
  'FINAL_REVIEW',
]

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
  initialTemplateId,
  assessmentCompleted = false,
}: {
  personalityAssessmentId: string
  jobRole: JobRole
  onClose: () => void
  onGenerated: () => void
  /** A saved personality_assessment_templates row (e.g. from the candidate's Assessment Blueprint)
   * whose question mix replaces DEFAULT_COUNTS as the starting grid. */
  initialTemplateId?: string | null
  /** The competency assessment is completed — the test is then frozen and cannot be regenerated. */
  assessmentCompleted?: boolean
}) {
  const questionBank = usePersonalityStore((s) => s.questionBank)
  const fetchQuestionBank = usePersonalityStore((s) => s.fetchQuestionBank)
  const generateFromMix = usePersonalityStore((s) => s.generateFromMix)
  const templates = usePersonalityStore((s) => s.templates)
  const fetchTemplates = usePersonalityStore((s) => s.fetchTemplates)

  const [counts, setCounts] = useState<Record<string, number>>(DEFAULT_COUNTS)
  const [generating, setGenerating] = useState(false)
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const personalityAssessment = usePersonalityStore((s) => s.assessments.find((a) => a.id === personalityAssessmentId))
  const locked = assessmentCompleted || personalityAssessment?.status === 'LOCKED' || personalityAssessment?.status === 'ARCHIVED'
  const hasProgress = personalityAssessment != null && PROGRESS_STATUSES.includes(personalityAssessment.status)

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    if (initialTemplateId && templates.length === 0) fetchTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initialTemplate = initialTemplateId ? templates.find((t) => t.id === initialTemplateId) : undefined
  useEffect(() => {
    if (!initialTemplate || appliedTemplateId === initialTemplate.id) return
    const next: Record<string, number> = {}
    for (const cell of initialTemplate.questionMix) next[cellKey(cell.questionType, cell.complexity)] = cell.count
    setCounts(next)
    setAppliedTemplateId(initialTemplate.id)
  }, [initialTemplate, appliedTemplateId])

  const approvedBank = useMemo(
    // Validity-scale items are added by the generator on top of the mix — never counted as supply.
    () => questionBank.filter((q) => q.active && q.approvalStatus === 'APPROVED' && q.validityScale == null && (q.jobRole == null || q.jobRole === jobRole)),
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

  const handleGenerate = async (discardExisting: boolean) => {
    if (locked) return
    if (hasProgress && !discardExisting) {
      setConfirmingDiscard(true)
      return
    }
    setGenerating(true)
    const mix = ALL_TYPES.flatMap((t) => ALL_COMPLEXITIES.map((c) => ({ questionType: t, complexity: c, count: counts[cellKey(t, c)] ?? 0 })).filter((cell) => cell.count > 0))
    const result = await generateFromMix(personalityAssessmentId, jobRole, mix, discardExisting)
    setGenerating(false)
    if (result === 'responses_exist') {
      setConfirmingDiscard(true)
      return
    }
    if (result === 'ok') onGenerated()
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
          {initialTemplate && (
            <p className="mb-2 text-[10.5px] text-pink-200">ترکیب اولیه از الگوی «{initialTemplate.title}» بارگذاری شد.</p>
          )}
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
          <p className="mt-1 text-[10.5px] leading-6 text-muted">
            انتخاب سؤال‌ها بُعدمحور است: برای هر بُعد رفتاری که نیم‌رخ شغلی یا مدل شایستگی این شغل به آن نیاز دارد حداقل {MIN_ITEMS_PER_DIMENSION.toLocaleString('fa-IR')} گویه
            (در صورت وجود در بانک) و چند جفت گویه‌ی معکوس برای سنجش سازگاری انتخاب می‌شود. علاوه بر این مجموع، {VALIDITY_ITEMS_PER_TEST.toLocaleString('fa-IR')} گویه‌ی
            مقیاس اعتبار (مطلوبیت اجتماعی) به آزمون اضافه می‌شود که در امتیاز هیچ بُعدی حساب نمی‌شود.
          </p>

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

          {locked && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-400/25 bg-white/[0.03] p-3 text-[11px] leading-6 text-secondary">
              <AlertTriangle size={14} className="mt-1 shrink-0" />
              {assessmentCompleted
                ? 'این ارزیابی ثبت نهایی شده است؛ آزمون شخصیت آن قفل است و قابل تولید مجدد نیست. برای اصلاح، ادمین ماژول باید ارزیابی را بازگشایی کند.'
                : 'این آزمون شخصیت قفل یا بایگانی شده است و قابل تولید مجدد نیست.'}
            </div>
          )}

          {confirmingDiscard && !locked && (
            <div className="mt-3 space-y-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[11px] leading-6 text-red-100">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} /> متقاضی به این آزمون پاسخ داده یا آزمون نمره‌دهی شده است.
              </p>
              <p>
                تولید مجدد، <b>همه‌ی پاسخ‌های ثبت‌شده‌ی متقاضی، امتیازهای ابعاد و نتیجه‌ی اعتبارسنجی</b> را حذف می‌کند (یک نسخه در گزارش رویدادها بایگانی می‌شود)،
                وضعیت آزمون به «تولیدشده» برمی‌گردد و متقاضی باید با همان لینک از ابتدا پاسخ دهد. شواهد شخصیت تا پاسخ‌گویی دوباره در پروفایل شایستگی حساب نمی‌شود.
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button onClick={() => setConfirmingDiscard(false)} className="rounded-lg border border-white/15 px-3 py-1 text-[11px] text-secondary hover:bg-white/5">
                  انصراف
                </button>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={!canGenerate || generating}
                  className="rounded-lg bg-red-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-400 disabled:opacity-40"
                >
                  {generating ? 'در حال تولید…' : 'حذف پاسخ‌ها و تولید مجدد'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end border-t border-white/10 pt-4">
            <button
              onClick={() => handleGenerate(false)}
              disabled={!canGenerate || generating || locked || confirmingDiscard}
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
