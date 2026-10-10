import { useState } from 'react'
import { Pencil, Plus, Trash2, FilePlus2 } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { contractFile } from '../../lib/financeControl'
import { Chip, DataTable, Section, fmtBn, fmtD, fmtPct, type Col } from '../../components/fn'
import { FormModal, type FieldDef, type GroupDef, type Vals } from '../../components/FormModal'
import { FIN_CONTRACT_ROLES, FIN_CONTRACT_ROLE_LABEL_FA, FIN_CONTRACT_STATUSES, FIN_CONTRACT_STATUS_LABEL_FA, type FinContract, type FinContractRole, type FinContractStatus } from '../../types'

const TONE = { active: 'good', completed: 'neutral', draft: 'neutral', suspended: 'warn', terminated: 'bad', replaced: 'neutral' } as const
const GROUPS: GroupDef[] = [{ id: 'fx', title: 'بخش ارزی قرارداد (اختیاری)', collapsed: true }]

/** Create and edit contracts and their amendments. Reading and analysis live in «فهرست و پرونده». */
export function ContractsManage({ masterProjectId }: { masterProjectId: string }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const orgs = useMasterDataStore((s) => s.organizations)
  const items = useFinanceControlStore((s) => s.configItems)
  const lines = useFinanceControlStore((s) => s.budgetLines).filter((l) => l.masterProjectId === masterProjectId && l.isActive && l.kind !== 'land')
  const { createContract, updateContract, deleteContract, addAmendment, deleteAmendment } = useFinanceStore()
  const [edit, setEdit] = useState<FinContract | 'new' | null>(null)
  const [amend, setAmend] = useState<FinContract | null>(null)

  const fields = (cur: FinContract | null): FieldDef[] => [
    { key: 'title', label: 'عنوان قرارداد', kind: 'text', required: true, span: 2 },
    { key: 'contractNumber', label: 'شماره قرارداد', kind: 'text', required: true },
    { key: 'contractType', label: 'دستهٔ قرارداد', kind: 'select', options: items.filter((i) => i.kind === 'contract_type' && (i.active || i.key === cur?.contractType)).map((i) => ({ value: i.key, label: i.label })) },
    { key: 'contractRole', label: 'نقش قرارداد', kind: 'select', required: true, options: FIN_CONTRACT_ROLES.map((r) => ({ value: r, label: FIN_CONTRACT_ROLE_LABEL_FA[r] })) },
    { key: 'contractorOrgId', label: 'طرف قرارداد', kind: 'select', options: orgs.map((o) => ({ value: o.id, label: o.name })) },
    { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: FIN_CONTRACT_STATUSES.map((s) => ({ value: s, label: FIN_CONTRACT_STATUS_LABEL_FA[s] })) },
    { key: 'budgetLineId', label: 'ردیف بودجه', kind: 'select', options: lines.map((l) => ({ value: l.id, label: `${l.code} · ${l.title}` })) },
    { key: 'contractValue', label: 'مبلغ ریالی قرارداد (ریال)', kind: 'money', required: true },
    { key: 'startDate', label: 'تاریخ شروع', kind: 'date' },
    { key: 'plannedCompletionDate', label: 'تاریخ پایان مصوب', kind: 'date' },
    { key: 'advancePaymentPercent', label: 'پیش‌پرداخت', kind: 'pct' },
    { key: 'retentionPercent', label: 'کسر حسن انجام کار', kind: 'pct' },
    { key: 'performanceGuaranteePercent', label: 'ضمانت انجام تعهدات', kind: 'pct' },
    { key: 'supersedesContractId', label: 'جایگزین قرارداد قبلی', kind: 'select', options: contracts.filter((c) => c.id !== cur?.id).map((c) => ({ value: c.id, label: c.contractNumber || c.title })) },
    { key: 'statusNote', label: 'یادداشت وضعیت (دلیل توقف، فسخ یا جایگزینی)', kind: 'text', span: 2 },
    { key: 'fcAmount', label: 'مبلغ ارزی', kind: 'num', group: 'fx' }, { key: 'fcCurrency', label: 'ارز (مثلاً EUR)', kind: 'text', group: 'fx' },
    { key: 'exchangeRate', label: 'نرخ تبدیل به ریال', kind: 'num', group: 'fx' }, { key: 'rateDate', label: 'تاریخ نرخ', kind: 'date', group: 'fx' },
  ]
  const initial = (c: FinContract | null): Vals => ({ title: c?.title ?? '', contractNumber: c?.contractNumber ?? '', contractType: c?.contractType ?? '', contractRole: c?.contractRole ?? 'main_epc', contractorOrgId: c?.contractorOrgId ?? '', status: c?.status ?? 'active', budgetLineId: c?.budgetLineId ?? '',
    contractValue: c?.contractValue ?? 0, startDate: c?.startDate ?? null, plannedCompletionDate: c?.plannedCompletionDate ?? null, advancePaymentPercent: c?.advancePaymentPercent ?? 0, retentionPercent: c?.retentionPercent ?? 0, performanceGuaranteePercent: c?.performanceGuaranteePercent ?? 0,
    supersedesContractId: c?.supersedesContractId ?? '', statusNote: c?.statusNote ?? '', fcAmount: c?.fx.fcAmount ?? 0, fcCurrency: c?.fx.fcCurrency ?? '', exchangeRate: c?.fx.exchangeRate ?? 0, rateDate: c?.fx.rateDate ?? null })
  const save = async (v: Vals, cur: FinContract | null) => {
    const data: Partial<FinContract> = { title: String(v.title), contractNumber: String(v.contractNumber), contractType: String(v.contractType ?? ''), contractRole: v.contractRole as FinContractRole, contractorOrgId: (v.contractorOrgId as string) || null, status: v.status as FinContractStatus, budgetLineId: (v.budgetLineId as string) || null,
      contractValue: Number(v.contractValue) || 0, currency: cur?.currency ?? 'ریال', startDate: (v.startDate as string) || null, plannedCompletionDate: (v.plannedCompletionDate as string) || null, advancePaymentPercent: Number(v.advancePaymentPercent) || 0, retentionPercent: Number(v.retentionPercent) || 0, performanceGuaranteePercent: Number(v.performanceGuaranteePercent) || 0,
      supersedesContractId: (v.supersedesContractId as string) || null, statusNote: String(v.statusNote ?? ''), fx: { fcAmount: Number(v.fcAmount) || 0, fcCurrency: String(v.fcCurrency ?? ''), exchangeRate: Number(v.exchangeRate) || 0, fcRialEquivalent: 0, rateDate: (v.rateDate as string) || null } }
    if (cur) await updateContract(cur.id, data); else await createContract(masterProjectId, data)
  }
  const del = (c: FinContract) => { if (window.confirm(`قرارداد «${c.title || c.contractNumber}» با همهٔ صورت‌وضعیت‌ها، ضمانت‌نامه‌ها و پرداخت‌هایش حذف شود؟ این کار برگشت‌پذیر نیست.`)) void deleteContract(c.id) }

  const cols: Col<FinContract>[] = [
    { key: 'n', label: 'قرارداد', render: (c) => <><span className="strong">{c.title || '—'}</span><span className="sub fn-code">{c.contractNumber}</span></>, sort: (c) => c.title },
    { key: 'o', label: 'طرف قرارداد', render: (c) => orgs.find((o) => o.id === c.contractorOrgId)?.name ?? '—' },
    { key: 'r', label: 'نقش', render: (c) => FIN_CONTRACT_ROLE_LABEL_FA[c.contractRole] },
    { key: 's', label: 'وضعیت', render: (c) => <Chip tone={TONE[c.status]}>{FIN_CONTRACT_STATUS_LABEL_FA[c.status]}</Chip> },
    { key: 'v', label: 'مبلغ جاری (میلیارد)', num: true, render: (c) => { const f = contractFile(c, amendments); return <>{fmtBn(f.current)}{f.amendmentCount > 0 && <span className="sub">{fmtPct(f.increasePct)} · {f.amendmentCount.toLocaleString('fa-IR')} الحاقیه</span>}</> }, sort: (c) => contractFile(c, amendments).current },
    { key: 'e', label: 'پایان', render: (c) => fmtD(contractFile(c, amendments).currentEnd) },
    { key: 'a', label: '', render: (c) => <span className="fn-row-actions no-print"><button title="ویرایش" aria-label="ویرایش" onClick={() => setEdit(c)}><Pencil size={14} /></button><button title="الحاقیه" aria-label="الحاقیه" onClick={() => setAmend(c)}><FilePlus2 size={14} /></button><button title="حذف" aria-label="حذف" className="danger" onClick={() => del(c)}><Trash2 size={14} /></button></span> },
  ]
  const target = edit === 'new' ? null : edit
  return (
    <div>
      <div className="fn-toolbar"><p className="im-helper" style={{ margin: 0 }}>ثبت و ویرایش قراردادها و الحاقیه‌ها. تحلیل و پرونده‌ی هر قرارداد در «فهرست و پرونده» است.</p><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setEdit('new')}><Plus size={14} /> قرارداد جدید</button></div>
      <DataTable cols={cols} rows={contracts} rowKey={(c) => c.id} empty="هنوز قراردادی ثبت نشده است." />
      {edit && <FormModal key={target?.id ?? 'new'} title={target ? `ویرایش قرارداد ${target.contractNumber}` : 'قرارداد جدید'} fields={fields(target)} groups={GROUPS} initial={initial(target)} onSubmit={(v) => save(v, target)} onClose={() => setEdit(null)} submitLabel={target ? 'ذخیرهٔ تغییرات' : 'ثبت قرارداد'} />}
      {amend && (
        <FormModal key={amend.id} title={`الحاقیه برای ${amend.contractNumber || amend.title}`} subtitle="افزایش یا کاهش مبلغ و تمدید مدت؛ تغییرات تصویب‌شده در مدیریت تغییرات خودکار می‌آیند و دوباره ثبت نمی‌شوند."
          fields={[{ key: 'amendmentNumber', label: 'شمارهٔ الحاقیه', kind: 'text', required: true }, { key: 'amendmentDate', label: 'تاریخ', kind: 'date', required: true }, { key: 'amount', label: 'تغییر مبلغ (ریال؛ کاهش با منفی)', kind: 'money', allowNegative: true }, { key: 'daysDelta', label: 'تمدید مدت (روز)', kind: 'num' }, { key: 'reason', label: 'موضوع', kind: 'text', span: 2, required: true }]}
          initial={{ amendmentNumber: '', amendmentDate: new Date().toISOString().slice(0, 10), amount: 0, daysDelta: 0, reason: '' }}
          onSubmit={async (v) => { await addAmendment(amend.id, { amendmentNumber: String(v.amendmentNumber), amendmentDate: String(v.amendmentDate), amount: Number(v.amount) || 0, daysDelta: Number(v.daysDelta) || 0, reason: String(v.reason) }) }} onClose={() => setAmend(null)} submitLabel="ثبت الحاقیه"
          extra={<Section title="الحاقیه‌های ثبت‌شده" flush><DataTable rows={amendments.filter((a) => a.contractId === amend.id)} rowKey={(a) => a.id} empty="الحاقیه‌ای نیست." cols={[
            { key: 'd', label: 'تاریخ', render: (a) => fmtD(a.amendmentDate) }, { key: 'r', label: 'موضوع', render: (a) => <span style={{ textDecoration: a.voidedAt ? 'line-through' : undefined }}>{a.reason}</span> }, { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (a) => fmtBn(a.amount) },
            { key: 'x', label: '', render: (a) => (a.cmRequestId ? <Chip>از مدیریت تغییرات</Chip> : <button className="im-ghostlink" onClick={() => void deleteAmendment(a.id)}>حذف</button>) }]} /></Section>} />
      )}
    </div>
  )
}
