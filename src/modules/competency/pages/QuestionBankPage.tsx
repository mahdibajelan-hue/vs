import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, CheckCircle2, Clock, ListChecks, Pencil, Plus, RotateCcw, Search, Settings, ShieldAlert, Trash2, X, XCircle } from 'lucide-react'
import { useCompetencyStore, type QuestionBankInput } from '../store/useCompetencyStore'
import { usePersonalityStore, type PersonalityQuestionInput } from '../../personality/store/usePersonalityStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import {
  JOB_ROLES,
  JOB_ROLE_LABEL_FA,
  QUESTION_APPROVAL_STATUS_LABEL_FA,
  QUESTION_DIFFICULTY_COLOR,
  QUESTION_DIFFICULTY_LABEL_FA,
  QUESTION_TYPE_LABEL_FA,
  type CompQuestionBankItem,
  type JobRole,
  type QuestionDifficulty,
  type QuestionType,
} from '../types'
import {
  PERSONALITY_APPROVAL_STATUS_LABEL_FA,
  PERSONALITY_COMPLEXITY_LABEL_FA,
  PERSONALITY_QUESTION_TYPE_LABEL_FA,
  type PersonalityApprovalStatus,
  type PersonalityComplexity,
  type PersonalityQuestion,
  type PersonalityQuestionOption,
  type PersonalityQuestionType,
} from '../../personality/types'

const QUESTION_TYPES: QuestionType[] = [
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
const DIFFICULTIES: QuestionDifficulty[] = ['L1', 'L2', 'L3', 'L4']

// Project Manager's questions now live in this same DB-backed bank too (seeded once from the
// fixed rubric's exact wording) — every role is editable here identically, none is special-cased.
const EDITABLE_ROLES = JOB_ROLES

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
  weight: 1,
}

const PERSONALITY_QUESTION_TYPES: PersonalityQuestionType[] = ['LIKERT', 'FORCED_CHOICE', 'SJT', 'FREQUENCY', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']
const PERSONALITY_COMPLEXITIES: PersonalityComplexity[] = ['L1', 'L2', 'L3', 'L4']
const PERSONALITY_APPROVAL_STATUSES: PersonalityApprovalStatus[] = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION']

// Only these types carry a candidate-facing choice list (options jsonb) — LIKERT/FREQUENCY score
// off the shared response scale instead (personality_response_scales), never off `options`.
const OPTION_BASED_TYPES: PersonalityQuestionType[] = ['FORCED_CHOICE', 'SJT', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED']

const PERSONALITY_EMPTY_INPUT: PersonalityQuestionInput = {
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

type QuestionBankTab = 'technical' | 'personality'

interface QuestionBankPageProps {
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
  isModuleAdmin: boolean
  isPersonalityModuleAdmin: boolean
  onNavPersonalitySettings?: () => void
  initialTab?: QuestionBankTab
}

/**
 * A single bank management screen covering both question sources the Competency module now
 * carries: the technical/competency bank (comp_question_bank — category/difficulty/jobRole) and
 * the Personality & Behavioral Assessment bank (personality_question_bank — questionType/
 * complexity/trait/facet/dimension), switched with a tab strip rather than two separate pages. The
 * two banks are genuinely different data models with their own store slices and approval flows —
 * this page shares only the sidebar shell/header and the tab toggle, never a unified schema.
 */
export function QuestionBankPage({ onExitToHub, nav, isModuleAdmin, isPersonalityModuleAdmin, onNavPersonalitySettings, initialTab }: QuestionBankPageProps) {
  const [tab, setTab] = useState<QuestionBankTab>(initialTab ?? 'technical')

  return (
    <CompetencySidebarShell active="questionBank" nav={nav} title="بانک سؤالات" onExitToHub={onExitToHub}>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('technical')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'technical' ? 'bg-purple-500/20 text-purple-200' : 'border border-white/10 text-secondary hover:bg-white/5'
          }`}
        >
          <ListChecks size={14} /> بانک سؤالات فنی
        </button>
        <button
          onClick={() => setTab('personality')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'personality' ? 'bg-pink-500/20 text-pink-200' : 'border border-white/10 text-secondary hover:bg-white/5'
          }`}
        >
          <BrainCircuit size={14} /> بانک سؤالات شخصیت و رفتاری
        </button>
      </div>

      {tab === 'technical' ? (
        <TechnicalQuestionBank isModuleAdmin={isModuleAdmin} />
      ) : (
        <PersonalityQuestionBank isModuleAdmin={isPersonalityModuleAdmin} onNavSettings={onNavPersonalitySettings} />
      )}
    </CompetencySidebarShell>
  )
}

/**
 * Bank management screen. Admins get the full picture (spec §21/22): filter by
 * role/category/difficulty/active, create/edit a question with its full reference-answer
 * structure, deactivate rather than delete (spec §13: soft delete only — a question already used
 * by a past assessment's frozen snapshot must stay resolvable forever), and approve/reject/request
 * revision on anyone's proposed questions. Everyone else gets the reduced Question Proposal
 * Workflow view (spec §12): propose a new question and track their own proposals' status — they
 * can never edit the bank directly (also enforced server-side by RLS).
 */
function TechnicalQuestionBank({ isModuleAdmin }: { isModuleAdmin: boolean }) {
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const loading = useCompetencyStore((s) => s.loadingQuestionBank)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBank)
  const createQuestion = useCompetencyStore((s) => s.createQuestion)
  const updateQuestion = useCompetencyStore((s) => s.updateQuestion)
  const setQuestionActive = useCompetencyStore((s) => s.setQuestionActive)
  const proposeQuestion = useCompetencyStore((s) => s.proposeQuestion)
  const approveQuestion = useCompetencyStore((s) => s.approveQuestion)
  const rejectQuestion = useCompetencyStore((s) => s.rejectQuestion)
  const requestQuestionRevision = useCompetencyStore((s) => s.requestQuestionRevision)

  const [roleFilter, setRoleFilter] = useState<JobRole | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<QuestionType | 'all'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CompQuestionBankItem | 'new' | null>(null)
  const [proposing, setProposing] = useState(false)

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

  const newQuestionButton = (
    <button
      onClick={() => (isModuleAdmin ? setEditing('new') : setProposing(true))}
      className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
    >
      <Plus size={14} /> {isModuleAdmin ? 'سؤال جدید' : 'پیشنهاد سؤال جدید'}
    </button>
  )

  if (!isModuleAdmin) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            بانک سؤالات فقط برای ادمین قابل ویرایش است — اما می‌توانید سؤال پیشنهادی خود را ثبت کنید و پس از بررسی ادمین، وضعیت آن را همین‌جا ببینید.
          </p>
          {newQuestionButton}
        </div>
        {questionBank.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز سؤالی پیشنهاد نداده‌اید.</div>
        ) : (
          <div className="space-y-2">
            {questionBank.map((q) => (
              <div key={q.id} className="glass-panel rounded-xl p-3.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-secondary">{JOB_ROLE_LABEL_FA[q.jobRole]}</span>
                  <span className="rounded-full bg-purple-500/12 px-2 py-0.5 text-[9.5px] font-bold text-purple-200">{QUESTION_TYPE_LABEL_FA[q.category]}</span>
                  <ApprovalBadge status={q.approvalStatus} />
                </div>
                <p className="text-xs leading-6">{q.questionText}</p>
                {q.proposalReason && <p className="mt-1.5 text-[10.5px] text-muted">دلیل پیشنهاد: {q.proposalReason}</p>}
              </div>
            ))}
          </div>
        )}
        {proposing && (
          <QuestionEditorModal
            mode="propose"
            initial={null}
            defaultJobRole={EMPTY_INPUT.jobRole}
            onClose={() => setProposing(false)}
            onSave={async (input, reason) => {
              await proposeQuestion(input, reason ?? '')
              setProposing(false)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">مدیریت سؤالات تخصصی هر شغل — پاسخ مرجع، معیار امتیازدهی، سطح دشواری و وضعیت فعال/غیرفعال</p>
        {newQuestionButton}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
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

      <div className="flex flex-wrap items-center gap-2">
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
                {q.version > 1 && (
                  <span className="num rounded-full bg-sky-500/12 px-2 py-0.5 text-[9.5px] font-bold text-sky-300">نسخه {q.version.toLocaleString('fa-IR')}</span>
                )}
                {q.supersededBy && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">نسخه جدیدتری از این سؤال ثبت شده</span>}
                {q.approvalStatus !== 'APPROVED' && <ApprovalBadge status={q.approvalStatus} />}
                <span
                  className={`mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                    q.active ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/5 text-muted'
                  }`}
                >
                  {q.active ? <CheckCircle2 size={10} /> : <XCircle size={10} />} {q.active ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
              <p className="text-xs leading-6">{q.questionText}</p>
              {q.proposalReason && <p className="mt-1 text-[10.5px] text-muted">دلیل پیشنهاد: {q.proposalReason}</p>}
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
                      onClick={() => requestQuestionRevision(q.id)}
                      className="flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold text-amber-200 hover:bg-amber-500/20"
                    >
                      <RotateCcw size={11} /> درخواست اصلاح
                    </button>
                    <button
                      onClick={() => rejectQuestion(q.id)}
                      className="flex items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10.5px] font-bold text-red-200 hover:bg-red-500/20"
                    >
                      <XCircle size={11} /> رد
                    </button>
                  </>
                )}
                <button onClick={() => setEditing(q)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5">
                  <Pencil size={11} /> ویرایش
                </button>
                <button
                  onClick={() => setQuestionActive(q.id, !q.active)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10.5px] ${
                    q.active ? 'border-white/10 text-muted hover:bg-red-500/10 hover:text-red-300' : 'border-white/10 text-secondary hover:bg-white/5'
                  }`}
                >
                  {q.active ? (
                    <>
                      <Trash2 size={11} /> غیرفعال‌کردن
                    </>
                  ) : (
                    'فعال‌کردن'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <QuestionEditorModal
          mode="admin"
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

function ApprovalBadge({ status }: { status: CompQuestionBankItem['approvalStatus'] }) {
  if (status === 'APPROVED') return null
  const toneClass = status === 'REJECTED' ? 'bg-red-500/12 text-red-300' : 'bg-amber-500/12 text-amber-300'
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${toneClass}`}>
      <Clock size={10} /> {QUESTION_APPROVAL_STATUS_LABEL_FA[status]}
    </span>
  )
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function QuestionEditorModal({
  mode,
  initial,
  defaultJobRole,
  onClose,
  onSave,
}: {
  mode: 'admin' | 'propose'
  initial: CompQuestionBankItem | null
  defaultJobRole: JobRole
  onClose: () => void
  onSave: (input: QuestionBankInput, reason?: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
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
          weight: initial.weight,
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

  const canSubmit = form.questionText.trim() && form.referenceAnswer.trim() && (mode === 'admin' || reason.trim())

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    await onSave(
      {
        ...form,
        keyPoints: linesToList(keyPointsText),
        excellentAnswerIndicators: linesToList(excellentText),
        commonMistakes: linesToList(mistakesText),
      },
      mode === 'propose' ? reason.trim() : undefined,
    )
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-sm font-bold">{mode === 'propose' ? 'پیشنهاد سؤال جدید' : initial ? 'ویرایش سؤال' : 'سؤال جدید'}</p>
        {initial && (
          <p className="mb-3 text-[10.5px] text-muted">
            ذخیره، یک نسخه جدید (نسخه {(initial.version + 1).toLocaleString('fa-IR')}) ثبت می‌کند و نسخه فعلی را به‌عنوان تاریخچه غیرفعال نگه می‌دارد — آزمون‌هایی که قبلاً از این سؤال
            استفاده کرده‌اند تحت تأثیر قرار نمی‌گیرند.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
          <FormField label="وزن نسبی در دسته‌بندی خود">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) || 1 }))}
              className="input"
            />
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

        {mode === 'propose' ? (
          <FormField label="دلیل پیشنهاد این سؤال *">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input resize-none" placeholder="چرا این سؤال باید به بانک اضافه شود؟" />
          </FormField>
        ) : (
          <label className="mt-2 flex items-center gap-1.5 text-xs text-secondary">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-3.5 w-3.5" />
            این سؤال فعال باشد (در انتخاب تصادفی سؤالات ارزیابی‌های جدید استفاده شود)
          </label>
        )}

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
          <button onClick={submit} disabled={saving || !canSubmit} className="rounded-lg bg-purple-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-400 disabled:opacity-50">
            {saving ? 'در حال ذخیره…' : mode === 'propose' ? 'ثبت پیشنهاد' : 'ذخیره سؤال'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Personality module's own bank tab — mirrors TechnicalQuestionBank's browse/filter, admin
 * approve/reject/edit, non-admin propose behavior exactly, adapted to PersonalityQuestion's own
 * shape: questionType/complexity instead of category/difficulty, and trait/facet/dimension instead
 * of a flat category string. Gated on the personality module's own admin flag
 * (isPersonalityModuleAdmin in CompetencyApp), separate from the technical bank's isModuleAdmin.
 */
function PersonalityQuestionBank({ isModuleAdmin, onNavSettings }: { isModuleAdmin: boolean; onNavSettings?: () => void }) {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {isModuleAdmin
            ? 'مدیریت سؤالات شخصیت و رفتاری — نوع سؤال، سطح پیچیدگی، ویژگی/زیرمؤلفه/بعد رفتاری و وضعیت تأیید'
            : 'بانک سؤالات فقط برای ادمین این ماژول قابل ویرایش است — اما می‌توانید سؤال پیشنهادی خود را ثبت کنید و پس از بررسی ادمین، وضعیت آن را همین‌جا ببینید.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isModuleAdmin && onNavSettings && (
            <button onClick={onNavSettings} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
              <Settings size={13} /> تنظیمات ماژول شخصیت
            </button>
          )}
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400"
          >
            <Plus size={14} /> {isModuleAdmin ? 'سؤال جدید' : 'پیشنهاد سؤال جدید'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در متن سؤال…" className="input w-56 pr-7" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PersonalityQuestionType | 'all')} className="input w-auto">
          <option value="all">همه انواع سؤال</option>
          {PERSONALITY_QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {PERSONALITY_QUESTION_TYPE_LABEL_FA[t]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PersonalityApprovalStatus | 'all')} className="input w-auto">
          <option value="all">همه وضعیت‌ها</option>
          {PERSONALITY_APPROVAL_STATUSES.map((s) => (
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
                <PersonalityApprovalBadge status={q.approvalStatus} />
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

      {editing && (
        <PersonalityQuestionEditorModal
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

function PersonalityApprovalBadge({ status }: { status: PersonalityApprovalStatus }) {
  if (status === 'APPROVED') return null
  const toneClass = status === 'REJECTED' ? 'bg-red-500/12 text-red-300' : 'bg-amber-500/12 text-amber-300'
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${toneClass}`}>
      <Clock size={10} /> {PERSONALITY_APPROVAL_STATUS_LABEL_FA[status]}
    </span>
  )
}

function PersonalityOptionsEditor({ options, onChange }: { options: PersonalityQuestionOption[]; onChange: (next: PersonalityQuestionOption[]) => void }) {
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

function PersonalityQuestionEditorModal({
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
      : { ...PERSONALITY_EMPTY_INPUT },
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
                {PERSONALITY_QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PERSONALITY_QUESTION_TYPE_LABEL_FA[t]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="سطح پیچیدگی">
              <select value={form.complexity} onChange={(e) => setForm((f) => ({ ...f, complexity: e.target.value as PersonalityComplexity }))} className="input">
                {PERSONALITY_COMPLEXITIES.map((c) => (
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
              <PersonalityOptionsEditor options={form.options ?? []} onChange={(opts) => setForm((f) => ({ ...f, options: opts }))} />
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
