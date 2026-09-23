import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, Clock, Home, Pencil, Plus, Search, Settings, X, XCircle } from 'lucide-react'
import { usePersonalityStore, type PersonalityQuestionInput } from '../store/usePersonalityStore'
import { SignOutButton } from '../../../components/Auth/SignOutButton'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import { JOB_ROLES, JOB_ROLE_LABEL_FA, type JobRole } from '../../competency/types'
import {
  PERSONALITY_APPROVAL_STATUS_LABEL_FA,
  PERSONALITY_COMPLEXITY_LABEL_FA,
  PERSONALITY_QUESTION_TYPE_LABEL_FA,
  type PersonalityApprovalStatus,
  type PersonalityComplexity,
  type PersonalityQuestion,
  type PersonalityQuestionOption,
  type PersonalityQuestionType,
} from '../types'

const QUESTION_TYPES: PersonalityQuestionType[] = ['LIKERT', 'FORCED_CHOICE', 'SJT', 'FREQUENCY', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']
const COMPLEXITIES: PersonalityComplexity[] = ['L1', 'L2', 'L3', 'L4']
const APPROVAL_STATUSES: PersonalityApprovalStatus[] = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION']

// Only these types carry a candidate-facing choice list (options jsonb) — LIKERT/FREQUENCY score
// off the shared response scale instead (personality_response_scales), never off `options`.
const OPTION_BASED_TYPES: PersonalityQuestionType[] = ['FORCED_CHOICE', 'SJT', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']

const EMPTY_INPUT: PersonalityQuestionInput = {
  frameworkId: null,
  traitId: null,
  facetId: null,
  dimensionId: null,
  questionType: 'LIKERT',
  questionText: '',
  scenarioContext: '',
  scaleId: null,
  options: [],
  reverseScored: false,
  jobRole: null,
  complexity: 'L1',
  weight: 1,
}

interface PersonalityQuestionBankPageProps {
  onExitToHub: () => void
  onNavDashboard: () => void
  onNavSettings?: () => void
  isModuleAdmin: boolean
}

/**
 * Personality module's staff-facing question bank — mirrors the Competency module's
 * QuestionBankPage exactly (browse/filter, admin approve/reject/edit, non-admin propose), adapted
 * to PersonalityQuestion's own shape: questionType/complexity instead of category/difficulty, and
 * trait/facet/dimension instead of a flat category string.
 */
export function PersonalityQuestionBankPage({ onExitToHub, onNavDashboard, onNavSettings, isModuleAdmin }: PersonalityQuestionBankPageProps) {
  const questionBank = usePersonalityStore((s) => s.questionBank)
  const fetchQuestionBank = usePersonalityStore((s) => s.fetchQuestionBank)
  const proposeOrCreateQuestion = usePersonalityStore((s) => s.proposeOrCreateQuestion)
  const approveQuestion = usePersonalityStore((s) => s.approveQuestion)
  const rejectQuestion = usePersonalityStore((s) => s.rejectQuestion)
  const traits = usePersonalityStore((s) => s.traits)
  const facets = usePersonalityStore((s) => s.facets)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const scales = usePersonalityStore((s) => s.scales)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)

  const [typeFilter, setTypeFilter] = useState<PersonalityQuestionType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<PersonalityApprovalStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PersonalityQuestion | 'new' | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    if (traits.length === 0) fetchCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const traitById = useMemo(() => new Map(traits.map((t) => [t.id, t])), [traits])
  const facetById = useMemo(() => new Map(facets.map((f) => [f.id, f])), [facets])
  const dimensionById = useMemo(() => new Map(dimensions.map((d) => [d.id, d])), [dimensions])

  const constructLabel = (q: PersonalityQuestion) => {
    const parts: string[] = []
    if (q.traitId) parts.push(traitById.get(q.traitId)?.labelFa ?? 'ویژگی نامشخص')
    if (q.facetId) parts.push(facetById.get(q.facetId)?.labelFa ?? 'زیرمؤلفه نامشخص')
    if (q.dimensionId) parts.push(dimensionById.get(q.dimensionId)?.labelFa ?? 'بعد رفتاری نامشخص')
    return parts.length > 0 ? parts.join(' / ') : '—'
  }

  const filtered = useMemo(() => {
    return questionBank.filter((q) => {
      if (typeFilter !== 'all' && q.questionType !== typeFilter) return false
      if (statusFilter !== 'all' && q.approvalStatus !== statusFilter) return false
      if (search.trim() && !q.questionText.includes(search.trim()) && !q.scenarioContext.includes(search.trim())) return false
      return true
    })
  }, [questionBank, typeFilter, statusFilter, search])

  const headerRight = (
    <button
      onClick={() => setEditing('new')}
      className="flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400"
    >
      <Plus size={14} /> {isModuleAdmin ? 'سؤال جدید' : 'پیشنهاد سؤال جدید'}
    </button>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
            <BookOpen size={16} />
          </div>
          <h1 className="text-sm font-extrabold">بانک سؤالات ارزیابی شخصیت</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onNavDashboard} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            داشبورد
          </button>
          {onNavSettings && (
            <button onClick={onNavSettings} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
              <Settings size={13} /> تنظیمات
            </button>
          )}
          {headerRight}
          <button onClick={onExitToHub} title="بازگشت به ماژول‌ها" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <Home size={14} />
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {!isModuleAdmin && (
          <p className="text-xs text-muted">
            بانک سؤالات فقط برای ادمین این ماژول قابل ویرایش است — اما می‌توانید سؤال پیشنهادی خود را ثبت کنید و پس از بررسی ادمین، وضعیت آن را همین‌جا ببینید.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در متن سؤال…" className="input w-56 pr-7" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PersonalityQuestionType | 'all')} className="input w-auto">
            <option value="all">همه انواع سؤال</option>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {PERSONALITY_QUESTION_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PersonalityApprovalStatus | 'all')} className="input w-auto">
            <option value="all">همه وضعیت‌ها</option>
            {APPROVAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PERSONALITY_APPROVAL_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">سؤالی با این فیلتر یافت نشد.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((q) => (
              <div key={q.id} className="glass-panel rounded-xl p-3.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-pink-500/12 px-2 py-0.5 text-[9.5px] font-bold text-pink-200">{PERSONALITY_QUESTION_TYPE_LABEL_FA[q.questionType]}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-secondary">{PERSONALITY_COMPLEXITY_LABEL_FA[q.complexity]}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">{constructLabel(q)}</span>
                  {q.jobRole && <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[9.5px] text-sky-300">{JOB_ROLE_LABEL_FA[q.jobRole]}</span>}
                  {q.reverseScored && <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[9.5px] text-amber-300">نمره‌گذاری معکوس</span>}
                  <ApprovalBadge status={q.approvalStatus} />
                  <span
                    className={`mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                      q.active ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/5 text-muted'
                    }`}
                  >
                    {q.active ? <CheckCircle2 size={10} /> : <XCircle size={10} />} {q.active ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>
                <p className="text-xs leading-6">{q.questionText}</p>
                {q.scenarioContext && <p className="mt-1 text-[10.5px] leading-6 text-muted">زمینه/سناریو: {q.scenarioContext}</p>}
                {q.options.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-secondary">
                    {q.options.map((opt) => (
                      <li key={opt.key}>— {opt.labelFa}</li>
                    ))}
                  </ul>
                )}

                {isModuleAdmin && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {q.approvalStatus === 'PENDING_REVIEW' && (
                      <>
                        <button
                          onClick={() => approveQuestion(q.id)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold text-emerald-200 hover:bg-emerald-500/20"
                        >
                          <CheckCircle2 size={11} /> تأیید
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(q.id)
                            setRejectReason('')
                          }}
                          className="flex items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10.5px] font-bold text-red-200 hover:bg-red-500/20"
                        >
                          <XCircle size={11} /> رد
                        </button>
                      </>
                    )}
                    <button onClick={() => setEditing(q)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5">
                      <Pencil size={11} /> ویرایش
                    </button>
                  </div>
                )}

                {rejectingId === q.id && (
                  <div className="mt-2.5 rounded-lg border border-red-400/25 bg-red-500/5 p-2.5">
                    <p className="mb-1.5 text-[10.5px] text-red-200">دلیل رد این سؤال (اختیاری):</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input flex-1" placeholder="مثلاً ابهام در متن سؤال…" />
                      <button
                        onClick={async () => {
                          await rejectQuestion(q.id, rejectReason.trim() || undefined)
                          setRejectingId(null)
                        }}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-[10.5px] font-bold text-white hover:bg-red-400"
                      >
                        ثبت رد سؤال
                      </button>
                      <button onClick={() => setRejectingId(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10.5px] text-secondary hover:bg-white/5">
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <QuestionEditorModal
          isModuleAdmin={isModuleAdmin}
          initial={editing === 'new' ? null : editing}
          traits={traits}
          facets={facets}
          dimensions={dimensions}
          scales={scales}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await proposeOrCreateQuestion(editing === 'new' ? input : { ...input, id: editing.id })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ApprovalBadge({ status }: { status: PersonalityApprovalStatus }) {
  if (status === 'APPROVED') return null
  const toneClass = status === 'REJECTED' ? 'bg-red-500/12 text-red-300' : 'bg-amber-500/12 text-amber-300'
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${toneClass}`}>
      <Clock size={10} /> {PERSONALITY_APPROVAL_STATUS_LABEL_FA[status]}
    </span>
  )
}

function OptionsEditor({ options, onChange }: { options: PersonalityQuestionOption[]; onChange: (next: PersonalityQuestionOption[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 p-2">
          <input
            value={opt.labelFa}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, labelFa: e.target.value } : o)))}
            placeholder="متن گزینه"
            className="input min-w-[10rem] flex-1"
          />
          <input
            value={opt.dimensionKey ?? ''}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, dimensionKey: e.target.value || undefined } : o)))}
            placeholder="کلید بعد رفتاری (اختیاری)"
            className="input w-40"
          />
          <input
            type="number"
            min={0}
            max={5}
            value={opt.score ?? ''}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, score: e.target.value ? Number(e.target.value) : undefined } : o)))}
            placeholder="امتیاز ۰-۵"
            className="num input w-20"
          />
          <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="text-muted hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { key: `opt_${options.length + 1}_${Date.now()}`, labelFa: '' }])}
        className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5"
      >
        <Plus size={11} /> افزودن گزینه
      </button>
    </div>
  )
}

function QuestionEditorModal({
  isModuleAdmin,
  initial,
  traits,
  facets,
  dimensions,
  scales,
  onClose,
  onSave,
}: {
  isModuleAdmin: boolean
  initial: PersonalityQuestion | null
  traits: { id: string; labelFa: string }[]
  facets: { id: string; traitId: string; labelFa: string }[]
  dimensions: { id: string; labelFa: string }[]
  scales: { id: string; labelFa: string }[]
  onClose: () => void
  onSave: (input: PersonalityQuestionInput) => Promise<void>
}) {
  const [form, setForm] = useState<PersonalityQuestionInput>(
    initial
      ? {
          frameworkId: initial.frameworkId,
          traitId: initial.traitId,
          facetId: initial.facetId,
          dimensionId: initial.dimensionId,
          questionType: initial.questionType,
          questionText: initial.questionText,
          scenarioContext: initial.scenarioContext,
          scaleId: initial.scaleId,
          options: initial.options,
          reverseScored: initial.reverseScored,
          jobRole: initial.jobRole,
          complexity: initial.complexity,
          weight: initial.weight,
        }
      : { ...EMPTY_INPUT },
  )
  const [saving, setSaving] = useState(false)

  const facetsForTrait = facets.filter((f) => f.traitId === form.traitId)
  const needsOptions = OPTION_BASED_TYPES.includes(form.questionType)
  const canSubmit = form.questionText.trim().length > 5 && (form.traitId || form.dimensionId)

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center py-6 sm:items-center sm:py-10">
        <div className="glass-panel w-full max-w-2xl rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">{isModuleAdmin ? (initial ? 'ویرایش سؤال' : 'سؤال جدید') : 'پیشنهاد سؤال جدید'}</p>
            <button onClick={onClose} className="text-muted hover:text-primary">
              <X size={16} />
            </button>
          </div>
          {!isModuleAdmin && !initial && (
            <p className="mb-3 text-[10.5px] text-muted">سؤال پیشنهادی شما پس از بررسی و تأیید ادمین ماژول، وارد بانک سؤالات فعال می‌شود.</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="نوع سؤال">
              <select value={form.questionType} onChange={(e) => setForm((f) => ({ ...f, questionType: e.target.value as PersonalityQuestionType, options: [] }))} className="input">
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PERSONALITY_QUESTION_TYPE_LABEL_FA[t]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="سطح پیچیدگی">
              <select value={form.complexity} onChange={(e) => setForm((f) => ({ ...f, complexity: e.target.value as PersonalityComplexity }))} className="input">
                {COMPLEXITIES.map((c) => (
                  <option key={c} value={c}>
                    {PERSONALITY_COMPLEXITY_LABEL_FA[c]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="وزن">
              <input type="number" min={0.1} step={0.1} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) || 1 }))} className="num input" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="ویژگی (Trait)">
              <select
                value={form.traitId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, traitId: e.target.value || null, facetId: null }))}
                className="input"
              >
                <option value="">— بدون ویژگی —</option>
                {traits.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.labelFa}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="زیرمؤلفه (Facet)">
              <select value={form.facetId ?? ''} onChange={(e) => setForm((f) => ({ ...f, facetId: e.target.value || null }))} className="input" disabled={!form.traitId}>
                <option value="">— بدون زیرمؤلفه —</option>
                {facetsForTrait.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.labelFa}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="بعد رفتاری (Behavioral Dimension)">
              <select value={form.dimensionId ?? ''} onChange={(e) => setForm((f) => ({ ...f, dimensionId: e.target.value || null }))} className="input">
                <option value="">— بدون بعد رفتاری —</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.labelFa}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <p className="mb-1 text-[10px] text-amber-300">حداقل یکی از ویژگی یا بعد رفتاری باید انتخاب شود.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="شغل مرتبط (اختیاری — خالی یعنی همه مشاغل)">
              <select value={form.jobRole ?? ''} onChange={(e) => setForm((f) => ({ ...f, jobRole: (e.target.value as JobRole) || null }))} className="input">
                <option value="">— همه مشاغل —</option>
                {JOB_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {JOB_ROLE_LABEL_FA[r]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="مقیاس پاسخ (برای LIKERT/FREQUENCY)">
              <select value={form.scaleId ?? ''} onChange={(e) => setForm((f) => ({ ...f, scaleId: e.target.value || null }))} className="input">
                <option value="">— بدون مقیاس —</option>
                {scales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labelFa}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="متن سؤال *">
            <textarea value={form.questionText} onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))} rows={3} className="input resize-none" />
          </FormField>

          <FormField label="زمینه/سناریو (برای SJT — اختیاری)">
            <textarea value={form.scenarioContext} onChange={(e) => setForm((f) => ({ ...f, scenarioContext: e.target.value }))} rows={2} className="input resize-none" />
          </FormField>

          <label className="mt-3 flex items-center gap-1.5 text-xs text-secondary">
            <input type="checkbox" checked={form.reverseScored} onChange={(e) => setForm((f) => ({ ...f, reverseScored: e.target.checked }))} className="h-3.5 w-3.5" />
            نمره‌گذاری این سؤال معکوس است
          </label>

          {needsOptions && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-muted">گزینه‌های انتخابی</p>
              <OptionsEditor options={form.options ?? []} onChange={(opts) => setForm((f) => ({ ...f, options: opts }))} />
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-white/10 pt-4">
            <button onClick={onClose} className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs">
              انصراف
            </button>
            <button onClick={submit} disabled={saving || !canSubmit} className="rounded-lg bg-pink-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-pink-400 disabled:opacity-50">
              {saving ? 'در حال ذخیره…' : isModuleAdmin ? 'ذخیره سؤال' : 'ثبت پیشنهاد'}
            </button>
          </div>
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
