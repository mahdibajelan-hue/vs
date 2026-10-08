import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Award, CheckCircle2, ChevronLeft, ClipboardCheck, ClipboardList, Hourglass, Plus, Repeat, Search, Sprout, Trash2, TrendingUp, User, Users, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { approvalLevel, computeDomainScores, computeOverallPercent, CONDITIONAL_COLOR, isConditionalScore, maturityBand } from '../lib/competencyModel'
import { computeCategoryScores, usesLegacyPmRubric, questionsForAssessment, resolveOfficialAnswers } from '../lib/roleCompetencyModel'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { ApprovalMedal } from '../components/ApprovalMedal'
import { OpenToWorkRing, WorkStatusChip } from '../components/OpenToWorkRing'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { RingChart } from '../components/DonutChart'
import { tone } from '../lib/tone'
import { jobRoleLabel, sortedJobRoles } from '../lib/competencyData'
import { computeNextStep, type NextStep } from '../lib/nextStep'
import { DemoBadge, DemoDataToggle } from '../components/DemoDataToggle'
import { supabase } from '../../../lib/supabaseClient'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { fetchMcqTestStatuses, type McqTestStatus } from '../lib/mcqData'
import type { CompetencyAssessment, JobRole } from '../types'

interface CompetencyDashboardPageProps {
  onOpen: (id: string) => void
  onNew: () => void
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
}

type StatusFilter = 'all' | 'mine' | 'inProgress' | 'completed' | 'approved' | 'conditional'
type WorkFilter = 'all' | 'open_to_work' | 'on_project'
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'همه وضعیت‌ها' },
  { id: 'mine', label: 'منتظر اقدام من' },
  { id: 'inProgress', label: 'در جریان' },
  { id: 'completed', label: 'تکمیل‌شده' },
  { id: 'approved', label: 'تأییدشده' },
  { id: 'conditional', label: 'تأیید مشروط' },
]
const WORK_FILTERS: { id: WorkFilter; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'open_to_work', label: 'Open to work' },
  { id: 'on_project', label: 'شاغل در پروژه' },
]

/** Row/accent color for an overall score: orange for the conditional 50–59 band, else the usual tiers. */
function rowTier(overall: number | null): string {
  if (overall == null) return '#6b7280'
  if (overall >= 75) return '#34d399'
  if (overall >= 60) return '#fbbf24'
  if (isConditionalScore(overall)) return CONDITIONAL_COLOR
  return '#f87171'
}

/** Lowercase, unify Arabic/Persian letter variants and Persian/Arabic digits so «علی» / «علي» and «۰۹۱۲» / «0912» match. */
function normalizeSearch(v: string): string {
  return v
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Landing page of the module — cross-role statistics (how many candidates, how many accepted, who
 * leads each specialty) plus the full candidate grid to open one. Replaces the old plain list page:
 * item 9 of the redesign asked for exactly this comparison view instead of a bare list. */
export function CompetencyDashboardPage({ onOpen, onNew, onExitToHub, nav }: CompetencyDashboardPageProps) {
  const allAssessments = useCompetencyStore((s) => s.assessments)
  // N-15: demo/test candidates stay out of every number on this page unless the viewer opts in.
  const showDemoData = useCompetencyStore((s) => s.showDemoData)
  const deleteAssessment = useCompetencyStore((s) => s.deleteAssessment)
  // The dashboard only ever needs a question's category/weight to bucket an already-recorded score
  // into a domain — never the evaluator-only reference-answer material — so it reads the safe
  // public projection (visible for every candidate regardless of panelist status) rather than the
  // now access-restricted full bank.
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const panelistScores = useCompetencyStore((s) => s.panelistScores)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const developmentPlans = useCompetencyStore((s) => s.developmentPlans)
  const fetchDevelopmentPlans = useCompetencyStore((s) => s.fetchDevelopmentPlans)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<JobRole | 'all'>('all')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  // N-12: the next step per candidate — from the loaded rows plus two light lists: every panel
  // assignment (assessment/user/lead only) and the personality tests' statuses.
  const myProfile = useAuthStore((s) => s.profile)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const assessmentDesigners = useCompetencyStore((s) => s.assessmentDesigners)
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const [panelRows, setPanelRows] = useState<{ assessment_id: string; user_id: string; is_lead: boolean }[]>([])
  const [personalityLoaded, setPersonalityLoaded] = useState(false)
  const [mcqStatuses, setMcqStatuses] = useState<Map<string, McqTestStatus>>(new Map())
  const [mcqLoaded, setMcqLoaded] = useState(false)

  const myId = myProfile?.id ?? null
  const isModuleAdmin = Boolean(myProfile?.isAdmin) || moduleAdmins.some((m) => m.userId === myId)
  const isDesigner = isModuleAdmin || assessmentDesigners.some((d) => d.userId === myId)
  // A plain judge (neither module admin nor assessment designer) only ever needs their own
  // work here — everyone else's candidates would just be noise they can't act on anyway. An
  // admin/designer still sees the full cross-role picture, unchanged.
  const myPanelAssessmentIds = useMemo(() => new Set(panelRows.filter((r) => r.user_id === myId).map((r) => r.assessment_id)), [panelRows, myId])
  const assessments = useMemo(() => {
    const demoFiltered = showDemoData ? allAssessments : allAssessments.filter((a) => !a.isDemo)
    if (isModuleAdmin || isDesigner) return demoFiltered
    return demoFiltered.filter((a) => a.createdBy === myId || myPanelAssessmentIds.has(a.id))
  }, [allAssessments, showDemoData, isModuleAdmin, isDesigner, myId, myPanelAssessmentIds])

  useEffect(() => {
    let active = true
    supabase
      .from('comp_panelists')
      .select('assessment_id, user_id, is_lead')
      .then(({ data }) => active && setPanelRows((data ?? []) as { assessment_id: string; user_id: string; is_lead: boolean }[]))
    fetchPersonalityAssessments().then(() => active && setPersonalityLoaded(true))
    fetchMcqTestStatuses().then((m) => {
      if (active) {
        setMcqStatuses(m)
        setMcqLoaded(true)
      }
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    // Phase 5 card badges (IDP status) — RLS-scoped to plans this viewer may read.
    fetchDevelopmentPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The overall score everywhere on this page is the official, panel-averaged one (see
  // resolveOfficialAnswers) — the same figure the candidate's own results page shows.
  const scored = useMemo(
    () =>
      assessments.map((a) => {
        const isPM = usesLegacyPmRubric(a)
        const officialAnswers = resolveOfficialAnswers(
          a.answers,
          panelistScores.filter((s) => s.assessmentId === a.id),
        )
        const domainScores = isPM ? computeDomainScores(officialAnswers) : computeCategoryScores(questionsForAssessment(a, questionBank), officialAnswers)
        return { assessment: a, overall: computeOverallPercent(domainScores) }
      }),
    [assessments, questionBank, panelistScores],
  )

  const usedRoles = useMemo(
    () => sortedJobRoles(jobRoleConfigs).map((c) => c.jobRole).filter((r) => assessments.some((a) => a.jobRole === r)),
    [assessments, jobRoleConfigs],
  )

  // Rank of each candidate among peers of the same job role — feeds the dashboard card's floating
  // rank badge. Ties share the same rank (dense-ish: count of strictly-better peers + 1).
  const rankById = useMemo(() => {
    const map = new Map<string, number>()
    usedRoles.forEach((role) => {
      const inRole = scored.filter((s) => s.assessment.jobRole === role && s.overall != null)
      inRole.forEach((s) => {
        const better = inRole.filter((o) => (o.overall as number) > (s.overall as number)).length
        map.set(s.assessment.id, better + 1)
      })
    })
    return map
  }, [scored, usedRoles])
  const nextStepById = useMemo(() => {
    const myPanel = new Map<string, { isLead: boolean }>()
    const panelCount = new Map<string, number>()
    for (const r of panelRows) {
      panelCount.set(r.assessment_id, (panelCount.get(r.assessment_id) ?? 0) + 1)
      if (r.user_id === myId) myPanel.set(r.assessment_id, { isLead: r.is_lead })
    }
    const map = new Map<string, NextStep>()
    for (const a of assessments) {
      map.set(
        a.id,
        computeNextStep(a, {
          myId,
          isModuleAdmin,
          isDesigner,
          myPanel,
          panelCount: panelCount.get(a.id) ?? 0,
          sheets: panelistScores.filter((s) => s.assessmentId === a.id),
          personalityStatus: personalityAssessments.find((p) => p.assessmentId === a.id)?.status,
          personalityLoaded,
          mcqStatus: mcqStatuses.get(a.id),
          mcqLoaded,
        }),
      )
    }
    return map
  }, [assessments, panelistScores, panelRows, personalityAssessments, personalityLoaded, mcqStatuses, mcqLoaded, myId, isModuleAdmin, isDesigner])
  const overallById = useMemo(() => new Map(scored.map((x) => [x.assessment.id, x.overall])), [scored])
  const projectNames = useMemo(
    () => [...new Set(assessments.filter((a) => a.workStatus === 'on_project' && a.workProjectName).map((a) => a.workProjectName))].sort((x, y) => x.localeCompare(y, 'fa')),
    [assessments],
  )
  const filteredAssessments = useMemo(() => {
    const q = normalizeSearch(query)
    return assessments.filter((a) => {
      if (roleFilter !== 'all' && a.jobRole !== roleFilter) return false
      if (workFilter !== 'all' && a.workStatus !== workFilter) return false
      if (workFilter === 'on_project' && projectFilter !== 'all' && a.workProjectName !== projectFilter) return false
      const level = approvalLevel(a.isApproved, overallById.get(a.id))
      if (statusFilter === 'approved' && level !== 'approved') return false
      if (statusFilter === 'conditional' && level !== 'conditional') return false
      if (statusFilter === 'completed' && a.status !== 'completed') return false
      if (statusFilter === 'inProgress' && a.status === 'completed') return false
      if (statusFilter === 'mine' && !nextStepById.get(a.id)?.mine) return false
      if (!q) return true
      const hay = normalizeSearch([a.candidateName, a.candidatePosition, a.currentEmployer, a.workProjectName, a.candidateNationalId, a.candidatePhone, a.candidateEmail].join(' '))
      return q.split(' ').every((t) => hay.includes(t))
    })
  }, [assessments, roleFilter, statusFilter, workFilter, projectFilter, query, nextStepById, overallById])
  const filtersActive = roleFilter !== 'all' || statusFilter !== 'all' || workFilter !== 'all' || query.trim() !== ''

  const totalInterviews = assessments.length
  const acceptedCount = assessments.filter((a) => a.isApproved).length
  const completedCount = assessments.filter((a) => a.status === 'completed').length
  const acceptanceRate = totalInterviews > 0 ? Math.round((acceptedCount / totalInterviews) * 100) : null

  const myActionItems = assessments.filter((a) => nextStepById.get(a.id)?.mine)

  // The self-service intake already encodes the workflow: the candidate finishes their profile and
  // uploads documents ("submitted"), then the evaluation officer checks them and presses the approve
  // button on the Documents stage ("reviewed", see markReviewed). Only the latter are truly ready to
  // interview — people with just a name and basic details (not_sent/pending) stay out of both lists
  // and remain visible in the full talent pool below.
  const awaitingDocsReview = assessments.filter((a) => a.status !== 'completed' && a.selfServiceStatus === 'submitted')
  const readyForInterview = assessments.filter((a) => a.status !== 'completed' && a.selfServiceStatus === 'reviewed')

  // Best-scoring candidate per role that actually has candidates — admin/designer view only (a plain
  // judge's own handful of candidates makes a leaderboard meaningless noise, per the product owner's
  // earlier request to drop it from that view entirely).
  const topPerRole = (isModuleAdmin || isDesigner
    ? usedRoles
        .map((role) => {
          const inRole = scored.filter((s) => s.assessment.jobRole === role && s.overall != null)
          if (inRole.length === 0) return null
          const top = inRole.reduce((best, cur) => (cur.overall! > best.overall! ? cur : best))
          return { role, ...top }
        })
        .filter((x): x is { role: JobRole; assessment: CompetencyAssessment; overall: number | null } => x != null)
        .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
    : [])

  const headerRight = (
    <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400 transition-colors">
      <Plus size={14} /> مصاحبه جدید
    </button>
  )

  return (
    <CompetencySidebarShell active="dashboard" nav={nav} title="داشبورد ارزیابی شایستگی" onExitToHub={onExitToHub} headerRight={headerRight}>
      {/* A single flex child so the shell's own `space-y-4` no longer stacks these sections — the
          tighter `gap-3` here is what keeps the whole page's vertical rhythm compact. */}
      <div className="fx fx-remap flex flex-col gap-3">
        {/* Aggregate stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon={Users} label="کل مصاحبه‌ها" value={totalInterviews.toLocaleString('fa-IR')} color="#a855f7" />
          <StatTile icon={CheckCircle2} label="پذیرفته‌شده" value={acceptedCount.toLocaleString('fa-IR')} color="#34d399" />
          <StatTile icon={ClipboardList} label="ارزیابی تکمیل‌شده" value={completedCount.toLocaleString('fa-IR')} color="#38bdf8" />
          <AcceptanceRateTile rate={acceptanceRate} />
        </div>

        {myActionItems.length > 0 && (
          <section className="fx-card fx-accent-bar p-3" style={tone('#fb7185')}>
            <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[11.5px] font-bold">
              <AlertCircle size={13} /> نیازمند اقدام من ({myActionItems.length.toLocaleString('fa-IR')})
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {myActionItems.map((a) => (
                <ActionCandidateRow
                  key={a.id}
                  assessment={a}
                  overall={scored.find((s) => s.assessment.id === a.id)?.overall ?? null}
                  rank={rankById.get(a.id)}
                  nextStep={nextStepById.get(a.id)}
                  hasPlan={developmentPlans.some((p) => p.assessmentId === a.id && p.status !== 'CANCELLED')}
                  reassessmentRelated={!!a.previousAssessmentId || assessments.some((x) => x.previousAssessmentId === a.id)}
                  onOpen={() => onOpen(a.id)}
                  onDelete={() => setConfirmId(a.id)}
                />
              ))}
            </div>
          </section>
        )}

        {(readyForInterview.length > 0 || awaitingDocsReview.length > 0) && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <QueueSection
              title="آماده مصاحبه"
              hint="پروفایل و مدارک تکمیل و توسط مسئول ارزیابی تأیید شده"
              color="#34d399"
              icon={ClipboardCheck}
              items={readyForInterview}
              empty="هنوز کسی تأیید مدارک نشده است."
              trailing={(a) => (a.reviewedAt ? `تأیید ${formatJalali(a.reviewedAt.slice(0, 10))}` : 'تأییدشده')}
              onOpen={onOpen}
            />
            <QueueSection
              title="منتظر تأیید مدارک"
              hint="پروفایل تکمیل و مدارک بارگذاری شده — منتظر بررسی مسئول ارزیابی"
              color="#fbbf24"
              icon={Hourglass}
              items={awaitingDocsReview}
              empty="موردی در انتظار بررسی نیست."
              trailing={() => 'در انتظار بررسی'}
              onOpen={onOpen}
            />
          </div>
        )}

        {topPerRole.length > 0 && (
          <section className="fx-card p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold">
              <Award size={13} className="text-amber-300" /> متقاضیان برتر هر شغل
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {topPerRole.map(({ role, assessment: a, overall }) => (
                <button key={role} onClick={() => onOpen(a.id)} className="fx-sub flex items-center gap-2 rounded-lg p-1.5 text-right transition-colors hover:bg-white/5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                    <Award size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold leading-tight">{a.candidateName}</p>
                    <p className="fx-muted truncate text-[9px] leading-tight">{jobRoleLabel(jobRoleConfigs, role)}</p>
                  </div>
                  <span className="num shrink-0 text-xs font-extrabold text-amber-300">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Talent pool — every candidate, kept deliberately lightweight (no photo, one line per
            candidate) so this reads as a scannable roster for succession planning rather than a wall of
            avatar cards; a candidate's full profile is a click away for whoever needs it. This is the
            one section allowed to keep scrolling — it can legitimately run to dozens of rows. */}
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{isModuleAdmin || isDesigner ? 'کل متقاضیان' : 'متقاضیان من'}</p>
              {(isModuleAdmin || isDesigner) && <p className="fx-muted text-[10.5px]">بانک استعداد — مرجعی برای جانشین‌پروری در هر شغل</p>}
            </div>
            <DemoDataToggle />
          </div>

          <div className="mb-2.5 flex flex-col gap-2">
            <div className="relative">
              <Search size={14} className="fx-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی متقاضی: نام، سمت، پروژه، کارفرما، کد ملی، تلفن…"
                aria-label="جستجوی متقاضی"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-9 text-xs outline-none focus:border-purple-400/60"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="پاک کردن جستجو" className="fx-muted absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white/10">
                  <X size={13} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر وضعیت">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={statusFilter === f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${statusFilter === f.id ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/5 text-secondary hover:bg-white/10'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="فیلتر وضعیت اشتغال">
              <span className="fx-muted text-[10.5px]">اشتغال:</span>
              {WORK_FILTERS.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={workFilter === f.id}
                  onClick={() => {
                    setWorkFilter(f.id)
                    if (f.id !== 'on_project') setProjectFilter('all')
                  }}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${workFilter === f.id ? (f.id === 'open_to_work' ? 'bg-emerald-500/25 text-emerald-300' : 'bg-sky-500/25 text-sky-300') : 'bg-white/5 text-secondary hover:bg-white/10'}`}
                >
                  {f.label}
                </button>
              ))}
              {workFilter === 'on_project' && projectNames.length > 0 && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  aria-label="فیلتر بر اساس نام پروژه"
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] outline-none focus:border-sky-400/60"
                >
                  <option value="all">همه پروژه‌ها</option>
                  {projectNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {usedRoles.length > 1 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              <button
                onClick={() => setRoleFilter('all')}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${roleFilter === 'all' ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-secondary hover:bg-white/10'}`}
              >
                همه مشاغل
              </button>
              {usedRoles.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${roleFilter === r ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-secondary hover:bg-white/10'}`}
                >
                  {jobRoleLabel(jobRoleConfigs, r)}
                </button>
              ))}
            </div>
          )}

          {filtersActive && assessments.length > 0 && (
            <p className="fx-muted mb-2 flex items-center gap-2 text-[10.5px]">
              {filteredAssessments.length.toLocaleString('fa-IR')} از {assessments.length.toLocaleString('fa-IR')} متقاضی
              <button
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                  setRoleFilter('all')
                  setWorkFilter('all')
                  setProjectFilter('all')
                }}
                className="text-purple-300 underline-offset-2 hover:underline"
              >
                پاک کردن فیلترها
              </button>
            </p>
          )}

          {assessments.length > 0 && filteredAssessments.length === 0 ? (
            <div className="fx-card flex flex-col items-center gap-2 p-8 text-center">
              <Search size={24} className="fx-muted" />
              <p className="text-sm text-secondary">متقاضی با این مشخصات پیدا نشد.</p>
              <p className="fx-muted text-[10.5px]">املای نام را بررسی کنید یا فیلترها را پاک کنید.</p>
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="fx-card flex flex-col items-center gap-2 p-10 text-center">
              <ClipboardList size={28} className="fx-muted" />
              <p className="text-sm text-secondary">هنوز مصاحبه‌ای ثبت نشده است.</p>
              <button onClick={onNew} className="mt-2 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
                شروع اولین مصاحبه
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {filteredAssessments.map((a) => (
                <TalentPoolRow
                  key={a.id}
                  assessment={a}
                  overall={scored.find((s) => s.assessment.id === a.id)?.overall ?? null}
                  nextStep={nextStepById.get(a.id)}
                  onOpen={() => onOpen(a.id)}
                  onDelete={() => setConfirmId(a.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmId(null)}>
          <div className="fx-card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">حذف این ارزیابی؟</p>
            <p className="fx-muted mt-1 text-xs">این عمل قابل بازگشت نیست.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs">
                انصراف
              </button>
              <button
                onClick={() => {
                  deleteAssessment(confirmId)
                  setConfirmId(null)
                }}
                className="rounded-lg bg-red-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-400"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </CompetencySidebarShell>
  )
}

/** A short, scrollable list of candidates sharing one intake state ("آماده مصاحبه" / "منتظر تأیید
 * مدارک"). Capped height so two of these side by side never push the page into a long scroll — a
 * long queue scrolls inside its own card instead. */
function QueueSection({
  title,
  hint,
  color,
  icon: Icon,
  items,
  empty,
  trailing,
  onOpen,
}: {
  title: string
  hint: string
  color: string
  icon: typeof Users
  items: CompetencyAssessment[]
  empty: string
  trailing: (a: CompetencyAssessment) => string
  onOpen: (id: string) => void
}) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  return (
    <section className="fx-card fx-accent-bar p-3" style={tone(color)}>
      <p className="fx-tone-text flex items-center gap-1.5 text-[11.5px] font-bold">
        <Icon size={13} /> {title} ({items.length.toLocaleString('fa-IR')})
      </p>
      <p className="fx-muted mb-2 text-[10px]">{hint}</p>
      {items.length === 0 ? (
        <p className="fx-muted py-2 text-center text-[10.5px]">{empty}</p>
      ) : (
        <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto pl-0.5">
          {items.map((a) => (
            <button key={a.id} onClick={() => onOpen(a.id)} className="fx-sub flex items-center gap-2 rounded-lg p-1.5 pr-2.5 text-right transition-colors hover:bg-white/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[11.5px] font-bold leading-tight">{a.candidateName}</p>
                  {a.isDemo && <DemoBadge />}
                </div>
                <p className="fx-muted truncate text-[9.5px] leading-tight">{jobRoleLabel(jobRoleConfigs, a.jobRole)}</p>
              </div>
              <span className="fx-tone-bg fx-tone-text shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold">{trailing(a)}</span>
              <ChevronLeft size={13} className="fx-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function StatTile({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: string }) {
  return (
    <div className="fx-card p-2.5">
      <div className="fx-text-2 mb-1 flex items-center gap-1.5 text-[10.5px]">
        <Icon size={12} style={{ color }} /> {label}
      </div>
      <p className="num text-xl font-extrabold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

/** The acceptance-rate stat tile earns a small ring (rather than bare text) because, unlike the
 * other three tiles, it is itself already a percentage of a whole — the ring makes that relationship
 * visible at a glance instead of needing to be inferred from a lone number. */
function AcceptanceRateTile({ rate }: { rate: number | null }) {
  return (
    <div className="fx-card flex items-center gap-2 p-2.5">
      <RingChart value={rate} color="#fbbf24" size={38} strokeWidth={5} label="نرخ پذیرش">
        <span className="num text-[9.5px] font-extrabold" style={{ color: '#fbbf24' }}>
          {rate != null ? `٪${rate.toLocaleString('fa-IR')}` : '—'}
        </span>
      </RingChart>
      <div className="fx-text-2 flex min-w-0 flex-1 items-center gap-1 text-[10.5px]">
        <TrendingUp size={12} className="shrink-0" style={{ color: '#fbbf24' }} /> نرخ پذیرش
      </div>
    </div>
  )
}

/** One scannable line per candidate for the "کل متقاضیان" talent pool — deliberately no photo (this
 * list can run to dozens of rows; a wall of avatars was the exact clutter the product owner asked to
 * remove) and no rank badge (that comparison lives in the leaderboard card above). The whole row is
 * the "link" to open the candidate. */
function TalentPoolRow({
  assessment: a,
  overall,
  nextStep,
  onOpen,
  onDelete,
}: {
  assessment: CompetencyAssessment
  overall: number | null
  nextStep?: NextStep
  onOpen: () => void
  onDelete: () => void
}) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const band = maturityBand(overall)
  const tier = rowTier(overall)

  return (
    <div className="fx-sub group flex items-center gap-2.5 rounded-lg border-r-[3px] p-1.5 pr-3 transition-colors hover:bg-white/5" style={{ borderRightColor: tier }}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5 text-right">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12.5px] font-bold">{a.candidateName}</p>
            {a.isApproved && <ApprovalMedal size="sm" level={approvalLevel(a.isApproved, overall)} />}
            {a.isDemo && <DemoBadge />}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="fx-muted truncate text-[10.5px]">{jobRoleLabel(jobRoleConfigs, a.jobRole)}</p>
            <WorkStatusChip status={a.workStatus} projectName={a.workProjectName} />
          </div>
        </div>
        <span
          className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold sm:inline-block ${
            nextStep?.mine
              ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
              : nextStep?.tone === 'done' || (!nextStep && a.status === 'completed')
                ? 'bg-green-500/15 text-green-300'
                : nextStep?.tone === 'waiting'
                  ? 'bg-slate-500/20 text-slate-300'
                  : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {nextStep?.label ?? (a.status === 'completed' ? 'تکمیل‌شده' : 'در حال انجام')}
        </span>
        <div className="flex shrink-0 items-baseline gap-1">
          <span className="num text-sm font-extrabold" style={{ color: tier }}>
            {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
          </span>
          <span className="fx-muted hidden text-[9.5px] sm:inline">{band.label}</span>
        </div>
        <ChevronLeft size={14} className="fx-muted shrink-0" />
      </button>
      <button
        onClick={onDelete}
        title="حذف"
        className="shrink-0 rounded-lg p-1.5 text-muted opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

/** The compact "needs my action" row: one line per candidate (avatar, name/role, a single next-step
 * chip, the score) instead of the previous vertical avatar card — the same information density as
 * `TalentPoolRow` but keeping the small avatar and a rank badge, since this list is usually short and
 * the person opening it is about to act on exactly one of these candidates. Plan/reassessment status,
 * previously two extra stacked badge rows, collapses to at most two tiny icons next to the name; the
 * interview date (not shown in the talent-pool row either) is dropped here on purpose. */
function ActionCandidateRow({
  assessment: a,
  overall,
  rank,
  nextStep,
  hasPlan,
  reassessmentRelated,
  onOpen,
  onDelete,
}: {
  assessment: CompetencyAssessment
  overall: number | null
  rank?: number
  nextStep?: NextStep
  hasPlan: boolean
  reassessmentRelated: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (a.photoUrl) getCompDocSignedUrl(a.photoUrl).then((u) => active && setPhotoUrl(u))
    return () => {
      active = false
    }
  }, [a.photoUrl])

  const tier = rowTier(overall)

  return (
    <div className="fx-sub group flex items-center gap-2 rounded-lg border-r-[3px] p-1.5 pr-2.5 transition-colors hover:bg-white/5" style={{ borderRightColor: tier }}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-right">
        <div className="relative shrink-0">
          <div className="h-8 w-8">
            <OpenToWorkRing active={a.workStatus === 'open_to_work'} size={32}>
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-purple-400/30 bg-purple-500/10 text-purple-300">
                {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <User size={12} />}
              </div>
            </OpenToWorkRing>
          </div>
          {a.isApproved && (
            <span className="absolute -bottom-1 -left-1 scale-75">
              <ApprovalMedal size="sm" level={approvalLevel(a.isApproved, overall)} />
            </span>
          )}
          {rank != null && (
            <span
              className="num absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[7.5px] font-extrabold text-amber-950"
              title={`رتبه ${rank} در میان متقاضیان این شغل`}
            >
              {rank.toLocaleString('fa-IR')}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-[11.5px] font-bold leading-tight">{a.candidateName}</p>
            {hasPlan && <Sprout size={9} className="shrink-0 text-emerald-300" aria-label="برنامه توسعه فردی فعال" />}
            {reassessmentRelated && <Repeat size={9} className="shrink-0 text-sky-300" aria-label="ارزیابی مجدد" />}
            {a.isDemo && <DemoBadge />}
          </div>
          <p className="fx-muted truncate text-[9.5px] leading-tight">{jobRoleLabel(jobRoleConfigs, a.jobRole)}</p>
        </div>
        <span
          className="shrink-0 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-200 ring-1 ring-rose-400/40"
          title="این مرحله منتظر اقدام شماست"
        >
          {nextStep?.label ?? 'اقدام'}
        </span>
        <span className="num shrink-0 text-xs font-extrabold" style={{ color: tier }}>
          {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
        </span>
      </button>
      <button
        onClick={onDelete}
        title="حذف"
        className="shrink-0 rounded-md p-1 text-muted opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
