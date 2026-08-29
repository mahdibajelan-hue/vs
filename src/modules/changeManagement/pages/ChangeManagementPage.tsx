import { createContext, useContext, useEffect, useState } from 'react'
import {
  ArrowRight, Check, CheckCircle2, ClipboardList, FileText, Gauge, Plus,
  ShieldAlert, Sparkles, X,
} from 'lucide-react'
import { formatJalali, todayJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useChangeStore } from '../store/useChangeStore'
import { fetchCurrentContractValue } from '../lib/changeContract'
import {
  computeChangeImpact, contractChangePercent, newContractAmount, newProjectDuration, scheduleChangePercent,
} from '../lib/changeCalc'
import {
  CHANGE_PRIORITY_LABEL_FA, CHANGE_ROLE_NAME, CHANGE_STATUS_COLOR, CHANGE_STATUS_LABEL_FA,
  IMPACT_LEVEL_COLOR, IMPACT_LEVEL_LABEL_FA, REVIEW_STAGE_LABEL_FA, REVIEW_STAGE_ROLE_NAME,
  STAGE_DECISION_COLOR, STAGE_DECISION_LABEL_FA, TIMELINE_STAGES,
  type ChangeDocument, type ChangeHistoryEntry, type ChangePriority, type ChangeRequest,
  type ChangeStatus, type DocumentCategory, type ImpactLevel,
  type ReviewStage, type StageReview, type StageReviewDecision, type StageReviewDetails,
} from '../types'

function money(n: number, currency: string): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n).toLocaleString('en-US')} ${currency}`
}

function pct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}٪`
}

/** Counts up from 0 on mount/value-change — same pattern RadarPanels.tsx uses. */
function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) * (1 - t)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}

function useHasProjectRole(masterProjectId: string, roleName: string): boolean {
  const userId = useAuthStore((s) => s.currentUser()?.id)
  const isAdmin = useAuthStore((s) => s.currentUser()?.isAdmin) ?? false
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const assignments = useAccessStore((s) => s.projectRoleAssignments)
  if (isAdmin) return true
  if (!userId) return false
  const role = projectRoles.find((r) => r.name === roleName)
  if (!role) return false
  return assignments.some((a) => a.projectId === masterProjectId && a.userId === userId && a.projectRoleId === role.id)
}

const STATUS_ORDER: ChangeStatus[] = TIMELINE_STAGES.map((s) => s.key)

function statusIndex(status: ChangeStatus): number {
  const i = STATUS_ORDER.indexOf(status)
  return i === -1 ? 0 : i
}

export function ChangeManagementPage({ masterProjectId, projectName, onBack }: { masterProjectId: string | null; projectName: string; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!masterProjectId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--bg-app)' }}>
        <div className="glass-panel max-w-md rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-4 text-sm text-muted">برای مدیریت تغییرات ابتدا یک پروژه واقعی انتخاب کنید.</p>
          <button onClick={onBack} className="rounded-xl border px-4 py-2 text-sm font-bold" style={{ borderColor: 'var(--border-soft)' }}>بازگشت</button>
        </div>
      </div>
    )
  }

  if (selectedId) {
    return <ChangeRequestDetail masterProjectId={masterProjectId} projectName={projectName} changeRequestId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <ChangeRequestList masterProjectId={masterProjectId} projectName={projectName} onBack={onBack} onSelect={setSelectedId} />
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ChangeRequestList({ masterProjectId, projectName, onBack, onSelect }: {
  masterProjectId: string; projectName: string; onBack: () => void; onSelect: (id: string) => void
}) {
  const requests = useChangeStore((s) => s.requests)
  const loadingList = useChangeStore((s) => s.loadingList)
  const fetchForProject = useChangeStore((s) => s.fetchForProject)
  const createDraft = useChangeStore((s) => s.createDraft)
  const fetchAccessAll = useAccessStore((s) => s.fetchAll)
  const currentUser = useAuthStore((s) => s.currentUser())
  const [contractValue, setContractValue] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    fetchAccessAll()
    fetchForProject(masterProjectId)
    fetchCurrentContractValue(masterProjectId).then(setContractValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProjectId])

  const isContractor = useHasProjectRole(masterProjectId, CHANGE_ROLE_NAME.contractor)

  return (
    <div className="min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
            <ArrowRight size={16} />
          </button>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-wide">مدیریت تغییرات</p>
            <p className="text-[10px] font-bold tracking-wide text-muted">EPC CHANGE REQUEST &amp; CHANGE CONTROL</p>
            <p className="text-[11px] text-muted">{projectName}</p>
          </div>
        </div>
        {isContractor && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold"
            style={{ borderColor: 'color-mix(in srgb, #22ff9e 45%, var(--border-soft))', color: '#22ff9e' }}
          >
            <Plus size={14} /> درخواست تغییر جدید
          </button>
        )}
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {formOpen && (
          <NewChangeDraftForm
            contractValue={contractValue}
            onCancel={() => setFormOpen(false)}
            onCreate={async (data) => {
              const id = await createDraft(masterProjectId, data, currentUser?.id ?? null)
              if (id) onSelect(id)
            }}
          />
        )}

        {loadingList && <p className="text-sm text-muted">در حال بارگذاری…</p>}
        {!loadingList && requests.length === 0 && (
          <p className="glass-panel rounded-2xl border p-6 text-center text-sm text-muted" style={{ borderColor: 'var(--border-soft)' }}>
            هنوز هیچ درخواست تغییری برای این پروژه ثبت نشده است.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {requests.map((r) => {
            const impact = computeChangeImpact(r)
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-right hover:bg-white/5"
                style={{ borderColor: 'var(--border-soft)' }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="num shrink-0 text-[11px] font-bold text-muted">{r.crNumber}</span>
                  <span className="min-w-0 truncate text-[13px] font-bold">{r.title || 'بدون عنوان'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num text-[11px]" style={{ color: IMPACT_LEVEL_COLOR[impact.overallSeverity] }}>{IMPACT_LEVEL_LABEL_FA[impact.overallSeverity]}</span>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${CHANGE_STATUS_COLOR[r.status]} 18%, transparent)`, color: CHANGE_STATUS_COLOR[r.status] }}>
                    {CHANGE_STATUS_LABEL_FA[r.status]}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function NewChangeDraftForm({ contractValue, onCancel, onCreate }: {
  contractValue: number | null
  onCancel: () => void
  onCreate: (data: {
    title: string; description: string; reasonForChange: string; priority: ChangePriority
    currency: string; originalContractAmount: number; proposedChangeAmount: number
    originalDurationDays: number; proposedScheduleImpactDays: number
    newRisksCount: number; scopeImpactLevel: ImpactLevel
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reasonForChange, setReasonForChange] = useState('')
  const [priority, setPriority] = useState<ChangePriority>('medium')
  const [proposedChangeAmount, setProposedChangeAmount] = useState(0)
  const [originalDurationDays, setOriginalDurationDays] = useState(540)
  const [proposedScheduleImpactDays, setProposedScheduleImpactDays] = useState(0)
  const [newRisksCount, setNewRisksCount] = useState(0)
  const [scopeImpactLevel, setScopeImpactLevel] = useState<ImpactLevel>('medium')

  const originalContractAmount = contractValue ?? 0
  const costPct = originalContractAmount > 0 ? (proposedChangeAmount / originalContractAmount) * 100 : 0
  const schedulePct = originalDurationDays > 0 ? (proposedScheduleImpactDays / originalDurationDays) * 100 : 0

  return (
    <div className="glass-panel mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[13px] font-bold">
        <Sparkles size={14} style={{ color: '#22ff9e' }} /> اطلاعات و پیشنهاد پیمانکار — Contractor Change Proposal
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input rounded-lg px-3 py-2 text-sm" placeholder="عنوان تغییر" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input rounded-lg px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as ChangePriority)}>
          {(['low', 'medium', 'high', 'critical'] as ChangePriority[]).map((p) => (
            <option key={p} value={p}>{CHANGE_PRIORITY_LABEL_FA[p]}</option>
          ))}
        </select>
      </div>
      <textarea className="input mt-3 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="شرح تغییر (Change Description)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <textarea className="input mt-3 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="دلیل تغییر (Reason for Change)" value={reasonForChange} onChange={(e) => setReasonForChange(e.target.value)} />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-[10px] font-bold tracking-wide text-muted">Financial Impact</p>
          <label className="text-[11px] text-muted">
            مبلغ پیشنهادی تغییر
            <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={proposedChangeAmount} onChange={(e) => setProposedChangeAmount(Number(e.target.value))} />
          </label>
          <div className="num mt-3 space-y-1 text-[11px] text-muted">
            <p>قرارداد اصلی: {originalContractAmount ? Math.round(originalContractAmount).toLocaleString('en-US') : '—'}</p>
            <p style={{ color: costPct >= 0 ? '#2ecc71' : '#ef4444' }}>تغییر: {pct(costPct)}</p>
            <p>قرارداد جدید: {originalContractAmount ? Math.round(originalContractAmount + proposedChangeAmount).toLocaleString('en-US') : '—'}</p>
          </div>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-[10px] font-bold tracking-wide text-muted">Schedule Impact</p>
          <label className="text-[11px] text-muted">
            مدت اصلی پروژه (روز)
            <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={originalDurationDays} onChange={(e) => setOriginalDurationDays(Number(e.target.value))} />
          </label>
          <label className="mt-2 block text-[11px] text-muted">
            اثر زمانی پیشنهادی (روز)
            <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={proposedScheduleImpactDays} onChange={(e) => setProposedScheduleImpactDays(Number(e.target.value))} />
          </label>
          <div className="num mt-3 space-y-1 text-[11px] text-muted">
            <p style={{ color: schedulePct >= 0 ? '#2ecc71' : '#ef4444' }}>تغییر: {pct(schedulePct)}</p>
            <p>مدت جدید: {originalDurationDays + proposedScheduleImpactDays} روز</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted">
          تعداد ریسک جدید احتمالی
          <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={newRisksCount} onChange={(e) => setNewRisksCount(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-muted">
          سطح اثر بر دامنه (Scope)
          <select className="input mt-1 w-full rounded-lg px-3 py-2 text-sm" value={scopeImpactLevel} onChange={(e) => setScopeImpactLevel(e.target.value as ImpactLevel)}>
            {(['low', 'medium', 'high', 'critical'] as ImpactLevel[]).map((l) => (
              <option key={l} value={l}>{IMPACT_LEVEL_LABEL_FA[l]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-xl border px-4 py-2 text-[12px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>انصراف</button>
        <button
          disabled={!title.trim()}
          onClick={() => onCreate({
            title, description, reasonForChange, priority, currency: 'IRR',
            originalContractAmount, proposedChangeAmount, originalDurationDays, proposedScheduleImpactDays,
            newRisksCount, scopeImpactLevel,
          })}
          className="rounded-xl px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: '#2ecc71' }}
        >
          ذخیره پیش‌نویس
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function ChangeRequestDetail({ masterProjectId, projectName, changeRequestId, onBack }: {
  masterProjectId: string; projectName: string; changeRequestId: string; onBack: () => void
}) {
  const requests = useChangeStore((s) => s.requests)
  const reviews = useChangeStore((s) => s.reviews)
  const documents = useChangeStore((s) => s.documents)
  const history = useChangeStore((s) => s.history)
  const fetchBundle = useChangeStore((s) => s.fetchBundle)
  const fetchForProject = useChangeStore((s) => s.fetchForProject)
  const submitDraft = useChangeStore((s) => s.submitDraft)
  const saveStageReview = useChangeStore((s) => s.saveStageReview)
  const addDocument = useChangeStore((s) => s.addDocument)
  const saving = useChangeStore((s) => s.saving)
  const fetchAccessAll = useAccessStore((s) => s.fetchAll)
  const currentUser = useAuthStore((s) => s.currentUser())

  const [expandedStage, setExpandedStage] = useState<ChangeStatus | null>(null)

  useEffect(() => {
    fetchAccessAll()
    fetchForProject(masterProjectId)
    fetchBundle(changeRequestId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeRequestId])

  const request = requests.find((r) => r.id === changeRequestId)

  const isContractor = useHasProjectRole(masterProjectId, CHANGE_ROLE_NAME.contractor)
  const isEngineering = useHasProjectRole(masterProjectId, REVIEW_STAGE_ROLE_NAME.engineering)
  const isPlanning = useHasProjectRole(masterProjectId, REVIEW_STAGE_ROLE_NAME.planning)
  const isContract = useHasProjectRole(masterProjectId, REVIEW_STAGE_ROLE_NAME.contract)
  const isPm = useHasProjectRole(masterProjectId, REVIEW_STAGE_ROLE_NAME.pm)
  const isCcb = useHasProjectRole(masterProjectId, REVIEW_STAGE_ROLE_NAME.ccb)

  if (!request) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--bg-app)' }}>
        <p className="text-sm text-muted">در حال بارگذاری…</p>
      </div>
    )
  }

  const impact = computeChangeImpact(request)
  const isOwnRequest = currentUser?.id != null && request.submittedBy === currentUser.id
  const reviewByStage = (stage: ReviewStage) => reviews.find((r) => r.stage === stage)

  return (
    <div className="min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      {/* Header — spec §2 */}
      <header className="border-b px-4 py-4 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
              <ArrowRight size={16} />
            </button>
            <div className="leading-tight">
              <p className="text-lg font-extrabold tracking-wide">مدیریت تغییرات</p>
              <p className="text-[10px] font-bold tracking-wide text-muted">EPC CHANGE REQUEST &amp; CHANGE CONTROL</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-5">
            <HeaderStat label="CR No." value={request.crNumber} mono />
            <HeaderStat label="پروژه" value={projectName} />
            <HeaderStat label="وضعیت" value={CHANGE_STATUS_LABEL_FA[request.status]} color={CHANGE_STATUS_COLOR[request.status]} />
            <HeaderStat label="اولویت" value={CHANGE_PRIORITY_LABEL_FA[request.priority]} />
            <HeaderStat label="تاریخ" value={formatJalali(request.createdAt.slice(0, 10)) || `${todayJalali().jy}/${todayJalali().jm}/${todayJalali().jd}`} mono />
          </div>
        </div>
        <p className="mt-3 text-[15px] font-bold">{request.title}</p>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {/* Approval timeline — spec §3 */}
        <ApprovalTimeline request={request} reviews={reviews} expanded={expandedStage} onToggle={setExpandedStage} />

        {/* Executive impact summary — spec §4 */}
        <ImpactSummary request={request} impact={impact} />

        {/* Contractor proposal — spec §5 */}
        <ContractorProposalCard request={request} isContractor={isContractor} saving={saving} onSubmit={() => submitDraft(request, currentUser?.id ?? null)} />

        {/* Stage review cards — spec §6-10 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StageReviewCard
            stage="engineering" request={request} review={reviewByStage('engineering')} canDecide={isEngineering && !isOwnRequest} saving={saving}
            onDecide={(decision, comment, details) => saveStageReview(request, 'engineering', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.engineering)}
            fields={<EngineeringFields />}
          />
          <StageReviewCard
            stage="planning" request={request} review={reviewByStage('planning')} canDecide={isPlanning && !isOwnRequest} saving={saving}
            onDecide={(decision, comment, details) => saveStageReview(request, 'planning', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.planning)}
            fields={<PlanningFields request={request} />}
          />
          <StageReviewCard
            stage="contract" request={request} review={reviewByStage('contract')} canDecide={isContract && !isOwnRequest} saving={saving}
            onDecide={(decision, comment, details) => saveStageReview(request, 'contract', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.contract)}
            fields={<ContractFields request={request} />}
          />
          <StageReviewCard
            stage="pm" request={request} review={reviewByStage('pm')} canDecide={isPm && !isOwnRequest} saving={saving}
            onDecide={(decision, comment, details) => saveStageReview(request, 'pm', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.pm)}
            fields={<PmFields request={request} impact={impact} reviews={reviews} />}
          />
        </div>

        {/* CCB — spec §10 */}
        <CcbCard request={request} review={reviewByStage('ccb')} reviews={reviews} canDecide={isCcb && !isOwnRequest} saving={saving}
          onDecide={(decision, comment, details) => saveStageReview(request, 'ccb', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.ccb)}
        />

        {/* Change Impact Radar — spec §11 */}
        <ChangeImpactRadar impact={impact} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Documents — spec §12 */}
          <DocumentsPanel documents={documents} onAdd={(data) => addDocument(request.id, data, currentUser?.id ?? null)} />
          {/* Change History — spec §13 */}
          <HistoryPanel history={history} />
        </div>
      </main>
    </div>
  )
}

function HeaderStat({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold tracking-wide text-muted">{label}</p>
      <p className={mono ? 'num text-[12px] font-bold' : 'text-[12px] font-bold'} style={{ color }}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approval timeline — spec §3
// ---------------------------------------------------------------------------

function ApprovalTimeline({ request, reviews, expanded, onToggle }: {
  request: ChangeRequest; reviews: StageReview[]; expanded: ChangeStatus | null; onToggle: (s: ChangeStatus | null) => void
}) {
  const currentIdx = statusIndex(request.status)
  const isRejected = request.status === 'rejected'

  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-bold text-muted">مسیر تصویب تغییر</p>
        <p className="num text-[10px] text-muted">مرحله {Math.min(currentIdx + 1, TIMELINE_STAGES.length)} از {TIMELINE_STAGES.length}</p>
      </div>
      <div className="flex flex-col gap-3 overflow-x-auto md:flex-row md:items-start md:gap-0">
        {TIMELINE_STAGES.map((stage, i) => {
          const state: 'done' | 'current' | 'upcoming' | 'rejected' =
            isRejected && i === currentIdx ? 'rejected' : i < currentIdx || request.status === 'closed' || request.status === 'approved' ? 'done' : i === currentIdx ? 'current' : 'upcoming'
          const color = state === 'done' ? '#2ecc71' : state === 'current' ? '#38bdf8' : state === 'rejected' ? '#ef4444' : '#475569'
          const relatedReview = reviews.find((r) => REVIEW_STAGE_ROLE_NAME[r.stage] && stage.role === REVIEW_STAGE_ROLE_NAME[r.stage as ReviewStage])
          return (
            <div key={stage.key} className="flex flex-1 items-center md:flex-col">
              <button
                onClick={() => onToggle(expanded === stage.key ? null : stage.key)}
                className="flex shrink-0 flex-col items-center gap-1.5 md:w-full"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-[11px] font-extrabold"
                  style={{
                    borderColor: color, color,
                    background: state === 'current' ? 'color-mix(in srgb, #38bdf8 18%, transparent)' : 'transparent',
                    boxShadow: state === 'current' ? '0 0 0 4px color-mix(in srgb, #38bdf8 22%, transparent)' : undefined,
                    animation: state === 'current' ? 'chg-glow 1.8s ease-in-out infinite' : undefined,
                  }}
                >
                  {state === 'done' ? <Check size={16} /> : state === 'rejected' ? <X size={16} /> : i + 1}
                </span>
                <span className="max-w-[84px] text-center text-[9.5px] font-bold leading-tight" style={{ color }}>{stage.labelFa}</span>
              </button>
              {i < TIMELINE_STAGES.length - 1 && (
                <div className="mx-1 hidden h-0.5 flex-1 md:block" style={{ background: i < currentIdx ? '#2ecc71' : 'var(--border-soft)' }} />
              )}
              {expanded === stage.key && (
                <div className="mt-2 w-full rounded-xl border p-2.5 text-[11px] md:absolute md:z-10 md:mt-14 md:w-48" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}>
                  <p className="font-bold">{stage.labelFa}</p>
                  <p className="mt-1 text-muted">مسئول: {stage.role}</p>
                  {relatedReview ? (
                    <>
                      <p className="mt-1" style={{ color: STAGE_DECISION_COLOR[relatedReview.decision] }}>{STAGE_DECISION_LABEL_FA[relatedReview.decision]}</p>
                      {relatedReview.decidedAt && <p className="num mt-1 text-muted">{formatJalali(relatedReview.decidedAt.slice(0, 10))}</p>}
                      {relatedReview.comment && <p className="mt-1 text-secondary">«{relatedReview.comment}»</p>}
                    </>
                  ) : (
                    <p className="mt-1 text-muted">{state === 'upcoming' ? 'شروع نشده' : 'در انتظار تصمیم'}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <style>{`@keyframes chg-glow { 0%,100% { box-shadow: 0 0 0 4px color-mix(in srgb, #38bdf8 22%, transparent); } 50% { box-shadow: 0 0 0 8px color-mix(in srgb, #38bdf8 10%, transparent); } }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Executive impact summary — spec §4
// ---------------------------------------------------------------------------

function ImpactSummary({ request, impact }: { request: ChangeRequest; impact: ReturnType<typeof computeChangeImpact> }) {
  const animatedCost = useCountUp(impact.costPercent)
  const animatedSchedule = useCountUp(impact.schedulePercent)

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={Gauge} label="اثر مالی" sub="COST IMPACT" value={pct(animatedCost)} color={impact.highFinancialImpact ? '#ef4444' : '#2ecc71'} />
        <KpiCard icon={Gauge} label="اثر زمانی" sub="TIME IMPACT" value={pct(animatedSchedule)} color={impact.highScheduleImpact ? '#ef4444' : '#2ecc71'} />
        <KpiCard icon={ShieldAlert} label="ریسک" sub="RISK" value={IMPACT_LEVEL_LABEL_FA[impact.riskLevel]} color={IMPACT_LEVEL_COLOR[impact.riskLevel]} />
        <KpiCard icon={ClipboardList} label="دامنه" sub="SCOPE" value={IMPACT_LEVEL_LABEL_FA[impact.scopeLevel]} color={IMPACT_LEVEL_COLOR[impact.scopeLevel]} />
      </div>
      {(impact.highFinancialImpact || impact.highScheduleImpact) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {impact.isCritical && <ValidationBanner color="#ef4444" text="CRITICAL CHANGE — بررسی الزامی CCB" />}
          {!impact.isCritical && impact.highFinancialImpact && <ValidationBanner color="#f0a836" text="اثر مالی بالا (High Financial Impact)" />}
          {!impact.isCritical && impact.highScheduleImpact && <ValidationBanner color="#f0a836" text="اثر زمانی بالا (High Schedule Impact)" />}
          {impact.ccbReviewRequired && <ValidationBanner color="#38bdf8" text="نیازمند بررسی CCB" />}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted">شدت کلی تغییر: <span className="num font-bold" style={{ color: IMPACT_LEVEL_COLOR[impact.overallSeverity] }}>{IMPACT_LEVEL_LABEL_FA[impact.overallSeverity].toUpperCase()}</span>{request.newRisksCount > 0 ? ` — ${request.newRisksCount} ریسک جدید` : ''}</p>
    </div>
  )
}

function KpiCard({ icon: Icon, label, sub, value, color }: { icon: typeof Gauge; label: string; sub: string; value: string; color: string }) {
  return (
    <div className="glass-panel rounded-2xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={13} aria-hidden="true" style={{ color }} />
        <span className="text-[9px] font-bold tracking-wide text-muted">{sub}</span>
      </div>
      <p className="num text-lg font-extrabold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
}

function ValidationBanner({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <ShieldAlert size={12} aria-hidden="true" /> {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Contractor proposal — spec §5
// ---------------------------------------------------------------------------

function ContractorProposalCard({ request, isContractor, saving, onSubmit }: {
  request: ChangeRequest; isContractor: boolean; saving: boolean; onSubmit: () => void
}) {
  const costPct = contractChangePercent(request)
  const schedulePct = scheduleChangePercent(request)
  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 text-[12px] font-bold text-muted">اطلاعات و پیشنهاد پیمانکار — Contractor Change Proposal</p>
      <p className="mb-3 text-[12px] text-secondary">{request.description || '—'}</p>
      {request.reasonForChange && <p className="mb-3 text-[11px] text-muted">دلیل: {request.reasonForChange}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-[10px] font-bold tracking-wide text-muted">Financial</p>
          <div className="num space-y-1 text-muted">
            <p>قرارداد اصلی: {Math.round(request.originalContractAmount).toLocaleString('en-US')} {request.currency}</p>
            <p style={{ color: costPct >= 0 ? '#2ecc71' : '#ef4444' }}>تغییر: {money(request.proposedChangeAmount, request.currency)} ({pct(costPct)})</p>
            <p className="font-bold text-primary">قرارداد جدید: {Math.round(newContractAmount(request)).toLocaleString('en-US')} {request.currency}</p>
          </div>
        </div>
        <div className="rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-[10px] font-bold tracking-wide text-muted">Schedule</p>
          <div className="num space-y-1 text-muted">
            <p>مدت اصلی: {request.originalDurationDays} روز</p>
            <p style={{ color: schedulePct >= 0 ? '#2ecc71' : '#ef4444' }}>اثر: {request.proposedScheduleImpactDays > 0 ? '+' : ''}{request.proposedScheduleImpactDays} روز ({pct(schedulePct)})</p>
            <p className="font-bold text-primary">مدت جدید: {newProjectDuration(request)} روز</p>
          </div>
        </div>
      </div>
      {request.status === 'draft' && isContractor && (
        <div className="mt-4 flex justify-end">
          <button disabled={saving} onClick={onSubmit} className="rounded-xl px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#38bdf8' }}>
            ثبت و ارسال برای بررسی مهندسی
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic stage review card — spec §6-9
// ---------------------------------------------------------------------------

function StageReviewCard({ stage, request, review, canDecide, saving, onDecide, fields }: {
  stage: ReviewStage
  request: ChangeRequest
  review: StageReview | undefined
  canDecide: boolean
  saving: boolean
  onDecide: (decision: StageReviewDecision, comment: string, details: StageReviewDetails) => void
  fields: React.ReactNode
}) {
  const [comment, setComment] = useState(review?.comment ?? '')
  const [details, setDetails] = useState<StageReviewDetails>(review?.details ?? {})
  const isActiveStage = STATUS_ORDER[statusIndex(request.status)] === (
    stage === 'engineering' ? 'engineering_review' : stage === 'planning' ? 'planning_review' : stage === 'contract' ? 'contract_review' : 'pm_review'
  )
  const decision = review?.decision ?? 'pending'
  const locked = !isActiveStage && decision === 'pending'

  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)', opacity: locked ? 0.55 : 1 }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold">{REVIEW_STAGE_LABEL_FA[stage]}</p>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `color-mix(in srgb, ${STAGE_DECISION_COLOR[decision]} 18%, transparent)`, color: STAGE_DECISION_COLOR[decision] }}>
          {STAGE_DECISION_LABEL_FA[decision]}
        </span>
      </div>

      <StageDetailsForm
        details={details} onChange={setDetails} readOnly={!isActiveStage || !canDecide}
      >
        {fields}
      </StageDetailsForm>

      {decision === 'pending' && isActiveStage && canDecide && (
        <div className="mt-3">
          <textarea className="input w-full rounded-lg px-3 py-2 text-[12px]" rows={2} placeholder="نظر کارشناسی" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button disabled={saving} onClick={() => onDecide('request_revision', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#f0a836', color: '#f0a836' }}>نیازمند بازنگری</button>
            <button disabled={saving} onClick={() => onDecide('rejected', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#ef4444', color: '#ef4444' }}>رد</button>
            <button disabled={saving} onClick={() => onDecide('approved_with_conditions', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#2ecc71', color: '#2ecc71' }}>تایید مشروط</button>
            <button disabled={saving} onClick={() => onDecide('approved', comment, details)} className="rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white" style={{ background: '#2ecc71' }}>تایید</button>
          </div>
        </div>
      )}
      {decision !== 'pending' && (
        <div className="mt-2 text-[11px] text-secondary">
          {review?.comment && <p>«{review.comment}»</p>}
          {review?.decidedAt && <p className="num mt-1 text-muted">{formatJalali(review.decidedAt.slice(0, 10))}</p>}
        </div>
      )}
    </div>
  )
}

function StageDetailsForm({ details, onChange, readOnly, children }: {
  details: StageReviewDetails; onChange: (d: StageReviewDetails) => void; readOnly: boolean; children: React.ReactNode
}) {
  return (
    <FieldsContext.Provider value={{ details, onChange, readOnly }}>
      <div className="space-y-2">{children}</div>
    </FieldsContext.Provider>
  )
}

const FieldsContext = createContext<{ details: StageReviewDetails; onChange: (d: StageReviewDetails) => void; readOnly: boolean }>({ details: {}, onChange: () => {}, readOnly: true })

function TextField({ k, label }: { k: keyof StageReviewDetails; label: string }) {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  return (
    <label className="block text-[10.5px] text-muted">
      {label}
      <input
        className="input mt-1 w-full rounded-lg px-2.5 py-1.5 text-[11.5px]"
        disabled={readOnly}
        value={(details[k] as string) ?? ''}
        onChange={(e) => onChange({ ...details, [k]: e.target.value })}
      />
    </label>
  )
}

function BoolField({ k, label }: { k: keyof StageReviewDetails; label: string }) {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  return (
    <label className="flex items-center gap-2 text-[10.5px] text-muted">
      <input type="checkbox" disabled={readOnly} checked={Boolean(details[k])} onChange={(e) => onChange({ ...details, [k]: e.target.checked })} />
      {label}
    </label>
  )
}

function NumberField({ k, label }: { k: keyof StageReviewDetails; label: string }) {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  return (
    <label className="block text-[10.5px] text-muted">
      {label}
      <input
        type="number"
        className="input num mt-1 w-full rounded-lg px-2.5 py-1.5 text-[11.5px]"
        disabled={readOnly}
        value={(details[k] as number) ?? 0}
        onChange={(e) => onChange({ ...details, [k]: Number(e.target.value) })}
      />
    </label>
  )
}

function EngineeringFields() {
  return (
    <>
      <TextField k="technicalImpact" label="اثر فنی (Technical Impact)" />
      <div className="grid grid-cols-2 gap-2">
        <TextField k="affectedDrawings" label="نقشه‌های متاثر" />
        <TextField k="affectedPids" label="P&amp;ID های متاثر" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BoolField k="designReworkRequired" label="نیاز به بازطراحی" />
        <NumberField k="engineeringDurationDays" label="مدت بررسی (روز)" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField k="hseImpact" label="اثر HSE" />
        <TextField k="qualityImpact" label="اثر کیفیت" />
      </div>
    </>
  )
}

function PlanningFields({ request }: { request: ChangeRequest }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-[10.5px] text-muted">
        <p className="num">مدت اصلی: {request.originalDurationDays} روز</p>
        <p className="num">مدت جدید: {newProjectDuration(request)} روز</p>
      </div>
      <TextField k="criticalPathImpact" label="اثر بر مسیر بحرانی" />
      <TextField k="affectedActivities" label="فعالیت‌های متاثر" />
      <TextField k="milestonesAffected" label="نقاط عطف متاثر" />
      <div className="grid grid-cols-2 gap-2">
        <BoolField k="eotRequired" label="نیاز به EOT" />
        <BoolField k="recoveryPossible" label="امکان جبران" />
      </div>
    </>
  )
}

function ContractFields({ request }: { request: ChangeRequest }) {
  return (
    <>
      <TextField k="contractualBasis" label="مبنای قراردادی" />
      <TextField k="relevantClause" label="بند مرتبط قرارداد" />
      <div className="grid grid-cols-2 gap-2">
        <BoolField k="variationOrderRequired" label="نیاز به VO" />
        <BoolField k="claimPotential" label="پتانسیل کلایم" />
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="text-center">
          <p className="num text-[11px] font-bold">{money(request.proposedChangeAmount, request.currency)}</p>
          <p className="text-[9px] text-muted">پیشنهاد پیمانکار</p>
        </div>
        <NumberField k="evaluatedAmount" label="ارزیابی امور پیمان" />
        <NumberField k="recommendedAmount" label="مبلغ پیشنهادی نهایی" />
      </div>
    </>
  )
}

function PmFields({ request, impact, reviews }: { request: ChangeRequest; impact: ReturnType<typeof computeChangeImpact>; reviews: StageReview[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-[10.5px] text-muted">
        <p>هزینه: <span className="num font-bold" style={{ color: impact.highFinancialImpact ? '#ef4444' : '#2ecc71' }}>{pct(impact.costPercent)}</span></p>
        <p>زمان: <span className="num font-bold" style={{ color: impact.highScheduleImpact ? '#ef4444' : '#2ecc71' }}>{pct(impact.schedulePercent)}</span></p>
        <p>ریسک: <span className="font-bold" style={{ color: IMPACT_LEVEL_COLOR[impact.riskLevel] }}>{IMPACT_LEVEL_LABEL_FA[impact.riskLevel]}</span></p>
        <p>پیمان: {reviews.find((r) => r.stage === 'contract')?.details.variationOrderRequired ? 'نیازمند VO' : '—'}</p>
      </div>
      <TextField k="managementComment" label="نظر مدیریتی" />
      <TextField k="conditions" label="شروط" />
      <TextField k="requiredActions" label="اقدامات لازم" />
      <p className="text-[9px] text-muted">وضعیت درخواست: {CHANGE_STATUS_LABEL_FA[request.status]}</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// CCB — spec §10
// ---------------------------------------------------------------------------

function CcbCard({ request, review, reviews, canDecide, saving, onDecide }: {
  request: ChangeRequest; review: StageReview | undefined; reviews: StageReview[]
  canDecide: boolean; saving: boolean
  onDecide: (decision: StageReviewDecision, comment: string, details: StageReviewDetails) => void
}) {
  const [comment, setComment] = useState(review?.comment ?? '')
  const [details, setDetails] = useState<StageReviewDetails>(review?.details ?? { finalApprovedAmount: request.proposedChangeAmount, finalApprovedScheduleImpactDays: request.proposedScheduleImpactDays })
  const isActive = request.status === 'ccb_review'
  const decision = review?.decision ?? 'pending'

  return (
    <div className="glass-panel rounded-2xl border-2 p-4" style={{ borderColor: isActive ? '#f0a836' : 'var(--border-soft)' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-bold"><CheckCircle2 size={15} aria-hidden="true" style={{ color: '#f0a836' }} /> کمیته کنترل تغییرات — Change Control Board (CCB)</p>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${STAGE_DECISION_COLOR[decision]} 18%, transparent)`, color: STAGE_DECISION_COLOR[decision] }}>
          {STAGE_DECISION_LABEL_FA[decision]}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[10.5px] sm:grid-cols-6">
        {(['engineering', 'planning', 'contract', 'pm'] as ReviewStage[]).map((s) => {
          const r = reviews.find((x) => x.stage === s)
          return (
            <div key={s} className="rounded-lg border p-2 text-center" style={{ borderColor: 'var(--border-soft)' }}>
              <p className="text-muted">{REVIEW_STAGE_LABEL_FA[s].replace('بررسی ', '')}</p>
              <p className="font-bold" style={{ color: STAGE_DECISION_COLOR[r?.decision ?? 'pending'] }}>{STAGE_DECISION_LABEL_FA[r?.decision ?? 'pending']}</p>
            </div>
          )
        })}
      </div>

      <FieldsContext.Provider value={{ details, onChange: setDetails, readOnly: !isActive || !canDecide }}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TextField k="meetingNumber" label="شماره جلسه" />
          <TextField k="members" label="اعضا" />
          <NumberField k="finalApprovedAmount" label="مبلغ نهایی تصویب" />
          <NumberField k="finalApprovedScheduleImpactDays" label="اثر زمانی نهایی (روز)" />
        </div>
        <div className="mt-2"><TextField k="conditions" label="شروط تصویب" /></div>
      </FieldsContext.Provider>

      {isActive && canDecide && (
        <div className="mt-3">
          <textarea className="input w-full rounded-lg px-3 py-2 text-[12px]" rows={2} placeholder="مصوبه CCB" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button disabled={saving} onClick={() => onDecide('returned', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>عودت جهت بازنگری</button>
            <button disabled={saving} onClick={() => onDecide('rejected', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#ef4444', color: '#ef4444' }}>رد</button>
            <button disabled={saving} onClick={() => onDecide('approved_with_conditions', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#2ecc71', color: '#2ecc71' }}>تایید مشروط</button>
            <button disabled={saving} onClick={() => onDecide('approved', comment, details)} className="rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white" style={{ background: '#2ecc71' }}>تصویب</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change Impact Radar — spec §11
// ---------------------------------------------------------------------------

const RADAR_AXES: { key: 'cost' | 'time' | 'risk' | 'scope'; label: string }[] = [
  { key: 'cost', label: 'COST' }, { key: 'time', label: 'TIME' }, { key: 'risk', label: 'RISK' }, { key: 'scope', label: 'SCOPE' },
]

function ChangeImpactRadar({ impact }: { impact: ReturnType<typeof computeChangeImpact> }) {
  const levelToFrac = (l: ImpactLevel) => ({ low: 0.25, medium: 0.5, high: 0.75, critical: 1 }[l])
  const values: Record<string, number> = {
    cost: Math.min(1, impact.costPercent / 10),
    time: Math.min(1, impact.schedulePercent / 10),
    risk: levelToFrac(impact.riskLevel),
    scope: levelToFrac(impact.scopeLevel),
  }
  const size = 220
  const center = size / 2
  const maxR = size / 2 - 24
  const points = RADAR_AXES.map((a, i) => {
    const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2
    const r = maxR * values[a.key]
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const
  })
  const polygon = points.map((p) => p.join(',')).join(' ')

  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 text-center text-[12px] font-bold text-muted">CHANGE IMPACT RADAR</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <svg width={size} height={size} role="img" aria-label="نمودار راداری اثر تغییر روی هزینه، زمان، ریسک و دامنه">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <circle key={f} cx={center} cy={center} r={maxR * f} fill="none" stroke="var(--border-soft)" strokeWidth={1} />
          ))}
          {RADAR_AXES.map((a, i) => {
            const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2
            const x = center + maxR * Math.cos(angle)
            const y = center + maxR * Math.sin(angle)
            return <line key={a.key} x1={center} y1={center} x2={x} y2={y} stroke="var(--border-soft)" strokeWidth={1} />
          })}
          <polygon points={polygon} fill="color-mix(in srgb, #38bdf8 28%, transparent)" stroke="#38bdf8" strokeWidth={2} />
          {RADAR_AXES.map((a, i) => {
            const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2
            const x = center + (maxR + 16) * Math.cos(angle)
            const y = center + (maxR + 16) * Math.sin(angle)
            return <text key={a.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="var(--text-muted)">{a.label}</text>
          })}
        </svg>
        {/* Text fallback for accessibility — radar charts must not rely on color/shape alone */}
        <ul className="grid w-full max-w-xs grid-cols-2 gap-2 text-[11px] sm:w-auto">
          <li className="rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>Cost: <span className="num font-bold">{pct(impact.costPercent)}</span></li>
          <li className="rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>Time: <span className="num font-bold">{pct(impact.schedulePercent)}</span></li>
          <li className="rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>Risk: <span className="font-bold" style={{ color: IMPACT_LEVEL_COLOR[impact.riskLevel] }}>{IMPACT_LEVEL_LABEL_FA[impact.riskLevel].toUpperCase()}</span></li>
          <li className="rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>Scope: <span className="font-bold" style={{ color: IMPACT_LEVEL_COLOR[impact.scopeLevel] }}>{IMPACT_LEVEL_LABEL_FA[impact.scopeLevel].toUpperCase()}</span></li>
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Documents — spec §12
// ---------------------------------------------------------------------------

function DocumentsPanel({ documents, onAdd }: { documents: ChangeDocument[]; onAdd: (data: { category: DocumentCategory; documentNumber: string; revision: string; fileName: string; fileUrl: string }) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[12px] font-bold text-muted"><FileText size={14} aria-hidden="true" /> مستندات و شواهد</p>
        <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-bold" style={{ color: '#38bdf8' }}>+ افزودن مستند</button>
      </div>
      {open && <NewDocumentForm onAdd={(d) => { onAdd(d); setOpen(false) }} />}
      {documents.length === 0 ? (
        <p className="text-[11px] text-muted">مستندی ثبت نشده است.</p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border p-2 text-[10.5px]" style={{ borderColor: 'var(--border-soft)' }}>
              <span className="min-w-0 truncate">{d.fileName || d.documentNumber || '—'} <span className="text-muted">({d.category})</span></span>
              <span className="num shrink-0 text-muted">Rev {d.revision || '0'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
function NewDocumentForm({ onAdd }: { onAdd: (data: { category: DocumentCategory; documentNumber: string; revision: string; fileName: string; fileUrl: string }) => void }) {
  const [category, setCategory] = useState<DocumentCategory>('technical')
  const [documentNumber, setDocumentNumber] = useState('')
  const [revision, setRevision] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  return (
    <div className="mb-3 rounded-xl border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="grid grid-cols-2 gap-2">
        <select className="input rounded-lg px-2 py-1.5 text-[11px]" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
          {(['contractor_proposal', 'technical', 'drawing', 'boq_mto', 'cost_breakdown', 'schedule_analysis', 'contract', 'correspondence', 'ccb_minutes', 'other'] as DocumentCategory[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input className="input rounded-lg px-2 py-1.5 text-[11px]" placeholder="شماره مدرک" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
        <input className="input rounded-lg px-2 py-1.5 text-[11px]" placeholder="ریویژن" value={revision} onChange={(e) => setRevision(e.target.value)} />
        <input className="input rounded-lg px-2 py-1.5 text-[11px]" placeholder="نام فایل" value={fileName} onChange={(e) => setFileName(e.target.value)} />
      </div>
      <input className="input mt-2 w-full rounded-lg px-2 py-1.5 text-[11px]" placeholder="لینک مدرک (اختیاری)" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <button onClick={() => onAdd({ category, documentNumber, revision, fileName, fileUrl })} className="rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white" style={{ background: '#38bdf8' }}>ثبت</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change History — spec §13
// ---------------------------------------------------------------------------

function HistoryPanel({ history }: { history: ChangeHistoryEntry[] }) {
  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 text-[12px] font-bold text-muted">Change History</p>
      {history.length === 0 ? (
        <p className="text-[11px] text-muted">فعالیتی ثبت نشده است.</p>
      ) : (
        <ol className="relative space-y-3 border-e pe-3" style={{ borderColor: 'var(--border-soft)' }}>
          {history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -end-[18px] top-1 h-2 w-2 rounded-full" style={{ background: '#38bdf8' }} />
              <p className="num text-[10px] text-muted">{formatJalali(h.createdAt.slice(0, 10))} — {h.createdAt.slice(11, 16)}</p>
              <p className="text-[11.5px] font-bold">{h.action}</p>
              <p className="text-[10.5px] text-muted">{h.roleLabel}</p>
              {h.comment && <p className="text-[10.5px] text-secondary">«{h.comment}»</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
