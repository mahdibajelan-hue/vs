import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, HelpCircle, ListTodo, Loader2, Plus, Repeat, Sparkles, Sprout, Trash2, Wand2 } from 'lucide-react'
import { useCompetencyStore, type DevelopmentActionInput } from '../store/useCompetencyStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { StatusBadge } from '../components/CompetencyGapAnalysis'
import { AssessmentChainNav } from '../components/AssessmentChainNav'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../lib/jalali'
import { computeEvaluationStages } from '../lib/evaluationStages'
import { computeCompletion } from '../lib/competencyModel'
import { computeRoleCompletion, questionsForAssessment, resolveOfficialAnswers, usesLegacyPmRubric } from '../lib/roleCompetencyModel'
import { formatLevel } from '../lib/competencyGap'
import {
  ACTION_SOURCE_LABEL_FA,
  ACTION_STATUS_META,
  ACTION_TYPE_LABEL_FA,
  PLAN_STATUS_META,
  PRIORITY_META,
  groupActionsByCompetency,
  planProgress,
  type ActionGroup,
} from '../lib/developmentPlan'
import type {
  CompCompetencyScore,
  CompDevelopmentAction,
  CompDevelopmentActionStatus,
  CompDevelopmentActionType,
  CompDevelopmentPlanStatus,
  CompDevelopmentPriority,
  CompProfileLite,
  CompetencyAssessment,
} from '../types'

interface DevelopmentPlanStageProps {
  assessment: CompetencyAssessment
  nav: Partial<Record<CompetencySection, () => void>>
  onExitToHub: () => void
  /** Lead of this assessment, ASSESSMENT_DESIGNER or module admin — mirrors
   * comp_can_manage_development_plan; everyone else sees the plan read-only. */
  canManage: boolean
  onOpenAssessment: (id: string, stage?: 'results' | 'idp' | 'profile') => void
}

const ACTION_TYPES = Object.keys(ACTION_TYPE_LABEL_FA) as CompDevelopmentActionType[]
const ACTION_STATUSES = Object.keys(ACTION_STATUS_META) as CompDevelopmentActionStatus[]
const PRIORITIES = Object.keys(PRIORITY_META) as CompDevelopmentPriority[]
const PLAN_STATUSES = Object.keys(PLAN_STATUS_META) as CompDevelopmentPlanStatus[]

/**
 * «برنامه توسعه فردی» (Phase 5) — the candidate's Individual Development Plan, seeded from the
 * Competency Engine's gaps (comp_seed_development_plan) and then owned/edited by the lead, HR or
 * line manager. A full-screen stage like CandidateAiAnalysisStage. INSUFFICIENT_EVIDENCE
 * competencies only ever get an «ارزیابی تکمیلی» (collect evidence) action — never training.
 */
export function DevelopmentPlanStage({ assessment, nav, onExitToHub, canManage, onOpenAssessment }: DevelopmentPlanStageProps) {
  const plan = useCompetencyStore((s) => s.developmentPlans.find((p) => p.assessmentId === assessment.id && p.status !== 'CANCELLED'))
  const actions = useCompetencyStore((s) => (plan ? s.developmentActionsByPlan[plan.id] : undefined))
  const fetchDevelopmentPlan = useCompetencyStore((s) => s.fetchDevelopmentPlan)
  const seedDevelopmentPlan = useCompetencyStore((s) => s.seedDevelopmentPlan)
  const updateDevelopmentPlan = useCompetencyStore((s) => s.updateDevelopmentPlan)
  const addDevelopmentAction = useCompetencyStore((s) => s.addDevelopmentAction)
  const createReassessment = useCompetencyStore((s) => s.createReassessment)
  const profile = useCompetencyStore((s) => s.competencyProfileByAssessment[assessment.id])
  const fetchCompetencyProfile = useCompetencyStore((s) => s.fetchCompetencyProfile)
  const computeCompetencyProfile = useCompetencyStore((s) => s.computeCompetencyProfile)
  const competencies = useCompetencyStore((s) => s.competencies)
  const fetchCompetencies = useCompetencyStore((s) => s.fetchCompetencies)
  const profiles = useCompetencyStore((s) => s.profiles)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const allAssessments = useCompetencyStore((s) => s.assessments)
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const [loaded, setLoaded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)
  const [reassessing, setReassessing] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      fetchDevelopmentPlan(assessment.id),
      profile ? Promise.resolve() : fetchCompetencyProfile(assessment.id),
      competencies.length === 0 ? fetchCompetencies() : Promise.resolve(),
      profiles.length === 0 ? fetchProfiles() : Promise.resolve(),
    ]).then(() => active && setLoaded(true))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  const scores = useMemo(() => profile?.scores ?? [], [profile])
  const labelFor = (competencyId: string) => competencies.find((c) => c.id === competencyId)?.labelFa ?? 'شایستگی'
  const groups = useMemo(() => groupActionsByCompetency(actions ?? [], scores, labelFor), [actions, scores, competencies]) // eslint-disable-line react-hooks/exhaustive-deps
  const progress = planProgress(actions ?? [])
  const nextAssessment = allAssessments.find((a) => a.previousAssessmentId === assessment.id)
  const editable = canManage && plan != null && plan.status !== 'COMPLETED' && plan.status !== 'CANCELLED'

  const isPM = usesLegacyPmRubric(assessment)
  const officialAnswers = resolveOfficialAnswers(assessment.answers, allPanelistScores.filter((s) => s.assessmentId === assessment.id))
  const completion = isPM ? computeCompletion(officialAnswers) : computeRoleCompletion(questionsForAssessment(assessment, questionBank), officialAnswers)
  const stageStrip = computeEvaluationStages(
    assessment,
    completion.percent,
    allPanelists.filter((p) => p.assessmentId === assessment.id).length,
    allPanelistScores.filter((s) => s.assessmentId === assessment.id && s.submittedAt).length,
  )

  const handleSeed = async () => {
    setSeeding(true)
    setSeedMessage(null)
    // The seed reads the STORED profile — refresh it first so suggestions reflect the latest scores.
    await computeCompetencyProfile(assessment.id)
    const result = await seedDevelopmentPlan(assessment.id)
    setSeeding(false)
    if (!result) return
    if (result.skipped === 'PLAN_COMPLETED') {
      setSeedMessage('این برنامه تکمیل‌شده است؛ پیشنهاد جدیدی به آن افزوده نمی‌شود.')
      return
    }
    const added = result.gapActions + result.evidenceActions + result.aiActions
    setSeedMessage(
      added === 0
        ? 'اقدام جدیدی لازم نبود — برای همه شکاف‌ها و شایستگی‌های فاقد شواهد از قبل اقدام ثبت شده است.'
        : `${added.toLocaleString('fa-IR')} اقدام افزوده شد: ${result.gapActions.toLocaleString('fa-IR')} اقدام توسعه برای شکاف‌ها، ${result.evidenceActions.toLocaleString('fa-IR')} ارزیابی تکمیلی و ${result.aiActions.toLocaleString('fa-IR')} پیشنهاد هوش مصنوعی.`,
    )
  }

  const handleReassess = async () => {
    setReassessing(true)
    const id = await createReassessment(assessment.id)
    setReassessing(false)
    if (id) onOpenAssessment(id, 'profile')
  }

  return (
    <CompetencySidebarShell
      active="idp"
      nav={nav}
      title={`برنامه توسعه فردی — ${assessment.candidateName}`}
      stageStrip={stageStrip}
      onExitToHub={onExitToHub}
      headerRight={<AssessmentChainNav assessment={assessment} onOpen={(id) => onOpenAssessment(id, 'idp')} />}
    >
      <div className="glass-panel space-y-3 rounded-2xl border border-teal-400/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Sprout size={16} className="text-teal-300" /> برنامه توسعه فردی (IDP)
            {plan && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: `${PLAN_STATUS_META[plan.status].color}1f`, color: PLAN_STATUS_META[plan.status].color }}
              >
                {PLAN_STATUS_META[plan.status].label}
              </span>
            )}
          </p>
          {canManage && (!plan || editable) && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-50"
            >
              {seeding ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {seeding ? 'در حال تولید…' : plan ? 'افزودن پیشنهادها از روی شکاف‌ها' : 'تولید برنامه از روی شکاف‌ها'}
            </button>
          )}
        </div>
        <p className="text-[10.5px] leading-6 text-muted">
          برای هر شایستگی دارای شکاف یک اقدام توسعه (سطح هدف = سطح الزامی شغل) پیشنهاد می‌شود؛ شایستگی‌های حیاتی در اولویت‌اند. برای شایستگی‌های «شواهد ناکافی» فقط
          «ارزیابی تکمیلی» پیشنهاد می‌شود — نبودِ شواهد به معنای ضعف نیست. تولید مجدد، اقدامات موجود و ویرایش‌های شما را تغییر نمی‌دهد.
        </p>
        {seedMessage && <p className="rounded-lg border border-teal-400/25 bg-teal-500/10 p-2 text-[10.5px] text-teal-100">{seedMessage}</p>}

        {!loaded ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 size={13} className="animate-spin" /> در حال بارگذاری…
          </p>
        ) : !plan ? (
          <p className="text-[11px] text-muted">
            هنوز برنامه توسعه‌ای برای این متقاضی ثبت نشده است.
            {!canManage && ' تنها مسئول ارزیابی، طراح آزمون یا ادمین ماژول می‌تواند آن را ایجاد کند.'}
          </p>
        ) : (
          <PlanHeader
            key={plan.id}
            planStatus={plan.status}
            ownerId={plan.ownerId}
            summary={plan.summary}
            targetReviewDate={plan.targetReviewDate}
            profiles={profiles}
            canManage={canManage}
            progress={progress}
            onChange={(patch) => updateDevelopmentPlan(plan.id, patch)}
          />
        )}
      </div>

      {plan && (
        <div className="space-y-3">
          {groups.length === 0 && <div className="glass-panel rounded-2xl p-5 text-center text-[11px] text-muted">این برنامه هنوز اقدامی ندارد.</div>}
          {groups.map((g) => (
            <ActionGroupCard key={g.competencyId ?? 'general'} group={g} editable={editable} profiles={profiles} />
          ))}

          {editable &&
            (adding ? (
              <NewActionForm
                scores={scores}
                labelFor={labelFor}
                onCancel={() => setAdding(false)}
                onSubmit={async (input) => {
                  await addDevelopmentAction(plan.id, input)
                  setAdding(false)
                }}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-teal-400/40 px-4 py-2 text-xs font-bold text-teal-200 hover:bg-teal-500/10"
              >
                <Plus size={13} /> افزودن اقدام دستی
              </button>
            ))}
        </div>
      )}

      <div className="glass-panel flex flex-col items-start gap-3 rounded-2xl border border-sky-400/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Repeat size={14} className="text-sky-300" /> ارزیابی مجدد
          </p>
          <p className="mt-1 text-[10.5px] leading-6 text-muted">
            پس از اجرای برنامه، یک ارزیابی تازه برای همین متقاضی و همین شغل با همان طرح آزمون ایجاد می‌شود (مشخصات و سوابق کپی می‌شوند؛ پاسخ‌ها و امتیازها از نو
            ثبت می‌شوند) و نتایج آن در صفحه نتیجه با این ارزیابی مقایسه می‌شود.
          </p>
        </div>
        {nextAssessment ? (
          <button
            onClick={() => onOpenAssessment(nextAssessment.id, 'results')}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/20"
          >
            مشاهده ارزیابی مجدد ({formatJalali(nextAssessment.interviewDate)}) <ArrowLeft size={13} />
          </button>
        ) : canManage ? (
          <button
            onClick={handleReassess}
            disabled={reassessing}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {reassessing ? <Loader2 size={13} className="animate-spin" /> : <Repeat size={13} />} {reassessing ? 'در حال ایجاد…' : 'ایجاد ارزیابی مجدد'}
          </button>
        ) : null}
      </div>
    </CompetencySidebarShell>
  )
}

function PlanHeader({
  planStatus,
  ownerId,
  summary,
  targetReviewDate,
  profiles,
  canManage,
  progress,
  onChange,
}: {
  planStatus: CompDevelopmentPlanStatus
  ownerId: string | null
  summary: string
  targetReviewDate: string | null
  profiles: CompProfileLite[]
  canManage: boolean
  progress: ReturnType<typeof planProgress>
  onChange: (patch: { status?: CompDevelopmentPlanStatus; ownerId?: string | null; summary?: string; targetReviewDate?: string | null }) => void
}) {
  const [draftSummary, setDraftSummary] = useState(summary)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="space-y-1 text-[10.5px] text-muted">
          <span>وضعیت برنامه</span>
          <select disabled={!canManage} value={planStatus} onChange={(e) => onChange({ status: e.target.value as CompDevelopmentPlanStatus })} className="input w-full text-[11px]">
            {PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PLAN_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[10.5px] text-muted">
          <span>مسئول پیگیری (مدیر مستقیم / منابع انسانی)</span>
          <OwnerSelect disabled={!canManage} value={ownerId} profiles={profiles} onChange={(v) => onChange({ ownerId: v })} />
        </label>
        <div className="space-y-1 text-[10.5px] text-muted">
          <span>تاریخ بازبینی هدف</span>
          {canManage ? (
            <JalaliDateInput value={targetReviewDate ?? ''} onChange={(v) => onChange({ targetReviewDate: v || null })} />
          ) : (
            <p className="text-[11px] text-secondary">{targetReviewDate ? formatJalali(targetReviewDate) : '—'}</p>
          )}
        </div>
      </div>
      <label className="block space-y-1 text-[10.5px] text-muted">
        <span>جمع‌بندی برنامه</span>
        <textarea
          disabled={!canManage}
          value={draftSummary}
          onChange={(e) => setDraftSummary(e.target.value)}
          onBlur={() => draftSummary !== summary && onChange({ summary: draftSummary })}
          rows={2}
          placeholder="اهداف کلی توسعه، منابع و انتظارات…"
          className="input w-full text-[11px] leading-6"
        />
      </label>
      <div>
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-[10.5px]">
          <span className="text-muted">
            پیشرفت: <span className="num font-bold text-teal-200">{progress.done.toLocaleString('fa-IR')}</span> از{' '}
            <span className="num">{progress.total.toLocaleString('fa-IR')}</span> اقدام انجام شده
            {progress.inProgress > 0 && <span> · {progress.inProgress.toLocaleString('fa-IR')} در حال انجام</span>}
            {progress.overdue > 0 && <span className="text-red-300"> · {progress.overdue.toLocaleString('fa-IR')} عقب‌افتاده</span>}
          </span>
          <span className="num font-bold text-teal-200">٪{progress.percent.toLocaleString('fa-IR')}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
    </div>
  )
}

function OwnerSelect({ value, profiles, onChange, disabled }: { value: string | null; profiles: CompProfileLite[]; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <select disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="input w-full text-[11px]">
      <option value="">— تعیین نشده —</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.fullName || p.email}
        </option>
      ))}
    </select>
  )
}

function GapBadge({ score }: { score: CompCompetencyScore | null }) {
  if (!score) return null
  if (score.status === 'INSUFFICIENT_EVIDENCE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400/40 px-2 py-0.5 text-[10px] text-slate-300">
        <HelpCircle size={11} /> سطح نامعلوم — الزامی {formatLevel(score.requiredLevel)}
      </span>
    )
  }
  const shortfall = score.gap != null && score.gap > 0
  return (
    <span
      className="num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: shortfall ? '#f871711c' : '#34d3991c', color: shortfall ? '#fca5a5' : '#6ee7b7' }}
    >
      {formatLevel(score.actualLevel)} ← {formatLevel(score.requiredLevel)}
      {shortfall && <span>· شکاف {formatLevel(score.gap)}</span>}
    </span>
  )
}

function ActionGroupCard({ group, editable, profiles }: { group: ActionGroup; editable: boolean; profiles: CompProfileLite[] }) {
  const done = group.actions.filter((a) => a.status === 'DONE').length
  const live = group.actions.filter((a) => a.status !== 'CANCELLED').length
  return (
    <div className={`glass-panel rounded-2xl border p-3.5 ${group.score?.status === 'INSUFFICIENT_EVIDENCE' ? 'border-dashed border-slate-400/30' : 'border-white/10'}`}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {group.competencyId ? <ListTodo size={13} className="text-teal-300" /> : <Sparkles size={13} className="text-indigo-300" />}
          {group.labelFa}
          {group.score?.isCritical && <span className="text-amber-300" title="شایستگی حیاتی">★</span>}
          {group.score && <StatusBadge status={group.score.status} />}
          <GapBadge score={group.score} />
        </p>
        <span className="num text-[10px] text-muted">
          {done.toLocaleString('fa-IR')} / {live.toLocaleString('fa-IR')} انجام‌شده
        </span>
      </div>
      <div className="space-y-2">
        {group.actions.map((a) => (
          <ActionRow key={a.id} action={a} editable={editable} profiles={profiles} />
        ))}
      </div>
    </div>
  )
}

function ActionRow({ action: a, editable, profiles }: { action: CompDevelopmentAction; editable: boolean; profiles: CompProfileLite[] }) {
  const updateDevelopmentAction = useCompetencyStore((s) => s.updateDevelopmentAction)
  const removeDevelopmentAction = useCompetencyStore((s) => s.removeDevelopmentAction)
  const [title, setTitle] = useState(a.title)
  const [description, setDescription] = useState(a.description)
  const [note, setNote] = useState(a.progressNote)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const statusMeta = ACTION_STATUS_META[a.status]
  const today = new Date().toISOString().slice(0, 10)
  const overdue = a.status !== 'DONE' && a.status !== 'CANCELLED' && a.dueDate != null && a.dueDate < today
  const update = (patch: Partial<DevelopmentActionInput>) => updateDevelopmentAction(a.id, patch)
  const levelInput = (value: number | null, onCommit: (v: number | null) => void) => (
    <input
      type="number"
      min={1}
      max={10}
      step={0.1}
      disabled={!editable}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value)
        if (v !== value) onCommit(v)
      }}
      className="input num w-16 text-center text-[11px]"
    />
  )

  return (
    <div
      className={`rounded-xl border p-2.5 ${a.status === 'CANCELLED' ? 'opacity-50' : ''}`}
      style={{ borderColor: `${statusMeta.color}33`, background: `linear-gradient(160deg, ${statusMeta.color}0d, transparent 70%)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editable ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== a.title && update({ title: title.trim() })}
            className="input min-w-0 flex-1 text-[11.5px] font-bold"
          />
        ) : (
          <p className={`flex-1 text-[11.5px] font-bold ${a.status === 'DONE' ? 'text-emerald-200' : ''}`}>{a.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={{ background: `${PRIORITY_META[a.priority].color}1c`, color: PRIORITY_META[a.priority].color }}>
            {PRIORITY_META[a.priority].label}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9.5px] text-muted">{ACTION_SOURCE_LABEL_FA[a.source]}</span>
          {editable &&
            (confirmDelete ? (
              <span className="flex items-center gap-1 text-[10px]">
                <button onClick={() => removeDevelopmentAction(a.id)} className="rounded bg-red-500 px-1.5 py-0.5 font-bold text-white">
                  حذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded border border-white/10 px-1.5 py-0.5">
                  انصراف
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="حذف اقدام" className="rounded-lg p-1 text-muted hover:bg-red-500/10 hover:text-red-300">
                <Trash2 size={12} />
              </button>
            ))}
        </div>
      </div>

      {editable ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== a.description && update({ description })}
          rows={1}
          placeholder="شرح اقدام…"
          className="input mt-1.5 w-full text-[10.5px] leading-5"
        />
      ) : (
        a.description && <p className="mt-1 text-[10.5px] leading-5 text-secondary">{a.description}</p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted sm:grid-cols-3 lg:grid-cols-6">
        <label className="space-y-0.5">
          <span>نوع اقدام</span>
          <select disabled={!editable} value={a.actionType} onChange={(e) => update({ actionType: e.target.value as CompDevelopmentActionType })} className="input w-full text-[11px]">
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTION_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5">
          <span>وضعیت</span>
          <select
            disabled={!editable}
            value={a.status}
            onChange={(e) => update({ status: e.target.value as CompDevelopmentActionStatus })}
            className="input w-full text-[11px] font-bold"
            style={{ color: statusMeta.color }}
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5">
          <span>اولویت</span>
          <select disabled={!editable} value={a.priority} onChange={(e) => update({ priority: e.target.value as CompDevelopmentPriority })} className="input w-full text-[11px]">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-0.5">
          <span className={overdue ? 'text-red-300' : ''}>مهلت{overdue ? ' (گذشته)' : ''}</span>
          {editable ? (
            <JalaliDateInput value={a.dueDate ?? ''} onChange={(v) => update({ dueDate: v || null })} />
          ) : (
            <p className="text-[11px] text-secondary">{a.dueDate ? formatJalali(a.dueDate) : '—'}</p>
          )}
        </div>
        <label className="space-y-0.5">
          <span>مسئول اقدام</span>
          <OwnerSelect disabled={!editable} value={a.ownerId} profiles={profiles} onChange={(v) => update({ ownerId: v })} />
        </label>
        {a.actionType !== 'EVIDENCE_COLLECTION' && (
          <div className="space-y-0.5">
            <span>سطح فعلی ← هدف</span>
            <div className="flex items-center gap-1">
              {levelInput(a.currentLevel, (v) => update({ currentLevel: v }))}
              <span>←</span>
              {levelInput(a.targetLevel, (v) => update({ targetLevel: v }))}
            </div>
          </div>
        )}
      </div>

      {editable ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== a.progressNote && update({ progressNote: note })}
          placeholder="یادداشت پیشرفت…"
          className="input mt-2 w-full text-[10.5px]"
        />
      ) : (
        a.progressNote && <p className="mt-1.5 text-[10px] text-muted">یادداشت پیشرفت: {a.progressNote}</p>
      )}
      {a.completedAt && <p className="mt-1 text-[9.5px] text-emerald-300/80">انجام‌شده در {formatJalali(a.completedAt)}</p>}
    </div>
  )
}

function NewActionForm({
  scores,
  labelFor,
  onSubmit,
  onCancel,
}: {
  scores: CompCompetencyScore[]
  labelFor: (id: string) => string
  onSubmit: (input: DevelopmentActionInput) => Promise<void>
  onCancel: () => void
}) {
  const [competencyId, setCompetencyId] = useState<string>('')
  const [actionType, setActionType] = useState<CompDevelopmentActionType>('TRAINING')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<CompDevelopmentPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const score = scores.find((s) => s.competencyId === competencyId) ?? null
  const insufficient = score?.status === 'INSUFFICIENT_EVIDENCE'

  return (
    <div className="glass-panel space-y-2.5 rounded-2xl border border-teal-400/30 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-bold">
        <Plus size={13} className="text-teal-300" /> اقدام دستی جدید
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-0.5 text-[10px] text-muted">
          <span>شایستگی</span>
          <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className="input w-full text-[11px]">
            <option value="">اقدام عمومی (بدون شایستگی مشخص)</option>
            {scores.map((s) => (
              <option key={s.competencyId} value={s.competencyId}>
                {labelFor(s.competencyId)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5 text-[10px] text-muted">
          <span>نوع اقدام</span>
          <select value={actionType} onChange={(e) => setActionType(e.target.value as CompDevelopmentActionType)} className="input w-full text-[11px]">
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTION_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5 text-[10px] text-muted">
          <span>اولویت</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as CompDevelopmentPriority)} className="input w-full text-[11px]">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-0.5 text-[10px] text-muted">
          <span>مهلت</span>
          <JalaliDateInput value={dueDate} onChange={setDueDate} />
        </div>
      </div>
      {insufficient && actionType !== 'EVIDENCE_COLLECTION' && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[10px] text-amber-200">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> برای این شایستگی شواهدی ثبت نشده — پیش از برنامه آموزشی، «ارزیابی تکمیلی» را در نظر بگیرید.
        </p>
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان اقدام (الزامی)" className="input w-full text-[11px]" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="شرح اقدام…" className="input w-full text-[11px]" />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs">
          انصراف
        </button>
        <button
          disabled={!title.trim() || saving}
          onClick={async () => {
            setSaving(true)
            await onSubmit({
              competencyId: competencyId || null,
              actionType,
              title: title.trim(),
              description,
              currentLevel: actionType === 'EVIDENCE_COLLECTION' ? null : score?.actualLevel ?? null,
              targetLevel: actionType === 'EVIDENCE_COLLECTION' ? null : score?.requiredLevel ?? null,
              priority,
              dueDate: dueDate || null,
              status: 'NOT_STARTED',
              ownerId: null,
              progressNote: '',
            })
            setSaving(false)
          }}
          className="rounded-lg bg-teal-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40"
        >
          افزودن
        </button>
      </div>
    </div>
  )
}
