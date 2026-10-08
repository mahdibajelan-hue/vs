import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { COMPETENCY_DOMAINS, CAPSTONE_QUESTION, computeDomainScores, computeOverallPercent } from '../lib/competencyModel'
import { computeCategoryScores, usesLegacyPmRubric, questionsForAssessment } from '../lib/roleCompetencyModel'
import { jobRoleLabel, sortedJobRoles } from '../lib/competencyData'
import type { CompetencyAssessment, CompPanelGroup, CompProfileLite, JobRole } from '../types'

interface PanelStageProps {
  assessmentId: string
  /** Advances the wizard to the next stage — the exam design for the lead, the structured interview
   * for a panelist; omitted for a viewer with no further stage to go to. */
  onContinue?: () => void
}

/** Tiered color for a 0-100 score, matching ResultsStage's tierColor — kept as a local duplicate rather than a shared import to avoid coupling this stage to the results page. */
function tierColor(percent: number | null): string {
  if (percent == null) return '#6b7280'
  if (percent >= 80) return '#34d399'
  if (percent >= 60) return '#a78bfa'
  if (percent >= 40) return '#fbbf24'
  return '#f87171'
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Live, judge-controllable interview timer (any panelist — not just the lead — may start/pause/
 * reset it, see comp_set_interview_timer). Purely a stopwatch for how long the interview itself has
 * run; it never touches anyone's scores or auto-submits anything. When the assessment's designer set
 * a target duration and opted into auto-finish, the timer auto-pauses itself once that duration is
 * reached and flags it — it still never forces a submission. */
function InterviewTimer({ assessment }: { assessment: CompetencyAssessment }) {
  const setInterviewTimer = useCompetencyStore((s) => s.setInterviewTimer)
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!assessment.interviewTimerRunning) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [assessment.interviewTimerRunning])

  const liveElapsedSeconds =
    assessment.interviewTimerElapsedSeconds +
    (assessment.interviewTimerRunning && assessment.interviewTimerStartedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(assessment.interviewTimerStartedAt).getTime()) / 1000))
      : 0)

  const durationSeconds = assessment.durationMinutes != null ? assessment.durationMinutes * 60 : null
  const timedOut = durationSeconds != null && liveElapsedSeconds >= durationSeconds

  useEffect(() => {
    if (timedOut && assessment.autoFinishOnTimeout && assessment.interviewTimerRunning) {
      setInterviewTimer(assessment.id, 'pause')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedOut, assessment.autoFinishOnTimeout, assessment.interviewTimerRunning, assessment.id])

  return (
    <div className={`glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${timedOut ? 'border border-red-400/30' : ''}`}>
      <div className="flex items-center gap-2">
        <Clock size={16} className={timedOut ? 'text-red-300' : 'text-purple-300'} />
        <div>
          <p className="text-xs font-bold">تایمر مصاحبه</p>
          {durationSeconds != null && (
            <p className="text-[10.5px] text-muted">
              زمان تعیین‌شده: {assessment.durationMinutes?.toLocaleString('fa-IR')} دقیقه
              {assessment.autoFinishOnTimeout ? ' (توقف خودکار در پایان زمان)' : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`num text-xl font-extrabold ${timedOut ? 'text-red-300' : ''}`}>{formatDuration(liveElapsedSeconds)}</span>
        <div className="flex items-center gap-1.5">
          {assessment.interviewTimerRunning ? (
            <button
              onClick={() => setInterviewTimer(assessment.id, 'pause')}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold hover:bg-white/5"
            >
              <Pause size={13} /> توقف
            </button>
          ) : (
            <button
              onClick={() => setInterviewTimer(assessment.id, 'start')}
              className="flex items-center gap-1 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400"
            >
              <Play size={13} /> {liveElapsedSeconds > 0 ? 'ادامه' : 'شروع مصاحبه'}
            </button>
          )}
          <button
            onClick={() => setInterviewTimer(assessment.id, 'reset')}
            title="بازنشانی تایمر"
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-white/5"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      {timedOut && (
        <p className="w-full text-[11px] font-bold text-red-300">
          {assessment.autoFinishOnTimeout
            ? 'زمان مصاحبه به پایان رسید و تایمر به‌صورت خودکار متوقف شد.'
            : 'زمان تعیین‌شده برای این مصاحبه به پایان رسیده — تایمر همچنان در حال شمارش (اضافه‌کار) است.'}
        </p>
      )}
    </div>
  )
}

/** Multi-interviewer panel: assign panelists, let each score the candidate independently, and show the interview lead the panel's average per domain before the lead records their own final score in the "questions" stage. */
export function PanelStage({ assessmentId, onContinue }: PanelStageProps) {
  const profiles = useCompetencyStore((s) => s.profiles)
  const panelists = useCompetencyStore((s) => s.panelists).filter((p) => p.assessmentId === assessmentId)
  const panelistScores = useCompetencyStore((s) => s.panelistScores).filter((p) => p.assessmentId === assessmentId)
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const fetchPanelists = useCompetencyStore((s) => s.fetchPanelists)
  const fetchPanelistScores = useCompetencyStore((s) => s.fetchPanelistScores)
  const addPanelist = useCompetencyStore((s) => s.addPanelist)
  const removePanelist = useCompetencyStore((s) => s.removePanelist)
  const setPanelistLead = useCompetencyStore((s) => s.setPanelistLead)
  const setPanelSize = useCompetencyStore((s) => s.setPanelSize)
  const panelGroups = useCompetencyStore((s) => s.panelGroups)
  const fetchPanelGroups = useCompetencyStore((s) => s.fetchPanelGroups)
  const createPanelGroup = useCompetencyStore((s) => s.createPanelGroup)
  const deletePanelGroup = useCompetencyStore((s) => s.deletePanelGroup)
  const applyPanelGroup = useCompetencyStore((s) => s.applyPanelGroup)
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBank)

  const myId = useAuthStore((s) => s.profile?.id ?? null)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const myPanelistRow = panelists.find((p) => p.userId === myId)
  const isLead = assessment?.createdBy === myId || isAdmin || myPanelistRow?.isLead === true
  const isPM = assessment != null && usesLegacyPmRubric(assessment)

  const [pickUserId, setPickUserId] = useState('')
  const [pickAsLead, setPickAsLead] = useState(false)
  const [pickGroupId, setPickGroupId] = useState('')
  const [showGroupBuilder, setShowGroupBuilder] = useState(false)

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchPanelists(assessmentId)
    fetchPanelistScores(assessmentId)
    if (questionBank.length === 0) fetchQuestionBank()
    if (panelGroups.length === 0) fetchPanelGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  const amPanelist = panelists.some((p) => p.userId === myId)

  const availableProfiles = profiles.filter((p) => !panelists.some((pl) => pl.userId === p.id))
  const panelSize = assessment?.panelSize ?? 3
  const panelFull = panelists.length >= panelSize
  const suggestedGroups = panelGroups.filter((g) => g.jobRole == null || g.jobRole === assessment?.jobRole)

  // Still needed here (unlike the rest of each panelist's own scoring, which moved to the "questions"
  // stage — see PanelistScoreSheet) for the panel-average summary panel below.
  const roleQuestions = useMemo(() => (assessment && !isPM ? questionsForAssessment(assessment, questionBank) : []), [assessment, isPM, questionBank])

  const submittedScores = panelistScores.filter((p) => p.submittedAt)
  const averageDomainScores = useMemo(() => {
    if (submittedScores.length === 0) return null
    const domains = isPM ? COMPETENCY_DOMAINS : computeCategoryScores(roleQuestions, {}).map((d) => d.domain)
    return domains.map((domain) => {
      const values = submittedScores
        .map((s) => (isPM ? computeDomainScores(s.answers) : computeCategoryScores(roleQuestions, s.answers)).find((d) => d.domain.key === domain.key)?.percentScore)
        .filter((v): v is number => typeof v === 'number')
      return { domain, avg: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null, count: values.length }
    })
  }, [submittedScores, isPM, roleQuestions])

  const overallAverages = submittedScores
    .map((s) => computeOverallPercent(isPM ? computeDomainScores(s.answers) : computeCategoryScores(roleQuestions, s.answers)))
    .filter((v): v is number => typeof v === 'number')
  const overallAvg = overallAverages.length > 0 ? Math.round(overallAverages.reduce((a, b) => a + b, 0) / overallAverages.length) : null

  const capstoneAverages = submittedScores.map((s) => s.capstoneScore).filter((v): v is number => typeof v === 'number')
  const capstoneAvg = capstoneAverages.length > 0 ? Math.round((capstoneAverages.reduce((a, b) => a + b, 0) / capstoneAverages.length) * 10) / 10 : null

  return (
    <div className="space-y-4">
      {assessment && <InterviewTimer assessment={assessment} />}

      {isLead && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Users size={14} className="text-purple-300" /> پنل مصاحبه‌گران این مصاحبه
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10.5px] text-muted">
                تعداد داوران:
                <select
                  value={panelSize}
                  onChange={(e) => setPanelSize(assessmentId, Number(e.target.value))}
                  className="input num w-14 !px-1.5 !py-1 text-[11px]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString('fa-IR')}
                    </option>
                  ))}
                </select>
              </label>
              <span className={`num rounded-full px-2 py-0.5 text-[10px] font-bold ${panelFull ? 'bg-green-500/15 text-green-300' : 'bg-purple-500/15 text-purple-300'}`}>
                {panelists.length.toLocaleString('fa-IR')} از {panelSize.toLocaleString('fa-IR')} مصاحبه‌گر
              </span>
            </div>
          </div>

          <PanelGroupPicker
            groups={suggestedGroups}
            allGroups={panelGroups}
            pickGroupId={pickGroupId}
            setPickGroupId={setPickGroupId}
            onApply={() => {
              if (pickGroupId) applyPanelGroup(assessmentId, pickGroupId)
              setPickGroupId('')
            }}
            disabled={panelFull}
            profiles={profiles}
            myId={myId}
            isAdmin={isAdmin}
            onDeleteGroup={deletePanelGroup}
            showBuilder={showGroupBuilder}
            setShowBuilder={setShowGroupBuilder}
            jobRole={assessment?.jobRole ?? null}
            onCreateGroup={createPanelGroup}
          />

          {panelFull ? (
            <p className="mb-3 text-[11px] text-amber-300/90">
              پنل تکمیل شده است ({panelSize.toLocaleString('fa-IR')} داور). برای افزودن داور دیگر، یکی را حذف کنید یا تعداد داوران را افزایش دهید.
            </p>
          ) : (
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select value={pickUserId} onChange={(e) => setPickUserId(e.target.value)} className="input max-w-xs">
                  <option value="">انتخاب داور از فهرست کاربران…</option>
                  {availableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!pickUserId}
                  onClick={() => {
                    addPanelist(assessmentId, pickUserId, pickAsLead)
                    setPickUserId('')
                    setPickAsLead(false)
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
                >
                  <UserPlus size={13} /> افزودن داور
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-secondary">
                <input type="checkbox" checked={pickAsLead} onChange={(e) => setPickAsLead(e.target.checked)} className="h-3.5 w-3.5" />
                این فرد مسئول تیم مصاحبه‌کننده باشد (نظر نهایی و تایید صلاحیت را او ثبت می‌کند)
              </label>
            </div>
          )}
          {panelists.length === 0 ? (
            <p className="text-[11px] text-muted">هنوز داوری اضافه نشده است — امتیاز نهایی را خودتان در بخش «نظر نهایی» ثبت می‌کنید.</p>
          ) : (
            <div className="space-y-1.5">
              {panelists.map((p) => {
                const profile = profiles.find((pr) => pr.id === p.userId)
                const score = panelistScores.find((s) => s.panelistId === p.userId)
                const answered = score ? Object.values(score.answers).filter((a) => a.score != null).length : 0
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span>{profile?.fullName ?? p.userId}</span>
                      {p.isLead && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          <ShieldCheck size={11} /> مسئول تیم
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num text-muted">{answered.toLocaleString('fa-IR')} پاسخ</span>
                      {score?.submittedAt ? (
                        <span className="flex items-center gap-1 text-green-300">
                          <CheckCircle2 size={12} /> ثبت نهایی
                        </span>
                      ) : answered > 0 ? (
                        <span className="text-amber-300">در حال امتیازدهی</span>
                      ) : (
                        <span className="text-muted">در انتظار امتیازدهی</span>
                      )}
                      {!p.isLead && (
                        <button onClick={() => setPanelistLead(assessmentId, p.id)} title="تعیین به‌عنوان مسئول تیم" className="text-muted hover:text-amber-300">
                          <ShieldCheck size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // N-6: removing a judge also deletes their score sheet (archived in the audit
                          // log) so it no longer counts in the official average — confirm when there is one.
                          if (
                            score &&
                            (answered > 0 || score.submittedAt) &&
                            !window.confirm(
                              `با حذف «${profile?.fullName ?? 'این داور'}» از پنل، برگه‌ی امتیاز او${score.submittedAt ? ' (ثبت نهایی‌شده)' : ''} هم حذف می‌شود و دیگر در میانگین رسمی حساب نمی‌شود. یک نسخه از برگه در گزارش رویدادها بایگانی می‌شود. ادامه می‌دهید؟`,
                            )
                          )
                            return
                          removePanelist(p.id)
                        }}
                        className="text-muted hover:text-red-300"
                        title="حذف از پنل"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {averageDomainScores && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold">میانگین امتیاز داوران ({submittedScores.length} داور ثبت‌شده)</p>
            <span className="num text-sm font-extrabold text-purple-300">{overallAvg != null ? `٪${overallAvg.toLocaleString('fa-IR')}` : '—'}</span>
          </div>
          <div className="space-y-1.5">
            {averageDomainScores.map((d) => (
              <div key={d.domain.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-secondary">{d.domain.shortTitle}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${d.avg ?? 0}%`, background: tierColor(d.avg) }} />
                </div>
                <span className="num w-10 shrink-0 text-left text-[10px] text-muted">{d.avg != null ? `٪${d.avg}` : '—'}</span>
              </div>
            ))}
          </div>
          {capstoneAvg != null && <p className="mt-2 text-[11px] text-muted">میانگین امتیاز سناریوی پایانی داوران: {capstoneAvg.toLocaleString('fa-IR')}</p>}
        </div>
      )}

      {amPanelist ? (
        <div className="glass-panel rounded-2xl border-purple-400/25 p-4">
          <p className="text-xs font-bold">شما عضو پنل مصاحبه‌گران این مصاحبه هستید</p>
          <p className="mt-1 text-[11px] leading-6 text-secondary">
            برگهٔ امتیازدهی مستقل شما در بخش «ارزیابی فنی تخصصی» ثبت می‌شود، نه اینجا — این بخش فقط برای تشکیل پنل است.
          </p>
        </div>
      ) : (
        !isLead && (
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs font-bold">شما عضو پنل مصاحبه‌گران این مصاحبه نیستید</p>
            <p className="mt-1 text-[11px] leading-6 text-secondary">
              برای امتیازدهی، مسئول ارزیابی این مصاحبه باید شما را در بخش «پنل مصاحبه‌گران» به‌عنوان مصاحبه‌گر اضافه کند.
            </p>
          </div>
        )
      )}

      {isLead && !amPanelist && isPM && (
        <p className="text-[11px] text-muted">
          سؤال پایانی سناریو («{CAPSTONE_QUESTION.text.slice(0, 40)}…») را در پایان مصاحبه بپرسید — امتیاز نهایی خودتان را در بخش «سوالات» ثبت کنید.
        </p>
      )}

      {onContinue && (
        <div className="flex justify-end">
          <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
            ادامه <ArrowLeft size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Lets the lead apply a saved specialty interview group to this assessment's panel in one click,
 * and build new groups (e.g. "گروه مصاحبه برق و ابزار دقیق") from the pool of FARIN users — a
 * one-time setup that then works for every future candidate of that specialty. */
function PanelGroupPicker({
  groups,
  allGroups,
  pickGroupId,
  setPickGroupId,
  onApply,
  disabled,
  profiles,
  myId,
  isAdmin,
  onDeleteGroup,
  showBuilder,
  setShowBuilder,
  jobRole,
  onCreateGroup,
}: {
  groups: CompPanelGroup[]
  allGroups: CompPanelGroup[]
  pickGroupId: string
  setPickGroupId: (id: string) => void
  onApply: () => void
  disabled: boolean
  profiles: CompProfileLite[]
  myId: string | null
  isAdmin: boolean
  onDeleteGroup: (id: string) => void
  showBuilder: boolean
  setShowBuilder: (v: boolean) => void
  jobRole: JobRole | null
  onCreateGroup: (name: string, jobRole: JobRole | null, memberUserIds: string[], leadUserId: string | null) => void
}) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<JobRole | ''>(jobRole ?? '')
  const [newMembers, setNewMembers] = useState<string[]>([])
  const [newLead, setNewLead] = useState<string>('')

  const toggleMember = (id: string) =>
    setNewMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
          <Layers size={12} className="text-purple-300" /> گروه‌های داوری تخصصی
        </p>
        <select value={pickGroupId} onChange={(e) => setPickGroupId(e.target.value)} className="input max-w-[14rem] !py-1 text-[11px]">
          <option value="">
            {groups.length === 0 ? 'گروهی برای این شغل ثبت نشده' : 'انتخاب گروه داوری…'}
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} {g.jobRole ? `(${jobRoleLabel(jobRoleConfigs, g.jobRole)})` : '(همه مشاغل)'} — {g.members.length.toLocaleString('fa-IR')} نفر
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pickGroupId || disabled}
          onClick={onApply}
          className="rounded-lg bg-purple-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
        >
          اعمال گروه
        </button>
        <button
          type="button"
          onClick={() => setShowBuilder(!showBuilder)}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5"
        >
          <Plus size={11} /> گروه جدید <ChevronDown size={11} className={`transition-transform ${showBuilder ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showBuilder && (
        <div className="space-y-2 rounded-lg border border-purple-400/20 bg-purple-500/[0.04] p-2.5">
          <div className="flex flex-wrap gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام گروه (مثلاً برق و ابزار دقیق)" className="input flex-1 !py-1 text-[11px]" />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as JobRole | '')} className="input max-w-[12rem] !py-1 text-[11px]">
              <option value="">همه مشاغل</option>
              {sortedJobRoles(jobRoleConfigs).map((c) => (
                <option key={c.jobRole} value={c.jobRole}>
                  {c.labelFa}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            {profiles.length === 0 && <p className="text-[10.5px] text-muted">کاربری یافت نشد.</p>}
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={newMembers.includes(p.id)} onChange={() => toggleMember(p.id)} className="h-3 w-3" />
                <span className="flex-1">
                  {p.fullName} <span className="text-muted">({p.email})</span>
                </span>
                {newMembers.includes(p.id) && (
                  <label className="flex items-center gap-1 text-[10px] text-amber-300">
                    <input type="radio" name="new-group-lead" checked={newLead === p.id} onChange={() => setNewLead(p.id)} className="h-3 w-3" /> مسئول تیم
                  </label>
                )}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!newName.trim() || newMembers.length === 0}
            onClick={() => {
              onCreateGroup(newName.trim(), newRole || null, newMembers, newLead || null)
              setNewName('')
              setNewRole('')
              setNewMembers([])
              setNewLead('')
              setShowBuilder(false)
            }}
            className="rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            ذخیره گروه
          </button>
        </div>
      )}

      {allGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
          {allGroups.map((g) => (
            <span key={g.id} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-secondary">
              {g.name} {g.jobRole && <span className="text-muted">({jobRoleLabel(jobRoleConfigs, g.jobRole)})</span>}
              {(isAdmin || g.createdBy === myId) && (
                <button onClick={() => onDeleteGroup(g.id)} className="text-muted hover:text-red-300">
                  <Trash2 size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
