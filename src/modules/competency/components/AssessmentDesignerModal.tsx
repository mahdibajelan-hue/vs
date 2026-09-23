import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, Wand2, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import {
  JOB_ROLE_LABEL_FA,
  QUESTION_DIFFICULTY_LABEL_FA,
  QUESTION_TYPE_LABEL_FA,
  type JobRole,
  type QuestionDifficulty,
  type QuestionMixCell,
  type QuestionType,
} from '../types'

const ALL_DIFFICULTIES: QuestionDifficulty[] = ['L1', 'L2', 'L3', 'L4']
const ALL_QUESTION_TYPES: QuestionType[] = [
  'GENERAL',
  'TECHNICAL',
  'SCENARIO',
  'PROBLEM_SOLVING',
  'EXPERIENCE_BASED',
  'CASE_STUDY',
  'IMAGE_BASED',
  'BEHAVIORAL',
  'HSE',
  'JUDGMENT',
]

function cellKey(category: QuestionType, difficulty: QuestionDifficulty) {
  return `${category}__${difficulty}`
}

const STEPS = ['تنظیمات آزمون', 'ترکیب سؤال', 'بررسی موجودی بانک سؤال', 'پیش‌نمایش و تولید'] as const

/**
 * "طراحی آزمون شایستگی" wizard (spec section 6-9/36-37): configure how many questions of each
 * type/difficulty an assessment should draw from the bank, check that against real availability,
 * then generate the frozen question snapshot for one specific candidate's assessment. The
 * type/difficulty mix is saved as a reusable comp_assessment_templates row so the next candidate of
 * the same job role can reuse it in one click instead of reconfiguring from scratch.
 */
export function AssessmentDesignerModal({ assessmentId, jobRole, onClose }: { assessmentId: string; jobRole: JobRole; onClose: () => void }) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const fetchJobRoleConfigs = useCompetencyStore((s) => s.fetchJobRoleConfigs)
  const questionBankPublic = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBankPublic = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const assessmentTemplates = useCompetencyStore((s) => s.assessmentTemplates)
  const fetchAssessmentTemplates = useCompetencyStore((s) => s.fetchAssessmentTemplates)
  const upsertAssessmentTemplate = useCompetencyStore((s) => s.upsertAssessmentTemplate)
  const assignQuestionsFromMix = useCompetencyStore((s) => s.assignQuestionsFromMix)

  const [step, setStep] = useState(0)
  const [generating, setGenerating] = useState(false)

  const templatesForRole = useMemo(() => assessmentTemplates.filter((t) => t.jobRole === jobRole), [assessmentTemplates, jobRole])
  const [templateId, setTemplateId] = useState<string | null>(null)

  const [title, setTitle] = useState(`آزمون استاندارد — ${JOB_ROLE_LABEL_FA[jobRole]}`)
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null)
  const [autoFinishOnTimeout, setAutoFinishOnTimeout] = useState(false)
  const [panelSizeDefault, setPanelSizeDefault] = useState(3)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (jobRoleConfigs.length === 0) fetchJobRoleConfigs()
    if (questionBankPublic.length === 0) fetchQuestionBankPublic()
    if (assessmentTemplates.length === 0) fetchAssessmentTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allowedTypes = useMemo(() => {
    const config = jobRoleConfigs.find((c) => c.jobRole === jobRole)
    return config && config.allowedQuestionTypes.length > 0 ? config.allowedQuestionTypes : ALL_QUESTION_TYPES
  }, [jobRoleConfigs, jobRole])

  const applyTemplate = (id: string | null) => {
    setTemplateId(id)
    const t = templatesForRole.find((x) => x.id === id)
    if (!t) return
    setTitle(t.title)
    setDurationMinutes(t.durationMinutes)
    setAutoFinishOnTimeout(t.autoFinishOnTimeout)
    setPanelSizeDefault(t.panelSizeDefault)
    const next: Record<string, number> = {}
    for (const cell of t.questionMix) next[cellKey(cell.category, cell.difficulty)] = cell.count
    setCounts(next)
  }

  // Auto-load this role's most recently saved template once, so a designer generating the Nth
  // candidate of the same role doesn't have to reconfigure the mix from scratch every time.
  useEffect(() => {
    if (templateId === null && templatesForRole.length > 0) applyTemplate(templatesForRole[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesForRole.length])

  const totalByType = (type: QuestionType) => ALL_DIFFICULTIES.reduce((sum, d) => sum + (counts[cellKey(type, d)] ?? 0), 0)
  const grandTotal = allowedTypes.reduce((sum, t) => sum + totalByType(t), 0)

  const availableFor = (type: QuestionType, difficulty: QuestionDifficulty) =>
    questionBankPublic.filter((q) => q.jobRole === jobRole && q.category === type && q.difficulty === difficulty && q.active).length

  const shortfalls = useMemo(() => {
    const list: { type: QuestionType; difficulty: QuestionDifficulty; required: number; available: number }[] = []
    for (const t of allowedTypes) {
      for (const d of ALL_DIFFICULTIES) {
        const required = counts[cellKey(t, d)] ?? 0
        if (required === 0) continue
        const available = availableFor(t, d)
        if (available < required) list.push({ type: t, difficulty: d, required, available })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, allowedTypes, questionBankPublic, jobRole])

  const buildMix = (): QuestionMixCell[] =>
    allowedTypes.flatMap((t) => ALL_DIFFICULTIES.map((d) => ({ category: t, difficulty: d, count: counts[cellKey(t, d)] ?? 0 })).filter((c) => c.count > 0))

  const clampToAvailable = () => {
    setCounts((prev) => {
      const next = { ...prev }
      for (const s of shortfalls) next[cellKey(s.type, s.difficulty)] = s.available
      return next
    })
  }

  const canGoToAvailability = grandTotal > 0
  const canGenerate = grandTotal > 0 && shortfalls.length === 0

  const handleGenerate = async () => {
    setGenerating(true)
    const mix = buildMix()
    await upsertAssessmentTemplate({ id: templateId ?? undefined, jobRole, title, durationMinutes, autoFinishOnTimeout, panelSizeDefault, questionMix: mix })
    await assignQuestionsFromMix(assessmentId, jobRole, mix, durationMinutes, autoFinishOnTimeout)
    setGenerating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* flex-col with a shrink-0 header/footer and a flex-1 scrollable body — keeps the
          prev/next/generate footer always on screen instead of scrolling away with long step
          content, which on mobile (especially with the on-screen keyboard open, shrinking the
          viewport) made the submit button unreachable. */}
      {/* dvh (dynamic viewport height), not vh — vh on mobile Safari/Chrome is the LARGEST possible
          viewport (browser chrome hidden), taller than what's actually visible once the address
          bar/bottom toolbar are showing, which pinned this modal's footer buttons below the fold
          with no way to reach them. dvh tracks the real, currently-visible viewport instead. */}
      <div className="glass-panel flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 p-5 pb-0">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Wand2 size={16} className="text-purple-300" /> طراحی آزمون شایستگی — {JOB_ROLE_LABEL_FA[jobRole]}
            </p>
            <button onClick={onClose} className="text-muted hover:text-primary">
              <X size={16} />
            </button>
          </div>

          <div className="mb-5 flex items-center gap-1.5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    i === step ? 'bg-purple-500 text-white' : i < step ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-muted'
                  }`}
                >
                  {i < step ? <CheckCircle2 size={13} /> : (i + 1).toLocaleString('fa-IR')}
                </div>
                <span className={`hidden truncate text-[10px] sm:block ${i === step ? 'font-bold text-primary' : 'text-muted'}`}>{label}</span>
                {i < STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {step === 0 && (
          <div className="space-y-3">
            {templatesForRole.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">استفاده از طرح ذخیره‌شده قبلی (اختیاری)</span>
                <select value={templateId ?? ''} onChange={(e) => applyTemplate(e.target.value || null)} className="input">
                  <option value="">— طرح جدید —</option>
                  {templatesForRole.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">عنوان آزمون</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">مدت زمان تقریبی (دقیقه) — اختیاری</span>
                <input
                  type="number"
                  min={1}
                  placeholder="بدون محدودیت زمانی"
                  value={durationMinutes ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setDurationMinutes(v === '' ? null : Math.max(1, Number(v) || 1))
                  }}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">تعداد داوران پیش‌فرض</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={panelSizeDefault}
                  onChange={(e) => setPanelSizeDefault(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                  className="input"
                />
              </label>
            </div>
            <label className={`flex items-center gap-1.5 text-[11px] ${durationMinutes == null ? 'text-muted/50' : 'text-secondary'}`}>
              <input
                type="checkbox"
                disabled={durationMinutes == null}
                checked={autoFinishOnTimeout}
                onChange={(e) => setAutoFinishOnTimeout(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              پس از پایان زمان تعیین‌شده، تایمر مصاحبه به‌صورت خودکار متوقف شود (در غیر این صورت تایمر تا توقف دستی داور ادامه می‌یابد)
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted">برای هر نوع سؤال، تعداد لازم را به تفکیک سطح دشواری وارد کنید.</p>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
                    <th className="p-2 text-right font-bold">نوع سؤال</th>
                    {ALL_DIFFICULTIES.map((d) => (
                      <th key={d} className="num p-2 text-center font-bold">
                        {QUESTION_DIFFICULTY_LABEL_FA[d].split(' ')[0]}
                      </th>
                    ))}
                    <th className="num p-2 text-center font-bold text-purple-300">جمع</th>
                  </tr>
                </thead>
                <tbody>
                  {allowedTypes.map((t) => (
                    <tr key={t} className="border-b border-white/5 last:border-0">
                      <td className="p-2 font-bold">{QUESTION_TYPE_LABEL_FA[t]}</td>
                      {ALL_DIFFICULTIES.map((d) => (
                        <td key={d} className="p-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            value={counts[cellKey(t, d)] ?? 0}
                            onChange={(e) =>
                              setCounts((prev) => ({ ...prev, [cellKey(t, d)]: Math.max(0, Number(e.target.value) || 0) }))
                            }
                            className="num h-7 w-14 rounded-lg border border-white/10 bg-white/5 text-center outline-none focus:border-purple-400"
                          />
                        </td>
                      ))}
                      <td className="num p-2 text-center font-bold text-purple-300">{totalByType(t).toLocaleString('fa-IR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="num text-left text-xs font-bold text-secondary">مجموع سؤالات: {grandTotal.toLocaleString('fa-IR')}</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {shortfalls.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
                <CheckCircle2 size={15} /> بانک سؤال برای این ترکیب کافی است — می‌توانید ادامه دهید.
              </div>
            ) : (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                <p className="mb-1.5 flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={14} /> برای این ترکیب سؤال، بانک سؤال کافی نیست.
                </p>
                <p className="mb-2 text-amber-200/80">می‌توانید تعداد را کاهش دهید، سطح دشواری را تغییر دهید، ترکیب را عوض کنید یا سؤال جدید به بانک اضافه کنید.</p>
                <button
                  onClick={clampToAvailable}
                  className="rounded-lg border border-amber-300/30 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold text-amber-100 hover:bg-amber-500/25"
                >
                  تعداد را با موجودی واقعی هماهنگ کن
                </button>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
                    <th className="p-2 text-right font-bold">نوع سؤال</th>
                    <th className="p-2 text-right font-bold">دشواری</th>
                    <th className="num p-2 text-center font-bold">مورد نیاز</th>
                    <th className="num p-2 text-center font-bold">موجود</th>
                    <th className="p-2 text-center font-bold">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {allowedTypes.flatMap((t) =>
                    ALL_DIFFICULTIES.filter((d) => (counts[cellKey(t, d)] ?? 0) > 0).map((d) => {
                      const required = counts[cellKey(t, d)] ?? 0
                      const available = availableFor(t, d)
                      const ok = available >= required
                      return (
                        <tr key={cellKey(t, d)} className="border-b border-white/5 last:border-0">
                          <td className="p-2">{QUESTION_TYPE_LABEL_FA[t]}</td>
                          <td className="p-2 text-muted">{QUESTION_DIFFICULTY_LABEL_FA[d]}</td>
                          <td className="num p-2 text-center">{required.toLocaleString('fa-IR')}</td>
                          <td className="num p-2 text-center">{available.toLocaleString('fa-IR')}</td>
                          <td className="p-2 text-center">
                            {ok ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <CheckCircle2 size={12} /> کافی
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-300">
                                <AlertTriangle size={12} /> کمبود
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewTile label="شغل" value={JOB_ROLE_LABEL_FA[jobRole]} />
              <PreviewTile label="تعداد کل سؤالات" value={grandTotal.toLocaleString('fa-IR')} />
              <PreviewTile label="مدت زمان تقریبی" value={durationMinutes != null ? `${durationMinutes.toLocaleString('fa-IR')} دقیقه` : 'بدون محدودیت'} />
              <PreviewTile label="داوران پیش‌فرض" value={panelSizeDefault.toLocaleString('fa-IR')} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allowedTypes
                .filter((t) => totalByType(t) > 0)
                .map((t) => (
                  <span key={t} className="rounded-full bg-purple-500/12 px-2.5 py-1 text-[10.5px] font-bold text-purple-200">
                    {QUESTION_TYPE_LABEL_FA[t]}: {totalByType(t).toLocaleString('fa-IR')}
                  </span>
                ))}
            </div>
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <Sparkles size={12} /> با تولید، این ترکیب به‌عنوان طرح «{title}» ذخیره می‌شود و سؤالات به‌صورت تصادفی از بانک انتخاب و برای این ارزیابی قفل می‌شوند.
            </p>
          </div>
        )}
        </div>

        <div className="shrink-0 flex items-center justify-between border-t border-white/10 p-5">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-30"
          >
            <ChevronRight size={14} /> قبلی
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={step === 1 && !canGoToAvailability}
              className="flex items-center gap-1 rounded-lg bg-purple-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-400 disabled:opacity-40"
            >
              بعدی <ChevronLeft size={14} />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-400 disabled:opacity-40"
            >
              <Wand2 size={14} /> {generating ? 'در حال تولید…' : 'تولید و اعمال آزمون'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <p className="mb-0.5 text-[10px] text-muted">{label}</p>
      <p className="num truncate text-xs font-bold">{value}</p>
    </div>
  )
}
