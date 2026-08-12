import { useMemo, useState } from 'react'
import { PackageCheck, Plus, Trash2, Warehouse } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { computeMaterialStatus } from '../lib/materialCalc'
import { ResponsiveTable, type ResponsiveTableColumn } from '../../../components/common/ResponsiveTable'
import { fmtDate, fmtQty } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { WAREHOUSE_LINE_CONDITION_LABEL_FA, type WarehouseLineCondition } from '../types'

export function WarehousePage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const poLines = useMaterialStore((s) => s.poLines)
  const purchaseOrders = useMaterialStore((s) => s.purchaseOrders)
  const manufacturing = useMaterialStore((s) => s.manufacturing)
  const releaseLines = useMaterialStore((s) => s.releaseLines)
  const shipmentLines = useMaterialStore((s) => s.shipmentLines)
  const shipments = useMaterialStore((s) => s.shipments).filter((sh) => sh.masterProjectId === masterProjectId)
  const warehouseLines = useMaterialStore((s) => s.warehouseLines)
  const allocations = useMaterialStore((s) => s.allocations)
  const receipts = useMaterialStore((s) => s.warehouseReceipts).filter((r) => r.masterProjectId === masterProjectId)

  const createWarehouseReceipt = useMaterialStore((s) => s.createWarehouseReceipt)
  const deleteWarehouseReceipt = useMaterialStore((s) => s.deleteWarehouseReceipt)
  const addWarehouseLine = useMaterialStore((s) => s.addWarehouseLine)
  const deleteWarehouseLine = useMaterialStore((s) => s.deleteWarehouseLine)

  const [subTab, setSubTab] = useState<'inventory' | 'receipts'>('inventory')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNewReceipt, setShowNewReceipt] = useState(false)
  const [addingLineFor, setAddingLineFor] = useState<string | null>(null)

  const inventoryRows = useMemo(
    () =>
      materials.map((m) => ({
        material: m,
        status: computeMaterialStatus(m, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations),
      })),
    [materials, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations],
  )

  const materialLabel = (id: string) => {
    const m = materials.find((mm) => mm.id === id)
    return m ? `${m.materialCode || m.lineNo} — ${m.description}` : '—'
  }

  const columns: ResponsiveTableColumn<(typeof inventoryRows)[number]>[] = [
    {
      key: 'code',
      label: 'کالا',
      primary: true,
      render: ({ material: m }) => (
        <div>
          <p className="num text-xs font-bold" dir="ltr">
            {m.materialCode || '—'}
          </p>
          <p className="text-[11px] text-secondary">{m.description}</p>
        </div>
      ),
    },
    { key: 'mto', label: 'MTO', render: ({ status }) => <span className="num text-xs">{fmtQty(status.mtoQuantity)}</span> },
    { key: 'ordered', label: 'سفارش‌شده', render: ({ status }) => <span className="num text-xs">{fmtQty(status.ordered)}</span> },
    { key: 'shipped', label: 'ارسال‌شده', render: ({ status }) => <span className="num text-xs">{fmtQty(status.shipped)}</span> },
    { key: 'transit', label: 'در راه', primary: true, render: ({ status }) => <span className="num text-xs" style={{ color: status.inTransit > 0 ? '#38bdf8' : undefined }}>{fmtQty(status.inTransit)}</span> },
    { key: 'received', label: 'رسیده به انبار', render: ({ status }) => <span className="num text-xs">{fmtQty(status.received)}</span> },
    { key: 'available', label: 'موجود (قابل تخصیص)', primary: true, render: ({ status }) => <span className="num text-xs font-bold" style={{ color: MATERIAL_ACCENT }}>{fmtQty(status.available)}</span> },
    { key: 'allocated', label: 'تخصیص‌یافته', render: ({ status }) => <span className="num text-xs">{fmtQty(status.allocated)}</span> },
    { key: 'consumed', label: 'مصرف‌شده', render: ({ status }) => <span className="num text-xs">{fmtQty(status.consumed)}</span> },
    {
      key: 'remaining',
      label: 'باقی‌مانده تا تکمیل نیاز',
      render: ({ status }) => (
        <span className="num text-xs font-bold" style={{ color: status.remaining > 0 ? '#f1c40f' : '#2ecc71' }}>
          {fmtQty(status.remaining)}
        </span>
      ),
    },
  ]

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">انبار پروژه — زنجیره وضعیت کالا</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        <div className="mt-3 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
          <button
            onClick={() => setSubTab('inventory')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'inventory' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            موجودی و زنجیره وضعیت
          </button>
          <button
            onClick={() => setSubTab('receipts')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'receipts' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            رسیدهای انبار
          </button>
        </div>
      </div>

      {subTab === 'inventory' ? (
        <div className="glass-panel overflow-hidden rounded-2xl">
          <ResponsiveTable columns={columns} rows={inventoryRows} rowKey={(r) => r.material.id} emptyText="کالایی برای نمایش وجود ندارد." />
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowNewReceipt(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> رسید انبار جدید
            </button>
          </div>
          {receipts.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز رسیدی ثبت نشده است.</div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r) => {
                const lines = warehouseLines.filter((l) => l.receiptId === r.id)
                const isOpen = expanded === r.id
                return (
                  <div key={r.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Warehouse size={14} style={{ color: MATERIAL_ACCENT }} />
                          <p className="text-sm font-bold">{r.receiptNumber || 'رسید بدون شماره'}</p>
                        </div>
                        <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                          {fmtDate(r.receiptDate)} {r.warehouseLocation ? `· ${r.warehouseLocation}` : ''}
                        </p>
                        {r.shipmentId && <p className="mt-1 text-xs text-secondary">محموله: {shipments.find((sh) => sh.id === r.shipmentId)?.shipmentNumber ?? '—'}</p>}
                      </div>
                      <button onClick={() => deleteWarehouseReceipt(r.id)} className="text-muted hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="mt-3 text-[11px] font-medium hover:underline" style={{ color: MATERIAL_ACCENT }}>
                      {isOpen ? 'بستن اقلام' : `اقلام رسید (${lines.length})`}
                    </button>
                    {isOpen && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        {lines.length === 0 && <p className="text-xs text-muted">قلمی ثبت نشده است.</p>}
                        {lines.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{materialLabel(l.materialId)}</span>
                            <span
                              className="rounded-full border px-2 py-0.5 text-[10px]"
                              style={{
                                borderColor: l.condition === 'ok' ? '#2ecc7155' : l.condition === 'damaged' ? '#e74c3c55' : '#f1c40f55',
                                color: l.condition === 'ok' ? '#2ecc71' : l.condition === 'damaged' ? '#e74c3c' : '#f1c40f',
                              }}
                            >
                              {WAREHOUSE_LINE_CONDITION_LABEL_FA[l.condition]}
                            </span>
                            <span className="num shrink-0 text-xs font-bold">{fmtQty(l.quantityReceived)}</span>
                            <button onClick={() => deleteWarehouseLine(l.id)} className="shrink-0 text-muted hover:text-red-400">
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
      )}

      {showNewReceipt && (
        <ReceiptModal
          shipments={shipments}
          onClose={() => setShowNewReceipt(false)}
          onSave={async (data) => {
            const id = await createWarehouseReceipt(masterProjectId, data)
            if (id) setExpanded(id)
            setShowNewReceipt(false)
          }}
        />
      )}
      {addingLineFor && (
        <ReceiptLineModal
          materials={materials}
          onClose={() => setAddingLineFor(null)}
          onSave={async (materialId, qty, condition) => {
            await addWarehouseLine(addingLineFor, materialId, qty, condition)
            setAddingLineFor(null)
          }}
        />
      )}
    </div>
  )
}

function ReceiptModal({
  shipments,
  onClose,
  onSave,
}: {
  shipments: { id: string; shipmentNumber: string }[]
  onClose: () => void
  onSave: (data: { receiptNumber: string; receiptDate: string; shipmentId: string | null; warehouseLocation: string; notes: string }) => Promise<void>
}) {
  const [receiptNumber, setReceiptNumber] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10))
  const [shipmentId, setShipmentId] = useState('')
  const [warehouseLocation, setWarehouseLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ receiptNumber, receiptDate, shipmentId: shipmentId || null, warehouseLocation, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">رسید انبار جدید</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره رسید</span>
          <input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <JalaliDateInput value={receiptDate} onChange={setReceiptDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">محموله مرتبط</span>
          <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className="input">
            <option value="">—</option>
            {shipments.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.shipmentNumber || 'بدون شماره'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">محل انبار</span>
          <input value={warehouseLocation} onChange={(e) => setWarehouseLocation(e.target.value)} className="input" />
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
            {saving ? 'در حال ذخیره...' : 'ایجاد'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiptLineModal({
  materials,
  onClose,
  onSave,
}: {
  materials: { id: string; materialCode: string; description: string }[]
  onClose: () => void
  onSave: (materialId: string, qty: number, condition: WarehouseLineCondition) => Promise<void>
}) {
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('')
  const [condition, setCondition] = useState<WarehouseLineCondition>('ok')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!materialId || qty === '') return
    setSaving(true)
    await onSave(materialId, Number(qty), condition)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-sm font-extrabold">
          <PackageCheck size={15} style={{ color: MATERIAL_ACCENT }} /> افزودن قلم رسید
        </h3>
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
          <span className="mb-1 block text-xs text-secondary">مقدار دریافتی</span>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت کالا</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value as WarehouseLineCondition)} className="input">
            {(['ok', 'damaged', 'shortage'] as WarehouseLineCondition[]).map((c) => (
              <option key={c} value={c}>
                {WAREHOUSE_LINE_CONDITION_LABEL_FA[c]}
              </option>
            ))}
          </select>
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
