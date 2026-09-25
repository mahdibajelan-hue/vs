import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarClock, Loader2, Repeat, Sprout, User } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { formatJalali } from '../../../lib/jalali'
import { ACTION_STATUS_META, ACTION_TYPE_LABEL_FA, PLAN_STATUS_META, PRIORITY_META, planProgress } from '../lib/developmentPlan'
import type { CompetencyAssessment } from '../types'

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

/**
 * Compact «برنامه توسعه فردی» card for the results page (Phase 5): plan status, owner, review date,
 * done/total progress and the most urgent open actions — the full editor lives in the IDP stage.
 */
export function DevelopmentPlanSummary({
  assessment,
  canManage,
  onGoToIdp,
  onOpenAssessment,
}: {
  assessment: CompetencyAssessment
  canManage: boolean
  onGoToIdp?: () => void
  onOpenAssessment: (id: string, stage?: 'results' | 'idp' | 'profile') => void
}) {
  const plan = useCompetencyStore((s) => s.developmentPlans.find((p) => p.assessmentId === assessment.id && p.status !== 'CANCELLED'))
  const actions = useCompetencyStore((s) => (plan ? s.developmentActionsByPlan[plan.id] : undefined))
  const profiles = useCompetencyStore((s) => s.profiles)
  const competencies = useCompetencyStore((s) => s.competencies)
  const fetchDevelopmentPlan = useCompetencyStore((s) => s.fetchDevelopmentPlan)
  const createReassessment = useCompetencyStore((s) => s.createReassessment)
  const next = useCompetencyStore((s) => s.assessments.find((a) => a.previousAssessmentId === assessment.id))
  const [loading, setLoading] = useState(true)
  const [reassessing, setReassessing] = useState(false)

  useEffect(() => {
    let active = true
    fetchDevelopmentPlan(assessment.id).then(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [assessment.id, fetchDevelopmentPlan])

  const progress = planProgress(actions ?? [])
  const openActions = (actions ?? [])
    .filter((a) => a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS')
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 4)
  const owner = plan?.ownerId ? profiles.find((p) => p.id === plan.ownerId) : undefined

  const reassessButton = next ? (
    <button
      onClick={() => onOpenAssessment(next.id, 'results')}
      className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/20"
    >
      <Repeat size={12} /> ارزیابی مجدد ({formatJalali(next.interviewDate)})
    </button>
  ) : canManage ? (
    <button
      disabled={reassessing}
      onClick={async () => {
        setReassessing(true)
        const id = await createReassessment(assessment.id)
        setReassessing(false)
        if (id) onOpenAssessment(id, 'profile')
      }}
      className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
    >
      {reassessing ? <Loader2 size={12} className="animate-spin" /> : <Repeat size={12} />} ارزیابی مجدد
    </button>
  ) : null

  return (
    <div className="glass-panel space-y-3 rounded-2xl border border-teal-400/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Sprout size={15} className="text-teal-300" /> برنامه توسعه فردی
          {plan && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${PLAN_STATUS_META[plan.status].color}1f`, color: PLAN_STATUS_META[plan.status].color }}>
              {PLAN_STATUS_META[plan.status].label}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {reassessButton}
          {onGoToIdp && (
            <button
              onClick={onGoToIdp}
              className="flex items-center gap-1.5 rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-[11px] font-bold text-teal-200 hover:bg-teal-500/20"
            >
              {plan ? 'مشاهده و ویرایش برنامه' : canManage ? 'تهیه برنامه توسعه' : 'برنامه توسعه'} <ArrowLeft size={12} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" /> در حال بارگذاری…
        </p>
      ) : !plan ? (
        <p className="text-[11px] leading-6 text-muted">
          هنوز برنامه توسعه‌ای برای این متقاضی ثبت نشده است — می‌توانید آن را مستقیماً از روی شکاف‌های شایستگی بالا تولید کنید.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted">
            <span className="flex items-center gap-1">
              <User size={11} /> مسئول پیگیری: <span className="text-secondary">{owner ? owner.fullName || owner.email : '—'}</span>
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock size={11} /> بازبینی: <span className="text-secondary">{plan.targetReviewDate ? formatJalali(plan.targetReviewDate) : '—'}</span>
            </span>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10.5px]">
              <span className="text-muted">
                <span className="num font-bold text-teal-200">{progress.done.toLocaleString('fa-IR')}</span> از {progress.total.toLocaleString('fa-IR')} اقدام انجام شده
                {progress.overdue > 0 && <span className="text-red-300"> · {progress.overdue.toLocaleString('fa-IR')} عقب‌افتاده</span>}
              </span>
              <span className="num font-bold text-teal-200">٪{progress.percent.toLocaleString('fa-IR')}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-teal-400" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
          {openActions.length > 0 && (
            <ul className="space-y-1">
              {openActions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[10.5px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META[a.priority].color }} />
                    <span className="truncate font-bold text-secondary">{a.title}</span>
                    <span className="shrink-0 text-muted">
                      · {ACTION_TYPE_LABEL_FA[a.actionType]}
                      {a.competencyId ? ` · ${competencies.find((c) => c.id === a.competencyId)?.labelFa ?? ''}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {a.dueDate && <span className="num text-muted">{formatJalali(a.dueDate)}</span>}
                    <span style={{ color: ACTION_STATUS_META[a.status].color }}>{ACTION_STATUS_META[a.status].label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
