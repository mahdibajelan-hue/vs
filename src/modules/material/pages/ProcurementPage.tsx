import { useState } from 'react'
import { FileText, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { fmtDate, fmtQty, fmtValue } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  PO_STATUS_COLOR,
  PO_STATUS_LABEL_FA,
  PO_STATUSES,
  PROCUREMENT_REQUEST_STATUS_COLOR,
  PROCUREMENT_REQUEST_STATUS_LABEL_FA,
  PROCUREMENT_REQUEST_STATUSES,
  type PoStatus,
  type ProcurementRequest,
  type ProcurementRequestStatus,
  type PurchaseOrder,
} from '../types'

type SubTab = 'requests' | 'orders'

export function ProcurementPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const organizations = useMasterDataStore((s) => s.organizations)
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const requests = useMaterialStore((s) => s.procurementRequests).filter((r) => r.masterProjectId === masterProjectId)
  const reqLines = useMaterialStore((s) => s.procurementLines)
  const orders = useMaterialStore((s) => s.purchaseOrders).filter((p) => p.masterProjectId === masterProjectId)
  const poLines = useMaterialStore((s) => s.poLines)

  const createProcurementRequest = useMaterialStore((s) => s.createProcurementRequest)
  const updateProcurementRequest = useMaterialStore((s) => s.updateProcurementRequest)
  const deleteProcurementRequest = useMaterialStore((s) => s.deleteProcurementRequest)
  const addProcurementLine = useMaterialStore((s) => s.addProcurementLine)
  const deleteProcurementLine = useMaterialStore((s) => s.deleteProcurementLine)

  const createPurchaseOrder = useMaterialStore((s) => s.createPurchaseOrder)
  const updatePurchaseOrder = useMaterialStore((s) => s.updatePurchaseOrder)
  const deletePurchaseOrder = useMaterialStore((s) => s.deletePurchaseOrder)
  const addPoLine = useMaterialStore((s) => s.addPoLine)
  const deletePoLine = useMaterialStore((s) => s.deletePoLine)

  const [subTab, setSubTab] = useState<SubTab>('requests')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [editingRequest, setEditingRequest] = useState<ProcurementRequest | null>(null)
  const [addingLineFor, setAddingLineFor] = useState<string | null>(null)
  const [showNewPo, setShowNewPo] = useState(false)
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null)
  const [addingPoLineFor, setAddingPoLineFor] = useState<string | null>(null)

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—'
  const materialLabel = (id: string) => {
    const m = materials.find((mm) => mm.id === id)
    return m ? `${m.materialCode || m.lineNo} — ${m.description}` : '—'
  }

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">تامین و خرید کالا</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        <div className="mt-3 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
          <button
            onClick={() => setSubTab('requests')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'requests' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            درخواست خرید (MR/RFQ)
          </button>
          <button
            onClick={() => setSubTab('orders')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'orders' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            سفارش خرید (PO/Contract)
          </button>
        </div>
      </div>

      {subTab === 'requests' ? (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowNewRequest(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> درخواست خرید جدید
            </button>
          </div>
          {requests.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز درخواست خریدی ثبت نشده است.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const lines = reqLines.filter((l) => l.requestId === r.id)
                const isOpen = expanded === r.id
                return (
                  <div key={r.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText size={14} style={{ color: MATERIAL_ACCENT }} />
                          <p className="text-sm font-bold">{r.mrNumber || 'MR بدون شماره'}</p>
                          <span
                            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{ borderColor: `${PROCUREMENT_REQUEST_STATUS_COLOR[r.status]}55`, color: PROCUREMENT_REQUEST_STATUS_COLOR[r.status] }}
                          >
                            {PROCUREMENT_REQUEST_STATUS_LABEL_FA[r.status]}
                          </span>
                        </div>
                        <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                          {fmtDate(r.mrDate)}
                        </p>
                        {r.supplierOrgId && <p className="mt-1 text-xs text-secondary">تامین‌کننده: {orgName(r.supplierOrgId)}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={r.status}
                          onChange={(e) => updateProcurementRequest(r.id, { status: e.target.value as ProcurementRequestStatus })}
                          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] outline-none"
                        >
                          {PROCUREMENT_REQUEST_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {PROCUREMENT_REQUEST_STATUS_LABEL_FA[s]}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => setEditingRequest(r)} className="text-xs text-secondary hover:underline">
                          ویرایش
                        </button>
                        <button onClick={() => deleteProcurementRequest(r.id)} className="text-muted hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="mt-3 text-[11px] font-medium hover:underline" style={{ color: MATERIAL_ACCENT }}>
                      {isOpen ? 'بستن اقلام' : `اقلام درخواستی (${lines.length})`}
                    </button>

                    {isOpen && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        {lines.length === 0 && <p className="text-xs text-muted">قلمی ثبت نشده است.</p>}
                        {lines.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{materialLabel(l.materialId)}</span>
                            <span className="num shrink-0 text-xs font-bold">{fmtQty(l.quantityRequested)}</span>
                            <button onClick={() => deleteProcurementLine(l.id)} className="shrink-0 text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setAddingLineFor(r.id)} className="flex items-center gap-1 text-[11px] text-secondary hover:text-current">
                          <Plus size={11} /> افزودن قلم
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowNewPo(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> سفارش خرید جدید
            </button>
          </div>
          {orders.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز سفارش خریدی ثبت نشده است.</div>
          ) : (
            <div className="space-y-3">
              {orders.map((po) => {
                const lines = poLines.filter((l) => l.poId === po.id)
                const isOpen = expanded === po.id
                const totalValue = lines.reduce((sum, l) => sum + l.quantityOrdered * l.unitPrice, 0)
                return (
                  <div key={po.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={14} style={{ color: MATERIAL_ACCENT }} />
                          <p className="text-sm font-bold">{po.poNumber || 'PO بدون شماره'}</p>
                          <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${PO_STATUS_COLOR[po.status]}55`, color: PO_STATUS_COLOR[po.status] }}>
                            {PO_STATUS_LABEL_FA[po.status]}
                          </span>
                        </div>
                        <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                          {fmtDate(po.poDate)}
                        </p>
                        <p className="mt-1 text-xs text-secondary">تامین‌کننده: {orgName(po.supplierOrgId)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={po.status}
                          onChange={(e) => updatePurchaseOrder(po.id, { status: e.target.value as PoStatus })}
                          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] outline-none"
                        >
                          {PO_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {PO_STATUS_LABEL_FA[s]}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => setEditingPo(po)} className="text-xs text-secondary hover:underline">
                          ویرایش
                        </button>
                        <button onClick={() => deletePurchaseOrder(po.id)} className="text-muted hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p className="num mt-2 text-sm font-bold" style={{ color: MATERIAL_ACCENT }}>
                      {fmtValue(totalValue, po.currency)}
                    </p>

                    <button onClick={() => setExpanded(isOpen ? null : po.id)} className="mt-2 text-[11px] font-medium hover:underline" style={{ color: MATERIAL_ACCENT }}>
                      {isOpen ? 'بستن اقلام' : `اقلام سفارش (${lines.length})`}
                    </button>

                    {isOpen && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        {lines.length === 0 && <p className="text-xs text-muted">قلمی ثبت نشده است.</p>}
                        {lines.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{materialLabel(l.materialId)}</span>
                            <span className="num shrink-0 text-xs">{fmtQty(l.quantityOrdered)}</span>
                            <span className="num shrink-0 text-xs font-bold">{fmtValue(l.quantityOrdered * l.unitPrice, po.currency)}</span>
                            <button onClick={() => deletePoLine(l.id)} className="shrink-0 text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setAddingPoLineFor(po.id)} className="flex items-center gap-1 text-[11px] text-secondary hover:text-current">
                          <Plus size={11} /> افزودن قلم
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {showNewRequest && (
        <RequestModal
          title="درخواست خرید جدید"
          organizations={organizations}
          onClose={() => setShowNewRequest(false)}
          onSave={async (data) => {
            await createProcurementRequest(masterProjectId, data)
            setShowNewRequest(false)
          }}
        />
      )}
      {editingRequest && (
        <RequestModal
          title="ویرایش درخواست خرید"
          organizations={organizations}
          initial={editingRequest}
          onClose={() => setEditingRequest(null)}
          onSave={async (data) => {
            await updateProcurementRequest(editingRequest.id, data)
            setEditingRequest(null)
          }}
        />
      )}
      {addingLineFor && (
        <AddLineModal
          materials={materials}
          onClose={() => setAddingLineFor(null)}
          onSave={async (materialId, qty) => {
            await addProcurementLine(addingLineFor, materialId, qty)
            setAddingLineFor(null)
          }}
        />
      )}

      {showNewPo && (
        <PoModal
          title="سفارش خرید جدید"
          organizations={organizations}
          requests={requests}
          onClose={() => setShowNewPo(false)}
          onSave={async (data) => {
            await createPurchaseOrder(masterProjectId, data)
            setShowNewPo(false)
          }}
        />
      )}
      {editingPo && (
        <PoModal
          title="ویرایش سفارش خرید"
          organizations={organizations}
          requests={requests}
          initial={editingPo}
          onClose={() => setEditingPo(null)}
          onSave={async (data) => {
            await updatePurchaseOrder(editingPo.id, data)
            setEditingPo(null)
          }}
        />
      )}
      {addingPoLineFor && (
        <AddPoLineModal
          materials={materials}
          onClose={() => setAddingPoLineFor(null)}
          onSave={async (data) => {
            await addPoLine(addingPoLineFor, data)
            setAddingPoLineFor(null)
          }}
        />
      )}
    </div>
  )
}

function RequestModal({
  title,
  organizations,
  initial,
  onClose,
  onSave,
}: {
  title: string
  organizations: { id: string; name: string }[]
  initial?: ProcurementRequest
  onClose: () => void
  onSave: (data: Partial<ProcurementRequest>) => Promise<void>
}) {
  const [mrNumber, setMrNumber] = useState(initial?.mrNumber ?? '')
  const [mrDate, setMrDate] = useState(initial?.mrDate ?? new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<ProcurementRequestStatus>(initial?.status ?? 'draft')
  const [supplierOrgId, setSupplierOrgId] = useState(initial?.supplierOrgId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ mrNumber, mrDate, status, supplierOrgId: supplierOrgId || null, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره MR</span>
          <input value={mrNumber} onChange={(e) => setMrNumber(e.target.value)} className="input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <JalaliDateInput value={mrDate} onChange={setMrDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProcurementRequestStatus)} className="input">
            {PROCUREMENT_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROCUREMENT_REQUEST_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تامین‌کننده (پس از واگذاری)</span>
          <select value={supplierOrgId} onChange={(e) => setSupplierOrgId(e.target.value)} className="input">
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddLineModal({ materials, onClose, onSave }: { materials: { id: string; materialCode: string; description: string }[]; onClose: () => void; onSave: (materialId: string, qty: number) => Promise<void> }) {
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!materialId || qty === '') return
    setSaving(true)
    await onSave(materialId, Number(qty))
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">افزودن قلم</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کالا</span>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="input" autoFocus>
            <option value="">انتخاب کنید</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.materialCode || '—'} — {m.description}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مقدار</span>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="input num" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={!materialId || qty === '' || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PoModal({
  title,
  organizations,
  requests,
  initial,
  onClose,
  onSave,
}: {
  title: string
  organizations: { id: string; name: string }[]
  requests: ProcurementRequest[]
  initial?: PurchaseOrder
  onClose: () => void
  onSave: (data: Partial<PurchaseOrder>) => Promise<void>
}) {
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? '')
  const [poDate, setPoDate] = useState(initial?.poDate ?? new Date().toISOString().slice(0, 10))
  const [requestId, setRequestId] = useState(initial?.requestId ?? '')
  const [supplierOrgId, setSupplierOrgId] = useState(initial?.supplierOrgId ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [status, setStatus] = useState<PoStatus>(initial?.status ?? 'issued')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ poNumber, poDate, requestId: requestId || null, supplierOrgId: supplierOrgId || null, currency, status, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره سفارش خرید</span>
          <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <JalaliDateInput value={poDate} onChange={setPoDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">درخواست خرید مرتبط</span>
          <select value={requestId} onChange={(e) => setRequestId(e.target.value)} className="input">
            <option value="">—</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.mrNumber || 'بدون شماره'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تامین‌کننده</span>
          <select value={supplierOrgId} onChange={(e) => setSupplierOrgId(e.target.value)} className="input">
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">ارز</span>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="input" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as PoStatus)} className="input">
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddPoLineModal({
  materials,
  onClose,
  onSave,
}: {
  materials: { id: string; materialCode: string; description: string; unitPrice: number }[]
  onClose: () => void
  onSave: (data: { materialId: string; quantityOrdered: number; unitPrice: number; plannedDeliveryDate: string | null }) => Promise<void>
}) {
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState('')
  const [saving, setSaving] = useState(false)

  const selectMaterial = (id: string) => {
    setMaterialId(id)
    const m = materials.find((mm) => mm.id === id)
    if (m && unitPrice === '') setUnitPrice(String(m.unitPrice))
  }

  const submit = async () => {
    if (!materialId || qty === '') return
    setSaving(true)
    await onSave({ materialId, quantityOrdered: Number(qty), unitPrice: Number(unitPrice) || 0, plannedDeliveryDate: plannedDeliveryDate || null })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">افزودن قلم سفارش خرید</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کالا</span>
          <select value={materialId} onChange={(e) => selectMaterial(e.target.value)} className="input" autoFocus>
            <option value="">انتخاب کنید</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.materialCode || '—'} — {m.description}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مقدار سفارش</span>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">قیمت واحد</span>
          <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ تحویل برنامه‌ریزی‌شده</span>
          <JalaliDateInput value={plannedDeliveryDate} onChange={setPlannedDeliveryDate} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={!materialId || qty === '' || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  )
}
