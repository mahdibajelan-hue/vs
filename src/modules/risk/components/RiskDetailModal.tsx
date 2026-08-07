import { useState } from 'react'
import { Check, ChevronDown, MessageSquare, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useRiskStore, type RmProjectDetail } from '../store/useRiskStore'
import { useRiskCurrentRole, useRiskMembersStore } from '../store/useRiskMembersStore'
import {
  RM_CATEGORY_LABEL_FA,
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
  type RmRisk,
  type RmRiskStatus,
  type RmTrend,
} from '../types'
import { currentState, isActionOverdue, isEscalationRequired, riskLevel, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA } from '../lib/riskScore'

export function RiskDetailModal({ project, risk, onClose }: { project: RmProjectDetail; risk: RmRisk; onClose: () => void }) {
  const role = useRiskCurrentRole()
  const canManage = rmCanManage(role)
  const canEdit = rmCanEdit(role)
  const updateRisk = useRiskStore((s) => s.updateRisk)
  const deleteRisk = useRiskStore((s) => s.deleteRisk)

  const assessments = project.assessments.filter((a) => a.riskId === risk.id).sort((a, b) => (a.reviewDate < b.reviewDate ? 1 : -1))
  const actions = project.actions.filter((a) => a.riskId === risk.id)
  const history = project.history.filter((h) => h.riskId === risk.id)

  const state = currentState(risk, assessments)
  const level = riskLevel(state.score)
  const escalation = isEscalationRequired(risk, assessments, actions)
  const initialLevel = riskLevel(risk.initialScore)

  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <Modal
      title={`${risk.code} — ${risk.title}`}
      subtitle={escalation ? 'نیازمند توجه مدیریت' : undefined}
      onClose={onClose}
      width="max-w-3xl"
    >
      <div className="space-y-4">
        {escalation && (
          <div className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
            <ShieldAlert size={15} className="shrink-0" />
            این ریسک نیازمند توجه مدیریت است — امتیاز بحرانی، اقدام عقب‌افتاده یا زمان تا وقوع پیامد کمتر از ۱۴ روز.
          </div>
        )}

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

        {/* Score journey */}
        <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
          <ScorePill label="امتیاز اولیه" score={risk.initialScore} level={initialLevel} />
          <span className="text-muted">←</span>
          <ScorePill label="امتیاز فعلی" score={state.score} level={level} highlight />
          {risk.initialScore !== state.score && (
            <span className="mr-auto text-xs font-bold" style={{ color: state.score < risk.initialScore ? '#2ecc71' : '#e74c3c' }}>
              {state.score < risk.initialScore ? '↓' : '↑'} {Math.abs(Math.round(((risk.initialScore - state.score) / risk.initialScore) * 100))}%
            </span>
          )}
        </div>

        <AssessmentSection riskId={risk.id} assessments={assessments} canManage={canManage} />
        <ActionsSection riskId={risk.id} actions={actions} canEdit={canEdit} ownerId={risk.ownerId} />
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

function AssessmentSection({
  riskId,
  assessments,
  canManage,
}: {
  riskId: string
  assessments: RmProjectDetail['assessments']
  canManage: boolean
}) {
  const addAssessment = useRiskStore((s) => s.addAssessment)
  const [showForm, setShowForm] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [currentProbability, setCurrentProbability] = useState(3)
  const [currentImpact, setCurrentImpact] = useState(3)
  const [residualProbability, setResidualProbability] = useState(2)
  const [residualImpact, setResidualImpact] = useState(2)
  const [trend, setTrend] = useState<RmTrend>('stable')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await addAssessment(riskId, { currentProbability, currentImpact, residualProbability, residualImpact, trend, reviewerComment: comment.trim() })
      setShowForm(false)
      setComment('')
    } finally {
      setBusy(false)
    }
  }

  const visible = showAll ? assessments : assessments.slice(0, 2)

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">تاریخچه بازبینی ریسک</p>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1 text-[11px] text-red-300 hover:underline">
            <Plus size={12} /> بازبینی جدید
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-3 space-y-2.5 rounded-lg bg-white/[0.03] p-3">
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs text-secondary hover:underline">
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
        <div className="space-y-2">
          {visible.map((a) => {
            const lv = riskLevel(a.currentScore)
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px]">
                <span className="num shrink-0 text-muted">{formatJalali(a.reviewDate)}</span>
                <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[lv] }}>
                  {a.currentScore}
                </span>
                <span className="shrink-0 rounded-full px-1.5 py-0.5" style={{ background: `${RM_TREND_COLOR[a.trend]}22`, color: RM_TREND_COLOR[a.trend] }}>
                  {RM_TREND_LABEL_FA[a.trend]}
                </span>
                <span className="truncate text-secondary">{a.reviewerComment}</span>
              </div>
            )
          })}
          {assessments.length > 2 && !showAll && (
            <button onClick={() => setShowAll(true)} className="flex items-center gap-1 text-[10px] text-muted hover:text-secondary">
              <ChevronDown size={11} /> نمایش {assessments.length - 2} مورد دیگر
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

function ActionsSection({ riskId, actions, canEdit, ownerId }: { riskId: string; actions: RmProjectDetail['actions']; canEdit: boolean; ownerId: string | null }) {
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

  const submit = async () => {
    if (!description.trim()) return
    setBusy(true)
    try {
      await addAction(riskId, { description: description.trim(), ownerId: actionOwnerId || null, dueDate: dueDate || null })
      setShowForm(false)
      setDescription('')
      setDueDate('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">اقدامات کنترلی</p>
        {canEditActions && (
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1 text-[11px] text-red-300 hover:underline">
            <Plus size={12} /> اقدام جدید
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg bg-white/[0.03] p-3">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input text-xs" placeholder="شرح اقدام" />
          <div className="grid grid-cols-2 gap-2">
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
            <button onClick={() => setShowForm(false)} className="text-xs text-secondary hover:underline">
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
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={a.completionPercentage}
                      onChange={(e) => updateAction(a.id, { completionPercentage: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                      className="num w-12 shrink-0 rounded-md bg-black/20 border border-white/10 px-1 py-1 text-[10px] outline-none"
                    />
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
                <span>{h.activity === 'comment' ? 'نظر' : h.activity === 'assessment_added' ? 'بازبینی' : h.activity === 'risk_created' ? 'ایجاد ریسک' : h.activity}</span>
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
