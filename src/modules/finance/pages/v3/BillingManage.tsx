import { useMemo, useState } from 'react'
import { BadgeCheck, CircleDollarSign, Pencil, Plus, ShieldCheck, Trash2, Wallet } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useAuthStore } from '../../../../store/useAuthStore'
import { certificateGrossTotal, certificateOutstanding, certificatePaidTotal, paymentAgingDays, todayIso } from '../../lib/financeCalc'
import { Chip, DataTable, KpiCard, Section, fmtBn, fmtD, type Col } from '../../components/fn'
import { FormModal, type FieldDef, type GroupDef, type Vals } from '../../components/FormModal'
import { FIN_CERTIFICATE_STATUS_LABEL_FA, FIN_CERTIFICATE_TYPE_LABEL_FA, type FinCertificateStatus, type FinPayment, type FinPaymentCertificate } from '../../types'

const TONE: Record<FinCertificateStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { draft: 'neutral', submitted: 'neutral', under_review: 'neutral', certified: 'warn', rejected: 'bad', paid: 'good', partially_paid: 'warn' }
const GROUPS: GroupDef[] = [{ id: 'ded', title: 'کسورات و پیش‌پرداخت' }, { id: 'fx', title: 'بخش ارزی (اختیاری)', collapsed: true }]
const num = (x: unknown) => Number(x) || 0
const payableOf = (v: Vals) => num(v.grossAmount) + num(v.adjustments) - num(v.taxDeduction) - num(v.insuranceDeduction) - num(v.otherDeduction) - num(v.retentionAmount) - num(v.advanceRecoveryAmount)

/** Certificates and payments of one project: record, certify, approve and pay in one place. A certificate's paid fields always follow its payments. */
/** `approverHost`: hosted by the statements module, where statement approvers (not only the system admin) give final approval — the database decides */
export function BillingManage({ masterProjectId, view, approverHost }: { masterProjectId: string; view: 'certificates' | 'payments'; approverHost?: boolean }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const allCerts = useFinanceStore((s) => s.certificates)
  const allPays = useFinanceStore((s) => s.payments)
  const budget = useFinanceStore((s) => s.budgets.find((b) => b.masterProjectId === masterProjectId))
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false) || !!approverHost
  const { createCertificate, updateCertificate, deleteCertificate, certifyCertificate, approveCertificate, createPayment, updatePayment, deletePayment } = useFinanceStore()
  const ids = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts])
  const certs = useMemo(() => allCerts.filter((c) => ids.has(c.contractId)).sort((a, b) => (a.certificateDate < b.certificateDate ? 1 : -1)), [allCerts, ids])
  const certIds = useMemo(() => new Set(certs.map((c) => c.id)), [certs])
  const pays = useMemo(() => allPays.filter((p) => certIds.has(p.certificateId)).sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1)), [allPays, certIds])
  const [contractId, setContractId] = useState('')
  const [edit, setEdit] = useState<FinPaymentCertificate | 'new' | null>(null)
  const [certify, setCertify] = useState<FinPaymentCertificate | null>(null)
  const [payFor, setPayFor] = useState<{ cert: FinPaymentCertificate | null; pay: FinPayment | null } | null>(null)
  const threshold = budget?.certificateApprovalThreshold ?? null
  const cName = (id: string) => contracts.find((c) => c.id === id)
  const label = (c: FinPaymentCertificate) => `${cName(c.contractId)?.contractNumber || cName(c.contractId)?.title || '—'} · ${c.certificateNumber}`
  const shown = contractId ? certs.filter((c) => c.contractId === contractId) : certs
  const today = todayIso()

  /** Paid fields of a certificate = sum of its payments; status follows. */
  const syncPaid = async (certId: string) => {
    const st = useFinanceStore.getState()
    const cert = st.certificates.find((c) => c.id === certId)
    if (!cert) return
    const mine = st.payments.filter((p) => p.certificateId === certId)
    const paid = mine.reduce((s, p) => s + p.amount, 0)
    const fcRial = mine.reduce((s, p) => s + p.fx.fcRialEquivalent, 0)
    const last = mine.map((p) => p.paymentDate).sort().at(-1) ?? null
    const owed = cert.certifiedAmount ?? cert.payableAmount
    const total = paid + fcRial
    let status: FinCertificateStatus = cert.status
    if (total > 0) status = total >= owed - 1 ? 'paid' : 'partially_paid'
    else if (cert.status === 'paid' || cert.status === 'partially_paid') status = cert.certifiedAmount != null ? 'certified' : 'submitted'
    if (paid !== cert.paidAmount || last !== cert.paidDate || status !== cert.status) await updateCertificate(certId, { paidAmount: paid, paidDate: last, status })
  }

  // ---- KPI strip
  const gross = shown.reduce((s, c) => s + certificateGrossTotal(c), 0)
  const certified = shown.reduce((s, c) => s + (c.certifiedAmount ?? 0), 0)
  const paid = shown.reduce((s, c) => s + certificatePaidTotal(c), 0)
  const out = shown.reduce((s, c) => s + certificateOutstanding(c), 0)
  const late = shown.filter((c) => (paymentAgingDays(c, today) ?? 0) > 30).length

  const certFields: FieldDef[] = [
    { key: 'contractId', label: 'قرارداد', kind: 'select', required: true, options: contracts.map((c) => ({ value: c.id, label: c.contractNumber ? `${c.contractNumber} · ${c.title}` : c.title })) },
    { key: 'certificateNumber', label: 'شمارهٔ صورت‌وضعیت', kind: 'text', required: true },
    { key: 'certificateDate', label: 'تاریخ صورت‌وضعیت', kind: 'date', required: true },
    { key: 'certificateType', label: 'نوع', kind: 'select', required: true, options: [{ value: 'work', label: FIN_CERTIFICATE_TYPE_LABEL_FA.work }, { value: 'adjustment', label: FIN_CERTIFICATE_TYPE_LABEL_FA.adjustment }] },
    { key: 'relatedCertificateId', label: 'صورت‌وضعیت کارکردِ مرتبط', kind: 'select', show: (v) => v.certificateType === 'adjustment', options: certs.filter((c) => c.certificateType === 'work').map((c) => ({ value: c.id, label: label(c) })) },
    { key: 'adjustmentFactor', label: 'ضریب تعدیل', kind: 'num', show: (v) => v.certificateType === 'adjustment' },
    { key: 'grossAmount', label: 'مبلغ ناخالص ریالی (ریال)', kind: 'money', required: true, span: 2 },
    { key: 'adjustments', label: 'تعدیل / افزایش (ریال)', kind: 'money', allowNegative: true, group: 'ded' },
    { key: 'taxDeduction', label: 'مالیات', kind: 'money', group: 'ded' }, { key: 'insuranceDeduction', label: 'بیمه', kind: 'money', group: 'ded' }, { key: 'otherDeduction', label: 'سایر کسورات', kind: 'money', group: 'ded' },
    { key: 'retentionAmount', label: 'حسن انجام کار', kind: 'money', group: 'ded' }, { key: 'advanceRecoveryAmount', label: 'کسر پیش‌پرداخت', kind: 'money', group: 'ded' },
    { key: 'fcAmount', label: 'مبلغ ارزی ناخالص', kind: 'num', group: 'fx' }, { key: 'fcCurrency', label: 'ارز', kind: 'text', group: 'fx' }, { key: 'exchangeRate', label: 'نرخ تبدیل', kind: 'num', group: 'fx' },
    { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: (['draft', 'submitted', 'under_review', 'rejected'] as FinCertificateStatus[]).map((s) => ({ value: s, label: FIN_CERTIFICATE_STATUS_LABEL_FA[s] })), hint: 'تأیید و پرداخت با دکمه‌های همان ردیف ثبت می‌شود.' },
    { key: 'submittedDate', label: 'تاریخ ارسال به کارفرما', kind: 'date' },
    { key: 'attachmentUrl', label: 'پیوست (مستندات)', kind: 'file', folder: 'certificates', span: 2 },
    { key: 'notes', label: 'یادداشت', kind: 'area', span: 2 },
  ]
  const initialCert = (c: FinPaymentCertificate | null): Vals => ({ contractId: c?.contractId ?? (contractId || contracts[0]?.id || ''), certificateNumber: c?.certificateNumber ?? `${(certs.filter((x) => !contractId || x.contractId === contractId).length + 1).toLocaleString('en-US')}`, certificateDate: c?.certificateDate ?? today, certificateType: c?.certificateType ?? 'work',
    relatedCertificateId: c?.relatedCertificateId ?? '', adjustmentFactor: c?.adjustmentFactor ?? 0, grossAmount: c?.grossAmount ?? 0, adjustments: c?.adjustments ?? 0, taxDeduction: c?.taxDeduction ?? 0, insuranceDeduction: c?.insuranceDeduction ?? 0, otherDeduction: c?.otherDeduction ?? 0,
    retentionAmount: c?.retentionAmount ?? 0, advanceRecoveryAmount: c?.advanceRecoveryAmount ?? 0, fcAmount: c?.grossFx.fcAmount ?? 0, fcCurrency: c?.grossFx.fcCurrency ?? '', exchangeRate: c?.grossFx.exchangeRate ?? 0,
    status: c && ['draft', 'submitted', 'under_review', 'rejected'].includes(c.status) ? c.status : c ? 'submitted' : 'submitted', submittedDate: c?.submittedDate ?? null, attachmentUrl: c?.attachmentUrl ?? '', notes: c?.notes ?? '' })
  const saveCert = async (v: Vals, cur: FinPaymentCertificate | null) => {
    const keepStatus = cur && !['draft', 'submitted', 'under_review', 'rejected'].includes(cur.status)
    const data: Partial<FinPaymentCertificate> = { certificateNumber: String(v.certificateNumber), certificateDate: String(v.certificateDate), certificateType: v.certificateType as FinPaymentCertificate['certificateType'], relatedCertificateId: (v.relatedCertificateId as string) || null, adjustmentFactor: v.certificateType === 'adjustment' ? num(v.adjustmentFactor) || null : null,
      grossAmount: num(v.grossAmount), adjustments: num(v.adjustments), taxDeduction: num(v.taxDeduction), insuranceDeduction: num(v.insuranceDeduction), otherDeduction: num(v.otherDeduction), retentionAmount: num(v.retentionAmount), advanceRecoveryAmount: num(v.advanceRecoveryAmount),
      grossFx: { fcAmount: num(v.fcAmount), fcCurrency: String(v.fcCurrency ?? ''), exchangeRate: num(v.exchangeRate), fcRialEquivalent: 0, rateDate: null }, status: keepStatus ? cur.status : (v.status as FinCertificateStatus), submittedDate: (v.submittedDate as string) || null, attachmentUrl: String(v.attachmentUrl ?? ''), notes: String(v.notes ?? '') }
    if (cur) await updateCertificate(cur.id, data); else await createCertificate(String(v.contractId), data)
  }
  const del = (c: FinPaymentCertificate) => { if (window.confirm(`صورت‌وضعیت ${c.certificateNumber} با پرداخت‌هایش حذف شود؟`)) void deleteCertificate(c.id) }
  const exceeds = (c: FinPaymentCertificate) => threshold != null && (c.certifiedAmount ?? 0) > threshold

  const certCols: Col<FinPaymentCertificate>[] = [
    { key: 'n', label: 'صورت‌وضعیت', render: (c) => <><span className="strong">{c.certificateNumber}</span><span className="sub">{cName(c.contractId)?.contractNumber || cName(c.contractId)?.title} · {FIN_CERTIFICATE_TYPE_LABEL_FA[c.certificateType]}</span></>, sort: (c) => c.certificateDate },
    { key: 'd', label: 'تاریخ', render: (c) => fmtD(c.certificateDate), sort: (c) => c.certificateDate },
    { key: 's', label: 'وضعیت', render: (c) => <><Chip tone={TONE[c.status]}>{FIN_CERTIFICATE_STATUS_LABEL_FA[c.status]}</Chip>{c.certifiedBy && !c.approvedBy && <span className="sub">در انتظار تصویب</span>}</> },
    { key: 'g', label: 'ناخالص', num: true, render: (c) => fmtBn(certificateGrossTotal(c)), sort: (c) => certificateGrossTotal(c) },
    { key: 'p', label: 'قابل پرداخت', num: true, render: (c) => fmtBn(c.payableAmount) },
    { key: 'c', label: 'تأییدشده', num: true, render: (c) => (c.certifiedAmount != null ? fmtBn(c.certifiedAmount) : '—') },
    { key: 'pd', label: 'پرداخت‌شده', num: true, render: (c) => fmtBn(certificatePaidTotal(c)), sort: (c) => certificatePaidTotal(c) },
    { key: 'o', label: 'مانده', num: true, render: (c) => { const a = paymentAgingDays(c, today); return <>{fmtBn(certificateOutstanding(c))}{a != null && <span className="sub" style={{ color: a > 30 ? 'var(--im-bad, #e5484d)' : undefined }}>{a.toLocaleString('fa-IR')} روز</span>}</> }, sort: (c) => certificateOutstanding(c) },
    { key: 'a', label: '', render: (c) => (
      <span className="fn-row-actions no-print">
        {c.status !== 'paid' && c.status !== 'rejected' && !c.certifiedBy && <button title="تأیید کارکرد" aria-label="تأیید کارکرد" onClick={() => setCertify(c)}><BadgeCheck size={14} /></button>}
        {c.certifiedBy && !c.approvedBy && <button title={isAdmin ? (exceeds(c) ? 'تصویب مدیرعامل (فراتر از سقف اختیار)' : 'تصویب نهایی') : 'تصویب نهایی فقط برای مدیر سیستم'} aria-label="تصویب نهایی" disabled={!isAdmin} onClick={() => void approveCertificate(c.id)}><ShieldCheck size={14} /></button>}
        {c.certifiedBy && certificateOutstanding(c) > 0 && <button title="ثبت پرداخت" aria-label="ثبت پرداخت" onClick={() => setPayFor({ cert: c, pay: null })}><Wallet size={14} /></button>}
        <button title="ویرایش" aria-label="ویرایش" onClick={() => setEdit(c)}><Pencil size={14} /></button>
        <button title="حذف" aria-label="حذف" className="danger" onClick={() => del(c)}><Trash2 size={14} /></button>
      </span>) },
  ]
  const payCols: Col<FinPayment>[] = [
    { key: 'd', label: 'تاریخ', render: (p) => fmtD(p.paymentDate), sort: (p) => p.paymentDate },
    { key: 'c', label: 'صورت‌وضعیت', render: (p) => { const c = allCerts.find((x) => x.id === p.certificateId); return c ? label(c) : '—' } },
    { key: 'm', label: 'روش / مرجع', render: (p) => <>{p.method || '—'}<span className="sub">{p.referenceNumber}</span></> },
    { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (p) => fmtBn(p.amount + p.fx.fcRialEquivalent), sort: (p) => p.amount + p.fx.fcRialEquivalent },
    { key: 'x', label: '', render: (p) => <span className="fn-row-actions no-print"><button title="ویرایش" aria-label="ویرایش" onClick={() => setPayFor({ cert: allCerts.find((c) => c.id === p.certificateId) ?? null, pay: p })}><Pencil size={14} /></button><button title="حذف" aria-label="حذف" className="danger" onClick={async () => { if (window.confirm('این پرداخت حذف شود؟')) { await deletePayment(p.id); await syncPaid(p.certificateId) } }}><Trash2 size={14} /></button></span> },
  ]

  const target = edit === 'new' ? null : edit
  const payCert = payFor?.cert ?? null
  return (
    <div>
      <div className="fn-kpis" style={{ marginBottom: 12 }}>
        <KpiCard i={0} label="جمع ناخالص" value={fmtBn(gross)} unit="میلیارد ریال" sub={`${shown.length.toLocaleString('fa-IR')} صورت‌وضعیت`} />
        <KpiCard i={1} label="تأییدشده" value={fmtBn(certified)} unit="میلیارد ریال" tone="neutral" />
        <KpiCard i={2} label="پرداخت‌شده" value={fmtBn(paid)} unit="میلیارد ریال" tone="good" />
        <KpiCard i={3} label="مانده پرداخت‌نشده" value={fmtBn(out)} unit="میلیارد ریال" tone={out > 0 ? 'warn' : 'good'} sub={late ? `${late.toLocaleString('fa-IR')} مورد بیش از ۳۰ روز` : undefined} />
      </div>
      <div className="fn-toolbar">
        <select value={contractId} onChange={(e) => setContractId(e.target.value)} aria-label="قرارداد" style={{ maxWidth: 280 }}><option value="">همهٔ قراردادها</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title}</option>)}</select>
        {view === 'certificates'
          ? <button className="im-btn im-btn-primary im-btn-sm" disabled={!contracts.length} onClick={() => setEdit('new')}><Plus size={14} /> صورت‌وضعیت جدید</button>
          : <button className="im-btn im-btn-primary im-btn-sm" disabled={!certs.length} onClick={() => setPayFor({ cert: null, pay: null })}><CircleDollarSign size={14} /> ثبت پرداخت</button>}
      </div>
      {!contracts.length ? <div className="fn-empty">ابتدا در «قراردادها ← ثبت و ویرایش» یک قرارداد ثبت کنید.</div>
        : view === 'certificates' ? <DataTable cols={certCols} rows={shown} rowKey={(c) => c.id} empty="هنوز صورت‌وضعیتی ثبت نشده است." foot />
        : <DataTable cols={payCols} rows={contractId ? pays.filter((p) => allCerts.find((c) => c.id === p.certificateId)?.contractId === contractId) : pays} rowKey={(p) => p.id} empty="پرداختی ثبت نشده است." foot />}

      {edit && <FormModal key={target?.id ?? 'new'} title={target ? `ویرایش صورت‌وضعیت ${target.certificateNumber}` : 'صورت‌وضعیت جدید'} fields={certFields} groups={GROUPS} initial={initialCert(target)} submitLabel={target ? 'ذخیرهٔ تغییرات' : 'ثبت صورت‌وضعیت'}
        preview={(v) => { const p = payableOf(v); return <div className="fn-preview"><span>مبلغ قابل پرداخت</span><b className="fn-num" style={{ color: p < 0 ? 'var(--im-bad,#e5484d)' : undefined }}>{fmtBn(p, 2)} میلیارد ریال</b><small>ناخالص + تعدیل − کسورات − حسن انجام کار − کسر پیش‌پرداخت</small></div> }}
        onSubmit={(v) => saveCert(v, target)} onClose={() => setEdit(null)} />}

      {certify && <FormModal title={`تأیید کارکرد · ${certify.certificateNumber}`} subtitle="مبلغی که کارفرما یا مشاور تأیید کرده است. پیش‌فرض، مبلغ قابل پرداخت است."
        fields={[{ key: 'amount', label: 'مبلغ تأییدشده (ریال)', kind: 'money', required: true }]} initial={{ amount: certify.certifiedAmount ?? certify.payableAmount }} submitLabel="ثبت تأیید"
        preview={(v) => threshold != null && num(v.amount) > threshold ? <div className="fn-preview warn"><span>فراتر از سقف اختیار</span><b>پس از تأیید، تصویب مدیرعامل لازم است.</b></div> : null}
        onSubmit={async (v) => { await certifyCertificate(certify.id, num(v.amount)) }} onClose={() => setCertify(null)} />}

      {payFor && <FormModal key={payFor.pay?.id ?? payCert?.id ?? 'new-pay'} title={payFor.pay ? 'ویرایش پرداخت' : 'ثبت پرداخت'} subtitle={payCert ? `${label(payCert)} · مانده ${fmtBn(certificateOutstanding(payCert))} میلیارد ریال` : 'پرداخت به صورت‌وضعیت‌ها نسبت داده می‌شود.'}
        fields={[
          { key: 'certificateId', label: 'صورت‌وضعیت', kind: 'select', required: true, disabled: !!payFor.pay, options: certs.filter((c) => c.certifiedBy || c.id === payCert?.id).map((c) => ({ value: c.id, label: `${label(c)} · مانده ${fmtBn(certificateOutstanding(c))}` })), span: 2 },
          { key: 'paymentDate', label: 'تاریخ پرداخت', kind: 'date', required: true }, { key: 'amount', label: 'مبلغ ریالی (ریال)', kind: 'money' },
          { key: 'method', label: 'روش پرداخت', kind: 'text' }, { key: 'referenceNumber', label: 'شمارهٔ مرجع / سند', kind: 'text' },
          { key: 'fcAmount', label: 'مبلغ ارزی', kind: 'num' }, { key: 'fcCurrency', label: 'ارز', kind: 'text' }, { key: 'exchangeRate', label: 'نرخ تبدیل', kind: 'num' },
          { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 }]}
        initial={{ certificateId: payCert?.id ?? '', paymentDate: payFor.pay?.paymentDate ?? today, amount: payFor.pay?.amount ?? (payCert ? certificateOutstanding(payCert) : 0), method: payFor.pay?.method ?? '', referenceNumber: payFor.pay?.referenceNumber ?? '', fcAmount: payFor.pay?.fx.fcAmount ?? 0, fcCurrency: payFor.pay?.fx.fcCurrency ?? '', exchangeRate: payFor.pay?.fx.exchangeRate ?? 0, notes: payFor.pay?.notes ?? '' }}
        submitLabel={payFor.pay ? 'ذخیرهٔ تغییرات' : 'ثبت پرداخت'}
        onSubmit={async (v) => {
          const data: Partial<FinPayment> = { paymentDate: String(v.paymentDate), amount: num(v.amount), method: String(v.method ?? ''), referenceNumber: String(v.referenceNumber ?? ''), notes: String(v.notes ?? ''), fx: { fcAmount: num(v.fcAmount), fcCurrency: String(v.fcCurrency ?? ''), exchangeRate: num(v.exchangeRate), fcRialEquivalent: 0, rateDate: null } }
          const certId = String(v.certificateId)
          if (payFor.pay) await updatePayment(payFor.pay.id, data); else await createPayment(certId, data)
          await syncPaid(certId)
        }} onClose={() => setPayFor(null)}
        extra={payCert ? <Section title="پرداخت‌های قبلی این صورت‌وضعیت" flush><DataTable rows={pays.filter((p) => p.certificateId === payCert.id)} rowKey={(p) => p.id} empty="هنوز پرداختی نیست." cols={[{ key: 'd', label: 'تاریخ', render: (p) => fmtD(p.paymentDate) }, { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (p) => fmtBn(p.amount + p.fx.fcRialEquivalent) }]} /></Section> : undefined} />}
    </div>
  )
}
