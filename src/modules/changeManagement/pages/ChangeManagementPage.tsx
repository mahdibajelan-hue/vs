import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  ArrowRight, BarChart3, Check, CheckCircle2, ClipboardList, Download, FileText, Flag, Gauge,
  HardHat, ListChecks, Package, Pencil, Plus, ShieldAlert, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react'
import { formatJalali, todayJalali } from '../../../lib/jalali'
import { exportElementToPdf } from '../../../lib/export'
import { useAuthStore } from '../../../store/useAuthStore'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useChangeStore } from '../store/useChangeStore'
import { fetchCurrentContractValue } from '../lib/changeContract'
import { ChangeRequestPrintReport } from '../components/ChangeRequestPrintReport'
import { ChangeReportsPage } from './ChangeReportsPage'
import {
  computeChangeImpact, computeCostBreakdown, contractChangePercent, newContractAmount, newProjectDuration, scheduleChangePercent,
} from '../lib/changeCalc'
import {
  CHANGE_PRIORITY_LABEL_FA, CHANGE_REASON_CATEGORY_LABEL_FA, CHANGE_ROLE_NAME, CHANGE_STATUS_COLOR,
  CHANGE_STATUS_LABEL_FA, CHANGE_TYPE_TAG_LABEL_FA, CLOSEOUT_DOCUMENT_TYPE_LABEL_FA,
  CONSTRUCTION_IMPACT_TYPE_LABEL_FA, CONTRACTOR_FAULT_STATUS_LABEL_FA, CONTRACTUAL_CLASSIFICATION_LABEL_FA,
  COST_RESPONSIBLE_PARTY_LABEL_FA, ENGINEERING_IMPACT_ITEM_LABEL_FA, HSE_IMPACT_TYPE_LABEL_FA,
  HSE_QAQC_VERDICT_LABEL_FA, IMPACT_LEVEL_COLOR, IMPACT_LEVEL_LABEL_FA, IMPACT_MATRIX_LEVEL_LABEL_FA,
  PROCUREMENT_STATUS_LABEL_FA, PROJECT_PHASE_LABEL_FA, QUALITY_IMPACT_TYPE_LABEL_FA,
  REQUESTER_ORGANIZATION_LABEL_FA, REVIEW_STAGE_LABEL_FA, REVIEW_STAGE_ROLE_NAME, RISK_LIKERT_LABEL_FA,
  SCHEDULE_ANALYSIS_RESULT_LABEL_FA, SCOPE_CHANGE_TYPE_LABEL_FA, STAGE_DECISION_COLOR,
  STAGE_DECISION_LABEL_FA, TIMELINE_STAGES,
  type AffectedDocument, type ChangeDocument, type ChangeHistoryEntry, type ChangePriority,
  type ChangeReasonCategory, type ChangeRequest, type ChangeStatus, type ChangeTypeTag,
  type CloseoutDocumentType, type ConstructionImpactType, type ContractorFaultStatus,
  type ContractualClassification, type CostResponsibleParty, type DocumentCategory,
  type EngineeringImpactItem, type HseImpactType, type HseQaqcVerdict, type IdentifiedChangeRisk,
  type ImpactLevel, type ImpactMatrixLevel, type ImplementationAction, type ImplementationActionStatus,
  type ProcurementStatus, type ProjectPhase, type QualityImpactType, type RequesterOrganization,
  type ReviewStage, type RiskLikertLevel, type ScheduleAnalysisResult, type ScopeChangeType,
  type StageReview, type StageReviewDecision, type StageReviewDetails,
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
  const [reportsOpen, setReportsOpen] = useState(false)
  const requests = useChangeStore((s) => s.requests)

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

  if (reportsOpen) {
    return <ChangeReportsPage masterProjectId={masterProjectId} projectName={projectName} requests={requests} onBack={() => setReportsOpen(false)} />
  }
  if (selectedId) {
    return <ChangeRequestDetail masterProjectId={masterProjectId} projectName={projectName} changeRequestId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <ChangeRequestList masterProjectId={masterProjectId} projectName={projectName} onBack={onBack} onSelect={setSelectedId} onOpenReports={() => setReportsOpen(true)} />
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ChangeRequestList({ masterProjectId, projectName, onBack, onSelect, onOpenReports }: {
  masterProjectId: string; projectName: string; onBack: () => void; onSelect: (id: string) => void; onOpenReports: () => void
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
    <div className="chg-scope min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
            <ArrowRight size={16} />
          </button>
          <div className="leading-tight">
            <p className="chg-title-gradient text-base font-extrabold tracking-wide">مدیریت تغییرات</p>
            <p className="text-[10px] font-bold tracking-wide text-muted">EPC CHANGE REQUEST &amp; CHANGE CONTROL</p>
            <p className="text-[11px] text-muted">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenReports}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold hover:bg-white/5"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--chg-accent)' }}
          >
            <BarChart3 size={14} /> گزارش‌ها
          </button>
          {isContractor && (
            <button
              onClick={() => setFormOpen(true)}
              className="chg-primary-btn flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold text-white"
            >
              <Plus size={14} /> درخواست تغییر جدید
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {formOpen && (
          <ChangeDraftForm
            contractValue={contractValue}
            submitLabel="ذخیره پیش‌نویس"
            onCancel={() => setFormOpen(false)}
            onSubmit={async (data) => {
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
          {requests.map((r) => (
            <ChangeRequestRow key={r.id} request={r} onSelect={() => onSelect(r.id)} />
          ))}
        </div>

        {requests.length > 0 && <ChangeListTotals requests={requests} />}
      </main>
    </div>
  )
}

function ChangeRequestRow({ request: r, onSelect }: { request: ChangeRequest; onSelect: () => void }) {
  const isAdmin = useAuthStore((s) => s.currentUser()?.isAdmin) ?? false
  const deleteChangeRequest = useChangeStore((s) => s.deleteChangeRequest)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const impact = computeChangeImpact(r)
  return (
    <div className="chg-card glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-right">
        <span className="num shrink-0 text-[11px] font-bold text-muted">{r.crNumber}</span>
        <span className="min-w-0 truncate text-[13px] font-bold">{r.title || 'بدون عنوان'}</span>
      </button>
      <div className="flex items-center gap-3">
        <span className="num text-[11px]" style={{ color: IMPACT_LEVEL_COLOR[impact.overallSeverity] }}>{IMPACT_LEVEL_LABEL_FA[impact.overallSeverity]}</span>
        <StatusPill color={CHANGE_STATUS_COLOR[r.status]} label={CHANGE_STATUS_LABEL_FA[r.status]} />
        {isAdmin && (
          confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <button onClick={() => deleteChangeRequest(r)} className="text-[10.5px] font-bold text-red-400 hover:underline">تایید حذف</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10.5px] text-muted hover:underline">انصراف</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="حذف" className="text-muted hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          )
        )}
      </div>
    </div>
  )
}

function ChangeListTotals({ requests }: { requests: ChangeRequest[] }) {
  const active = requests.filter((r) => r.status !== 'rejected')
  const totalCost = active.reduce((sum, r) => sum + (r.approvedChangeAmount ?? r.proposedChangeAmount), 0)
  const totalDays = active.reduce((sum, r) => sum + (r.approvedScheduleImpactDays ?? r.proposedScheduleImpactDays), 0)
  const currency = requests[0]?.currency || 'IRR'
  return (
    <div className="chg-card glass-panel mt-3 grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-3" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="text-center">
        <p className="text-[9.5px] text-muted">تعداد کل تغییرات</p>
        <p className="num text-lg font-extrabold" style={{ color: 'var(--chg-accent)' }}>{requests.length}</p>
      </div>
      <div className="text-center">
        <p className="text-[9.5px] text-muted">مجموع اثر مالی (بدون موارد رد شده)</p>
        <p className="num text-lg font-extrabold" style={{ color: totalCost >= 0 ? '#ef4444' : '#2ecc71' }}>{money(totalCost, currency)}</p>
      </div>
      <div className="text-center">
        <p className="text-[9.5px] text-muted">مجموع اثر زمانی (بدون موارد رد شده)</p>
        <p className="num text-lg font-extrabold" style={{ color: totalDays >= 0 ? '#ef4444' : '#2ecc71' }}>{totalDays > 0 ? '+' : ''}{totalDays} روز</p>
      </div>
    </div>
  )
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="chg-status-pill rounded-full px-2.5 py-1 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color, ['--pill-color' as string]: color }}
    >
      {label}
    </span>
  )
}

function ChangeDraftForm({ contractValue, initial, submitLabel, onCancel, onSubmit }: {
  contractValue: number | null
  initial?: ChangeRequest
  submitLabel: string
  onCancel: () => void
  onSubmit: (data: {
    title: string; description: string; reasonForChange: string; priority: ChangePriority
    currency: string; originalContractAmount: number; proposedChangeAmount: number
    originalDurationDays: number; proposedScheduleImpactDays: number
    newRisksCount: number; scopeImpactLevel: ImpactLevel
    projectCode: string; contractName: string; contractNumber: string; contractDate: string
    projectPhase: ProjectPhase | null; requesterName: string; requesterOrganization: RequesterOrganization | null
    changeTypes: ChangeTypeTag[]; currentSituationDescription: string
    changeReasonCategories: ChangeReasonCategory[]; changeReasonOther: string
    affectedDocuments: AffectedDocument[]; scopeChangeType: ScopeChangeType | null; scopeEffectDescription: string
  }) => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [reasonForChange, setReasonForChange] = useState(initial?.reasonForChange ?? '')
  const [priority, setPriority] = useState<ChangePriority>(initial?.priority ?? 'medium')
  const [proposedChangeAmount, setProposedChangeAmount] = useState(initial?.proposedChangeAmount ?? 0)
  const [originalDurationDays, setOriginalDurationDays] = useState(initial?.originalDurationDays ?? 540)
  const [proposedScheduleImpactDays, setProposedScheduleImpactDays] = useState(initial?.proposedScheduleImpactDays ?? 0)
  const [newRisksCount, setNewRisksCount] = useState(initial?.newRisksCount ?? 0)
  const [scopeImpactLevel, setScopeImpactLevel] = useState<ImpactLevel>(initial?.scopeImpactLevel ?? 'medium')

  const [projectCode, setProjectCode] = useState(initial?.projectCode ?? '')
  const [contractName, setContractName] = useState(initial?.contractName ?? '')
  const [contractNumber, setContractNumber] = useState(initial?.contractNumber ?? '')
  const [contractDate, setContractDate] = useState(initial?.contractDate ?? '')
  const [projectPhase, setProjectPhase] = useState<ProjectPhase | ''>(initial?.projectPhase ?? '')
  const [requesterName, setRequesterName] = useState(initial?.requesterName ?? '')
  const [requesterOrganization, setRequesterOrganization] = useState<RequesterOrganization | ''>(initial?.requesterOrganization ?? '')
  const [changeTypes, setChangeTypes] = useState<ChangeTypeTag[]>(initial?.changeTypes ?? [])

  const [currentSituationDescription, setCurrentSituationDescription] = useState(initial?.currentSituationDescription ?? '')
  const [changeReasonCategories, setChangeReasonCategories] = useState<ChangeReasonCategory[]>(initial?.changeReasonCategories ?? [])
  const [changeReasonOther, setChangeReasonOther] = useState(initial?.changeReasonOther ?? '')
  const [affectedDocuments, setAffectedDocuments] = useState<AffectedDocument[]>(initial?.affectedDocuments ?? [])

  const [scopeChangeType, setScopeChangeType] = useState<ScopeChangeType | ''>(initial?.scopeChangeType ?? '')
  const [scopeEffectDescription, setScopeEffectDescription] = useState(initial?.scopeEffectDescription ?? '')

  // Editing a draft keeps its own snapshotted contract amount rather than re-deriving from the
  // contract's current value, which may have moved since the request was first created.
  const originalContractAmount = initial ? initial.originalContractAmount : (contractValue ?? 0)
  const costPct = originalContractAmount > 0 ? (proposedChangeAmount / originalContractAmount) * 100 : 0
  const schedulePct = originalDurationDays > 0 ? (proposedScheduleImpactDays / originalDurationDays) * 100 : 0

  const toggleChangeType = (t: ChangeTypeTag) => setChangeTypes((cur) => (cur.includes(t) ? cur.filter((c) => c !== t) : [...cur, t]))
  const toggleReasonCategory = (c: ChangeReasonCategory) => setChangeReasonCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))

  return (
    <div className="chg-card glass-panel mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[13px] font-bold">
        <Sparkles size={14} style={{ color: 'var(--chg-accent)' }} /> اطلاعات و پیشنهاد پیمانکار — Contractor Change Proposal
      </p>

      {/* Section 1 — general/contract identification */}
      <p className="mb-2 flex items-center gap-2 text-[10.5px] font-bold tracking-wide text-muted"><span className="chg-icon-badge"><ClipboardList size={13} /></span> اطلاعات عمومی</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className="input rounded-lg px-3 py-2 text-[12px]" placeholder="کد پروژه" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} />
        <input className="input rounded-lg px-3 py-2 text-[12px]" placeholder="نام قرارداد" value={contractName} onChange={(e) => setContractName(e.target.value)} />
        <input className="input rounded-lg px-3 py-2 text-[12px]" placeholder="شماره قرارداد" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className="input num rounded-lg px-3 py-2 text-[12px]" placeholder="تاریخ قرارداد (1405/06/10)" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
        <select className="input rounded-lg px-3 py-2 text-[12px]" value={projectPhase} onChange={(e) => setProjectPhase(e.target.value as ProjectPhase)}>
          <option value="">فاز پروژه...</option>
          {(Object.keys(PROJECT_PHASE_LABEL_FA) as ProjectPhase[]).map((p) => <option key={p} value={p}>{PROJECT_PHASE_LABEL_FA[p]}</option>)}
        </select>
        <input className="input rounded-lg px-3 py-2 text-[12px]" placeholder="نام درخواست‌کننده" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} />
        <select className="input rounded-lg px-3 py-2 text-[12px]" value={requesterOrganization} onChange={(e) => setRequesterOrganization(e.target.value as RequesterOrganization)}>
          <option value="">سمت / سازمان...</option>
          {(Object.keys(REQUESTER_ORGANIZATION_LABEL_FA) as RequesterOrganization[]).map((o) => <option key={o} value={o}>{REQUESTER_ORGANIZATION_LABEL_FA[o]}</option>)}
        </select>
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[10.5px] text-muted">نوع تغییر</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {(Object.keys(CHANGE_TYPE_TAG_LABEL_FA) as ChangeTypeTag[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[11px] text-secondary">
              <input type="checkbox" checked={changeTypes.includes(t)} onChange={() => toggleChangeType(t)} /> {CHANGE_TYPE_TAG_LABEL_FA[t]}
            </label>
          ))}
        </div>
      </div>

      {/* Section 2 — description */}
      <p className="mb-2 mt-4 flex items-center gap-2 text-[10.5px] font-bold tracking-wide text-muted"><span className="chg-icon-badge"><FileText size={13} /></span> شرح تغییر پیشنهادی</p>
      <textarea className="input w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="شرح وضعیت موجود" value={currentSituationDescription} onChange={(e) => setCurrentSituationDescription(e.target.value)} />
      <textarea className="input mt-2 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="شرح تغییر پیشنهادی (Change Description)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="mt-2">
        <p className="mb-1 text-[10.5px] text-muted">دلیل و ضرورت ایجاد تغییر</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {(Object.keys(CHANGE_REASON_CATEGORY_LABEL_FA) as ChangeReasonCategory[]).map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[11px] text-secondary">
              <input type="checkbox" checked={changeReasonCategories.includes(c)} onChange={() => toggleReasonCategory(c)} /> {CHANGE_REASON_CATEGORY_LABEL_FA[c]}
            </label>
          ))}
        </div>
        {changeReasonCategories.includes('other') && (
          <input className="input mt-1.5 w-full rounded-lg px-3 py-1.5 text-[11.5px]" placeholder="سایر — توضیح دهید" value={changeReasonOther} onChange={(e) => setChangeReasonOther(e.target.value)} />
        )}
      </div>
      <textarea className="input mt-2 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="توضیح تکمیلی دلیل تغییر" value={reasonForChange} onChange={(e) => setReasonForChange(e.target.value)} />

      <div className="mt-3">
        <p className="mb-1.5 text-[10.5px] text-muted">اسناد، نقشه‌ها و مشخصات تحت تأثیر</p>
        <AffectedDocumentsEditor value={affectedDocuments} onChange={setAffectedDocuments} />
      </div>

      {/* Section 3-1 — scope impact */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select className="input rounded-lg px-3 py-2 text-[12px]" value={scopeChangeType} onChange={(e) => setScopeChangeType(e.target.value as ScopeChangeType)}>
          <option value="">اثر بر محدوده کار (Scope)...</option>
          {(Object.keys(SCOPE_CHANGE_TYPE_LABEL_FA) as ScopeChangeType[]).map((s) => <option key={s} value={s}>{SCOPE_CHANGE_TYPE_LABEL_FA[s]}</option>)}
        </select>
        <input className="input rounded-lg px-3 py-2 text-[12px]" placeholder="شرح اثر بر محدوده" value={scopeEffectDescription} onChange={(e) => setScopeEffectDescription(e.target.value)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input rounded-lg px-3 py-2 text-sm" placeholder="عنوان تغییر" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input rounded-lg px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as ChangePriority)}>
          {(['low', 'medium', 'high', 'critical'] as ChangePriority[]).map((p) => (
            <option key={p} value={p}>{CHANGE_PRIORITY_LABEL_FA[p]}</option>
          ))}
        </select>
      </div>

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
          شدت اثر بر دامنه (Scope)
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
          onClick={() => onSubmit({
            title, description, reasonForChange, priority, currency: initial?.currency ?? 'IRR',
            originalContractAmount, proposedChangeAmount, originalDurationDays, proposedScheduleImpactDays,
            newRisksCount, scopeImpactLevel,
            projectCode, contractName, contractNumber, contractDate,
            projectPhase: projectPhase || null, requesterName, requesterOrganization: requesterOrganization || null,
            changeTypes, currentSituationDescription, changeReasonCategories, changeReasonOther,
            affectedDocuments, scopeChangeType: scopeChangeType || null, scopeEffectDescription,
          })}
          className="chg-primary-btn rounded-xl px-4 py-2 text-[12px] font-bold text-white"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

function AffectedDocumentsEditor({ value, onChange, readOnly }: { value: AffectedDocument[]; onChange?: (v: AffectedDocument[]) => void; readOnly?: boolean }) {
  const addRow = () => onChange?.([...value, { docNumber: '', title: '', currentRevision: '', proposedRevision: '' }])
  const update = (i: number, patch: Partial<AffectedDocument>) => onChange?.(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange?.(value.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-1.5">
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1.3fr_1.3fr_0.8fr_0.8fr_auto] gap-1.5">
          <input className="input rounded-lg px-2 py-1 text-[10.5px]" placeholder="شماره مدرک/نقشه" disabled={readOnly} value={row.docNumber} onChange={(e) => update(i, { docNumber: e.target.value })} />
          <input className="input rounded-lg px-2 py-1 text-[10.5px]" placeholder="عنوان" disabled={readOnly} value={row.title} onChange={(e) => update(i, { title: e.target.value })} />
          <input className="input num rounded-lg px-2 py-1 text-[10.5px]" placeholder="Rev فعلی" disabled={readOnly} value={row.currentRevision} onChange={(e) => update(i, { currentRevision: e.target.value })} />
          <input className="input num rounded-lg px-2 py-1 text-[10.5px]" placeholder="Rev پیشنهادی" disabled={readOnly} value={row.proposedRevision} onChange={(e) => update(i, { proposedRevision: e.target.value })} />
          {!readOnly && <button type="button" onClick={() => remove(i)} className="text-muted hover:text-red-400"><X size={13} /></button>}
        </div>
      ))}
      {!readOnly && <button type="button" onClick={addRow} className="text-[10.5px] font-bold" style={{ color: 'var(--chg-accent)' }}>+ افزودن ردیف</button>}
      {value.length === 0 && readOnly && <p className="text-[10.5px] text-muted">موردی ثبت نشده است.</p>}
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
  const updateDraft = useChangeStore((s) => s.updateDraft)
  const deleteChangeRequest = useChangeStore((s) => s.deleteChangeRequest)
  const saveStageReview = useChangeStore((s) => s.saveStageReview)
  const addDocument = useChangeStore((s) => s.addDocument)
  const updateRiskRegister = useChangeStore((s) => s.updateRiskRegister)
  const startImplementation = useChangeStore((s) => s.startImplementation)
  const updateImplementationActions = useChangeStore((s) => s.updateImplementationActions)
  const completeImplementation = useChangeStore((s) => s.completeImplementation)
  const finalizeCloseout = useChangeStore((s) => s.finalizeCloseout)
  const saving = useChangeStore((s) => s.saving)
  const fetchAccessAll = useAccessStore((s) => s.fetchAll)
  const currentUser = useAuthStore((s) => s.currentUser())

  const [expandedStage, setExpandedStage] = useState<ChangeStatus | null>(null)
  const [editingDraft, setEditingDraft] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isAdmin = useAuthStore((s) => s.currentUser()?.isAdmin) ?? false
  const printRef = useRef<HTMLDivElement>(null)

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
  const isExecutor = useHasProjectRole(masterProjectId, CHANGE_ROLE_NAME.executor)

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
  const canEditRiskRegister = (isContractor || isEngineering || isPlanning || isContract || isPm || isCcb) && request.status !== 'closed' && request.status !== 'rejected'

  return (
    <div className="chg-scope min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      {/* Header — spec §2 */}
      <header className="border-b px-4 py-4 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
              <ArrowRight size={16} />
            </button>
            <div className="leading-tight">
              <p className="chg-title-gradient text-lg font-extrabold tracking-wide">مدیریت تغییرات</p>
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => printRef.current && exportElementToPdf(printRef.current, `${request.crNumber}.pdf`, { backgroundColor: '#ffffff' })}
              title="دانلود گزارش PDF"
              className="flex h-10 w-10 items-center justify-center rounded-xl border text-muted hover:border-brand-400/40 hover:text-brand-400 transition-colors"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <Download size={15} />
            </button>
            {isAdmin && (
              confirmDelete ? (
                <span className="flex items-center gap-1.5 rounded-lg border border-red-400/40 px-2 py-1.5">
                  <span className="text-[11px] text-red-400">حذف این درخواست؟</span>
                  <button onClick={() => deleteChangeRequest(request).then(onBack)} className="text-[11px] font-bold text-red-400 hover:underline">تایید</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-muted hover:underline">انصراف</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(true)} title="حذف این درخواست" className="flex h-10 w-10 items-center justify-center rounded-xl border text-muted hover:border-red-400/40 hover:text-red-400 transition-colors" style={{ borderColor: 'var(--border-soft)' }}>
                  <Trash2 size={15} />
                </button>
              )
            )}
          </div>
        </div>
        <p className="mt-3 text-[15px] font-bold">{request.title}</p>
      </header>

      <div className="comp-print-offscreen" aria-hidden="true">
        <div ref={printRef}>
          <ChangeRequestPrintReport request={request} reviews={reviews} documents={documents} history={history} projectName={projectName} />
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {editingDraft && (
          <ChangeDraftForm
            contractValue={request.originalContractAmount}
            initial={request}
            submitLabel="ذخیره تغییرات"
            onCancel={() => setEditingDraft(false)}
            onSubmit={async (data) => {
              await updateDraft(request, data, currentUser?.id ?? null)
              setEditingDraft(false)
            }}
          />
        )}

        {/* Approval timeline — spec §3 */}
        <ApprovalTimeline request={request} reviews={reviews} expanded={expandedStage} onToggle={setExpandedStage} />

        {/* Executive impact summary — spec §4 */}
        <ImpactSummary request={request} impact={impact} />

        {/* General info & classification — Word form §1 */}
        <GeneralInfoCard request={request} />

        {/* Contractor proposal — spec §5, plus Word form §2/§3-1 */}
        <ContractorProposalCard
          request={request} isContractor={isContractor} saving={saving}
          onSubmit={() => submitDraft(request, currentUser?.id ?? null)}
          onEdit={() => setEditingDraft(true)}
        />

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

        {/* Change-level risk register — Word form §6 */}
        <RiskRegisterCard request={request} canEdit={canEditRiskRegister} saving={saving}
          onSave={(risks, needsRisk, needsIssue) => updateRiskRegister(request, risks, needsRisk, needsIssue, currentUser?.id ?? null)}
        />

        {/* CCB — spec §10 */}
        <CcbCard request={request} review={reviewByStage('ccb')} reviews={reviews} canDecide={isCcb && !isOwnRequest} saving={saving}
          onDecide={(decision, comment, details) => saveStageReview(request, 'ccb', decision, comment, details, currentUser?.id ?? null, REVIEW_STAGE_ROLE_NAME.ccb)}
        />

        {/* Implementation action plan — Word form §10 */}
        {(request.status === 'approved' || request.status === 'implementation' || request.status === 'verification' || request.status === 'closed') && (
          <ImplementationSection
            request={request} canAct={isExecutor || isPm} saving={saving}
            onStart={() => startImplementation(request, currentUser?.id ?? null)}
            onSave={(actions) => updateImplementationActions(request, actions)}
            onComplete={() => completeImplementation(request, currentUser?.id ?? null)}
          />
        )}

        {/* Closeout — Word form §11 */}
        {(request.status === 'verification' || request.status === 'closed') && (
          <CloseoutPanel request={request} canEdit={isPm && request.status === 'verification'} saving={saving}
            onFinalize={(data) => finalizeCloseout(request, data, currentUser?.id ?? null)}
          />
        )}

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
// General info & classification — Word form §1
// ---------------------------------------------------------------------------

function GeneralInfoCard({ request }: { request: ChangeRequest }) {
  const hasAny = request.projectCode || request.contractName || request.contractNumber || request.projectPhase || request.requesterName || request.requesterOrganization || request.changeTypes.length > 0
  if (!hasAny) return null
  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-muted"><span className="chg-icon-badge"><ClipboardList size={13} /></span> اطلاعات عمومی تغییر</p>
      <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
        {request.projectCode && <Field label="کد پروژه" value={request.projectCode} mono />}
        {request.contractName && <Field label="نام قرارداد" value={request.contractName} />}
        {request.contractNumber && <Field label="شماره/تاریخ قرارداد" value={request.contractNumber} mono />}
        {request.projectPhase && <Field label="فاز پروژه" value={PROJECT_PHASE_LABEL_FA[request.projectPhase]} />}
        {request.requesterName && <Field label="درخواست‌کننده" value={request.requesterName} />}
        {request.requesterOrganization && <Field label="سمت / سازمان" value={REQUESTER_ORGANIZATION_LABEL_FA[request.requesterOrganization]} />}
      </div>
      {request.changeTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {request.changeTypes.map((t) => (
            <span key={t} className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: 'var(--chg-accent-soft)', color: 'var(--chg-accent)' }}>{CHANGE_TYPE_TAG_LABEL_FA[t]}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[9.5px] text-muted">{label}</p>
      <p className={mono ? 'num text-[11.5px] font-bold' : 'text-[11.5px] font-bold'}>{value}</p>
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
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
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
    <div className="chg-card glass-panel rounded-2xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
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

function ContractorProposalCard({ request, isContractor, saving, onSubmit, onEdit }: {
  request: ChangeRequest; isContractor: boolean; saving: boolean; onSubmit: () => void; onEdit: () => void
}) {
  const costPct = contractChangePercent(request)
  const schedulePct = scheduleChangePercent(request)
  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-bold text-muted">اطلاعات و پیشنهاد پیمانکار — Contractor Change Proposal</p>
        {request.status === 'draft' && isContractor && (
          <button onClick={onEdit} className="flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color: 'var(--chg-accent)' }}>
            <Pencil size={12} /> ویرایش
          </button>
        )}
      </div>
      {request.currentSituationDescription && <p className="mb-2 text-[11px] text-muted">وضعیت موجود: {request.currentSituationDescription}</p>}
      <p className="mb-3 text-[12px] text-secondary">{request.description || '—'}</p>
      {request.reasonForChange && <p className="mb-2 text-[11px] text-muted">دلیل: {request.reasonForChange}</p>}
      {request.changeReasonCategories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {request.changeReasonCategories.map((c) => (
            <span key={c} className="rounded-full border px-2 py-0.5 text-[9.5px] text-muted" style={{ borderColor: 'var(--border-soft)' }}>
              {c === 'other' && request.changeReasonOther ? request.changeReasonOther : CHANGE_REASON_CATEGORY_LABEL_FA[c]}
            </span>
          ))}
        </div>
      )}
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
      {(request.scopeChangeType || request.affectedDocuments.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {request.scopeChangeType && (
            <div className="rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
              <p className="mb-1 text-[10px] font-bold tracking-wide text-muted">اثر بر محدوده کار</p>
              <p className="font-bold">{SCOPE_CHANGE_TYPE_LABEL_FA[request.scopeChangeType]}</p>
              {request.scopeEffectDescription && <p className="mt-1 text-muted">{request.scopeEffectDescription}</p>}
            </div>
          )}
          {request.affectedDocuments.length > 0 && (
            <div className="rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
              <p className="mb-1.5 text-[10px] font-bold tracking-wide text-muted">اسناد تحت تأثیر</p>
              <ul className="space-y-1 text-[10.5px] text-muted">
                {request.affectedDocuments.map((d, i) => (
                  <li key={i}>{d.docNumber || '—'} — {d.title || '—'} <span className="num">(Rev {d.currentRevision || '0'} → {d.proposedRevision || '0'})</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {request.status === 'draft' && isContractor && (
        <div className="mt-4 flex justify-end">
          <button disabled={saving} onClick={onSubmit} className="chg-primary-btn rounded-xl px-4 py-2 text-[12px] font-bold text-white">
            ثبت و ارسال برای بررسی مهندسی
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change-level risk register — Word form §6
// ---------------------------------------------------------------------------

function RiskRegisterCard({ request, canEdit, saving, onSave }: {
  request: ChangeRequest; canEdit: boolean; saving: boolean
  onSave: (risks: IdentifiedChangeRisk[], requiresNewRiskRegisterEntry: boolean, createsNewIssue: boolean) => void
}) {
  const [risks, setRisks] = useState<IdentifiedChangeRisk[]>(request.identifiedRisks)
  const [requiresNewRiskRegisterEntry, setRequiresNewRiskRegisterEntry] = useState(request.requiresNewRiskRegisterEntry)
  const [createsNewIssue, setCreatesNewIssue] = useState(request.createsNewIssue)
  const [dirty, setDirty] = useState(false)

  const addRow = () => { setRisks((r) => [...r, { description: '', probability: 'medium', impact: 'medium', controlAction: '' }]); setDirty(true) }
  const update = (i: number, patch: Partial<IdentifiedChangeRisk>) => { setRisks((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x))); setDirty(true) }
  const remove = (i: number) => { setRisks((r) => r.filter((_, idx) => idx !== i)); setDirty(true) }
  const levels: RiskLikertLevel[] = ['low', 'medium', 'high']

  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-muted"><span className="chg-icon-badge"><ShieldAlert size={13} /></span> تحلیل ریسک تغییر</p>
      <div className="space-y-2">
        {risks.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.6fr_0.7fr_0.7fr_1.2fr_auto]">
            <input className="input rounded-lg px-2 py-1.5 text-[10.5px]" placeholder="شرح ریسک" disabled={!canEdit} value={row.description} onChange={(e) => update(i, { description: e.target.value })} />
            <select className="input rounded-lg px-2 py-1.5 text-[10.5px]" disabled={!canEdit} value={row.probability} onChange={(e) => update(i, { probability: e.target.value as RiskLikertLevel })}>
              {levels.map((l) => <option key={l} value={l}>احتمال: {RISK_LIKERT_LABEL_FA[l]}</option>)}
            </select>
            <select className="input rounded-lg px-2 py-1.5 text-[10.5px]" disabled={!canEdit} value={row.impact} onChange={(e) => update(i, { impact: e.target.value as RiskLikertLevel })}>
              {levels.map((l) => <option key={l} value={l}>اثر: {RISK_LIKERT_LABEL_FA[l]}</option>)}
            </select>
            <input className="input rounded-lg px-2 py-1.5 text-[10.5px]" placeholder="اقدام کنترلی" disabled={!canEdit} value={row.controlAction} onChange={(e) => update(i, { controlAction: e.target.value })} />
            {canEdit && <button type="button" onClick={() => remove(i)} className="text-muted hover:text-red-400"><X size={13} /></button>}
          </div>
        ))}
        {risks.length === 0 && <p className="text-[10.5px] text-muted">ریسکی ثبت نشده است.</p>}
        {canEdit && <button type="button" onClick={addRow} className="text-[10.5px] font-bold" style={{ color: 'var(--chg-accent)' }}>+ افزودن ریسک</button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-[10.5px] text-muted">
          <input type="checkbox" disabled={!canEdit} checked={requiresNewRiskRegisterEntry} onChange={(e) => { setRequiresNewRiskRegisterEntry(e.target.checked); setDirty(true) }} />
          نیازمند ثبت ریسک جدید در Risk Register
        </label>
        <label className="flex items-center gap-2 text-[10.5px] text-muted">
          <input type="checkbox" disabled={!canEdit} checked={createsNewIssue} onChange={(e) => { setCreatesNewIssue(e.target.checked); setDirty(true) }} />
          ایجاد Issue جدید
        </label>
      </div>
      {canEdit && dirty && (
        <div className="mt-3 flex justify-end">
          <button disabled={saving} onClick={() => { onSave(risks, requiresNewRiskRegisterEntry, createsNewIssue); setDirty(false) }} className="chg-primary-btn rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white">
            ذخیره ریسک‌ها
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
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)', opacity: locked ? 0.55 : 1 }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold">{REVIEW_STAGE_LABEL_FA[stage]}</p>
        <StatusPill color={STAGE_DECISION_COLOR[decision]} label={STAGE_DECISION_LABEL_FA[decision]} />
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
            <button disabled={saving} onClick={() => onDecide('request_revision', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#f0a836', color: '#f0a836' }}>بازگشت به مرحله قبل</button>
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

function SelectField<T extends string>({ k, label, options, labels, placeholder }: {
  k: keyof StageReviewDetails; label: string; options: readonly T[]; labels: Record<T, string>; placeholder?: string
}) {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  const value = (details[k] as T | undefined) ?? ''
  return (
    <label className="block text-[10.5px] text-muted">
      {label}
      <select
        className="input mt-1 w-full rounded-lg px-2.5 py-1.5 text-[11.5px]"
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange({ ...details, [k]: e.target.value || undefined })}
      >
        <option value="">{placeholder ?? '—'}</option>
        {options.map((opt) => <option key={opt} value={opt}>{labels[opt]}</option>)}
      </select>
    </label>
  )
}

function CheckboxGroupField<T extends string>({ k, label, options, labels }: {
  k: keyof StageReviewDetails; label: string; options: readonly T[]; labels: Record<T, string>
}) {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  const current = (details[k] as T[] | undefined) ?? []
  const toggle = (opt: T) => onChange({ ...details, [k]: current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt] })
  return (
    <div className="text-[10.5px] text-muted">
      <p className="mb-1">{label}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5">
            <input type="checkbox" disabled={readOnly} checked={current.includes(opt)} onChange={() => toggle(opt)} />
            {labels[opt]}
          </label>
        ))}
      </div>
    </div>
  )
}

const ENGINEERING_IMPACT_ITEMS: EngineeringImpactItem[] = ['basicDesign', 'detailedDesign', 'drawings', 'datasheet', 'specifications', 'pidPfd', 'hazopHse']
const IMPACT_MATRIX_LEVELS: ImpactMatrixLevel[] = ['none', 'low', 'medium', 'high']

function ImpactMatrixField() {
  const { details, onChange, readOnly } = useContext(FieldsContext)
  const matrix = details.impactMatrix ?? {}
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-[10.5px] text-muted">اثر بر مهندسی و طراحی</p>
      <table className="w-full text-[9.5px]">
        <thead>
          <tr className="text-muted">
            <th className="text-right font-normal">موضوع</th>
            {IMPACT_MATRIX_LEVELS.map((l) => <th key={l} className="px-1 font-normal">{IMPACT_MATRIX_LEVEL_LABEL_FA[l]}</th>)}
          </tr>
        </thead>
        <tbody>
          {ENGINEERING_IMPACT_ITEMS.map((item) => (
            <tr key={item} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
              <td className="py-1">{ENGINEERING_IMPACT_ITEM_LABEL_FA[item]}</td>
              {IMPACT_MATRIX_LEVELS.map((l) => (
                <td key={l} className="text-center">
                  <input
                    type="radio" disabled={readOnly} name={`chg-impact-${item}`} checked={(matrix[item] ?? 'none') === l}
                    onChange={() => onChange({ ...details, impactMatrix: { ...matrix, [item]: l } })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <ImpactMatrixField />

      <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-bold text-muted"><Package size={12} /> اثر بر تأمین کالا و تجهیزات</p>
      <TextField k="procurementItemsInvolved" label="کالای درگیر" />
      <SelectField k="procurementCurrentStatus" label="وضعیت فعلی خرید" options={['not_ordered', 'ordered', 'in_manufacturing', 'ready_to_ship', 'delivered'] as ProcurementStatus[]} labels={PROCUREMENT_STATUS_LABEL_FA} />
      <div className="grid grid-cols-2 gap-2">
        <BoolField k="poChangeRequired" label="نیاز به تغییر PO" />
        <BoolField k="vendorChangeRequired" label="نیاز به تغییر Vendor" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField k="leadTimeImpactDays" label="اثر بر Lead Time (روز)" />
        <NumberField k="procurementFinancialImpact" label="اثر مالی بر Procurement" />
      </div>
      <TextField k="procurementDescription" label="شرح" />

      <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-bold text-muted"><ShieldCheck size={12} /> بررسی HSE و کیفیت</p>
      <CheckboxGroupField k="hseImpactTypes" label="اثر HSE" options={['none', 'hse_review', 'new_jsa', 'hazop_hazid_review', 'new_permits'] as HseImpactType[]} labels={HSE_IMPACT_TYPE_LABEL_FA} />
      <CheckboxGroupField k="qualityImpactTypes" label="اثر کیفیت" options={['none', 'itp_change', 'qcp_change', 'inspection_standard_change', 'retest_required'] as QualityImpactType[]} labels={QUALITY_IMPACT_TYPE_LABEL_FA} />
      <TextField k="hseQualityActionsDescription" label="شرح اقدامات موردنیاز" />
      <SelectField k="hseQaqcVerdict" label="نتیجه HSE / QAQC" options={['approved', 'approved_with_conditions', 'corrective_action_required'] as HseQaqcVerdict[]} labels={HSE_QAQC_VERDICT_LABEL_FA} />
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

      <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-bold text-muted"><HardHat size={12} /> اثر بر ساخت و اجرا</p>
      <CheckboxGroupField k="constructionImpactTypes" label="نوع اثر" options={['none', 'work_stoppage', 'rework', 'demolition', 'volume_increase', 'method_change'] as ConstructionImpactType[]} labels={CONSTRUCTION_IMPACT_TYPE_LABEL_FA} />
      <TextField k="resourceProductivityImpact" label="اثر بر بهره‌وری / منابع / ماشین‌آلات" />

      <p className="mt-2 text-[10.5px] font-bold text-muted">تحلیل اثر زمانی</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField k="originalAffectedDurationDays" label="مدت اولیه فعالیت‌های متاثر (روز)" />
        <NumberField k="recoverableDelayDays" label="میزان تأخیر قابل جبران (روز)" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField k="eotRequestedDays" label="EOT مورد درخواست (روز)" />
        <NumberField k="completionDateImpactDays" label="اثر بر تاریخ تکمیل پروژه (روز)" />
      </div>
      <SelectField k="scheduleAnalysisResult" label="نتیجه تحلیل برنامه زمان‌بندی" options={['no_impact', 'recoverable', 'needs_extension'] as ScheduleAnalysisResult[]} labels={SCHEDULE_ANALYSIS_RESULT_LABEL_FA} />
      <div className="grid grid-cols-2 gap-2">
        <BoolField k="attachedScheduleImpactAnalysis" label="پیوست: Schedule Impact Analysis" />
        <BoolField k="attachedUpdatedBaseline" label="پیوست: Updated Baseline / Recovery Plan" />
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

      <p className="mt-2 text-[10.5px] font-bold text-muted">تحلیل اثر مالی — امور مالی / کنترل هزینه</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField k="costEngineering" label="هزینه مهندسی" />
        <NumberField k="costProcurement" label="هزینه خرید" />
        <NumberField k="costConstruction" label="هزینه ساخت و نصب" />
        <NumberField k="costRework" label="هزینه Rework" />
        <NumberField k="costOverhead" label="هزینه تجهیز کارگاه / Overhead" />
        <NumberField k="costDelay" label="هزینه ناشی از تأخیر" />
        <NumberField k="costOther" label="سایر" />
        <NumberField k="costDecreaseTotal" label="جمع کاهش هزینه" />
      </div>
      <CostBreakdownSummaryRow />

      <p className="mt-2 text-[10.5px] font-bold text-muted">وضعیت قراردادی</p>
      <CheckboxGroupField k="contractualClassification" label="تغییر مشمول" options={['variation_order', 'change_order', 'change_in_scope', 'claim', 'contract_amendment', 'no_contractual_effect'] as ContractualClassification[]} labels={CONTRACTUAL_CLASSIFICATION_LABEL_FA} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField k="contractorFaultStatus" label="آیا تغییر ناشی از قصور پیمانکار است؟" options={['yes', 'no', 'needs_review'] as ContractorFaultStatus[]} labels={CONTRACTOR_FAULT_STATUS_LABEL_FA} />
        <SelectField k="costResponsibleParty" label="مسئول تأمین هزینه تغییر" options={['employer', 'contractor', 'consultant', 'shared_undetermined'] as CostResponsibleParty[]} labels={COST_RESPONSIBLE_PARTY_LABEL_FA} />
      </div>
    </>
  )
}

function CostBreakdownSummaryRow() {
  const { details } = useContext(FieldsContext)
  const summary = computeCostBreakdown(details)
  return (
    <div className="num mt-1.5 grid grid-cols-3 gap-2 rounded-lg border p-2 text-[10.5px]" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="text-center">
        <p className="font-bold" style={{ color: '#ef4444' }}>{Math.round(summary.totalIncrease).toLocaleString('en-US')}</p>
        <p className="text-[9px] text-muted">جمع افزایش هزینه</p>
      </div>
      <div className="text-center">
        <p className="font-bold" style={{ color: '#2ecc71' }}>{Math.round(summary.totalDecrease).toLocaleString('en-US')}</p>
        <p className="text-[9px] text-muted">جمع کاهش هزینه</p>
      </div>
      <div className="text-center">
        <p className="font-bold" style={{ color: 'var(--chg-accent)' }}>{Math.round(summary.netEffect).toLocaleString('en-US')}</p>
        <p className="text-[9px] text-muted">اثر خالص تغییر</p>
      </div>
    </div>
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
    <div className="chg-ccb-panel glass-panel rounded-2xl border-2 p-4" style={{ borderColor: isActive ? '#f0a836' : 'var(--border-soft)' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-bold"><CheckCircle2 size={15} aria-hidden="true" style={{ color: '#f0a836' }} /> کمیته کنترل تغییرات — Change Control Board (CCB)</p>
        <StatusPill color={STAGE_DECISION_COLOR[decision]} label={STAGE_DECISION_LABEL_FA[decision]} />
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
          <TextField k="resolutionNumber" label="شماره مصوبه CCB" />
          <NumberField k="finalApprovedAmount" label="سقف هزینه مصوب" />
          <NumberField k="finalApprovedScheduleImpactDays" label="مدت زمان مصوب (روز)" />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField k="members" label="اعضا" />
          <TextField k="effectiveDate" label="تاریخ لازم‌الاجرا شدن تغییر" />
        </div>
        <div className="mt-2"><TextField k="conditions" label="شرایط و ملاحظات تصویب" /></div>
      </FieldsContext.Provider>

      {isActive && canDecide && (
        <div className="mt-3">
          <textarea className="input w-full rounded-lg px-3 py-2 text-[12px]" rows={2} placeholder="مصوبه CCB" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button disabled={saving} onClick={() => onDecide('suspended', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#f0a836', color: '#f0a836' }}>تعلیق / بررسی بیشتر</button>
            <button disabled={saving} onClick={() => onDecide('returned', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>عودت جهت بازنگری</button>
            <button disabled={saving} onClick={() => onDecide('rejected', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#ef4444', color: '#ef4444' }}>رد</button>
            <button disabled={saving} onClick={() => onDecide('approved_with_time_revision', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#2ecc71', color: '#2ecc71' }}>تصویب با اصلاح زمان</button>
            <button disabled={saving} onClick={() => onDecide('approved_with_cost_revision', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#2ecc71', color: '#2ecc71' }}>تصویب با اصلاح هزینه</button>
            <button disabled={saving} onClick={() => onDecide('approved_with_conditions', comment, details)} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: '#2ecc71', color: '#2ecc71' }}>تایید مشروط</button>
            <button disabled={saving} onClick={() => onDecide('approved', comment, details)} className="rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white" style={{ background: '#2ecc71' }}>تصویب کامل</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Implementation action plan — Word form §10
// ---------------------------------------------------------------------------

const IMPLEMENTATION_ACTION_STATUSES: ImplementationActionStatus[] = ['pending', 'in_progress', 'done']
const IMPLEMENTATION_ACTION_STATUS_LABEL: Record<ImplementationActionStatus, string> = {
  pending: 'شروع نشده', in_progress: 'در حال انجام', done: 'انجام‌شده',
}

function ImplementationSection({ request, canAct, saving, onStart, onSave, onComplete }: {
  request: ChangeRequest; canAct: boolean; saving: boolean
  onStart: () => void; onSave: (actions: ImplementationAction[]) => void; onComplete: () => void
}) {
  if (request.status === 'approved') {
    return (
      <div className="chg-card glass-panel rounded-2xl border p-4 text-center" style={{ borderColor: 'var(--border-soft)' }}>
        <p className="mb-2 text-[12px] font-bold">این تغییر تصویب شده و آماده اجراست.</p>
        {canAct && (
          <button disabled={saving} onClick={onStart} className="chg-primary-btn rounded-xl px-4 py-2 text-[12px] font-bold text-white">شروع اجرای تغییر</button>
        )}
      </div>
    )
  }
  return (
    <ImplementationActionsEditor
      request={request}
      readOnly={!canAct || request.status !== 'implementation'}
      onSave={onSave}
      footer={request.status === 'implementation' && canAct ? (
        <div className="mt-3 flex justify-end">
          <button disabled={saving} onClick={onComplete} className="chg-primary-btn rounded-xl px-4 py-2 text-[12px] font-bold text-white">تکمیل اجرا و ارسال برای تأیید نهایی</button>
        </div>
      ) : null}
    />
  )
}

function ImplementationActionsEditor({ request, readOnly, onSave, footer }: {
  request: ChangeRequest; readOnly: boolean; onSave: (actions: ImplementationAction[]) => void; footer?: React.ReactNode
}) {
  const [actions, setActions] = useState<ImplementationAction[]>(request.implementationActions)
  const [dirty, setDirty] = useState(false)
  const update = (i: number, patch: Partial<ImplementationAction>) => { setActions((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x))); setDirty(true) }
  const addRow = () => { setActions((a) => [...a, { seq: a.length + 1, actionLabel: '', responsible: '', plannedStart: '', plannedEnd: '', status: 'pending' }]); setDirty(true) }

  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-muted"><span className="chg-icon-badge"><ListChecks size={13} /></span> برنامه اجرای تغییر</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[10.5px]">
          <thead>
            <tr className="text-muted">
              <th className="text-right font-normal">اقدام</th>
              <th className="text-right font-normal">مسئول</th>
              <th className="text-right font-normal">تاریخ شروع</th>
              <th className="text-right font-normal">تاریخ پایان</th>
              <th className="text-right font-normal">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                <td className="py-1 pe-2"><input className="input rounded-lg px-2 py-1 text-[10.5px]" disabled={readOnly} value={row.actionLabel} onChange={(e) => update(i, { actionLabel: e.target.value })} /></td>
                <td className="py-1 pe-2"><input className="input rounded-lg px-2 py-1 text-[10.5px]" disabled={readOnly} value={row.responsible} onChange={(e) => update(i, { responsible: e.target.value })} /></td>
                <td className="py-1 pe-2"><input className="input num rounded-lg px-2 py-1 text-[10.5px]" placeholder="1405/06/10" disabled={readOnly} value={row.plannedStart} onChange={(e) => update(i, { plannedStart: e.target.value })} /></td>
                <td className="py-1 pe-2"><input className="input num rounded-lg px-2 py-1 text-[10.5px]" placeholder="1405/06/10" disabled={readOnly} value={row.plannedEnd} onChange={(e) => update(i, { plannedEnd: e.target.value })} /></td>
                <td className="py-1">
                  <select className="input rounded-lg px-2 py-1 text-[10.5px]" disabled={readOnly} value={row.status} onChange={(e) => update(i, { status: e.target.value as ImplementationActionStatus })}>
                    {IMPLEMENTATION_ACTION_STATUSES.map((s) => <option key={s} value={s}>{IMPLEMENTATION_ACTION_STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" onClick={addRow} className="mt-2 text-[10.5px] font-bold" style={{ color: 'var(--chg-accent)' }}>+ افزودن اقدام</button>}
      {!readOnly && dirty && (
        <div className="mt-2 flex justify-end">
          <button onClick={() => { onSave(actions); setDirty(false) }} className="rounded-lg border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: 'var(--chg-accent)', color: 'var(--chg-accent)' }}>ذخیره برنامه اجرا</button>
        </div>
      )}
      {footer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Closeout — Word form §11
// ---------------------------------------------------------------------------

function CloseoutPanel({ request, canEdit, saving, onFinalize }: {
  request: ChangeRequest; canEdit: boolean; saving: boolean
  onFinalize: (data: {
    implementedAsApproved: boolean; actualCostAmount: number | null; actualDelayDays: number | null
    documentsUpdated: boolean; updatedDocumentTypes: CloseoutDocumentType[]
    lessonLearnedRecorded: boolean; lessonLearnedNumber: string
  }) => void
}) {
  const [implementedAsApproved, setImplementedAsApproved] = useState(request.implementedAsApproved ?? true)
  const [actualCostAmount, setActualCostAmount] = useState(request.actualCostAmount ?? 0)
  const [actualDelayDays, setActualDelayDays] = useState(request.actualDelayDays ?? 0)
  const [documentsUpdated, setDocumentsUpdated] = useState(request.documentsUpdated ?? false)
  const [updatedDocumentTypes, setUpdatedDocumentTypes] = useState<CloseoutDocumentType[]>(request.updatedDocumentTypes)
  const [lessonLearnedRecorded, setLessonLearnedRecorded] = useState(request.lessonLearnedRecorded ?? false)
  const [lessonLearnedNumber, setLessonLearnedNumber] = useState(request.lessonLearnedNumber)

  const toggleDocType = (t: CloseoutDocumentType) => setUpdatedDocumentTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const readOnly = !canEdit || request.status === 'closed'

  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-muted"><span className="chg-icon-badge"><Flag size={13} /></span> کنترل اجرای تغییر و بستن پرونده</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-[10.5px] text-muted">
          <input type="checkbox" disabled={readOnly} checked={implementedAsApproved} onChange={(e) => setImplementedAsApproved(e.target.checked)} />
          آیا تغییر مطابق مصوبه اجرا شده است؟
        </label>
        <label className="flex items-center gap-2 text-[10.5px] text-muted">
          <input type="checkbox" disabled={readOnly} checked={documentsUpdated} onChange={(e) => setDocumentsUpdated(e.target.checked)} />
          آیا تمام مدارک به‌روزرسانی شده‌اند؟
        </label>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-[10.5px] text-muted">
          هزینه واقعی تغییر
          <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-1.5 text-[11.5px]" disabled={readOnly} value={actualCostAmount} onChange={(e) => setActualCostAmount(Number(e.target.value))} />
        </label>
        <label className="block text-[10.5px] text-muted">
          تأخیر واقعی ناشی از تغییر (روز)
          <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-1.5 text-[11.5px]" disabled={readOnly} value={actualDelayDays} onChange={(e) => setActualDelayDays(Number(e.target.value))} />
        </label>
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[10.5px] text-muted">مدارک به‌روزرسانی‌شده</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(CLOSEOUT_DOCUMENT_TYPE_LABEL_FA) as CloseoutDocumentType[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <input type="checkbox" disabled={readOnly} checked={updatedDocumentTypes.includes(t)} onChange={() => toggleDocType(t)} /> {CLOSEOUT_DOCUMENT_TYPE_LABEL_FA[t]}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[10.5px] text-muted">
          <input type="checkbox" disabled={readOnly} checked={lessonLearnedRecorded} onChange={(e) => setLessonLearnedRecorded(e.target.checked)} />
          درس‌آموخته ثبت شد؟
        </label>
        {lessonLearnedRecorded && (
          <input className="input rounded-lg px-3 py-1.5 text-[11px]" placeholder="شماره Lesson Learned" disabled={readOnly} value={lessonLearnedNumber} onChange={(e) => setLessonLearnedNumber(e.target.value)} />
        )}
      </div>
      {canEdit && request.status === 'verification' && (
        <div className="mt-4 flex justify-end">
          <button
            disabled={saving}
            onClick={() => onFinalize({ implementedAsApproved, actualCostAmount, actualDelayDays, documentsUpdated, updatedDocumentTypes, lessonLearnedRecorded, lessonLearnedNumber })}
            className="chg-primary-btn rounded-xl px-4 py-2 text-[12px] font-bold text-white"
          >
            بستن تغییر (Close Change Request)
          </button>
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
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
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
          <polygon points={polygon} fill="color-mix(in srgb, var(--chg-accent, #38bdf8) 28%, transparent)" stroke="var(--chg-accent, #38bdf8)" strokeWidth={2} />
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
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[12px] font-bold text-muted"><FileText size={14} aria-hidden="true" /> مستندات و شواهد</p>
        <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-bold" style={{ color: 'var(--chg-accent)' }}>+ افزودن مستند</button>
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
        <button onClick={() => onAdd({ category, documentNumber, revision, fileName, fileUrl })} className="chg-primary-btn rounded-lg px-3 py-1.5 text-[10.5px] font-bold text-white">ثبت</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change History — spec §13
// ---------------------------------------------------------------------------

function HistoryPanel({ history }: { history: ChangeHistoryEntry[] }) {
  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 text-[12px] font-bold text-muted">Change History</p>
      {history.length === 0 ? (
        <p className="text-[11px] text-muted">فعالیتی ثبت نشده است.</p>
      ) : (
        <ol className="relative space-y-3 border-e pe-3" style={{ borderColor: 'var(--border-soft)' }}>
          {history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -end-[18px] top-1 h-2 w-2 rounded-full" style={{ background: 'var(--chg-accent)' }} />
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
