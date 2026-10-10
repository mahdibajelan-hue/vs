import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { bn, fa } from '../../components/control/common'
import {
  MANUFACTURING_STATUSES, MANUFACTURING_STATUS_LABEL_FA, PO_STATUSES, PO_STATUS_LABEL_FA, PROCUREMENT_REQUEST_STATUSES, PROCUREMENT_REQUEST_STATUS_LABEL_FA, SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL_FA,
  type Allocation, type ManufacturingStatus, type Material, type PoLine, type PoStatus, type ProcurementRequest, type ProcurementRequestStatus, type PurchaseOrder, type Shipment, type ShipmentStatus,
} from '../../types'

const Close = ({ onClose, title, sub, children, wide }: { onClose: () => void; title: string; sub?: string; children: React.ReactNode; wide?: boolean }) => (
  <div className="im-overlay"><div className="im-modal fn-form" style={{ maxWidth: wide ? 900 : 700 }} role="dialog" aria-modal="true" aria-label={title}>
    <div className="im-modal-head"><div><div className="im-modal-title">{title}</div>{sub && <p className="im-helper" style={{ margin: 0 }}>{sub}</p>}</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
    {children}
  </div></div>
)
function useCtx(projectId: string) {
  const m = useMaterialModel(projectId)
  const ms = useMaterialStore()
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const matOptions = m.materials.map((x) => ({ value: x.id, label: `${x.materialCode} · ${x.description}` }))
  const orgOptions = orgs.map((o) => ({ value: o.id, label: o.name }))
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const pkgOptions = m.packages.map((p) => ({ value: p.id, label: `${p.code} · ${p.title}` }))
  return { m, ms, cs, byId, matOptions, orgOptions, orgName, pkgOptions, can: cs.can(projectId, 'edit_packages') }
}

/** Purchase requests (MR) and purchase orders (PO) with their lines. A package can have several of each. */
export function OrdersPage({ projectId }: { projectId: string }) {
  const c = useCtx(projectId)
  const { m, ms, byId } = c
  const [mrForm, setMrForm] = useState<ProcurementRequest | 'new' | null>(null)
  const [poForm, setPoForm] = useState<PurchaseOrder | 'new' | null>(null)
  const [detail, setDetail] = useState<{ kind: 'mr' | 'po'; id: string } | null>(null)
  const mrs = ms.procurementRequests.filter((r) => r.masterProjectId === projectId)
  const pos = m.data.purchaseOrders
  const poValue = (id: string) => ms.poLines.filter((l) => l.poId === id).reduce((a, l) => a + l.quantityOrdered * l.unitPrice, 0)
  const pkgName = (id: string | null) => m.packages.find((p) => p.id === id)?.code ?? '—'

  const mrCols: Col<ProcurementRequest>[] = [
    { key: 'n', label: 'درخواست خرید', render: (r) => <><span className="strong">{r.mrNumber}</span><span className="sub">{fmtD(r.mrDate)}</span></> },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={r.status === 'awarded' ? 'good' : r.status === 'cancelled' ? 'neutral' : 'warn'}>{PROCUREMENT_REQUEST_STATUS_LABEL_FA[r.status]}</Chip> },
    { key: 'p', label: 'بسته', render: (r) => pkgName(r.packageId) }, { key: 'o', label: 'تأمین‌کننده', render: (r) => c.orgName(r.supplierOrgId) },
    { key: 'l', label: 'اقلام', num: true, render: (r) => fa(ms.procurementLines.filter((l) => l.requestId === r.id).length) },
    { key: 'a', label: '', render: (r) => c.can ? <span className="fn-row-actions"><button aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setMrForm(r) }}><Pencil size={14} /></button><button className="danger" aria-label="حذف" onClick={(e) => { e.stopPropagation(); if (window.confirm('درخواست خرید حذف شود؟')) void ms.deleteProcurementRequest(r.id) }}><Trash2 size={14} /></button></span> : null },
  ]
  const poCols: Col<PurchaseOrder>[] = [
    { key: 'n', label: 'سفارش خرید', render: (r) => <><span className="strong">{r.poNumber} {r.isDemo && <span className="mt-demo">آزمایشی</span>}</span><span className="sub">{fmtD(r.poDate)}</span></> },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={r.status === 'completed' ? 'good' : r.status === 'cancelled' ? 'neutral' : r.status === 'draft' ? 'neutral' : 'warn'}>{PO_STATUS_LABEL_FA[r.status]}</Chip> },
    { key: 'p', label: 'بسته', render: (r) => pkgName(r.packageId) }, { key: 'o', label: 'تأمین‌کننده', render: (r) => c.orgName(r.supplierOrgId) },
    { key: 'l', label: 'اقلام', num: true, render: (r) => fa(ms.poLines.filter((l) => l.poId === r.id).length) },
    { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (r) => bn(poValue(r.id)), sort: (r) => poValue(r.id) },
    { key: 'a', label: '', render: (r) => c.can ? <span className="fn-row-actions"><button aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setPoForm(r) }}><Pencil size={14} /></button><button className="danger" aria-label="حذف" onClick={(e) => { e.stopPropagation(); if (window.confirm('سفارش با اقلامش حذف شود؟')) void ms.deletePurchaseOrder(r.id) }}><Trash2 size={14} /></button></span> : null },
  ]
  const org = (id: string | null) => id ?? ''
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="fn-kpis"><KpiCard i={0} label="درخواست خرید" value={fa(mrs.length)} sub={`${fa(mrs.filter((r) => r.status === 'awarded').length)} واگذارشده`} /><KpiCard i={1} label="سفارش‌های فعال" value={fa(pos.filter((p) => p.status === 'issued' || p.status === 'active').length)} /><KpiCard i={2} label="ارزش سفارش‌ها" value={bn(pos.filter((p) => p.status !== 'cancelled' && p.status !== 'draft').reduce((a, p) => a + poValue(p.id), 0))} unit="میلیارد ریال" /><KpiCard i={3} label="قلم بدون سفارش" value={fa(m.materials.filter((x) => (m.positions.get(x.id)?.requiredQty ?? 0) > 0 && (m.positions.get(x.id)?.ordered ?? 0) === 0).length)} tone="warn" /></div>
      <div className="mt-filters"><b>درخواست‌های خرید (MR)</b>{c.can && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setMrForm('new')}><Plus size={14} /> درخواست جدید</button>}</div>
      <DataTable cols={mrCols} rows={mrs} rowKey={(r) => r.id} onRow={(r) => setDetail({ kind: 'mr', id: r.id })} empty="درخواست خریدی ثبت نشده است." />
      <div className="mt-filters"><b>سفارش‌های خرید (PO)</b>{c.can && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setPoForm('new')}><Plus size={14} /> سفارش جدید</button>}</div>
      <DataTable cols={poCols} rows={pos} rowKey={(r) => r.id} onRow={(r) => setDetail({ kind: 'po', id: r.id })} empty="سفارشی ثبت نشده است." />

      {mrForm && <FormModal title={mrForm === 'new' ? 'درخواست خرید جدید' : `ویرایش ${mrForm.mrNumber}`} submitLabel="ذخیره" onClose={() => setMrForm(null)}
        fields={[{ key: 'n', label: 'شمارهٔ درخواست', kind: 'text', required: true }, { key: 'd', label: 'تاریخ', kind: 'date', required: true }, { key: 's', label: 'وضعیت', kind: 'select', required: true, options: PROCUREMENT_REQUEST_STATUSES.map((s) => ({ value: s, label: PROCUREMENT_REQUEST_STATUS_LABEL_FA[s] })) }, { key: 'o', label: 'تأمین‌کننده', kind: 'select', options: c.orgOptions }, { key: 'p', label: 'بستهٔ خرید', kind: 'select', options: c.pkgOptions }, { key: 'x', label: 'یادداشت', kind: 'text', span: 2 }]}
        initial={{ n: mrForm === 'new' ? `MR-${String(mrs.length + 1).padStart(3, '0')}` : mrForm.mrNumber, d: mrForm === 'new' ? new Date().toISOString().slice(0, 10) : mrForm.mrDate, s: mrForm === 'new' ? 'draft' : mrForm.status, o: mrForm === 'new' ? '' : org(mrForm.supplierOrgId), p: mrForm === 'new' ? '' : org(mrForm.packageId), x: mrForm === 'new' ? '' : mrForm.notes }}
        onSubmit={async (v) => { const d = { mrNumber: String(v.n), mrDate: String(v.d), status: v.s as ProcurementRequestStatus, supplierOrgId: (v.o as string) || null, packageId: (v.p as string) || null, notes: String(v.x ?? '') }; if (mrForm === 'new') await ms.createProcurementRequest(projectId, d); else await ms.updateProcurementRequest(mrForm.id, d) }} />}
      {poForm && <FormModal title={poForm === 'new' ? 'سفارش خرید جدید' : `ویرایش ${poForm.poNumber}`} submitLabel="ذخیره" onClose={() => setPoForm(null)}
        fields={[{ key: 'n', label: 'شمارهٔ سفارش', kind: 'text', required: true }, { key: 'd', label: 'تاریخ', kind: 'date', required: true }, { key: 's', label: 'وضعیت', kind: 'select', required: true, options: PO_STATUSES.map((s) => ({ value: s, label: PO_STATUS_LABEL_FA[s] })) }, { key: 'o', label: 'تأمین‌کننده / سازنده', kind: 'select', options: c.orgOptions }, { key: 'p', label: 'بستهٔ خرید', kind: 'select', options: c.pkgOptions }, { key: 'r', label: 'درخواست خرید مرتبط', kind: 'select', options: mrs.map((r) => ({ value: r.id, label: r.mrNumber })) }, { key: 'c', label: 'ارز', kind: 'text' }, { key: 'x', label: 'یادداشت', kind: 'text', span: 2 }]}
        initial={{ n: poForm === 'new' ? `PO-${String(pos.length + 1).padStart(3, '0')}` : poForm.poNumber, d: poForm === 'new' ? new Date().toISOString().slice(0, 10) : poForm.poDate, s: poForm === 'new' ? 'draft' : poForm.status, o: poForm === 'new' ? '' : org(poForm.supplierOrgId), p: poForm === 'new' ? '' : org(poForm.packageId), r: poForm === 'new' ? '' : org(poForm.requestId), c: poForm === 'new' ? 'IRR' : poForm.currency, x: poForm === 'new' ? '' : poForm.notes }}
        onSubmit={async (v) => { const d = { poNumber: String(v.n), poDate: String(v.d), status: v.s as PoStatus, supplierOrgId: (v.o as string) || null, packageId: (v.p as string) || null, requestId: (v.r as string) || null, currency: String(v.c || 'IRR'), notes: String(v.x ?? '') }; if (poForm === 'new') await ms.createPurchaseOrder(projectId, d); else await ms.updatePurchaseOrder(poForm.id, d) }} />}
      {detail?.kind === 'mr' && <MrDetail id={detail.id} c={c} onClose={() => setDetail(null)} />}
      {detail?.kind === 'po' && <PoDetail id={detail.id} c={c} byId={byId} onClose={() => setDetail(null)} />}
    </div>
  )
}

type Ctx = ReturnType<typeof useCtx>
function MrDetail({ id, c, onClose }: { id: string; c: Ctx; onClose: () => void }) {
  const ms = useMaterialStore()
  const r = ms.procurementRequests.find((x) => x.id === id)
  const lines = ms.procurementLines.filter((l) => l.requestId === id)
  const [mat, setMat] = useState(''); const [qty, setQty] = useState(0)
  if (!r) return null
  return (
    <Close title={`درخواست ${r.mrNumber}`} sub={PROCUREMENT_REQUEST_STATUS_LABEL_FA[r.status]} onClose={onClose}>
      <DataTable rows={lines} rowKey={(l) => l.id} empty="هنوز قلمی در درخواست نیست." cols={[{ key: 'm', label: 'قلم', render: (l) => <span className="strong">{c.byId.get(l.materialId)?.description ?? '—'}</span> }, { key: 'q', label: 'مقدار', num: true, render: (l) => `${fa(l.quantityRequested, 2)} ${c.byId.get(l.materialId)?.unit ?? ''}` }, { key: 'x', label: '', render: (l) => c.can ? <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => void ms.deleteProcurementLine(l.id)}><Trash2 size={13} /></button> : null }]} />
      {c.can && <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6, marginTop: 10 }}><select value={mat} onChange={(e) => setMat(e.target.value)} aria-label="قلم"><option value="">قلم…</option>{c.matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><input inputMode="decimal" dir="ltr" placeholder="مقدار" value={qty || ''} onChange={(e) => setQty(Number(e.target.value) || 0)} aria-label="مقدار" /><button className="im-btn im-btn-primary im-btn-sm" disabled={!mat || qty <= 0} onClick={async () => { await ms.addProcurementLine(id, mat, qty); setMat(''); setQty(0) }}><Plus size={13} /> افزودن</button></div>}
    </Close>
  )
}

function PoDetail({ id, c, byId, onClose }: { id: string; c: Ctx; byId: Map<string, Material>; onClose: () => void }) {
  const ms = useMaterialStore()
  const po = ms.purchaseOrders.find((x) => x.id === id)
  const lines = ms.poLines.filter((l) => l.poId === id)
  const [f, setF] = useState<{ mat: string; qty: number; price: number; date: string }>({ mat: '', qty: 0, price: 0, date: '' })
  if (!po) return null
  const mf = (l: PoLine) => ms.manufacturing.find((x) => x.poLineId === l.id)
  return (
    <Close wide title={`سفارش ${po.poNumber}`} sub={`${PO_STATUS_LABEL_FA[po.status]} · ${c.orgName(po.supplierOrgId)}`} onClose={onClose}>
      <DataTable rows={lines} rowKey={(l) => l.id} empty="هنوز قلمی در سفارش نیست." foot cols={[
        { key: 'm', label: 'قلم', render: (l) => <span className="strong">{byId.get(l.materialId)?.description ?? '—'}</span> }, { key: 'q', label: 'مقدار', num: true, render: (l) => `${fa(l.quantityOrdered, 2)} ${byId.get(l.materialId)?.unit ?? ''}` },
        { key: 'p', label: 'قیمت واحد', num: true, render: (l) => fa(l.unitPrice) }, { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (l) => bn(l.quantityOrdered * l.unitPrice, 2), foot: <b>{bn(lines.reduce((a, l) => a + l.quantityOrdered * l.unitPrice, 0), 2)}</b> },
        { key: 'd', label: 'تحویل برنامه‌ای', render: (l) => fmtD(l.plannedDeliveryDate) }, { key: 's', label: 'ساخت', render: (l) => { const x = mf(l); return <Chip tone={x?.status === 'ready_for_shipment' || x?.status === 'fat_passed' ? 'good' : x?.status === 'fat_failed' ? 'bad' : 'neutral'}>{MANUFACTURING_STATUS_LABEL_FA[x?.status ?? 'not_started']}</Chip> } },
        { key: 'x', label: '', render: (l) => c.can ? <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => void ms.deletePoLine(l.id)}><Trash2 size={13} /></button> : null }]} />
      {c.can && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 6, marginTop: 10 }}>
          <select value={f.mat} onChange={(e) => { const x = byId.get(e.target.value); setF({ ...f, mat: e.target.value, price: x?.unitPrice ?? 0 }) }} aria-label="قلم"><option value="">قلم…</option>{c.matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input inputMode="decimal" dir="ltr" placeholder="مقدار" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: Number(e.target.value) || 0 })} aria-label="مقدار" />
          <input inputMode="decimal" dir="ltr" placeholder="قیمت واحد" value={f.price || ''} onChange={(e) => setF({ ...f, price: Number(e.target.value) || 0 })} aria-label="قیمت واحد" />
          <JalaliDateInput value={f.date} onChange={(x) => setF({ ...f, date: x })} />
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.mat || f.qty <= 0} onClick={async () => { await ms.addPoLine(id, { materialId: f.mat, quantityOrdered: f.qty, unitPrice: f.price, plannedDeliveryDate: f.date || null }); setF({ mat: '', qty: 0, price: 0, date: '' }) }}><Plus size={13} /> افزودن</button>
        </div>
      )}
    </Close>
  )
}

/** Manufacturing and inspection of every ordered line: status, FAT, long-lead flag, planned and actual ready dates, and how late it is. */
export function FactoryPage({ projectId }: { projectId: string }) {
  const c = useCtx(projectId)
  const { m, ms, byId } = c
  const [edit, setEdit] = useState<PoLine | null>(null)
  const lines = ms.poLines.filter((l) => m.data.purchaseOrders.some((p) => p.id === l.poId))
  const poOf = (l: PoLine) => m.data.purchaseOrders.find((p) => p.id === l.poId)
  const mf = (l: PoLine) => ms.manufacturing.find((x) => x.poLineId === l.id)
  const delay = (l: PoLine) => { const x = mf(l); const planned = x?.plannedReadyDate ?? null; if (!planned || x?.actualReadyDate || ['fat_passed', 'ready_for_shipment'].includes(x?.status ?? '')) return null; const d = Math.round((Date.parse(m.today) - Date.parse(planned)) / 86400000); return d > 0 ? d : null }
  const late = lines.filter((l) => delay(l) != null)
  const cols: Col<PoLine>[] = [
    { key: 'm', label: 'قلم', render: (l) => <><span className="strong">{byId.get(l.materialId)?.description ?? '—'}</span><span className="sub">{poOf(l)?.poNumber} · {c.orgName(poOf(l)?.supplierOrgId ?? null)}</span></> },
    { key: 'q', label: 'مقدار', num: true, render: (l) => `${fa(l.quantityOrdered, 1)} ${byId.get(l.materialId)?.unit ?? ''}` },
    { key: 's', label: 'وضعیت ساخت', render: (l) => { const x = mf(l); return <><Chip tone={x?.status === 'ready_for_shipment' || x?.status === 'fat_passed' ? 'good' : x?.status === 'fat_failed' ? 'bad' : x?.status === 'in_progress' || x?.status === 'fat_scheduled' ? 'warn' : 'neutral'}>{MANUFACTURING_STATUS_LABEL_FA[x?.status ?? 'not_started']}</Chip>{x?.isLongLead && <span className="sub">زمان تأمین طولانی</span>}</> } },
    { key: 'p', label: 'آمادگی برنامه‌ای', render: (l) => fmtD(mf(l)?.plannedReadyDate) }, { key: 'a', label: 'آمادگی واقعی', render: (l) => fmtD(mf(l)?.actualReadyDate) }, { key: 'f', label: 'تاریخ FAT', render: (l) => fmtD(mf(l)?.fatDate) },
    { key: 'd', label: 'تأخیر', num: true, render: (l) => { const d = delay(l); return d ? <b style={{ color: 'var(--im-coral)' }}>{fa(d)} روز</b> : <span style={{ opacity: .35 }}>—</span> }, sort: (l) => delay(l) ?? 0 },
    { key: 'e', label: '', render: (l) => c.can ? <button className="im-btn im-btn-sm" aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setEdit(l) }}><Pencil size={13} /></button> : null },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis"><KpiCard i={0} label="اقلام در ساخت" value={fa(lines.filter((l) => ['in_progress', 'fat_scheduled'].includes(mf(l)?.status ?? '')).length)} /><KpiCard i={1} label="آمادهٔ ارسال یا FAT موفق" value={fa(lines.filter((l) => ['ready_for_shipment', 'fat_passed'].includes(mf(l)?.status ?? '')).length)} tone="good" /><KpiCard i={2} label="تأخیر ساخت" value={fa(late.length)} tone={late.length ? 'bad' : 'good'} /><KpiCard i={3} label="FAT ناموفق" value={fa(lines.filter((l) => mf(l)?.status === 'fat_failed').length)} tone="bad" /></div>
      <DataTable cols={cols} rows={lines} rowKey={(l) => l.id} empty="هنوز قلمی سفارش داده نشده است." />
      {edit && <FormModal title={`ساخت و بازرسی · ${byId.get(edit.materialId)?.description ?? ''}`} submitLabel="ذخیره" onClose={() => setEdit(null)}
        fields={[{ key: 's', label: 'وضعیت', kind: 'select', required: true, options: MANUFACTURING_STATUSES.map((s) => ({ value: s, label: MANUFACTURING_STATUS_LABEL_FA[s] })) }, { key: 'l', label: 'زمان تأمین طولانی', kind: 'select', options: [{ value: '0', label: 'خیر' }, { value: '1', label: 'بله' }] }, { key: 'p', label: 'آمادگی برنامه‌ای', kind: 'date' }, { key: 'a', label: 'آمادگی واقعی', kind: 'date' }, { key: 'f', label: 'تاریخ FAT', kind: 'date' }, { key: 'n', label: 'یادداشت', kind: 'text', span: 2 }]}
        initial={{ s: mf(edit)?.status ?? 'not_started', l: mf(edit)?.isLongLead ? '1' : '0', p: mf(edit)?.plannedReadyDate ?? null, a: mf(edit)?.actualReadyDate ?? null, f: mf(edit)?.fatDate ?? null, n: mf(edit)?.notes ?? '' }}
        onSubmit={async (v) => { await ms.upsertManufacturing(edit.id, { status: v.s as ManufacturingStatus, isLongLead: v.l === '1', plannedReadyDate: (v.p as string) || null, actualReadyDate: (v.a as string) || null, fatDate: (v.f as string) || null, notes: String(v.n ?? '') }) }} />}
    </div>
  )
}

/** Release notes (permission to ship or hand over) and shipments with their lines. */
export function ShippingPage({ projectId }: { projectId: string }) {
  const c = useCtx(projectId)
  const { m, ms, byId } = c
  const [form, setForm] = useState<Shipment | 'new' | null>(null)
  const [rel, setRel] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const ships = ms.shipments.filter((s) => s.masterProjectId === projectId)
  const releases = ms.releaseNotes.filter((r) => r.masterProjectId === projectId)
  const sh = ships.find((s) => s.id === open)
  const [line, setLine] = useState<{ mat: string; qty: number }>({ mat: '', qty: 0 })
  const cols: Col<Shipment>[] = [
    { key: 'n', label: 'محموله', render: (s) => <><span className="strong">{s.shipmentNumber}</span><span className="sub">{fmtD(s.shipmentDate)} · {s.carrier}</span></> },
    { key: 'r', label: 'مسیر', render: (s) => `${s.origin || '—'} ← ${s.destination || '—'}` },
    { key: 's', label: 'وضعیت', render: (s) => <Chip tone={s.status === 'delivered' ? 'good' : s.status === 'planned' ? 'neutral' : 'warn'}>{SHIPMENT_STATUS_LABEL_FA[s.status]}</Chip> },
    { key: 'e', label: 'ورود برنامه‌ای', render: (s) => <>{fmtD(s.eta)}{s.ata && <span className="sub">واقعی {fmtD(s.ata)}</span>}{!s.ata && s.eta && s.eta < m.today && s.status !== 'delivered' && <span className="sub" style={{ color: 'var(--im-coral)' }}>{fa(Math.round((Date.parse(m.today) - Date.parse(s.eta)) / 86400000))} روز تأخیر</span>}</> },
    { key: 'l', label: 'اقلام', num: true, render: (s) => fa(ms.shipmentLines.filter((l) => l.shipmentId === s.id).length) },
    { key: 'a', label: '', render: (s) => c.can ? <span className="fn-row-actions"><button aria-label="ویرایش" onClick={(e) => { e.stopPropagation(); setForm(s) }}><Pencil size={14} /></button><button className="danger" aria-label="حذف" onClick={(e) => { e.stopPropagation(); if (window.confirm('محموله حذف شود؟')) void ms.deleteShipment(s.id) }}><Trash2 size={14} /></button></span> : null },
  ]
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="fn-kpis"><KpiCard i={0} label="محموله‌های در راه" value={fa(ships.filter((s) => s.status === 'in_transit' || s.status === 'customs').length)} /><KpiCard i={1} label="تحویل‌شده" value={fa(ships.filter((s) => s.status === 'delivered').length)} tone="good" /><KpiCard i={2} label="مجوزهای حمل" value={fa(releases.length)} /></div>
      <div className="mt-filters"><b>محموله‌ها</b>{c.can && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm('new')}><Plus size={14} /> محمولهٔ جدید</button>}</div>
      <DataTable cols={cols} rows={ships} rowKey={(s) => s.id} onRow={(s) => setOpen(s.id)} empty="محموله‌ای ثبت نشده است." />
      <div className="mt-filters"><b>مجوز حمل / تحویل</b>{c.can && <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setRel(true)}><Plus size={14} /> مجوز جدید</button>}</div>
      <DataTable rows={releases} rowKey={(r) => r.id} empty="مجوزی ثبت نشده است." cols={[{ key: 'n', label: 'مجوز', render: (r) => <span className="strong">{r.releaseNumber}</span> }, { key: 'd', label: 'تاریخ', render: (r) => fmtD(r.releaseDate) }, { key: 'p', label: 'سفارش', render: (r) => ms.purchaseOrders.find((p) => p.id === r.poId)?.poNumber ?? '—' }, { key: 'l', label: 'اقلام', num: true, render: (r) => fa(ms.releaseLines.filter((l) => l.releaseId === r.id).length) }, { key: 'x', label: '', render: (r) => c.can ? <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => void ms.deleteReleaseNote(r.id)}><Trash2 size={13} /></button> : null }]} />
      {form && <FormModal title={form === 'new' ? 'محمولهٔ جدید' : `ویرایش ${form.shipmentNumber}`} submitLabel="ذخیره" onClose={() => setForm(null)}
        fields={[{ key: 'n', label: 'شمارهٔ محموله', kind: 'text', required: true }, { key: 'd', label: 'تاریخ ارسال', kind: 'date', required: true }, { key: 'c', label: 'حمل‌کننده', kind: 'text' }, { key: 't', label: 'کد رهگیری', kind: 'text' }, { key: 'o', label: 'مبدأ', kind: 'text' }, { key: 'x', label: 'مقصد', kind: 'text' }, { key: 's', label: 'وضعیت', kind: 'select', required: true, options: SHIPMENT_STATUSES.map((s) => ({ value: s, label: SHIPMENT_STATUS_LABEL_FA[s] })) }, { key: 'e', label: 'ورود برنامه‌ای (ETA)', kind: 'date' }, { key: 'a', label: 'ورود واقعی (ATA)', kind: 'date' }]}
        initial={{ n: form === 'new' ? `SH-${String(ships.length + 1).padStart(3, '0')}` : form.shipmentNumber, d: form === 'new' ? new Date().toISOString().slice(0, 10) : form.shipmentDate, c: form === 'new' ? '' : form.carrier, t: form === 'new' ? '' : form.trackingRef, o: form === 'new' ? '' : form.origin, x: form === 'new' ? '' : form.destination, s: form === 'new' ? 'planned' : form.status, e: form === 'new' ? null : form.eta, a: form === 'new' ? null : form.ata }}
        onSubmit={async (v) => { const d = { shipmentNumber: String(v.n), shipmentDate: String(v.d), carrier: String(v.c ?? ''), trackingRef: String(v.t ?? ''), origin: String(v.o ?? ''), destination: String(v.x ?? ''), status: v.s as ShipmentStatus, eta: (v.e as string) || null, ata: (v.a as string) || null }; if (form === 'new') await ms.createShipment(projectId, d); else await ms.updateShipment(form.id, d) }} />}
      {rel && <FormModal title="مجوز حمل / تحویل" submitLabel="ثبت" onClose={() => setRel(false)} fields={[{ key: 'n', label: 'شمارهٔ مجوز', kind: 'text', required: true }, { key: 'd', label: 'تاریخ', kind: 'date', required: true }, { key: 'p', label: 'سفارش خرید', kind: 'select', options: m.data.purchaseOrders.map((p) => ({ value: p.id, label: p.poNumber })) }]} initial={{ n: `REL-${String(releases.length + 1).padStart(3, '0')}`, d: new Date().toISOString().slice(0, 10), p: '' }} onSubmit={async (v) => { await ms.createReleaseNote(projectId, { releaseNumber: String(v.n), releaseDate: String(v.d), poId: (v.p as string) || null, notes: '' }) }} />}
      {sh && (
        <Close wide title={`اقلام محمولهٔ ${sh.shipmentNumber}`} onClose={() => setOpen(null)}>
          <DataTable rows={ms.shipmentLines.filter((l) => l.shipmentId === sh.id)} rowKey={(l) => l.id} empty="هنوز قلمی در محموله نیست." cols={[{ key: 'm', label: 'قلم', render: (l) => <span className="strong">{byId.get(l.materialId)?.description ?? '—'}</span> }, { key: 'q', label: 'مقدار', num: true, render: (l) => `${fa(l.quantityShipped, 2)} ${byId.get(l.materialId)?.unit ?? ''}` }, { key: 'x', label: '', render: (l) => c.can ? <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => void ms.deleteShipmentLine(l.id)}><Trash2 size={13} /></button> : null }]} />
          {c.can && <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6, marginTop: 10 }}><select value={line.mat} onChange={(e) => setLine({ ...line, mat: e.target.value })} aria-label="قلم"><option value="">قلم…</option>{c.matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><input inputMode="decimal" dir="ltr" placeholder="مقدار" value={line.qty || ''} onChange={(e) => setLine({ ...line, qty: Number(e.target.value) || 0 })} aria-label="مقدار" /><button className="im-btn im-btn-primary im-btn-sm" disabled={!line.mat || line.qty <= 0} onClick={async () => { await ms.addShipmentLine(sh.id, line.mat, line.qty); setLine({ mat: '', qty: 0 }) }}><Plus size={13} /> افزودن</button></div>}
        </Close>
      )}
    </div>
  )
}

/** Allocation of accepted stock to a station or work front. Use is recorded as issue vouchers in the ledger («انتقال، مصرف و ضایعات»). */
export function AllocationsPage({ projectId }: { projectId: string }) {
  const c = useCtx(projectId)
  const { m, ms, byId } = c
  const [form, setForm] = useState<Allocation | 'new' | null>(null)
  const allocs = m.data.allocations
  const cols: Col<Allocation>[] = [
    { key: 'm', label: 'قلم', render: (a) => <><span className="strong">{byId.get(a.materialId)?.description ?? '—'}</span><span className="sub fn-code">{byId.get(a.materialId)?.materialCode}</span></> },
    { key: 'w', label: 'برنامهٔ کاری / جبهه', render: (a) => <>{a.workPackageName || a.workPackageCode || '—'}<span className="sub">{[a.facility, a.front].filter(Boolean).join(' · ')}</span></> },
    { key: 'q', label: 'تخصیص', num: true, render: (a) => `${fa(a.quantityAllocated, 2)} ${byId.get(a.materialId)?.unit ?? ''}` },
    { key: 'u', label: 'مصرف (از دفتر)', num: true, render: (a) => fa(m.data.txns.filter((t) => t.allocationId === a.id && t.status === 'posted').reduce((s, t) => s + (t.kind === 'issue' ? t.qty : t.kind === 'return' ? -t.qty : 0), 0), 2) },
    { key: 'd', label: 'تاریخ', render: (a) => fmtD(a.allocationDate) }, { key: 's', label: 'وضعیت', render: (a) => <Chip tone={a.status === 'returned' ? 'neutral' : 'good'}>{a.status === 'allocated' ? 'تخصیص‌یافته' : a.status === 'consumed' ? 'مصرف‌شده' : 'برگشت‌شده'}</Chip> },
    { key: 'a', label: '', render: (a) => c.can ? <span className="fn-row-actions"><button aria-label="ویرایش" onClick={() => setForm(a)}><Pencil size={14} /></button><button className="danger" aria-label="حذف" onClick={() => { if (window.confirm('تخصیص حذف شود؟')) void ms.deleteAllocation(a.id) }}><Trash2 size={14} /></button></span> : null },
  ]
  const unalloc = m.materials.filter((x) => (m.positions.get(x.id)?.onHand ?? 0) > 0 && (m.positions.get(x.id)?.allocated ?? 0) === 0)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis"><KpiCard i={0} label="تخصیص‌ها" value={fa(allocs.length)} /><KpiCard i={1} label="موجودی بدون تخصیص" value={fa(unalloc.length)} unit="قلم" tone={unalloc.length ? 'warn' : 'good'} hint="کالای پذیرفته‌شده که برای محل مصرفی تخصیص نیافته" /></div>
      <div className="mt-filters"><p className="im-helper" style={{ margin: 0 }}>تخصیص یعنی رزرو کالای پذیرفته‌شده برای یک ایستگاه یا جبهه؛ مصرف با حواله در دفتر تراکنش ثبت می‌شود.</p>{c.can && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm('new')}><Plus size={14} /> تخصیص جدید</button>}</div>
      <DataTable cols={cols} rows={allocs} rowKey={(a) => a.id} empty="تخصیصی ثبت نشده است." />
      {form && <FormModal title={form === 'new' ? 'تخصیص جدید' : 'ویرایش تخصیص'} submitLabel="ذخیره" onClose={() => setForm(null)}
        fields={[{ key: 'm', label: 'قلم', kind: 'select', required: true, options: c.matOptions, span: 2, disabled: form !== 'new' }, { key: 'q', label: 'مقدار تخصیص', kind: 'num', required: true }, { key: 'd', label: 'تاریخ', kind: 'date', required: true }, { key: 'wc', label: 'کد برنامهٔ کاری', kind: 'text' }, { key: 'wn', label: 'نام برنامهٔ کاری', kind: 'text' }, { key: 'f', label: 'ایستگاه', kind: 'text' }, { key: 'fr', label: 'جبهه کاری', kind: 'text' }]}
        initial={{ m: form === 'new' ? '' : form.materialId, q: form === 'new' ? 0 : form.quantityAllocated, d: form === 'new' ? new Date().toISOString().slice(0, 10) : form.allocationDate, wc: form === 'new' ? '' : form.workPackageCode, wn: form === 'new' ? '' : form.workPackageName, f: form === 'new' ? '' : form.facility, fr: form === 'new' ? '' : form.front }}
        preview={(v) => { const p = m.positions.get(String(v.m)); return p ? <span>موجودی آزاد (رزرونشده): <b>{fa(p.available, 2)} {p.unit}</b> · موجودی قابل‌مصرف {fa(p.onHand, 2)}</span> : null }}
        onSubmit={async (v) => { const d = { materialId: String(v.m), quantityAllocated: Number(v.q) || 0, allocationDate: String(v.d), workPackageCode: String(v.wc ?? ''), workPackageName: String(v.wn ?? ''), facility: String(v.f ?? ''), front: String(v.fr ?? ''), status: 'allocated' as const }; if (form === 'new') await ms.createAllocation(projectId, d); else await ms.updateAllocation(form.id, { quantityAllocated: d.quantityAllocated, allocationDate: d.allocationDate, workPackageCode: d.workPackageCode, workPackageName: d.workPackageName, facility: d.facility, front: d.front }) }} />}
    </div>
  )
}
