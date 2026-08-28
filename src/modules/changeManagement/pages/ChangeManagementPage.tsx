import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, FileText, Plus, ShieldAlert, XCircle } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useChangeStore } from '../store/useChangeStore'
import { fetchCurrentContractValue } from '../lib/changeContract'
import { CEO_CEILING_PCT, EXECUTOR_CEILING_PCT, previewTier } from '../lib/changeCalc'
import {
  APPROVAL_TIER_LABEL_FA, CHANGE_ROLE_NAME, CHANGE_STATUS_COLOR, CHANGE_STATUS_LABEL_FA,
  CONSULTANT_DECISION_LABEL_FA, type ChangeRequest,
} from '../types'

function money(n: number): string {
  return Math.round(n).toLocaleString('fa-IR')
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

export function ChangeManagementPage({ masterProjectId, projectName, onBack }: { masterProjectId: string | null; projectName: string; onBack: () => void }) {
  const fetchAccessAll = useAccessStore((s) => s.fetchAll)
  const requests = useChangeStore((s) => s.requests)
  const loading = useChangeStore((s) => s.loading)
  const saving = useChangeStore((s) => s.saving)
  const fetchForProject = useChangeStore((s) => s.fetchForProject)
  const submitChange = useChangeStore((s) => s.submitChange)
  const consultantReview = useChangeStore((s) => s.consultantReview)
  const employerDecide = useChangeStore((s) => s.employerDecide)
  const currentUser = useAuthStore((s) => s.currentUser())

  const [contractValue, setContractValue] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchAccessAll()
    if (masterProjectId) {
      fetchForProject(masterProjectId)
      fetchCurrentContractValue(masterProjectId).then(setContractValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProjectId])

  const isContractor = useHasProjectRole(masterProjectId ?? '', CHANGE_ROLE_NAME.contractor)
  const isConsultant = useHasProjectRole(masterProjectId ?? '', CHANGE_ROLE_NAME.consultant)
  const isExecutor = useHasProjectRole(masterProjectId ?? '', CHANGE_ROLE_NAME.executor)
  const isCeo = useHasProjectRole(masterProjectId ?? '', CHANGE_ROLE_NAME.ceo)

  const approvedTotal = useMemo(() => requests.filter((r) => r.status === 'approved').reduce((s, r) => s + r.costImpactAmount, 0), [requests])
  const approvedPct = contractValue ? (approvedTotal / contractValue) * 100 : 0

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

  return (
    <div className="min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
            <ArrowRight size={16} />
          </button>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-wide">مدیریت تغییرات (Change Management)</p>
            <p className="text-[11px] text-muted">{projectName}</p>
          </div>
        </div>
        {isContractor && (
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold"
            style={{ borderColor: 'color-mix(in srgb, var(--radar-green, #22ff9e) 45%, var(--border-soft))', color: 'var(--radar-green, #22ff9e)' }}
          >
            <Plus size={14} /> ثبت درخواست تغییر جدید
          </button>
        )}
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {/* Ceiling summary */}
        <div className="glass-panel mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="mb-2 flex items-center justify-between text-[12px] font-bold">
            <span>مجموع تغییرات تصویب‌شده نسبت به ارزش قرارداد</span>
            <span className="num" style={{ color: approvedPct > CEO_CEILING_PCT ? '#ef4444' : approvedPct > EXECUTOR_CEILING_PCT ? '#f0a836' : '#2ecc71' }}>
              {contractValue ? `${approvedPct.toFixed(1)}٪` : 'قرارداد ثبت نشده'}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.min(100, (approvedPct / CEO_CEILING_PCT) * 100)}%`,
                background: approvedPct > CEO_CEILING_PCT ? '#ef4444' : approvedPct > EXECUTOR_CEILING_PCT ? '#f0a836' : '#2ecc71',
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
            <span>تا {EXECUTOR_CEILING_PCT}٪ — مجوز مجری</span>
            <span>تا {CEO_CEILING_PCT}٪ — مجوز مدیرعامل</span>
            <span>بیش از {CEO_CEILING_PCT}٪ — خارج از سقف مجاز، غیرقابل تصویب</span>
          </div>
        </div>

        {formOpen && (
          <NewChangeForm
            saving={saving}
            onCancel={() => setFormOpen(false)}
            onSubmit={async (data) => {
              const result = await submitChange(masterProjectId, data, contractValue ?? 0)
              if (result.ok) setFormOpen(false)
            }}
          />
        )}

        {blockedMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border p-3 text-[12px]" style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            <ShieldAlert size={16} className="shrink-0" />
            {blockedMessage}
          </div>
        )}

        {loading && <p className="text-sm text-muted">در حال بارگذاری…</p>}
        {!loading && requests.length === 0 && (
          <p className="glass-panel rounded-2xl border p-6 text-center text-sm text-muted" style={{ borderColor: 'var(--border-soft)' }}>
            هنوز هیچ درخواست تغییری برای این پروژه ثبت نشده است.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {requests.map((r) => (
            <ChangeCard
              key={r.id}
              request={r}
              allRequests={requests}
              contractValue={contractValue}
              canReview={isConsultant}
              canDecideExecutor={isExecutor}
              canDecideCeo={isCeo}
              saving={saving}
              onConsultantReview={(decision, comment) => consultantReview(r, decision, comment, currentUser?.id ?? null)}
              onEmployerDecide={async (decision, comment) => {
                const result = await employerDecide(r, decision, comment, currentUser?.id ?? null, contractValue ?? 0)
                if (!result.ok && result.blockedReason) setBlockedMessage(result.blockedReason)
                else setBlockedMessage(null)
              }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function NewChangeForm({ saving, onCancel, onSubmit }: {
  saving: boolean
  onCancel: () => void
  onSubmit: (data: { changeNumber: string; title: string; description: string; justification: string; timeImpactDays: number; costImpactAmount: number }) => void
}) {
  const [changeNumber, setChangeNumber] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [justification, setJustification] = useState('')
  const [timeImpactDays, setTimeImpactDays] = useState(0)
  const [costImpactAmount, setCostImpactAmount] = useState(0)

  const canSubmit = title.trim().length > 0

  return (
    <div className="glass-panel mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 text-[13px] font-bold">درخواست تغییر جدید — پیمانکار</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input rounded-lg px-3 py-2 text-sm" placeholder="شماره تغییر (اختیاری)" value={changeNumber} onChange={(e) => setChangeNumber(e.target.value)} />
        <input className="input rounded-lg px-3 py-2 text-sm" placeholder="عنوان تغییر" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className="input mt-3 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="شرح تغییر" value={description} onChange={(e) => setDescription(e.target.value)} />
      <textarea className="input mt-3 w-full rounded-lg px-3 py-2 text-sm" rows={2} placeholder="توجیه فنی/قراردادی تغییر" value={justification} onChange={(e) => setJustification(e.target.value)} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted">
          اثر زمانی (روز)
          <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={timeImpactDays} onChange={(e) => setTimeImpactDays(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-muted">
          اثر هزینه‌ای (ریال)
          <input type="number" className="input num mt-1 w-full rounded-lg px-3 py-2 text-sm" value={costImpactAmount} onChange={(e) => setCostImpactAmount(Number(e.target.value))} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-xl border px-4 py-2 text-[12px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>انصراف</button>
        <button
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({ changeNumber, title, description, justification, timeImpactDays, costImpactAmount })}
          className="rounded-xl px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: '#2ecc71' }}
        >
          ثبت درخواست
        </button>
      </div>
    </div>
  )
}

function ChangeCard({
  request, allRequests, contractValue, canReview, canDecideExecutor, canDecideCeo, saving,
  onConsultantReview, onEmployerDecide,
}: {
  request: ChangeRequest
  allRequests: ChangeRequest[]
  contractValue: number | null
  canReview: boolean
  canDecideExecutor: boolean
  canDecideCeo: boolean
  saving: boolean
  onConsultantReview: (decision: 'recommended' | 'not_recommended', comment: string) => void
  onEmployerDecide: (decision: 'approved' | 'rejected', comment: string) => void
}) {
  const [reviewComment, setReviewComment] = useState('')
  const [decisionComment, setDecisionComment] = useState('')
  const preview = useMemo(() => previewTier(request, allRequests, contractValue ?? 0), [request, allRequests, contractValue])
  const canDecideThisTier = preview.tier === 'executor' ? canDecideExecutor : preview.tier === 'ceo' ? canDecideCeo : false

  return (
    <div className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted" />
          <span className="text-[13px] font-bold">{request.title}</span>
          {request.changeNumber && <span className="num text-[10px] text-muted">({request.changeNumber})</span>}
        </div>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${CHANGE_STATUS_COLOR[request.status]} 18%, transparent)`, color: CHANGE_STATUS_COLOR[request.status] }}>
          {CHANGE_STATUS_LABEL_FA[request.status]}
        </span>
      </div>

      {request.description && <p className="mb-2 text-[12px] text-secondary">{request.description}</p>}

      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1"><Clock3 size={12} /> {request.timeImpactDays} روز</span>
        <span className="num flex items-center gap-1">اثر هزینه‌ای: {money(request.costImpactAmount)} ریال</span>
        {contractValue ? <span className="num">({preview.ownPercent.toFixed(2)}٪ قرارداد — تجمعی تا این تغییر: {preview.cumulativeIfApprovedPercent.toFixed(1)}٪)</span> : null}
        <span>سطح تایید لازم: <strong>{APPROVAL_TIER_LABEL_FA[preview.tier]}</strong></span>
      </div>

      {request.consultantDecision !== 'pending' && (
        <p className="mb-2 text-[11px]" style={{ color: request.consultantDecision === 'recommended' ? '#2ecc71' : '#ef4444' }}>
          {CONSULTANT_DECISION_LABEL_FA[request.consultantDecision]}{request.consultantComment ? ` — ${request.consultantComment}` : ''}
        </p>
      )}

      {request.employerDecision !== 'pending' && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: request.employerDecision === 'approved' ? '#2ecc71' : '#ef4444' }}>
          {request.employerDecision === 'approved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {request.employerDecision === 'approved' ? 'تصویب و ابلاغ شد' : 'رد شد'}{request.employerComment ? ` — ${request.employerComment}` : ''}
        </p>
      )}

      {/* Consultant review action */}
      {request.status === 'submitted' && canReview && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-[11px] font-bold text-muted">بررسی مشاور</p>
          <textarea className="input w-full rounded-lg px-3 py-2 text-[12px]" rows={2} placeholder="نظر مشاور" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button disabled={saving} onClick={() => onConsultantReview('not_recommended', reviewComment)} className="rounded-lg border px-3 py-1.5 text-[11px] font-bold" style={{ borderColor: '#ef4444', color: '#ef4444' }}>عدم تایید</button>
            <button disabled={saving} onClick={() => onConsultantReview('recommended', reviewComment)} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-white" style={{ background: '#2ecc71' }}>تایید و ارجاع به کارفرما</button>
          </div>
        </div>
      )}

      {/* Employer decision action */}
      {request.status === 'pending_employer_decision' && (
        canDecideThisTier ? (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="mb-2 text-[11px] font-bold text-muted">تصمیم کارفرما ({APPROVAL_TIER_LABEL_FA[preview.tier]})</p>
            <textarea className="input w-full rounded-lg px-3 py-2 text-[12px]" rows={2} placeholder="نظر کارفرما" value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
            <div className="mt-2 flex justify-end gap-2">
              <button disabled={saving} onClick={() => onEmployerDecide('rejected', decisionComment)} className="rounded-lg border px-3 py-1.5 text-[11px] font-bold" style={{ borderColor: '#ef4444', color: '#ef4444' }}>رد</button>
              <button disabled={saving || preview.tier === 'over_ceiling'} onClick={() => onEmployerDecide('approved', decisionComment)} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50" style={{ background: '#2ecc71' }}>تصویب و ابلاغ</button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted">منتظر تصمیم نقش «{APPROVAL_TIER_LABEL_FA[preview.tier]}» است.</p>
        )
      )}
    </div>
  )
}
