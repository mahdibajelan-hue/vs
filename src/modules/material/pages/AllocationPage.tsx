import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { computeMaterialStatus } from '../lib/materialCalc'
import { fmtQty } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { ALLOCATION_STATUS_LABEL_FA, type Allocation } from '../types'

const ALLOCATION_STATUS_TONE: Record<Allocation['status'], string> = { allocated: '#38bdf8', consumed: '#2ecc71', returned: '#64748b' }

export function AllocationPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const poLines = useMaterialStore((s) => s.poLines)
  const purchaseOrders = useMaterialStore((s) => s.purchaseOrders)
  const manufacturing = useMaterialStore((s) => s.manufacturing)
  const releaseLines = useMaterialStore((s) => s.releaseLines)
  const shipmentLines = useMaterialStore((s) => s.shipmentLines)
  const warehouseLines = useMaterialStore((s) => s.warehouseLines)
  const allocations = useMaterialStore((s) => s.allocations).filter((a) => a.masterProjectId === masterProjectId)

  const createAllocation = useMaterialStore((s) => s.createAllocation)
  const deleteAllocation = useMaterialStore((s) => s.deleteAllocation)
  const recordConsumption = useMaterialStore((s) => s.recordConsumption)

  const [subTab, setSubTab] = useState<'allocation' | 'readiness'>('allocation')
  const [showNewAllocation, setShowNewAllocation] = useState(false)
  const [consumingId, setConsumingId] = useState<string | null>(null)

  const materialLabel = (id: string) => {
    const m = materials.find((mm) => mm.id === id)
    return m ? `${m.materialCode || m.lineNo} — ${m.description}` : '—'
  }
  const materialUnit = (id: string) => materials.find((mm) => mm.id === id)?.unit ?? ''

  const statuses = useMemo(
    () => materials.map((m) => ({ material: m, status: computeMaterialStatus(m, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations) })),
    [materials, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations],
  )
  const shortItems = statuses.filter((s) => s.status.isShort).sort((a, b) => b.status.shortageQuantity - a.status.shortageQuantity)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">تخصیص به بسته کاری و آمادگی اجرا</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        <div className="mt-3 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
          <button
            onClick={() => setSubTab('allocation')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'allocation' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            تخصیص کالا
          </button>
          <button
            onClick={() => setSubTab('readiness')}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'readiness' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            کسری و آمادگی اجرا
            {shortItems.length > 0 && <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300">{shortItems.length}</span>}
          </button>
        </div>
      </div>

      {subTab === 'allocation' ? (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowNewAllocation(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> تخصیص جدید
            </button>
          </div>
          {allocations.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز کالایی به بسته کاری تخصیص نیافته است.</div>
          ) : (
            <div className="space-y-2">
              {allocations.map((a) => (
                <div key={a.id} className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
                  <ClipboardCheck size={14} style={{ color: MATERIAL_ACCENT }} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{materialLabel(a.materialId)}</p>
                    <p className="text-[10.5px] text-muted">
                      بسته کاری: {a.workPackageCode} {a.workPackageName ? `— ${a.workPackageName}` : ''}
                    </p>
                  </div>
                  <span className="num shrink-0 text-xs">
                    تخصیص: <b>{fmtQty(a.quantityAllocated, materialUnit(a.materialId))}</b>
                  </span>
                  <span className="num shrink-0 text-xs">
                    مصرف: <b>{fmtQty(a.quantityConsumed, materialUnit(a.materialId))}</b>
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0" style={{ borderColor: `${ALLOCATION_STATUS_TONE[a.status]}55`, color: ALLOCATION_STATUS_TONE[a.status] }}>
                    {ALLOCATION_STATUS_LABEL_FA[a.status]}
                  </span>
                  {a.status !== 'consumed' && (
                    <button onClick={() => setConsumingId(a.id)} className="shrink-0 text-xs text-secondary hover:underline">
                      ثبت مصرف
                    </button>
                  )}
                  <button onClick={() => deleteAllocation(a.id)} className="shrink-0 text-muted hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : shortItems.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">در حال حاضر هیچ کسری یا کالای مسدودکننده اجرا شناسایی نشده است.</div>
      ) : (
        <div className="space-y-2">
          {shortItems.map(({ material: m, status: s }) => (
            <div key={m.id} className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
              <AlertTriangle size={14} className="shrink-0" style={{ color: m.isConstructionBlocking ? '#e74c3c' : '#f1c40f' }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  {m.materialCode || m.lineNo} — {m.description}
                </p>
                <p className="text-[10.5px] text-muted">
                  {[m.facility, m.area, m.systemName, m.pidNumber, m.tagNumber].filter(Boolean).join(' / ') || 'بدون مشخصات مهندسی'}
                </p>
              </div>
              <span className="num shrink-0 text-xs">
                نیاز MTO: <b>{fmtQty(s.mtoQuantity, m.unit)}</b>
              </span>
              <span className="num shrink-0 text-xs">
                رسیده/در راه: <b>{fmtQty(s.received + s.inTransit, m.unit)}</b>
              </span>
              <span className="num shrink-0 text-xs font-bold" style={{ color: '#e74c3c' }}>
                کسری: {fmtQty(s.shortageQuantity, m.unit)}
              </span>
              {m.isConstructionBlocking && (
                <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300 shrink-0">مسدودکننده اجرا</span>
              )}
            </div>
          ))}
        </div>
      )}

      {showNewAllocation && (
        <AllocationModal
          materials={materials}
          statuses={statuses}
          onClose={() => setShowNewAllocation(false)}
          onSave={async (data) => {
            await createAllocation(masterProjectId, data)
            setShowNewAllocation(false)
          }}
        />
      )}
      {consumingId && (
        <ConsumptionModal
          onClose={() => setConsumingId(null)}
          onSave={async (qty) => {
            await recordConsumption(consumingId, qty)
            setConsumingId(null)
          }}
        />
      )}
    </div>
  )
}

function AllocationModal({
  materials,
  statuses,
  onClose,
  onSave,
}: {
  materials: { id: string; materialCode: string; description: string; unit: string }[]
  statuses: { material: { id: string }; status: { available: number } }[]
  onClose: () => void
  onSave: (data: Partial<Allocation>) => Promise<void>
}) {
  const [materialId, setMaterialId] = useState('')
  const [workPackageCode, setWorkPackageCode] = useState('')
  const [workPackageName, setWorkPackageName] = useState('')
  const [quantityAllocated, setQuantityAllocated] = useState('')
  const [allocationDate, setAllocationDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const available = statuses.find((s) => s.material.id === materialId)?.status.available ?? null
  const selectedUnit = materials.find((m) => m.id === materialId)?.unit ?? ''

  const submit = async () => {
    if (!materialId || quantityAllocated === '' || !workPackageCode) return
    setSaving(true)
    await onSave({ materialId, workPackageCode, workPackageName, quantityAllocated: Number(quantityAllocated), quantityConsumed: 0, allocationDate, status: 'allocated', notes: '' })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">تخصیص کالا به بسته کاری</h3>
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
          {materialId && <p className="mt-1 text-[10.5px] text-muted">موجودی قابل تخصیص: {fmtQty(available ?? 0, selectedUnit)}</p>}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کد بسته کاری</span>
          <input value={workPackageCode} onChange={(e) => setWorkPackageCode(e.target.value)} className="input" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام بسته کاری</span>
          <input value={workPackageName} onChange={(e) => setWorkPackageName(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مقدار تخصیص</span>
          <input type="number" value={quantityAllocated} onChange={(e) => setQuantityAllocated(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ تخصیص</span>
          <JalaliDateInput value={allocationDate} onChange={setAllocationDate} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!materialId || quantityAllocated === '' || !workPackageCode || saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: MATERIAL_ACCENT }}
          >
            {saving ? 'در حال ذخیره...' : 'تخصیص'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConsumptionModal({ onClose, onSave }: { onClose: () => void; onSave: (qty: number) => Promise<void> }) {
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (qty === '') return
    setSaving(true)
    await onSave(Number(qty))
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-xs rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">ثبت مصرف</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مقدار مصرف‌شده (اضافه به مقدار قبلی)</span>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="input num" autoFocus />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={qty === '' || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ثبت...' : 'ثبت'}
          </button>
        </div>
      </div>
    </div>
  )
}
