import { useEffect, useMemo, useState } from 'react'
import { Award, CheckCircle2, ClipboardList, Plus, Trash2, TrendingUp, Trophy, User, Users } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { computeDomainScores, computeOverallPercent, maturityBand } from '../lib/competencyModel'
import { computeCategoryScores, usesLegacyPmRubric, questionsForAssessment, resolveOfficialAnswers } from '../lib/roleCompetencyModel'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { formatJalali } from '../../../lib/jalali'
import { ApprovalMedal } from '../components/ApprovalMedal'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { jobRoleLabel, sortedJobRoles } from '../lib/competencyData'
import type { CompetencyAssessment, JobRole } from '../types'

interface CompetencyDashboardPageProps {
  onOpen: (id: string) => void
  onNew: () => void
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
}

/** Landing page of the module — cross-role statistics (how many candidates, how many accepted, who
 * leads each specialty) plus the full candidate grid to open one. Replaces the old plain list page:
 * item 9 of the redesign asked for exactly this comparison view instead of a bare list. */
export function CompetencyDashboardPage({ onOpen, onNew, onExitToHub, nav }: CompetencyDashboardPageProps) {
  const assessments = useCompetencyStore((s) => s.assessments)
  const deleteAssessment = useCompetencyStore((s) => s.deleteAssessment)
  // The dashboard only ever needs a question's category/weight to bucket an already-recorded score
  // into a domain — never the evaluator-only reference-answer material — so it reads the safe
  // public projection (visible for every candidate regardless of panelist status) rather than the
  // now access-restricted full bank.
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const panelistScores = useCompetencyStore((s) => s.panelistScores)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<JobRole | 'all'>('all')

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
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
  const filteredAssessments = roleFilter === 'all' ? assessments : assessments.filter((a) => a.jobRole === roleFilter)

  const totalInterviews = assessments.length
  const acceptedCount = assessments.filter((a) => a.isApproved).length
  const completedCount = assessments.filter((a) => a.status === 'completed').length
  const acceptanceRate = totalInterviews > 0 ? Math.round((acceptedCount / totalInterviews) * 100) : null

  // Best-scoring candidate per role that actually has candidates — the cross-role comparison item 9
  // asked for, computed from the same scoring pipeline every other page uses (no separate ranking logic).
  const topPerRole = usedRoles
    .map((role) => {
      const inRole = scored.filter((s) => s.assessment.jobRole === role && s.overall != null)
      if (inRole.length === 0) return null
      const top = inRole.reduce((best, cur) => (cur.overall! > best.overall! ? cur : best))
      return { role, ...top }
    })
    .filter((x): x is { role: JobRole; assessment: CompetencyAssessment; overall: number | null } => x != null)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))

  const headerRight = (
    <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400 transition-colors">
      <Plus size={14} /> مصاحبه جدید
    </button>
  )

  return (
    <CompetencySidebarShell active="dashboard" nav={nav} title="داشبورد ارزیابی شایستگی" onExitToHub={onExitToHub} headerRight={headerRight}>
      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile icon={Users} label="کل مصاحبه‌ها" value={totalInterviews.toLocaleString('fa-IR')} color="#a855f7" />
        <StatTile icon={CheckCircle2} label="پذیرفته‌شده" value={acceptedCount.toLocaleString('fa-IR')} color="#34d399" />
        <StatTile icon={ClipboardList} label="ارزیابی تکمیل‌شده" value={completedCount.toLocaleString('fa-IR')} color="#38bdf8" />
        <StatTile icon={TrendingUp} label="نرخ پذیرش" value={acceptanceRate != null ? `٪${acceptanceRate.toLocaleString('fa-IR')}` : '—'} color="#fbbf24" />
      </div>

      {topPerRole.length > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
            <Trophy size={14} className="text-amber-300" /> نفر برتر هر شغل
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {topPerRole.map(({ role, assessment: a, overall }) => (
              <button
                key={role}
                onClick={() => onOpen(a.id)}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-right transition-colors hover:bg-white/5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                  <Award size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold">{a.candidateName}</p>
                  <p className="truncate text-[10.5px] text-muted">{jobRoleLabel(jobRoleConfigs, role)}</p>
                </div>
                <span className="num shrink-0 text-sm font-extrabold text-amber-300">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Candidate list */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">همه متقاضیان</p>
        </div>

        {usedRoles.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
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

        {filteredAssessments.length === 0 ? (
          <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <ClipboardList size={28} className="text-muted" />
            <p className="text-sm text-secondary">هنوز مصاحبه‌ای ثبت نشده است.</p>
            <button onClick={onNew} className="mt-2 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
              شروع اولین مصاحبه
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredAssessments.map((a) => (
              <CandidateCard
                key={a.id}
                assessment={a}
                overall={scored.find((s) => s.assessment.id === a.id)?.overall ?? null}
                rank={rankById.get(a.id)}
                onOpen={() => onOpen(a.id)}
                onDelete={() => setConfirmId(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmId(null)}>
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">حذف این ارزیابی؟</p>
            <p className="mt-1 text-xs text-muted">این عمل قابل بازگشت نیست.</p>
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

function StatTile({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: string }) {
  return (
    <div className="glass-panel rounded-2xl p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-secondary">
        <Icon size={13} style={{ color }} /> {label}
      </div>
      <p className="num text-2xl font-extrabold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function CandidateCard({
  assessment: a,
  overall,
  rank,
  onOpen,
  onDelete,
}: {
  assessment: CompetencyAssessment
  overall: number | null
  rank?: number
  onOpen: () => void
  onDelete: () => void
}) {
  const band = maturityBand(overall)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (a.photoUrl) getCompDocSignedUrl(a.photoUrl).then((u) => active && setPhotoUrl(u))
    return () => {
      active = false
    }
  }, [a.photoUrl])

  const tier = overall == null ? '#6b7280' : overall >= 75 ? '#34d399' : overall >= 60 ? '#fbbf24' : '#f87171'

  return (
    <div
      className="glass-panel group relative overflow-hidden rounded-xl border-r-[3px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-10px_rgba(168,85,247,0.4)]"
      style={{ borderRightColor: tier }}
    >
      <button onClick={onOpen} className="flex w-full flex-col items-center gap-1.5 p-2.5 pt-3 text-center">
        <div className="relative">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-purple-400/30 bg-purple-500/10 text-purple-300">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <User size={17} />}
          </div>
          {a.isApproved && (
            <span className="absolute -bottom-1.5 -left-1.5">
              <ApprovalMedal size="sm" />
            </span>
          )}
          {rank != null && (
            <span
              className="num absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0b0f16] bg-amber-400 text-[10px] font-extrabold text-amber-950 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
              title={`رتبه ${rank} در میان متقاضیان این شغل`}
            >
              {rank.toLocaleString('fa-IR')}
            </span>
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="truncate text-[12.5px] font-bold">{a.candidateName}</p>
          <p className="truncate text-[10px] text-muted">{jobRoleLabel(jobRoleConfigs, a.jobRole)}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <span className="num text-sm font-extrabold" style={{ color: tier }}>
            {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
          </span>
          <span className="text-[9.5px] text-muted">{band.label}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${a.status === 'completed' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}
          >
            {a.status === 'completed' ? 'تکمیل‌شده' : 'در حال انجام'}
          </span>
          <span className="text-[9px] text-muted">{formatJalali(a.interviewDate)}</span>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="حذف"
        className="absolute left-1 top-1 rounded-lg p-1 text-muted opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
