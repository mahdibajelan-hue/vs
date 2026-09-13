import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Library, Pencil, Plus, Search, ShieldAlert, Trash2, XCircle } from 'lucide-react'
import { useCompetencyStore, type QuestionBankInput } from '../store/useCompetencyStore'
import {
  JOB_ROLES,
  JOB_ROLE_LABEL_FA,
  QUESTION_DIFFICULTY_COLOR,
  QUESTION_DIFFICULTY_LABEL_FA,
  QUESTION_TYPE_LABEL_FA,
  type CompQuestionBankItem,
  type JobRole,
  type QuestionDifficulty,
  type QuestionType,
} from '../types'

const QUESTION_TYPES: QuestionType[] = ['GENERAL', 'TECHNICAL', 'SCENARIO', 'PROBLEM_SOLVING', 'EXPERIENCE_BASED', 'CASE_STUDY', 'IMAGE_BASED']
const DIFFICULTIES: QuestionDifficulty[] = ['L1', 'L2', 'L3', 'L4']

const EDITABLE_ROLES = JOB_ROLES.filter((r) => r !== 'project_manager')

const EMPTY_INPUT: QuestionBankInput = {
  jobRole: 'welding_inspector',
  category: 'TECHNICAL',
  subCategory: '',
  difficulty: 'L2',
  questionText: '',
  imageUrl: '',
  referenceAnswer: '',
  keyPoints: [],
  excellentAnswerIndicators: [],
  commonMistakes: [],
  standardReference: '',
  evaluatorNoteRequired: true,
  active: true,
}

/**
 * Admin-only bank management screen (spec §21/22): filter by role/category/difficulty/active,
 * create/edit a question with its full reference-answer structure, and activate/deactivate without
 * deleting — a question already used by a past assessment must stay resolvable, so this never
 * hard-deletes without confirmation and prefers deactivation for anything already in real use.
 */
export function QuestionBankPage({ onBack }: { onBack: () => void }) {
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const loading = useCompetencyStore((s) => s.loadingQuestionBank)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBank)
  const createQuestion = useCompetencyStore((s) => s.createQuestion)
  const updateQuestion = useCompetencyStore((s) => s.updateQuestion)
  const setQuestionActive = useCompetencyStore((s) => s.setQuestionActive)
  const deleteQuestion = useCompetencyStore((s) => s.deleteQuestion)

  const [roleFilter, setRoleFilter] = useState<JobRole | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<QuestionType | 'all'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CompQuestionBankItem | 'new' | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchQuestionBank()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    return questionBank.filter((q) => {
      if (roleFilter !== 'all' && q.jobRole !== roleFilter) return false
      if (categoryFilter !== 'all' && q.category !== categoryFilter) return false
      if (activeFilter === 'active' && !q.active) return false
      if (activeFilter === 'inactive' && q.active) return false
      if (search.trim() && !q.questionText.includes(search.trim()) && !q.subCategory.includes(search.trim())) return false
      return true
    })
  }, [questionBank, roleFilter, categoryFilter, activeFilter, search])

  const countsByRole = useMemo(() => {
    const map = new Map<JobRole, { total: number; active: number }>()
    for (const q of questionBank) {
      const entry = map.get(q.jobRole) ?? { total: 0, active: 0 }
      entry.total += 1
      if (q.active) entry.active += 1
      map.set(q.jobRole, entry)
    }
    return map
  }, [questionBank])

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={onBack} className="mb-1 flex items-center gap-1.5 text-xs text-secondary hover:text-primary">
            <ArrowRight size={13} /> بازگشت
          </button>
          <p className="flex items-center gap-1.5 text-lg font-extrabold">
            <Library size={18} className="text-purple-300" /> بانک سؤالات ارزیابی شایستگی
          </p>
          <p className="text-xs text-muted">مدیریت سؤالات تخصصی هر شغل — پاسخ مرجع، معیار امتیازدهی، سطح دشواری و وضعیت فعال/غیرفعال</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
        >
          <Plus size={14} /> سؤال جدید
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
        {EDITABLE_ROLES.map((role) => {
          const c = countsByRole.get(role)
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
              className={`rounded-xl border p-2 text-right transition-colors ${
                roleFilter === role ? 'border-purple-400/50 bg-purple-500/15' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
              }`}
            >
              <p className="truncate text-[10px] font-bold">{JOB_ROLE_LABEL_FA[role]}</p>
              <p className="num text-[10px] text-muted">
                {(c?.active ?? 0).toLocaleString('fa-IR')} فعال / {(c?.total ?? 0).toLocaleString('fa-IR')} کل
              </p>
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در متن سؤال…" className="input w-56 pr-7" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as QuestionType | 'all')} className="input w-auto">
          <option value="all">همه انواع سؤال</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABEL_FA[t]}
            </option>
          ))}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} className="input w-auto">
          <option value="all">همه وضعیت‌ها</option>
          <option value="active">فقط فعال</option>
          <option value="inactive">فقط غیرفعال</option>
        </select>
        {roleFilter !== 'all' && (
          <button onClick={() => setRoleFilter('all')} className="text-[11px] text-purple-300 hover:text-purple-200">
            پاک‌کردن فیلتر شغل ({JOB_ROLE_LABEL_FA[roleFilter]})
          </button>
        )}
      </div>

      {loading ? (
        <p className="p-6 text-center text-xs text-muted">در حال بارگذاری…</p>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">سؤالی با این فیلتر یافت نشد.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <div key={q.id} className="glass-panel rounded-xl p-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-secondary">{JOB_ROLE_LABEL_FA[q.jobRole]}</span>
                <span className="rounded-full bg-purple-500/12 px-2 py-0.5 text-[9.5px] font-bold text-purple-200">{QUESTION_TYPE_LABEL_FA[q.category]}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                  style={{ background: `${QUESTION_DIFFICULTY_COLOR[q.difficulty]}1c`, color: QUESTION_DIFFICULTY_COLOR[q.difficulty] }}
                >
                  {QUESTION_DIFFICULTY_LABEL_FA[q.difficulty]}
                </span>
                {q.subCategory && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">{q.subCategory}</span>}
                {q.standardReference && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9.5px] text-amber-300">
                    <ShieldAlert size={10} /> {q.standardReference}
                  </span>
                )}
                <span
                  className={`mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                    q.active ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/5 text-muted'
                  }`}
                >
                  {q.active ? <CheckCircle2 size={10} /> : <XCircle size={10} />} {q.active ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
              <p className="text-xs leading-6">{q.questionText}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setEditing(q)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5">
                  <Pencil size={11} /> ویرایش
                </button>
                <button
                  onClick={() => setQuestionActive(q.id, !q.active)}
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5"
                >
                  {q.active ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
                </button>
                {confirmDeleteId === q.id ? (
                  <span className="flex items-center gap-1.5 text-[10.5px]">
                    مطمئنید؟
                    <button onClick={() => deleteQuestion(q.id)} className="font-bold text-red-300 hover:text-red-200">
                      حذف
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-muted hover:text-secondary">
                      انصراف
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDeleteId(q.id)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-muted hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 size={11} /> حذف
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <QuestionEditorModal
          initial={editing === 'new' ? null : editing}
          defaultJobRole={roleFilter !== 'all' ? roleFilter : EMPTY_INPUT.jobRole}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === 'new') await createQuestion(input)
            else await updateQuestion(editing.id, input)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function QuestionEditorModal({
  initial,
  defaultJobRole,
  onClose,
  onSave,
}: {
  initial: CompQuestionBankItem | null
  defaultJobRole: JobRole
  onClose: () => void
  onSave: (input: QuestionBankInput) => Promise<void>
}) {
  const [form, setForm] = useState<QuestionBankInput>(
    initial
      ? {
          jobRole: initial.jobRole,
          category: initial.category,
          subCategory: initial.subCategory,
          difficulty: initial.difficulty,
          questionText: initial.questionText,
          imageUrl: initial.imageUrl,
          referenceAnswer: initial.referenceAnswer,
          keyPoints: initial.keyPoints,
          excellentAnswerIndicators: initial.excellentAnswerIndicators,
          commonMistakes: initial.commonMistakes,
          standardReference: initial.standardReference,
          evaluatorNoteRequired: initial.evaluatorNoteRequired,
          active: initial.active,
        }
      : { ...EMPTY_INPUT, jobRole: defaultJobRole },
  )
  const [keyPointsText, setKeyPointsText] = useState(form.keyPoints.join('\n'))
  const [excellentText, setExcellentText] = useState(form.excellentAnswerIndicators.join('\n'))
  const [mistakesText, setMistakesText] = useState(form.commonMistakes.join('\n'))
  const [saving, setSaving] = useState(false)

  // Quality-control checklist (spec §22) — soft guidance shown inline rather than a hard block, since
  // an admin may legitimately save a draft before every field is finalized.
  const checklist = [
    { label: 'مرتبط با شغل انتخاب‌شده است', ok: !!form.jobRole },
    { label: 'سطح دشواری مشخص است', ok: !!form.difficulty },
    { label: 'پاسخ مرجع دارد', ok: form.referenceAnswer.trim().length > 10 },
    { label: 'حداقل یک معیار امتیازدهی (نکته کلیدی) دارد', ok: linesToList(keyPointsText).length > 0 },
    { label: 'سؤال قابل فهم و بدون ابهام است (حداقل طول متن)', ok: form.questionText.trim().length > 15 },
  ]
  const allOk = checklist.every((c) => c.ok)

  const submit = async () => {
    if (!form.questionText.trim() || !form.referenceAnswer.trim()) return
    setSaving(true)
    await onSave({
      ...form,
      keyPoints: linesToList(keyPointsText),
      excellentAnswerIndicators: linesToList(excellentText),
      commonMistakes: linesToList(mistakesText),
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 text-sm font-bold">{initial ? 'ویرایش سؤال' : 'سؤال جدید'}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="شغل">
            <select value={form.jobRole} onChange={(e) => setForm((f) => ({ ...f, jobRole: e.target.value as JobRole }))} className="input">
              {EDITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {JOB_ROLE_LABEL_FA[r]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="نوع سؤال">
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as QuestionType }))} className="input">
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL_FA[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="سطح دشواری">
            <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as QuestionDifficulty }))} className="input">
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {QUESTION_DIFFICULTY_LABEL_FA[d]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="زیرموضوع (مثلاً WPS/PQR)">
          <input value={form.subCategory} onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))} className="input" />
        </FormField>

        <FormField label="متن سؤال *">
          <textarea value={form.questionText} onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))} rows={3} className="input resize-none" />
        </FormField>

        <FormField label="پاسخ مرجع (فقط برای داور نمایش داده می‌شود) *">
          <textarea value={form.referenceAnswer} onChange={(e) => setForm((f) => ({ ...f, referenceAnswer: e.target.value }))} rows={3} className="input resize-none" />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="نکات کلیدی (هر خط یک مورد)">
            <textarea value={keyPointsText} onChange={(e) => setKeyPointsText(e.target.value)} rows={4} className="input resize-none" />
          </FormField>
          <FormField label="نشانه‌های پاسخ ممتاز (هر خط یک مورد)">
            <textarea value={excellentText} onChange={(e) => setExcellentText(e.target.value)} rows={4} className="input resize-none" />
          </FormField>
          <FormField label="خطاهای رایج (هر خط یک مورد)">
            <textarea value={mistakesText} onChange={(e) => setMistakesText(e.target.value)} rows={4} className="input resize-none" />
          </FormField>
        </div>

        <FormField label="مرجع/استاندارد (در صورت اطمینان کامل — در غیر این صورت خالی بگذارید)">
          <input value={form.standardReference} onChange={(e) => setForm((f) => ({ ...f, standardReference: e.target.value }))} className="input" placeholder="مثلاً API 1104" />
        </FormField>

        <label className="mt-2 flex items-center gap-1.5 text-xs text-secondary">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-3.5 w-3.5" />
          این سؤال فعال باشد (در انتخاب تصادفی سؤالات ارزیابی‌های جدید استفاده شود)
        </label>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <p className="mb-1.5 text-[10px] font-bold text-muted">کنترل کیفیت سؤال</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {checklist.map((c) => (
              <p key={c.label} className={`flex items-center gap-1.5 text-[10.5px] ${c.ok ? 'text-emerald-300' : 'text-muted'}`}>
                {c.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {c.label}
              </p>
            ))}
          </div>
          {!allOk && <p className="mt-1.5 text-[10px] text-amber-300">می‌توانید به‌عنوان پیش‌نویس ذخیره کنید، اما پیش از فعال‌سازی نهایی موارد بالا را کامل کنید.</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.questionText.trim() || !form.referenceAnswer.trim()}
            className="rounded-lg bg-purple-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره سؤال'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  )
}
