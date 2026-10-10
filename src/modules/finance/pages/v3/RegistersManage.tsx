import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { todayIso } from '../../lib/financeCalc'
import { Chip, DataTable, KpiCard, fmtBn, fmtD, type Col } from '../../components/fn'
import { FormModal, type FieldDef, type Vals } from '../../components/FormModal'
import {
  FIN_CLAIM_STATUSES, FIN_CLAIM_STATUS_LABEL_FA, FIN_CLAIM_TYPES, FIN_CLAIM_TYPE_LABEL_FA, FIN_GUARANTEE_STATUSES, FIN_GUARANTEE_STATUS_LABEL_FA, FIN_GUARANTEE_TYPES, FIN_GUARANTEE_TYPE_LABEL_FA,
  FIN_RETENTION_RELEASE_STAGES, FIN_RETENTION_RELEASE_STAGE_LABEL_FA, FIN_RETENTION_RELEASE_STATUSES, FIN_RETENTION_RELEASE_STATUS_LABEL_FA,
  type FinClaim, type FinClaimStatus, type FinClaimType, type FinGuarantee, type FinGuaranteeStatus, type FinGuaranteeType, type FinRetentionRelease, type FinRetentionReleaseStage, type FinRetentionReleaseStatus,
} from '../../types'

const num = (x: unknown) => Number(x) || 0
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

/** Shared scaffolding: contract filter, toolbar, table and modal state for a simple register. */
function useScope(masterProjectId: string) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const [contractId, setContractId] = useState('')
  const ids = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts])
  const contractOptions = contracts.map((c) => ({ value: c.id, label: c.contractNumber ? `${c.contractNumber} · ${c.title}` : c.title }))
  const nameOf = (id: string) => { const c = contracts.find((x) => x.id === id); return c?.contractNumber || c?.title || '—' }
  return { contracts, contractId, setContractId, ids, contractOptions, nameOf }
}
function Toolbar({ scope, onNew, label, disabled }: { scope: ReturnType<typeof useScope>; onNew: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="fn-toolbar">
      <select value={scope.contractId} onChange={(e) => scope.setContractId(e.target.value)} aria-label="قرارداد" style={{ maxWidth: 280 }}><option value="">همهٔ قراردادها</option>{scope.contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title}</option>)}</select>
      <button className="im-btn im-btn-primary im-btn-sm" disabled={disabled ?? !scope.contracts.length} onClick={onNew}><Plus size={14} /> {label}</button>
    </div>
  )
}
const Actions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
  <span className="fn-row-actions no-print"><button title="ویرایش" aria-label="ویرایش" onClick={onEdit}><Pencil size={14} /></button><button title="حذف" aria-label="حذف" className="danger" onClick={onDelete}><Trash2 size={14} /></button></span>
)
const NoContract = () => <div className="fn-empty">ابتدا در «قراردادها ← ثبت و ویرایش» یک قرارداد ثبت کنید.</div>

// ───────────────────────── guarantees
const G_TONE: Record<FinGuaranteeStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { active: 'good', released: 'neutral', expired: 'bad', claimed: 'warn' }

export function GuaranteesManage({ masterProjectId }: { masterProjectId: string }) {
  const scope = useScope(masterProjectId)
  const all = useFinanceStore((s) => s.guarantees)
  const { createGuarantee, updateGuarantee, deleteGuarantee } = useFinanceStore()
  const [edit, setEdit] = useState<FinGuarantee | 'new' | null>(null)
  const today = todayIso()
  const rows = all.filter((g) => scope.ids.has(g.contractId) && (!scope.contractId || g.contractId === scope.contractId)).sort((a, b) => ((a.expiryDate ?? '9') < (b.expiryDate ?? '9') ? -1 : 1))
  const active = rows.filter((g) => g.status === 'active')
  const soon = active.filter((g) => g.expiryDate && dayDiff(g.expiryDate, today) <= 60)
  const lapsed = active.filter((g) => g.expiryDate && g.expiryDate < today)
  const fields: FieldDef[] = [
    { key: 'contractId', label: 'قرارداد', kind: 'select', required: true, options: scope.contractOptions, span: 2 },
    { key: 'guaranteeType', label: 'نوع', kind: 'select', required: true, options: FIN_GUARANTEE_TYPES.map((t) => ({ value: t, label: FIN_GUARANTEE_TYPE_LABEL_FA[t] })) },
    { key: 'number', label: 'شمارهٔ ضمانت‌نامه / سفته', kind: 'text', required: true },
    { key: 'amount', label: 'مبلغ (ریال)', kind: 'money', required: true }, { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: FIN_GUARANTEE_STATUSES.map((t) => ({ value: t, label: FIN_GUARANTEE_STATUS_LABEL_FA[t] })) },
    { key: 'issueDate', label: 'تاریخ صدور', kind: 'date' }, { key: 'expiryDate', label: 'تاریخ سررسید', kind: 'date', hint: 'ده روز مانده به سررسید در «نیازمند توجه» هشدار می‌دهد.' },
    { key: 'attachmentUrl', label: 'تصویر ضمانت‌نامه', kind: 'file', folder: 'guarantees', span: 2 }, { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  const cur = edit === 'new' ? null : edit
  const initial: Vals = { contractId: cur?.contractId ?? (scope.contractId || scope.contracts[0]?.id || ''), guaranteeType: cur?.guaranteeType ?? 'bank_guarantee', number: cur?.number ?? '', amount: cur?.amount ?? 0, status: cur?.status ?? 'active', issueDate: cur?.issueDate ?? null, expiryDate: cur?.expiryDate ?? null, attachmentUrl: cur?.attachmentUrl ?? '', notes: cur?.notes ?? '' }
  const cols: Col<FinGuarantee>[] = [
    { key: 'n', label: 'ضمانت‌نامه', render: (g) => <><span className="strong">{g.number}</span><span className="sub">{scope.nameOf(g.contractId)} · {FIN_GUARANTEE_TYPE_LABEL_FA[g.guaranteeType]}</span></>, sort: (g) => g.number },
    { key: 's', label: 'وضعیت', render: (g) => <Chip tone={G_TONE[g.status]}>{FIN_GUARANTEE_STATUS_LABEL_FA[g.status]}</Chip> },
    { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (g) => fmtBn(g.amount), sort: (g) => g.amount },
    { key: 'i', label: 'صدور', render: (g) => fmtD(g.issueDate) },
    { key: 'e', label: 'سررسید', render: (g) => { const d = g.expiryDate && g.status === 'active' ? dayDiff(g.expiryDate, today) : null; return <>{fmtD(g.expiryDate)}{d != null && <span className="sub" style={{ color: d < 0 ? 'var(--im-bad,#e5484d)' : d <= 60 ? 'var(--im-warn,#f5a524)' : undefined }}>{d < 0 ? `${(-d).toLocaleString('fa-IR')} روز گذشته` : `${d.toLocaleString('fa-IR')} روز مانده`}</span>}</> }, sort: (g) => g.expiryDate ?? '' },
    { key: 'x', label: '', render: (g) => <Actions onEdit={() => setEdit(g)} onDelete={() => { if (window.confirm(`ضمانت‌نامه ${g.number} حذف شود؟`)) void deleteGuarantee(g.id) }} /> },
  ]
  return (
    <div>
      <div className="fn-kpis" style={{ marginBottom: 12 }}>
        <KpiCard i={0} label="ضمانت‌نامه‌های معتبر" value={active.length.toLocaleString('fa-IR')} sub={`${fmtBn(active.reduce((s, g) => s + g.amount, 0))} میلیارد ریال`} />
        <KpiCard i={1} label="سررسید ظرف ۶۰ روز" value={soon.length.toLocaleString('fa-IR')} tone={soon.length ? 'warn' : 'good'} />
        <KpiCard i={2} label="سررسید گذشته" value={lapsed.length.toLocaleString('fa-IR')} tone={lapsed.length ? 'bad' : 'good'} hint="ضمانت‌نامه‌ای که هنوز معتبر ثبت شده ولی تاریخش گذشته است" />
        <KpiCard i={3} label="مطالبه‌شده" value={rows.filter((g) => g.status === 'claimed').length.toLocaleString('fa-IR')} />
      </div>
      <Toolbar scope={scope} onNew={() => setEdit('new')} label="ضمانت‌نامهٔ جدید" />
      {!scope.contracts.length ? <NoContract /> : <DataTable cols={cols} rows={rows} rowKey={(g) => g.id} empty="ضمانت‌نامه‌ای ثبت نشده است." />}
      {edit && <FormModal key={cur?.id ?? 'new'} title={cur ? `ویرایش ${cur.number}` : 'ضمانت‌نامهٔ جدید'} fields={fields} initial={initial} submitLabel={cur ? 'ذخیرهٔ تغییرات' : 'ثبت'} onClose={() => setEdit(null)}
        onSubmit={async (v) => { const d: Partial<FinGuarantee> = { guaranteeType: v.guaranteeType as FinGuaranteeType, number: String(v.number), amount: num(v.amount), status: v.status as FinGuaranteeStatus, issueDate: (v.issueDate as string) || null, expiryDate: (v.expiryDate as string) || null, attachmentUrl: String(v.attachmentUrl ?? ''), notes: String(v.notes ?? '') }; if (cur) await updateGuarantee(cur.id, d); else await createGuarantee(String(v.contractId), d) }} />}
    </div>
  )
}

// ───────────────────────── claims
const C_TONE: Record<FinClaimStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { submitted: 'neutral', under_review: 'warn', approved: 'good', partially_approved: 'good', rejected: 'bad', arbitration: 'bad' }

export function ClaimsManage({ masterProjectId }: { masterProjectId: string }) {
  const scope = useScope(masterProjectId)
  const all = useFinanceStore((s) => s.claims)
  const { createClaim, updateClaim, deleteClaim } = useFinanceStore()
  const [edit, setEdit] = useState<FinClaim | 'new' | null>(null)
  const today = todayIso()
  const rows = all.filter((c) => scope.ids.has(c.contractId) && (!scope.contractId || c.contractId === scope.contractId)).sort((a, b) => (a.submittedDate < b.submittedDate ? 1 : -1))
  const open = rows.filter((c) => ['submitted', 'under_review', 'arbitration'].includes(c.status))
  const exposure = open.reduce((s, c) => s + c.amountClaimed, 0)
  const approved = rows.reduce((s, c) => s + (c.amountApproved ?? 0), 0)
  const claimedAll = rows.reduce((s, c) => s + c.amountClaimed, 0)
  const aging = (c: FinClaim) => (open.includes(c) ? dayDiff(today, c.submittedDate) : null)
  const fields: FieldDef[] = [
    { key: 'contractId', label: 'قرارداد', kind: 'select', required: true, options: scope.contractOptions, span: 2 },
    { key: 'claimNumber', label: 'شمارهٔ ادعا', kind: 'text', required: true }, { key: 'claimType', label: 'نوع', kind: 'select', required: true, options: FIN_CLAIM_TYPES.map((t) => ({ value: t, label: FIN_CLAIM_TYPE_LABEL_FA[t] })) },
    { key: 'title', label: 'عنوان', kind: 'text', required: true, span: 2 }, { key: 'description', label: 'شرح', kind: 'area', span: 2 },
    { key: 'submittedDate', label: 'تاریخ ارائه', kind: 'date', required: true }, { key: 'amountClaimed', label: 'مبلغ ادعا (ریال)', kind: 'money' },
    { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: FIN_CLAIM_STATUSES.map((t) => ({ value: t, label: FIN_CLAIM_STATUS_LABEL_FA[t] })) },
    { key: 'amountApproved', label: 'مبلغ تأییدشده (ریال)', kind: 'money', show: (v) => v.status === 'approved' || v.status === 'partially_approved' }, { key: 'resolutionDate', label: 'تاریخ نتیجه', kind: 'date', show: (v) => ['approved', 'partially_approved', 'rejected'].includes(String(v.status)) },
    { key: 'correspondenceRef', label: 'شمارهٔ نامه / مکاتبه', kind: 'text' }, { key: 'attachmentUrl', label: 'پیوست', kind: 'file', folder: 'claims' }, { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  const cur = edit === 'new' ? null : edit
  const initial: Vals = { contractId: cur?.contractId ?? (scope.contractId || scope.contracts[0]?.id || ''), claimNumber: cur?.claimNumber ?? '', claimType: cur?.claimType ?? 'cost', title: cur?.title ?? '', description: cur?.description ?? '', submittedDate: cur?.submittedDate ?? today, amountClaimed: cur?.amountClaimed ?? 0, status: cur?.status ?? 'submitted', amountApproved: cur?.amountApproved ?? 0, resolutionDate: cur?.resolutionDate ?? null, correspondenceRef: cur?.correspondenceRef ?? '', attachmentUrl: cur?.attachmentUrl ?? '', notes: cur?.notes ?? '' }
  const cols: Col<FinClaim>[] = [
    { key: 'n', label: 'ادعا', render: (c) => <><span className="strong">{c.title}</span><span className="sub">{c.claimNumber} · {scope.nameOf(c.contractId)} · {FIN_CLAIM_TYPE_LABEL_FA[c.claimType]}</span></>, sort: (c) => c.claimNumber },
    { key: 's', label: 'وضعیت', render: (c) => <Chip tone={C_TONE[c.status]}>{FIN_CLAIM_STATUS_LABEL_FA[c.status]}</Chip> },
    { key: 'd', label: 'ارائه', render: (c) => <>{fmtD(c.submittedDate)}{aging(c) != null && <span className="sub" style={{ color: (aging(c) ?? 0) > 30 ? 'var(--im-bad,#e5484d)' : undefined }}>{(aging(c) ?? 0).toLocaleString('fa-IR')} روز بی‌نتیجه</span>}</>, sort: (c) => c.submittedDate },
    { key: 'a', label: 'ادعا (میلیارد)', num: true, render: (c) => fmtBn(c.amountClaimed), sort: (c) => c.amountClaimed },
    { key: 'p', label: 'تأییدشده (میلیارد)', num: true, render: (c) => (c.amountApproved != null ? fmtBn(c.amountApproved) : '—') },
    { key: 'x', label: '', render: (c) => <Actions onEdit={() => setEdit(c)} onDelete={() => { if (window.confirm(`ادعای ${c.claimNumber} حذف شود؟`)) void deleteClaim(c.id) }} /> },
  ]
  return (
    <div>
      <div className="fn-kpis" style={{ marginBottom: 12 }}>
        <KpiCard i={0} label="ادعاهای باز" value={open.length.toLocaleString('fa-IR')} tone={open.length ? 'warn' : 'good'} />
        <KpiCard i={1} label="تعهد احتمالی" value={fmtBn(exposure)} unit="میلیارد ریال" tone={exposure ? 'warn' : 'good'} hint="مجموع مبلغ ادعاهای هنوز تعیین‌تکلیف‌نشده" />
        <KpiCard i={2} label="تأییدشده تاکنون" value={fmtBn(approved)} unit="میلیارد ریال" />
        <KpiCard i={3} label="نسبت پذیرش" value={claimedAll ? `${Math.round((approved / claimedAll) * 100).toLocaleString('fa-IR')}٪` : '—'} sub="تأییدشده به ادعاشده" />
      </div>
      <Toolbar scope={scope} onNew={() => setEdit('new')} label="ادعای جدید" />
      {!scope.contracts.length ? <NoContract /> : <DataTable cols={cols} rows={rows} rowKey={(c) => c.id} empty="ادعایی ثبت نشده است." />}
      {edit && <FormModal key={cur?.id ?? 'new'} title={cur ? `ویرایش ادعا ${cur.claimNumber}` : 'ادعای جدید پیمانکار'} fields={fields} initial={initial} submitLabel={cur ? 'ذخیرهٔ تغییرات' : 'ثبت ادعا'} onClose={() => setEdit(null)}
        onSubmit={async (v) => { const closed = ['approved', 'partially_approved'].includes(String(v.status)); const d: Partial<FinClaim> = { claimNumber: String(v.claimNumber), claimType: v.claimType as FinClaimType, title: String(v.title), description: String(v.description ?? ''), submittedDate: String(v.submittedDate), amountClaimed: num(v.amountClaimed), status: v.status as FinClaimStatus, amountApproved: closed ? num(v.amountApproved) : null, resolutionDate: (v.resolutionDate as string) || null, correspondenceRef: String(v.correspondenceRef ?? ''), attachmentUrl: String(v.attachmentUrl ?? ''), notes: String(v.notes ?? '') }; if (cur) await updateClaim(cur.id, d); else await createClaim(String(v.contractId), d) }} />}
    </div>
  )
}

// ───────────────────────── retention
const R_TONE: Record<FinRetentionReleaseStatus, 'good' | 'warn' | 'neutral'> = { pending: 'warn', released: 'good', cancelled: 'neutral' }

export function RetentionManage({ masterProjectId }: { masterProjectId: string }) {
  const scope = useScope(masterProjectId)
  const all = useFinanceStore((s) => s.retentionReleases)
  const certs = useFinanceStore((s) => s.certificates)
  const { createRetentionRelease, updateRetentionRelease, deleteRetentionRelease } = useFinanceStore()
  const [edit, setEdit] = useState<FinRetentionRelease | 'new' | null>(null)
  const today = todayIso()
  const inScope = (id: string) => scope.ids.has(id) && (!scope.contractId || id === scope.contractId)
  const rows = all.filter((r) => inScope(r.contractId)).sort((a, b) => ((a.plannedDate ?? '9') < (b.plannedDate ?? '9') ? -1 : 1))
  const held = certs.filter((c) => inScope(c.contractId)).reduce((s, c) => s + c.retentionAmount, 0)
  const released = rows.filter((r) => r.status === 'released').reduce((s, r) => s + (r.actualAmount ?? 0), 0)
  const planned = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.plannedAmount, 0)
  const fields: FieldDef[] = [
    { key: 'contractId', label: 'قرارداد', kind: 'select', required: true, options: scope.contractOptions, span: 2 },
    { key: 'releaseStage', label: 'مرحلهٔ آزادسازی', kind: 'select', required: true, options: FIN_RETENTION_RELEASE_STAGES.map((t) => ({ value: t, label: FIN_RETENTION_RELEASE_STAGE_LABEL_FA[t] })) },
    { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: FIN_RETENTION_RELEASE_STATUSES.map((t) => ({ value: t, label: FIN_RETENTION_RELEASE_STATUS_LABEL_FA[t] })) },
    { key: 'plannedDate', label: 'تاریخ برنامه‌ای', kind: 'date' }, { key: 'plannedAmount', label: 'مبلغ برنامه‌ای (ریال)', kind: 'money', required: true },
    { key: 'actualDate', label: 'تاریخ واقعی', kind: 'date', show: (v) => v.status === 'released' }, { key: 'actualAmount', label: 'مبلغ واقعی (ریال)', kind: 'money', show: (v) => v.status === 'released' },
    { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  const cur = edit === 'new' ? null : edit
  const initial: Vals = { contractId: cur?.contractId ?? (scope.contractId || scope.contracts[0]?.id || ''), releaseStage: cur?.releaseStage ?? 'provisional_handover', status: cur?.status ?? 'pending', plannedDate: cur?.plannedDate ?? null, plannedAmount: cur?.plannedAmount ?? 0, actualDate: cur?.actualDate ?? null, actualAmount: cur?.actualAmount ?? 0, notes: cur?.notes ?? '' }
  const cols: Col<FinRetentionRelease>[] = [
    { key: 'n', label: 'آزادسازی', render: (r) => <><span className="strong">{FIN_RETENTION_RELEASE_STAGE_LABEL_FA[r.releaseStage]}</span><span className="sub">{scope.nameOf(r.contractId)}</span></> },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={R_TONE[r.status]}>{FIN_RETENTION_RELEASE_STATUS_LABEL_FA[r.status]}</Chip> },
    { key: 'd', label: 'برنامه‌ای', render: (r) => <>{fmtD(r.plannedDate)}{r.status === 'pending' && r.plannedDate && r.plannedDate < today && <span className="sub" style={{ color: 'var(--im-bad,#e5484d)' }}>{dayDiff(today, r.plannedDate).toLocaleString('fa-IR')} روز تأخیر</span>}</>, sort: (r) => r.plannedDate ?? '' },
    { key: 'p', label: 'مبلغ برنامه‌ای (میلیارد)', num: true, render: (r) => fmtBn(r.plannedAmount), sort: (r) => r.plannedAmount },
    { key: 'a', label: 'واقعی (میلیارد)', num: true, render: (r) => (r.actualAmount != null ? <>{fmtBn(r.actualAmount)}<span className="sub">{fmtD(r.actualDate)}</span></> : '—') },
    { key: 'x', label: '', render: (r) => <Actions onEdit={() => setEdit(r)} onDelete={() => { if (window.confirm('این ردیف آزادسازی حذف شود؟')) void deleteRetentionRelease(r.id) }} /> },
  ]
  return (
    <div>
      <div className="fn-kpis" style={{ marginBottom: 12 }}>
        <KpiCard i={0} label="حسن انجام کارِ کسرشده" value={fmtBn(held)} unit="میلیارد ریال" hint="مجموع کسر حسن انجام کار از صورت‌وضعیت‌ها" />
        <KpiCard i={1} label="آزادشده" value={fmtBn(released)} unit="میلیارد ریال" tone="good" />
        <KpiCard i={2} label="بدهی باقی‌مانده" value={fmtBn(Math.max(0, held - released))} unit="میلیارد ریال" tone={held - released > 0 ? 'warn' : 'good'} />
        <KpiCard i={3} label="برنامه‌ریزی‌شده" value={fmtBn(planned)} unit="میلیارد ریال" sub={held - released - planned > 1 ? `${fmtBn(held - released - planned)} میلیارد هنوز زمان‌بندی نشده` : 'کل مانده زمان‌بندی شده'} />
      </div>
      <Toolbar scope={scope} onNew={() => setEdit('new')} label="آزادسازی جدید" />
      {!scope.contracts.length ? <NoContract /> : <DataTable cols={cols} rows={rows} rowKey={(r) => r.id} empty="برنامهٔ آزادسازی ثبت نشده است." />}
      {edit && <FormModal key={cur?.id ?? 'new'} title={cur ? 'ویرایش آزادسازی' : 'آزادسازی حسن انجام کار'} fields={fields} initial={initial} submitLabel={cur ? 'ذخیرهٔ تغییرات' : 'ثبت'} onClose={() => setEdit(null)}
        onSubmit={async (v) => { const rel = v.status === 'released'; const d: Partial<FinRetentionRelease> = { releaseStage: v.releaseStage as FinRetentionReleaseStage, status: v.status as FinRetentionReleaseStatus, plannedDate: (v.plannedDate as string) || null, plannedAmount: num(v.plannedAmount), actualDate: rel ? (v.actualDate as string) || null : null, actualAmount: rel ? num(v.actualAmount) : null, notes: String(v.notes ?? '') }; if (cur) await updateRetentionRelease(cur.id, d); else await createRetentionRelease(String(v.contractId), d) }} />}
    </div>
  )
}
