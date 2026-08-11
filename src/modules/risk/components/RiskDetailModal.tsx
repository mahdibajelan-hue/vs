import { useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, MessageSquare, Plus, ShieldAlert, TriangleAlert, Trash2 } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useRiskStore, type RmProjectDetail } from '../store/useRiskStore'
import { useRiskCurrentRole, useRiskMembersStore } from '../store/useRiskMembersStore'
import {
  RM_CATEGORY_LABEL_FA,
  RM_ESCALATION_LEVELS,
  RM_ESCALATION_LEVEL_LABEL_FA,
  RM_ESCALATION_STATUS_LABEL_FA,
  RM_PROJECT_PHASE_LABEL_FA,
  RM_RESPONSE_STRATEGY_LABEL_FA,
  RM_RISK_STATUSES,
  RM_RISK_STATUS_COLOR,
  RM_RISK_STATUS_LABEL_FA,
  RM_RISK_TYPE_LABEL_FA,
  RM_ACTION_STATUSES,
  RM_ACTION_STATUS_LABEL_FA,
  RM_TREND_COLOR,
  RM_TREND_LABEL_FA,
  rmCanEdit,
  rmCanManage,
  type RmActionStatus,
  type RmEscalationLevel,
  type RmRisk,
  type RmRiskStatus,
  type RmTrend,
} from '../types'
import { STRATEGY_FIELDS } from '../lib/strategyFields'
import { riskInsightBullets } from '../lib/riskIntelligence'
import {
  assignReviewNumbers,
  currentState,
  isActionOverdue,
  isEscalationRequired,
  lifecycleStage,
  riskLevel,
  todayIso,
  RISK_LEVEL_COLOR,
  RISK_LEVEL_LABEL_FA,
  RM_LIFECYCLE_STAGE_COLOR,
  RM_LIFECYCLE_STAGE_LABEL_FA,
} from '../lib/riskScore'

export function RiskDetailModal({ project, risk, onClose }: { project: RmProjectDetail; risk: RmRisk; onClose: () => void }) {
  const role = useRiskCurrentRole()
  const canManage = rmCanManage(role)
  const canEdit = rmCanEdit(role)
  const updateRisk = useRiskStore((s) => s.updateRisk)
  const deleteRisk = useRiskStore((s) => s.deleteRisk)

  const assessments = project.assessments
    .filter((a) => a.riskId === risk.id)
    .sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))
  const actions = project.actions.filter((a) => a.riskId === risk.id)
  const history = project.history.filter((h) => h.riskId === risk.id)
  const reviewNumbers = assignReviewNumbers(assessments)
  const scoreChartData = [
    {
      date: risk.identifiedDate,
      reviewLabel: 'ارزیابی اولیه',
      score: risk.initialScore,
      residual: risk.initialScore,
      probability: risk.initialProbability,
      impact: risk.initialImpact,
    },
    ...[...assessments].reverse().map((a) => ({
      date: a.reviewDate,
      reviewLabel: `بازبینی #${reviewNumbers.get(a.id)}`,
      score: a.currentScore,
      residual: a.residualScore,
      probability: a.currentProbability,
      impact: a.currentImpact,
    })),
  ]

  const state = currentState(risk, assessments)
  const level = riskLevel(state.score)
  const escalation = isEscalationRequired(risk, assessments, actions)
  const initialLevel = riskLevel(risk.initialScore)
  const latestResidualScore = assessments.length > 0 ? assessments[0].residualScore : null
  const residualLevel = latestResidualScore !== null ? riskLevel(latestResidualScore) : null
  const stage = lifecycleStage(risk, assessments)
  const strategyFieldDefs = STRATEGY_FIELDS[risk.responseStrategy]
  const filledStrategyDetails = strategyFieldDefs.filter((f) => (risk.strategyDetails[f.key] ?? '').trim() !== '')

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [assessmentFormDirty, setAssessmentFormDirty] = useState(false)
  const [actionFormDirty, setActionFormDirty] = useState(false)
  const [escalationFormDirty, setEscalationFormDirty] = useState(false)

  return (
    <Modal
      title={`${risk.code} — ${risk.title}`}
      subtitle={escalation ? 'نیازمند توجه مدیریت' : undefined}
      onClose={onClose}
      width="max-w-3xl"
      isDirty={assessmentFormDirty || actionFormDirty || escalationFormDirty}
    >
      <div className="space-y-4">
        {escalation && (
          <div className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
            <ShieldAlert size={15} className="shrink-0" />
            این ریسک نیازمند توجه مدیریت است — امتیاز بحرانی، اقدام عقب‌افتاده یا زمان تا وقوع پیامد کمتر از ۱۴ روز.
          </div>
        )}

        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: `${RM_LIFECYCLE_STAGE_COLOR[stage]}1f`, color: RM_LIFECYCLE_STAGE_COLOR[stage] }}
        >
          {RM_LIFECYCLE_STAGE_LABEL_FA[stage]}
        </span>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoTile label="دسته‌بندی" value={RM_CATEGORY_LABEL_FA[risk.category]} />
          <InfoTile label="نوع" value={RM_RISK_TYPE_LABEL_FA[risk.riskType]} />
          <InfoTile label="استراتژی پاسخ" value={RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]} />
          <InfoTile label="فاز پروژه" value={risk.projectPhase ? RM_PROJECT_PHASE_LABEL_FA[risk.projectPhase] : '—'} />
          <InfoTile label="تاریخ شناسایی" value={formatJalali(risk.identifiedDate)} />
          <InfoTile label="زمان تا وقوع" value={risk.timeToImpactDays !== null ? `${risk.timeToImpactDays} روز` : '—'} />
          <div className="col-span-2">
            <span className="mb-1 block text-[11px] text-secondary">وضعیت</span>
            {canEdit ? (
              <select
                value={risk.status}
                onChange={(e) => updateRisk(risk.id, { status: e.target.value as RmRiskStatus })}
                className="input !h-auto !py-1.5 text-xs"
                style={{ color: RM_RISK_STATUS_COLOR[risk.status] }}
              >
                {RM_RISK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {RM_RISK_STATUS_LABEL_FA[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="inline-block rounded-full px-2.5 py-1 text-xs"
                style={{ background: `${RM_RISK_STATUS_COLOR[risk.status]}22`, color: RM_RISK_STATUS_COLOR[risk.status] }}
              >
                {RM_RISK_STATUS_LABEL_FA[risk.status]}
              </span>
            )}
          </div>
        </div>

        {risk.description && <p className="rounded-xl bg-white/[0.03] p-3 text-xs leading-6 text-secondary">{risk.description}</p>}

        {filledStrategyDetails.length > 0 && (
          <div className="rounded-xl border border-white/10 p-3">
            <p className="mb-2 text-xs font-bold">جزئیات استراتژی پاسخ — {RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filledStrategyDetails.map((f) => (
                <div key={f.key}>
                  <span className="mb-1 block text-[11px] text-secondary">{f.label}</span>
                  <p className="text-xs font-medium leading-5">
                    {f.type === 'select' ? f.options?.find((o) => o.value === risk.strategyDetails[f.key])?.label ?? risk.strategyDetails[f.key] : f.type === 'date' ? formatJalali(risk.strategyDetails[f.key]) : risk.strategyDetails[f.key]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score journey */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3">
          <ScorePill label="امتیاز اولیه" score={risk.initialScore} level={initialLevel} />
          <span className="text-muted">←</span>
          <ScorePill label="امتیاز فعلی" score={state.score} level={level} highlight />
          {latestResidualScore !== null && residualLevel && (
            <>
              <span className="text-muted">←</span>
              <ScorePill label="هدف باقیمانده" score={latestResidualScore} level={residualLevel} />
            </>
          )}
          <div className="mr-auto flex items-center gap-2">
            {risk.initialScore !== state.score && (
              <span className="text-xs font-bold" style={{ color: state.score < risk.initialScore ? '#2ecc71' : '#e74c3c' }}>
                {state.score < risk.initialScore ? '↓' : '↑'} {Math.abs(Math.round(((risk.initialScore - state.score) / risk.initialScore) * 100))}%
              </span>
            )}
            {assessments.length >= 1 && <ScoreSparkline data={scoreChartData} />}
          </div>
        </div>

        <EscalationSection risk={risk} canManage={canManage} escalationRequired={escalation} onDirtyChange={setEscalationFormDirty} />

        <AssessmentSection risk={risk} assessments={assessments} actions={actions} canManage={canManage} onDirtyChange={setAssessmentFormDirty} />
        <ActionsSection riskId={risk.id} actions={actions} canEdit={canEdit} ownerId={risk.ownerId} onDirtyChange={setActionFormDirty} />
        <HistorySection riskId={risk.id} history={history} canEdit={canEdit} />

        {canManage && (
          <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">حذف این ریسک قطعی است؟</span>
                <button
                  onClick={async () => {
                    await deleteRisk(risk.id)
                    onClose()
                  }}
                  className="text-xs font-medium text-red-400 hover:underline"
                >
                  تایید حذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-secondary hover:underline">
                  انصراف
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-muted hover:text-red-400 transition-colors">
                <Trash2 size={13} /> حذف ریسک
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] text-secondary">{label}</span>
      <p className="text-xs font-medium">{value}</p>
    </div>
  )
}

function ScorePill({ label, score, level, highlight }: { label: string; score: number; level: ReturnType<typeof riskLevel>; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-4 py-2 ${highlight ? '' : 'opacity-70'}`} style={{ background: `${RISK_LEVEL_COLOR[level]}15` }}>
      <span className="text-[10px] text-secondary">{label}</span>
      <span className="num text-lg font-extrabold" style={{ color: RISK_LEVEL_COLOR[level] }}>
        {score}
      </span>
      <span className="text-[9px]" style={{ color: RISK_LEVEL_COLOR[level] }}>
        {RISK_LEVEL_LABEL_FA[level]}
      </span>
    </div>
  )
}

interface ScorePoint {
  date: string
  reviewLabel: string
  score: number
  residual: number
  probability: number
  impact: number
}

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScorePoint }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f1115] px-2.5 py-1.5 text-[10px] leading-5 shadow-lg">
      <p className="font-bold text-secondary">{p.reviewLabel}</p>
      <p className="num text-muted">{formatJalali(p.date)}</p>
      <p>
        امتیاز فعلی: <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[riskLevel(p.score)] }}>{p.score}</span>
      </p>
      <p>
        امتیاز باقیمانده: <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[riskLevel(p.residual)] }}>{p.residual}</span>
      </p>
      <p className="num text-muted">
        احتمال {p.probability} × شدت {p.impact}
      </p>
    </div>
  )
}

function ScoreSparkline({ data }: { data: ScorePoint[] }) {
  return (
    <div className="flex h-11 w-24 flex-col items-center">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={formatJalali} tick={{ fontSize: 6, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-soft)' }} height={10} interval="preserveStartEnd" />
          <YAxis domain={[0, 25]} tick={{ fontSize: 6, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-soft)' }} width={16} tickCount={2} />
          <Tooltip content={<SparklineTooltip />} />
          <Line type="monotone" dataKey="score" stroke="#e74c3c" strokeWidth={1.25} dot={{ r: 1 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="residual" stroke="#2ecc71" strokeWidth={1.25} dot={{ r: 1 }} strokeDasharray="3 2" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <span className="text-[7px] text-muted">روند امتیاز</span>
    </div>
  )
}

function AssessmentSection({
  risk,
  assessments,
  actions,
  canManage,
  onDirtyChange,
}: {
  risk: RmRisk
  assessments: RmProjectDetail['assessments']
  actions: RmProjectDetail['actions']
  canManage: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const addAssessment = useRiskStore((s) => s.addAssessment)
  const [showForm, setShowForm] = useState(false)
  const [reviewDate, setReviewDate] = useState(todayIso())
  const [currentProbability, setCurrentProbability] = useState(3)
  const [currentImpact, setCurrentImpact] = useState(3)
  const [residualProbability, setResidualProbability] = useState(2)
  const [residualImpact, setResidualImpact] = useState(2)
  const [trend, setTrend] = useState<RmTrend>('stable')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  // Every field here used to keep whatever value the PREVIOUS review left it at (only `comment`
  // was reset after submit), since the form component never unmounts between reviews. Two
  // reviews submitted without touching every field would end up with identical scores/dates,
  // which looked like the newer review had "overwritten" the older one instead of being a
  // distinct entry. Resetting on every open (not just once at mount) fixes that.
  const resetFields = () => {
    setReviewDate(todayIso())
    setCurrentProbability(3)
    setCurrentImpact(3)
    setResidualProbability(2)
    setResidualImpact(2)
    setTrend('stable')
    setComment('')
  }

  const openForm = () => {
    resetFields()
    setShowForm(true)
    onDirtyChange(true)
  }

  const closeForm = () => {
    setShowForm(false)
    onDirtyChange(false)
  }

  const submit = async () => {
    setBusy(true)
    try {
      await addAssessment(risk.id, {
        reviewDate,
        currentProbability,
        currentImpact,
        residualProbability,
        residualImpact,
        trend,
        reviewerComment: comment.trim(),
        responseStrategy: risk.responseStrategy,
      })
      setShowForm(false)
      resetFields()
      onDirtyChange(false)
    } finally {
      setBusy(false)
    }
  }

  const assistantBullets = riskInsightBullets(risk, assessments, actions)
  const reviewNumbers = assignReviewNumbers(assessments)

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">تاریخچه بازبینی ریسک</p>
        {canManage && (
          <button
            onClick={() => (showForm ? closeForm() : openForm())}
            className="flex items-center gap-1 text-[11px] text-red-300 hover:underline"
          >
            <Plus size={12} /> بازبینی جدید
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-3 space-y-2.5 rounded-lg bg-white/[0.03] p-3">
          {assistantBullets.length > 0 && (
            <div className="rounded-lg border border-blue-400/20 bg-blue-500/5 p-2.5">
              <p className="mb-1 text-[10px] font-bold text-blue-300">دستیار بازبینی — قبل از ثبت این‌ها را بررسی کنید</p>
              <ul className="space-y-0.5 text-[10px] leading-5 text-secondary">
                {assistantBullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="block w-1/2">
            <span className="mb-1 block text-[10px] text-secondary">تاریخ بازبینی</span>
            <JalaliDateInput value={reviewDate} onChange={setReviewDate} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] text-secondary">وضعیت فعلی</p>
              <div className="flex gap-2">
                <NumberSlider label="احتمال" value={currentProbability} onChange={setCurrentProbability} />
                <NumberSlider label="شدت" value={currentImpact} onChange={setCurrentImpact} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] text-secondary">وضعیت باقیمانده (پس از اقدامات)</p>
              <div className="flex gap-2">
                <NumberSlider label="احتمال" value={residualProbability} onChange={setResidualProbability} />
                <NumberSlider label="شدت" value={residualImpact} onChange={setResidualImpact} />
              </div>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] text-secondary">روند</span>
            <select value={trend} onChange={(e) => setTrend(e.target.value as RmTrend)} className="input !h-auto !py-1.5 text-xs">
              {(['improving', 'stable', 'worsening'] as RmTrend[]).map((t) => (
                <option key={t} value={t}>
                  {RM_TREND_LABEL_FA[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-secondary">نظر بازبین</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="input resize-none text-xs" />
          </label>
          <p className="text-[10px] text-muted">استراتژی پاسخ فعلی ریسک («{RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]}») به‌صورت خودکار در این بازبینی ثبت می‌شود.</p>
          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="text-xs text-secondary hover:underline">
              انصراف
            </button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50">
              ثبت بازبینی
            </button>
          </div>
        </div>
      )}

      {assessments.length === 0 ? (
        <p className="text-[11px] text-muted">هنوز بازبینی‌ای ثبت نشده است</p>
      ) : (
        <>
          <div className="space-y-2">
            {assessments.map((a) => {
              const lv = riskLevel(a.currentScore)
              const residualLv = riskLevel(a.residualScore)
              return (
                <div key={a.id} className="rounded-lg bg-white/[0.02] p-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                      بازبینی #{reviewNumbers.get(a.id)}
                    </span>
                    <span className="num shrink-0 text-muted">{formatJalali(a.reviewDate)}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-[9px] text-muted">فعلی</span>
                      <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[lv] }}>
                        {a.currentScore}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-[9px] text-muted">باقیمانده</span>
                      <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[residualLv] }}>
                        {a.residualScore}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5" style={{ background: `${RM_TREND_COLOR[a.trend]}22`, color: RM_TREND_COLOR[a.trend] }}>
                      {RM_TREND_LABEL_FA[a.trend]}
                    </span>
                    {a.responseStrategy && (
                      <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-secondary">{RM_RESPONSE_STRATEGY_LABEL_FA[a.responseStrategy]}</span>
                    )}
                  </div>
                  {a.reviewerComment && <p className="mt-1.5 text-secondary">{a.reviewerComment}</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function EscalationSection({
  risk,
  canManage,
  escalationRequired,
  onDirtyChange,
}: {
  risk: RmRisk
  canManage: boolean
  escalationRequired: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const updateRisk = useRiskStore((s) => s.updateRisk)
  const [editing, setEditing] = useState(false)
  const [level, setLevel] = useState<RmEscalationLevel>(risk.escalationLevel ?? 'project_manager')
  const [escalatedTo, setEscalatedTo] = useState(risk.escalatedTo)
  const [reason, setReason] = useState(risk.escalationReason)
  const [date, setDate] = useState(risk.escalationDate ?? todayIso())
  const [requiredDecision, setRequiredDecision] = useState(risk.requiredDecision)
  const [decision, setDecision] = useState(risk.escalationDecision)
  const [decisionDate, setDecisionDate] = useState(risk.escalationDecisionDate ?? todayIso())
  const [busy, setBusy] = useState(false)

  const openEditor = () => {
    setLevel(risk.escalationLevel ?? 'project_manager')
    setEscalatedTo(risk.escalatedTo)
    setReason(risk.escalationReason)
    setDate(risk.escalationDate ?? todayIso())
    setRequiredDecision(risk.requiredDecision)
    setEditing(true)
    onDirtyChange(true)
  }

  const closeEditor = () => {
    setEditing(false)
    onDirtyChange(false)
  }

  const recommend = async () => {
    setBusy(true)
    try {
      await updateRisk(risk.id, { escalationStatus: 'recommended' })
    } finally {
      setBusy(false)
    }
  }

  const submitEscalation = async () => {
    setBusy(true)
    try {
      await updateRisk(risk.id, {
        escalationStatus: 'escalated',
        escalationLevel: level,
        escalatedTo: escalatedTo.trim(),
        escalationReason: reason.trim(),
        escalationDate: date,
        requiredDecision: requiredDecision.trim(),
      })
      closeEditor()
    } finally {
      setBusy(false)
    }
  }

  const submitDecision = async () => {
    setBusy(true)
    try {
      await updateRisk(risk.id, { escalationStatus: 'decided', escalationDecision: decision.trim(), escalationDecisionDate: decisionDate })
      onDirtyChange(false)
    } finally {
      setBusy(false)
    }
  }

  const cancelEscalation = async () => {
    setBusy(true)
    try {
      await updateRisk(risk.id, {
        escalationStatus: 'none',
        escalationLevel: null,
        escalatedTo: '',
        escalationReason: '',
        escalationDate: null,
        requiredDecision: '',
        escalationDecision: '',
        escalationDecisionDate: null,
      })
      closeEditor()
    } finally {
      setBusy(false)
    }
  }

  const statusColor =
    risk.escalationStatus === 'decided' ? '#2ecc71' : risk.escalationStatus === 'escalated' ? '#e74c3c' : risk.escalationStatus === 'recommended' ? '#f97316' : '#94a3b8'

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold">
          <TriangleAlert size={13} /> مدیریت ارجاع به مقام بالاتر (Escalation)
        </p>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${statusColor}22`, color: statusColor }}>
          {RM_ESCALATION_STATUS_LABEL_FA[risk.escalationStatus]}
        </span>
      </div>

      {canManage && risk.escalationStatus === 'none' && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] p-2.5">
          <p className="text-[11px] text-secondary">
            {escalationRequired ? 'این ریسک بر اساس معیارهای توجه مدیریت، پیشنهاد ارجاع به مقام بالاتر دارد.' : 'در صورت نیاز، این ریسک را برای تصمیم‌گیری سطح بالاتر ارجاع دهید.'}
          </p>
          <div className="flex shrink-0 gap-2">
            {escalationRequired && (
              <button onClick={recommend} disabled={busy} className="rounded-lg bg-orange-500/20 px-2.5 py-1.5 text-[11px] font-medium text-orange-300 hover:bg-orange-500/30">
                پیشنهاد ارجاع
              </button>
            )}
            <button onClick={openEditor} className="rounded-lg bg-red-500 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-red-400">
              ثبت ارجاع
            </button>
          </div>
        </div>
      )}

      {canManage && risk.escalationStatus === 'recommended' && !editing && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] p-2.5">
          <p className="text-[11px] text-secondary">ارجاع این ریسک به مقام بالاتر پیشنهاد شده است — جزئیات را تکمیل کنید.</p>
          <button onClick={openEditor} className="shrink-0 rounded-lg bg-red-500 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-red-400">
            تکمیل ارجاع
          </button>
        </div>
      )}

      {editing && (risk.escalationStatus === 'none' || risk.escalationStatus === 'recommended') && (
        <div className="space-y-2.5 rounded-lg bg-white/[0.03] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-secondary">سطح ارجاع</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as RmEscalationLevel)} className="input !h-auto !py-1.5 text-xs">
                {RM_ESCALATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {RM_ESCALATION_LEVEL_LABEL_FA[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-secondary">ارجاع به (فرد/جایگاه)</span>
              <input value={escalatedTo} onChange={(e) => setEscalatedTo(e.target.value)} className="input text-xs" placeholder="مثلاً مدیر پروژه، کمیته راهبری..." />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] text-secondary">دلیل ارجاع به مقام بالاتر</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input resize-none text-xs" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-secondary">تاریخ ارجاع</span>
              <JalaliDateInput value={date} onChange={setDate} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] text-secondary">تصمیم یا پشتیبانی موردنیاز</span>
            <textarea value={requiredDecision} onChange={(e) => setRequiredDecision(e.target.value)} rows={2} className="input resize-none text-xs" />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={closeEditor} className="text-xs text-secondary hover:underline">
              انصراف
            </button>
            <button onClick={submitEscalation} disabled={busy} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50">
              ثبت ارجاع
            </button>
          </div>
        </div>
      )}

      {(risk.escalationStatus === 'escalated' || risk.escalationStatus === 'decided') && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg bg-white/[0.02] p-2.5 text-[11px]">
            <InfoTile label="سطح ارجاع" value={risk.escalationLevel ? RM_ESCALATION_LEVEL_LABEL_FA[risk.escalationLevel] : '—'} />
            <InfoTile label="ارجاع به" value={risk.escalatedTo || '—'} />
            <InfoTile label="تاریخ ارجاع" value={risk.escalationDate ? formatJalali(risk.escalationDate) : '—'} />
            <InfoTile label="تصمیم موردنیاز" value={risk.requiredDecision || '—'} />
          </div>
          {risk.escalationReason && <p className="rounded-lg bg-white/[0.02] p-2.5 text-[11px] leading-5 text-secondary">{risk.escalationReason}</p>}

          {risk.escalationStatus === 'escalated' && canManage && (
            <div className="space-y-2 rounded-lg bg-white/[0.03] p-3">
              <label className="block">
                <span className="mb-1 block text-[10px] text-secondary">تصمیم نهایی</span>
                <textarea
                  value={decision}
                  onChange={(e) => {
                    setDecision(e.target.value)
                    onDirtyChange(true)
                  }}
                  rows={2}
                  className="input resize-none text-xs"
                />
              </label>
              <label className="block w-1/2">
                <span className="mb-1 block text-[10px] text-secondary">تاریخ تصمیم</span>
                <JalaliDateInput value={decisionDate} onChange={setDecisionDate} />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={submitDecision} disabled={busy || !decision.trim()} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50">
                  ثبت تصمیم
                </button>
              </div>
            </div>
          )}

          {risk.escalationStatus === 'decided' && (
            <div className="rounded-lg bg-green-500/10 p-2.5 text-[11px]">
              <span className="mb-1 block text-[10px] text-secondary">تصمیم نهایی — {risk.escalationDecisionDate ? formatJalali(risk.escalationDecisionDate) : ''}</span>
              <p className="leading-5">{risk.escalationDecision}</p>
            </div>
          )}

          {canManage && (
            <button onClick={cancelEscalation} className="text-[10px] text-muted hover:text-red-400">
              لغو و بازنشانی ارجاع
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NumberSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex-1">
      <span className="mb-0.5 flex items-center justify-between text-[9px] text-muted">
        <span>{label}</span>
        <span className="num">{value}</span>
      </span>
      <input type="range" min={1} max={5} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full accent-red-500" />
    </label>
  )
}

function ActionsSection({
  riskId,
  actions,
  canEdit,
  ownerId,
  onDirtyChange,
}: {
  riskId: string
  actions: RmProjectDetail['actions']
  canEdit: boolean
  ownerId: string | null
  onDirtyChange: (dirty: boolean) => void
}) {
  const addAction = useRiskStore((s) => s.addAction)
  const updateAction = useRiskStore((s) => s.updateAction)
  const deleteAction = useRiskStore((s) => s.deleteAction)
  const members = useRiskMembersStore((s) => s.members)
  const myUserId = useAuthStore((s) => s.profile?.id)
  const canEditActions = canEdit || ownerId === myUserId

  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [actionOwnerId, setActionOwnerId] = useState('')
  const [busy, setBusy] = useState(false)

  const closeForm = () => {
    setShowForm(false)
    onDirtyChange(false)
  }

  const submit = async () => {
    if (!description.trim()) return
    setBusy(true)
    try {
      await addAction(riskId, { description: description.trim(), ownerId: actionOwnerId || null, dueDate: dueDate || null })
      setShowForm(false)
      setDescription('')
      setDueDate('')
      onDirtyChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">اقدامات کنترلی</p>
        {canEditActions && (
          <button
            onClick={() => {
              setShowForm((v) => {
                onDirtyChange(!v)
                return !v
              })
            }}
            className="flex items-center gap-1 text-[11px] text-red-300 hover:underline"
          >
            <Plus size={12} /> اقدام جدید
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg bg-white/[0.03] p-3">
          <input
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              onDirtyChange(true)
            }}
            className="input text-xs"
            placeholder="شرح اقدام"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select value={actionOwnerId} onChange={(e) => setActionOwnerId(e.target.value)} className="input !h-auto !py-1.5 text-xs">
              <option value="">مالک اقدام</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName || m.email}
                </option>
              ))}
            </select>
            <JalaliDateInput value={dueDate} onChange={setDueDate} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="text-xs text-secondary hover:underline">
              انصراف
            </button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50">
              افزودن
            </button>
          </div>
        </div>
      )}

      {actions.length === 0 ? (
        <p className="text-[11px] text-muted">اقدامی ثبت نشده است</p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((a) => {
            const overdue = isActionOverdue(a)
            return (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px]">
                <span className="flex-1 truncate">{a.description}</span>
                {a.dueDate && (
                  <span className={`num shrink-0 ${overdue ? 'text-red-400 font-bold' : 'text-muted'}`}>{formatJalali(a.dueDate)}</span>
                )}
                {canEditActions ? (
                  <select
                    value={a.status}
                    onChange={(e) => {
                      const status = e.target.value as RmActionStatus
                      updateAction(a.id, { status, completionPercentage: status === 'completed' ? 100 : a.completionPercentage })
                    }}
                    className="shrink-0 rounded-md bg-black/20 border border-white/10 px-1.5 py-1 text-[10px] outline-none"
                  >
                    {RM_ACTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {RM_ACTION_STATUS_LABEL_FA[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px]">{RM_ACTION_STATUS_LABEL_FA[a.status]}</span>
                )}
                {a.status === 'completed' ? (
                  <Check size={13} className="shrink-0 text-green-400" />
                ) : (
                  canEditActions && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={a.completionPercentage}
                        onChange={(e) => {
                          const completionPercentage = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))
                          // درصد وارد‌شده وضعیت اقدام را هم به‌طور خودکار هماهنگ می‌کند: ۱۰۰٪ = تکمیل‌شده، ۰٪ = شروع‌نشده، بین این دو = در حال انجام.
                          const status: RmActionStatus = completionPercentage === 100 ? 'completed' : completionPercentage === 0 ? 'not_started' : 'in_progress'
                          updateAction(a.id, { completionPercentage, status })
                        }}
                        className="num w-11 rounded-md bg-black/20 border border-white/10 px-1 py-1 text-[10px] outline-none"
                      />
                      <span className="text-[10px] text-muted">%</span>
                    </span>
                  )
                )}
                {canEditActions && (
                  <button onClick={() => deleteAction(a.id)} className="shrink-0 text-muted hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HistorySection({ riskId, history, canEdit }: { riskId: string; history: RmProjectDetail['history']; canEdit: boolean }) {
  const addComment = useRiskStore((s) => s.addComment)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!comment.trim()) return
    setBusy(true)
    try {
      await addComment(riskId, comment.trim())
      setComment('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="mb-2 text-xs font-bold">نظرات و رویدادها</p>
      {canEdit && (
        <div className="mb-3 flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="input flex-1 text-xs"
            placeholder="نظر خود را بنویسید..."
          />
          <button onClick={submit} disabled={busy} className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50">
            <MessageSquare size={13} />
          </button>
        </div>
      )}
      {history.length === 0 ? (
        <p className="text-[11px] text-muted">رویدادی ثبت نشده است</p>
      ) : (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {history.map((h) => (
            <div key={h.id} className="rounded-lg bg-white/[0.02] px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>
                  {h.activity === 'comment'
                    ? 'نظر'
                    : h.activity === 'assessment_added'
                      ? 'بازبینی'
                      : h.activity === 'risk_created'
                        ? 'ایجاد ریسک'
                        : h.activity === 'field_changed'
                          ? 'ویرایش ریسک'
                          : h.activity === 'action_field_changed'
                            ? 'ویرایش اقدام'
                            : h.activity}
                </span>
                <span className="num">{formatJalali(h.createdAt.slice(0, 10))}</span>
              </div>
              {h.comment && <p className="mt-0.5 text-secondary">{h.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
