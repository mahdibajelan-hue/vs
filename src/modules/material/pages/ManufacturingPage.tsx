import { useState } from 'react'
import { Clock, Factory } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { manufacturingDelayDays } from '../lib/materialCalc'
import { fmtQty } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { MANUFACTURING_STATUS_COLOR, MANUFACTURING_STATUS_LABEL_FA, MANUFACTURING_STATUSES, type Manufacturing, type ManufacturingStatus, type PoLine } from '../types'

export function ManufacturingPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const orders = useMaterialStore((s) => s.purchaseOrders).filter((p) => p.masterProjectId === masterProjectId)
  const poLines = useMaterialStore((s) => s.poLines)
  const manufacturing = useMaterialStore((s) => s.manufacturing)
  const upsertManufacturing = useMaterialStore((s) => s.upsertManufacturing)

  const [editing, setEditing] = useState<{ poLine: PoLine; record: Manufacturing | null } | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const orderIds = new Set(orders.map((o) => o.id))
  const myPoLines = poLines.filter((l) => orderIds.has(l.poId))
  const materialLabel = (id: string) => {
    const m = materials.find((mm) => mm.id === id)
    return m ? `${m.materialCode || m.lineNo} — ${m.description}` : '—'
  }
  const poLabel = (id: string) => orders.find((o) => o.id === id)?.poNumber || '—'
  const recordFor = (poLineId: string) => manufacturing.find((m) => m.poLineId === poLineId) ?? null

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">ساخت و بازرسی کالا</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      {myPoLines.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز هیچ قلم سفارش خریدی برای ساخت ثبت نشده است.</div>
      ) : (
        <div className="space-y-2">
          {myPoLines.map((line) => {
            const record = recordFor(line.id)
            const status = record?.status ?? 'not_started'
            const delay = record ? manufacturingDelayDays(record.plannedReadyDate, record.actualReadyDate, record.status) : null
            return (
              <div key={line.id} className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
                <Factory size={14} style={{ color: MATERIAL_ACCENT }} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{materialLabel(line.materialId)}</p>
                  <p className="text-[10.5px] text-muted">
                    PO: {poLabel(line.poId)} · {fmtQty(line.quantityOrdered)}
                  </p>
                </div>
                {record?.isLongLead && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">Long-Lead</span>
                )}
                {delay != null && (
                  <span className="flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                    <Clock size={10} /> {delay} روز تاخیر
                  </span>
                )}
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0" style={{ borderColor: `${MANUFACTURING_STATUS_COLOR[status]}55`, color: MANUFACTURING_STATUS_COLOR[status] }}>
                  {MANUFACTURING_STATUS_LABEL_FA[status]}
                </span>
                <button onClick={() => setEditing({ poLine: line, record })} className="shrink-0 text-xs text-secondary hover:underline">
                  به‌روزرسانی
                </button>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <ManufacturingModal
          materialLabel={materialLabel(editing.poLine.materialId)}
          initial={editing.record}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await upsertManufacturing(editing.poLine.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ManufacturingModal({
  materialLabel,
  initial,
  onClose,
  onSave,
}: {
  materialLabel: string
  initial: Manufacturing | null
  onClose: () => void
  onSave: (data: Partial<Manufacturing>) => Promise<void>
}) {
  const [status, setStatus] = useState<ManufacturingStatus>(initial?.status ?? 'not_started')
  const [isLongLead, setIsLongLead] = useState(initial?.isLongLead ?? false)
  const [plannedReadyDate, setPlannedReadyDate] = useState(initial?.plannedReadyDate ?? '')
  const [actualReadyDate, setActualReadyDate] = useState(initial?.actualReadyDate ?? '')
  const [fatDate, setFatDate] = useState(initial?.fatDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ status, isLongLead, plannedReadyDate: plannedReadyDate || null, actualReadyDate: actualReadyDate || null, fatDate: fatDate || null, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">وضعیت ساخت</h3>
        <p className="truncate text-xs text-secondary">{materialLabel}</p>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ManufacturingStatus)} className="input" autoFocus>
            {MANUFACTURING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MANUFACTURING_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isLongLead} onChange={(e) => setIsLongLead(e.target.checked)} className="h-4 w-4" />
          <span className="text-xs text-secondary">این قلم Long-Lead است</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ برنامه‌ریزی آماده‌سازی</span>
          <JalaliDateInput value={plannedReadyDate} onChange={setPlannedReadyDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ واقعی آماده‌سازی</span>
          <JalaliDateInput value={actualReadyDate} onChange={setActualReadyDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ تست کارخانه‌ای (FAT)</span>
          <JalaliDateInput value={fatDate} onChange={setFatDate} />
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
