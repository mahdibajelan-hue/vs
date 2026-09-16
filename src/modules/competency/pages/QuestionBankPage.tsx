import { useState } from 'react'
import { BookOpen, Briefcase, Check, ChevronDown, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { COMPETENCY_DOMAINS, questionsForDomain, questionsForPosition } from '../lib/competencyModel'
import type { CompetencyDomainKey, CompetencyQuestion } from '../types'

/**
 * Admin-only screen for growing the question bank over time (item 3) and the job-position list
 * (item 4): add positions, add questions with their reference answer under each of the 8 shared
 * domains, and retire either without deleting them — comp_assessments.answers/comp_panelist_scores
 * still reference old questions by key, so "remove" here always means setActive(false), never a
 * hard delete.
 */
export function QuestionBankPage() {
  const jobPositions = useCompetencyStore((s) => s.jobPositions)
  const allQuestions = useCompetencyStore((s) => s.questions)
  const addJobPosition = useCompetencyStore((s) => s.addJobPosition)
  const setJobPositionActive = useCompetencyStore((s) => s.setJobPositionActive)

  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [newPositionTitle, setNewPositionTitle] = useState('')
  const [addingPosition, setAddingPosition] = useState(false)

  const selectedPosition = jobPositions.find((p) => p.id === selectedPositionId) ?? jobPositions[0] ?? null
  const positionQuestions = selectedPosition ? questionsForPosition(allQuestions, selectedPosition.id) : []

  const handleAddPosition = async () => {
    const trimmed = newPositionTitle.trim()
    if (!trimmed) return
    setAddingPosition(true)
    await addJobPosition(trimmed)
    setNewPositionTitle('')
    setAddingPosition(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <BookOpen size={15} className="text-purple-300" /> بانک سوالات و مشاغل قابل ارزیابی
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          مشاغل و سوالات جدید را در هر زمان اضافه کنید — سوالات هر شغل به‌طور مستقل زیر ۸ حوزهٔ شایستگی دسته‌بندی می‌شوند. غیرفعال کردن یک سوال یا شغل، آن
          را از فهرست مصاحبه‌های جدید کنار می‌گذارد، اما تاریخچهٔ امتیازهای قبلی حفظ می‌شود.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold">
          <Briefcase size={13} className="text-purple-300" /> مشاغل قابل ارزیابی
        </p>
        <div className="flex flex-wrap gap-1.5">
          {jobPositions.map((p) => (
            <div key={p.id} className="flex items-center overflow-hidden rounded-full border border-white/10">
              <button
                onClick={() => setSelectedPositionId(p.id)}
                className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  selectedPosition?.id === p.id ? 'bg-purple-500/25 text-purple-200' : 'text-secondary hover:bg-white/5'
                } ${!p.isActive ? 'opacity-40' : ''}`}
              >
                {p.title}
              </button>
              <button
                onClick={() => setJobPositionActive(p.id, !p.isActive)}
                title={p.isActive ? 'غیرفعال کردن این شغل' : 'فعال کردن این شغل'}
                className="border-r border-white/10 px-2 py-1.5 text-muted hover:bg-white/5"
              >
                {p.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newPositionTitle}
            onChange={(e) => setNewPositionTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPosition()}
            placeholder="عنوان شغل جدید…"
            className="input max-w-xs"
          />
          <button
            type="button"
            disabled={!newPositionTitle.trim() || addingPosition}
            onClick={handleAddPosition}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            <Plus size={13} /> افزودن شغل
          </button>
        </div>
      </div>

      {selectedPosition ? (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-secondary">
            سوالات شغل: <span className="text-primary">{selectedPosition.title}</span>{' '}
            <span className="num text-muted">({positionQuestions.filter((q) => q.isActive).length.toLocaleString('fa-IR')} سوال فعال)</span>
          </p>
          {COMPETENCY_DOMAINS.map((domain) => (
            <DomainQuestionGroup key={domain.key} jobPositionId={selectedPosition.id} domain={domain.key} title={domain.title} weight={domain.weight} />
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-6 text-center text-xs text-muted">ابتدا یک شغل اضافه کنید تا بتوانید سوالات آن را وارد کنید.</div>
      )}
    </div>
  )
}

function DomainQuestionGroup({
  jobPositionId,
  domain,
  title,
  weight,
}: {
  jobPositionId: string
  domain: CompetencyDomainKey
  title: string
  weight: number
}) {
  const allQuestions = useCompetencyStore((s) => s.questions)
  const addQuestion = useCompetencyStore((s) => s.addQuestion)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [referenceAnswer, setReferenceAnswer] = useState('')

  const questions = questionsForDomain(questionsForPosition(allQuestions, jobPositionId), domain)

  const handleAdd = async () => {
    if (!text.trim()) return
    setAdding(true)
    await addQuestion(jobPositionId, domain, text, referenceAnswer)
    setText('')
    setReferenceAnswer('')
    setAdding(false)
  }

  return (
    <div className="glass-panel rounded-2xl p-3.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-right">
        <span className="text-xs font-bold">
          {title} <span className="num text-muted">(٪{weight})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{questions.length.toLocaleString('fa-IR')} سوال</span>
          <ChevronDown size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {questions.map((q, i) => (
            <QuestionRow key={q.id} index={i} question={q} />
          ))}

          <div className="rounded-xl border border-dashed border-white/15 p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold text-purple-300">
              <Plus size={11} /> افزودن سوال جدید در این حوزه
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="متن سوال…"
              className="input resize-none text-[11px]"
            />
            <textarea
              value={referenceAnswer}
              onChange={(e) => setReferenceAnswer(e.target.value)}
              rows={2}
              placeholder="پاسخ مرجع (اختیاری، برای راهنمایی داوران و ادمین)…"
              className="input mt-1.5 resize-none text-[11px]"
            />
            <button
              type="button"
              disabled={!text.trim() || adding}
              onClick={handleAdd}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[10.5px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
            >
              <Plus size={12} /> افزودن سوال
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionRow({ index, question }: { index: number; question: CompetencyQuestion }) {
  const updateQuestion = useCompetencyStore((s) => s.updateQuestion)
  const setQuestionActive = useCompetencyStore((s) => s.setQuestionActive)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(question.text)
  const [referenceAnswer, setReferenceAnswer] = useState(question.referenceAnswer)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await updateQuestion(question.id, { text, referenceAnswer })
    setSaving(false)
    setEditing(false)
  }

  const handleCancel = () => {
    setText(question.text)
    setReferenceAnswer(question.referenceAnswer)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-purple-400/25 bg-purple-500/[0.05] p-2.5">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="input resize-none text-[11px]" />
        <textarea
          value={referenceAnswer}
          onChange={(e) => setReferenceAnswer(e.target.value)}
          rows={2}
          placeholder="پاسخ مرجع…"
          className="input mt-1.5 resize-none text-[11px]"
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            disabled={!text.trim() || saving}
            onClick={handleSave}
            className="flex items-center gap-1 rounded-lg bg-purple-500 px-2.5 py-1 text-[10.5px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            <Check size={11} /> ذخیره
          </button>
          <button type="button" onClick={handleCancel} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-secondary hover:bg-white/5">
            <X size={11} /> انصراف
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.02] p-2.5 ${!question.isActive ? 'opacity-45' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] leading-6">
          <span className="num ml-1 text-muted">{index + 1}.</span>
          {question.text}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setEditing(true)} title="ویرایش" className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-purple-300">
            <Pencil size={12} />
          </button>
          <button
            onClick={() => setQuestionActive(question.id, !question.isActive)}
            title={question.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
            className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-amber-300"
          >
            {question.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      </div>
      {question.referenceAnswer && <p className="mt-1.5 text-[10.5px] leading-5 text-emerald-300/80">پاسخ مرجع: {question.referenceAnswer}</p>}
    </div>
  )
}
