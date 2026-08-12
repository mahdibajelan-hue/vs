import { useState } from 'react'
import { FileOutput, Plus, Trash2, Truck } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { fmtQty } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { SHIPMENT_STATUS_COLOR, SHIPMENT_STATUS_LABEL_FA, SHIPMENT_STATUSES, type ReleaseNote, type Shipment, type ShipmentStatus } from '../types'

type SubTab = 'releases' | 'shipments'

export function LogisticsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const orders = useMaterialStore((s) => s.purchaseOrders).filter((p) => p.masterProjectId === masterProjectId)
  const releaseNotes = useMaterialStore((s) => s.releaseNotes).filter((r) => r.masterProjectId === masterProjectId)
  const releaseLines = useMaterialStore((s) => s.releaseLines)
  const shipments = useMaterialStore((s) => s.shipments).filter((sh) => sh.masterProjectId === masterProjectId)
  const shipmentLines = useMaterialStore((s) => s.shipmentLines)

  const createReleaseNote = useMaterialStore((s) => s.createReleaseNote)
  const deleteReleaseNote = useMaterialStore((s) => s.deleteReleaseNote)
  const addReleaseLine = useMaterialStore((s) => s.addReleaseLine)
  const deleteReleaseLine = useMaterialStore((s) => s.deleteReleaseLine)

  const createShipment = useMaterialStore((s) => s.createShipment)
  const updateShipment = useMaterialStore((s) => s.updateShipment)
  const deleteShipment = useMaterialStore((s) => s.deleteShipment)
  const addShipmentLine = useMaterialStore((s) => s.addShipmentLine)
  const deleteShipmentLine = useMaterialStore((s) => s.deleteShipmentLine)

  const [subTab, setSubTab] = useState<SubTab>('releases')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNewRelease, setShowNewRelease] = useState(false)
  const [addingReleaseLineFor, setAddingReleaseLineFor] = useState<string | null>(null)
  const [showNewShipment, setShowNewShipment] = useState(false)
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null)
  const [addingShipmentLineFor, setAddingShipmentLineFor] = useState<string | null>(null)

  const materialLabel = (id: string) => {
    const m = materials.find((mm) => mm.id === id)
    return m ? `${m.materialCode || m.lineNo} — ${m.description}` : '—'
  }

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">حواله ارسال و حمل‌ونقل</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        <div className="mt-3 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
          <button
            onClick={() => setSubTab('releases')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'releases' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            حواله ارسال (Release Note)
          </button>
          <button
            onClick={() => setSubTab('shipments')}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={subTab === 'shipments' ? { background: `${MATERIAL_ACCENT}2a`, color: MATERIAL_ACCENT } : undefined}
          >
            محموله و حمل (Shipment)
          </button>
        </div>
      </div>

      {subTab === 'releases' ? (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowNewRelease(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> حواله جدید
            </button>
          </div>
          {releaseNotes.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز حواله‌ای ثبت نشده است.</div>
          ) : (
            <div className="space-y-3">
              {releaseNotes.map((r) => {
                const lines = releaseLines.filter((l) => l.releaseId === r.id)
                const isOpen = expanded === r.id
                return (
                  <div key={r.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileOutput size={14} style={{ color: MATERIAL_ACCENT }} />
                          <p className="text-sm font-bold">{r.releaseNumber || 'حواله بدون شماره'}</p>
                        </div>
                        <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                          {r.releaseDate}
                        </p>
                        {r.poId && <p className="mt-1 text-xs text-secondary">PO: {orders.find((o) => o.id === r.poId)?.poNumber ?? '—'}</p>}
                      </div>
                      <button onClick={() => deleteReleaseNote(r.id)} className="text-muted hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="mt-3 text-[11px] font-medium hover:underline" style={{ color: MATERIAL_ACCENT }}>
                      {isOpen ? 'بستن اقلام' : `اقلام حواله (${lines.length})`}
                    </button>
                    {isOpen && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        {lines.length === 0 && <p className="text-xs text-muted">قلمی ثبت نشده است.</p>}
                        {lines.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{materialLabel(l.materialId)}</span>
                            <span className="num shrink-0 text-xs font-bold">{fmtQty(l.quantityReleased)}</span>
                            <button onClick={() => deleteReleaseLine(l.id)} className="shrink-0 text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setAddingReleaseLineFor(r.id)} className="flex items-center gap-1 text-[11px] text-secondary hover:text-current">
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
            <button onClick={() => setShowNewShipment(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
              <Plus size={13} /> محموله جدید
            </button>
          </div>
          {shipments.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز محموله‌ای ثبت نشده است.</div>
          ) : (
            <div className="space-y-3">
              {shipments.map((sh) => {
                const lines = shipmentLines.filter((l) => l.shipmentId === sh.id)
                const isOpen = expanded === sh.id
                return (
                  <div key={sh.id} className="glass-panel rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Truck size={14} style={{ color: MATERIAL_ACCENT }} />
                          <p className="text-sm font-bold">{sh.shipmentNumber || 'محموله بدون شماره'}</p>
                          <span
                            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{ borderColor: `${SHIPMENT_STATUS_COLOR[sh.status]}55`, color: SHIPMENT_STATUS_COLOR[sh.status] }}
                          >
                            {SHIPMENT_STATUS_LABEL_FA[sh.status]}
                          </span>
                        </div>
                        <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                          {sh.shipmentDate} {sh.carrier ? `· ${sh.carrier}` : ''}
                        </p>
                        {(sh.origin || sh.destination) && (
                          <p className="mt-1 text-xs text-secondary">
                            {sh.origin || '—'} ← {sh.destination || '—'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={sh.status}
                          onChange={(e) => updateShipment(sh.id, { status: e.target.value as ShipmentStatus })}
                          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] outline-none"
                        >
                          {SHIPMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {SHIPMENT_STATUS_LABEL_FA[s]}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => setEditingShipment(sh)} className="text-xs text-secondary hover:underline">
                          ویرایش
                        </button>
                        <button onClick={() => deleteShipment(sh.id)} className="text-muted hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <button onClick={() => setExpanded(isOpen ? null : sh.id)} className="mt-3 text-[11px] font-medium hover:underline" style={{ color: MATERIAL_ACCENT }}>
                      {isOpen ? 'بستن اقلام' : `اقلام محموله (${lines.length})`}
                    </button>
                    {isOpen && (
                      <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        {lines.length === 0 && <p className="text-xs text-muted">قلمی ثبت نشده است.</p>}
                        {lines.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs">{materialLabel(l.materialId)}</span>
                            <span className="num shrink-0 text-xs font-bold">{fmtQty(l.quantityShipped)}</span>
                            <button onClick={() => deleteShipmentLine(l.id)} className="shrink-0 text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setAddingShipmentLineFor(sh.id)} className="flex items-center gap-1 text-[11px] text-secondary hover:text-current">
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

      {showNewRelease && (
        <ReleaseModal
          orders={orders}
          onClose={() => setShowNewRelease(false)}
          onSave={async (data) => {
            await createReleaseNote(masterProjectId, data)
            setShowNewRelease(false)
          }}
        />
      )}
      {addingReleaseLineFor && (
        <LineModal
          materials={materials}
          label="افزودن قلم حواله"
          onClose={() => setAddingReleaseLineFor(null)}
          onSave={async (materialId, qty) => {
            await addReleaseLine(addingReleaseLineFor, materialId, qty)
            setAddingReleaseLineFor(null)
          }}
        />
      )}

      {showNewShipment && (
        <ShipmentModal
          onClose={() => setShowNewShipment(false)}
          onSave={async (data) => {
            await createShipment(masterProjectId, data)
            setShowNewShipment(false)
          }}
        />
      )}
      {editingShipment && (
        <ShipmentModal
          initial={editingShipment}
          onClose={() => setEditingShipment(null)}
          onSave={async (data) => {
            await updateShipment(editingShipment.id, data)
            setEditingShipment(null)
          }}
        />
      )}
      {addingShipmentLineFor && (
        <LineModal
          materials={materials}
          label="افزودن قلم محموله"
          onClose={() => setAddingShipmentLineFor(null)}
          onSave={async (materialId, qty) => {
            await addShipmentLine(addingShipmentLineFor, materialId, qty)
            setAddingShipmentLineFor(null)
          }}
        />
      )}
    </div>
  )
}

function ReleaseModal({
  orders,
  onClose,
  onSave,
}: {
  orders: { id: string; poNumber: string }[]
  onClose: () => void
  onSave: (data: Partial<ReleaseNote>) => Promise<void>
}) {
  const [releaseNumber, setReleaseNumber] = useState('')
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [poId, setPoId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ releaseNumber, releaseDate, poId: poId || null, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">حواله ارسال جدید</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره حواله</span>
          <input value={releaseNumber} onChange={(e) => setReleaseNumber(e.target.value)} className="input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">سفارش خرید مرتبط</span>
          <select value={poId} onChange={(e) => setPoId(e.target.value)} className="input">
            <option value="">—</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.poNumber || 'بدون شماره'}
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
            {saving ? 'در حال ذخیره...' : 'ایجاد'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LineModal({
  materials,
  label,
  onClose,
  onSave,
}: {
  materials: { id: string; materialCode: string; description: string }[]
  label: string
  onClose: () => void
  onSave: (materialId: string, qty: number) => Promise<void>
}) {
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
        <h3 className="text-sm font-extrabold">{label}</h3>
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

function ShipmentModal({ initial, onClose, onSave }: { initial?: Shipment; onClose: () => void; onSave: (data: Partial<Shipment>) => Promise<void> }) {
  const [shipmentNumber, setShipmentNumber] = useState(initial?.shipmentNumber ?? '')
  const [shipmentDate, setShipmentDate] = useState(initial?.shipmentDate ?? new Date().toISOString().slice(0, 10))
  const [carrier, setCarrier] = useState(initial?.carrier ?? '')
  const [trackingRef, setTrackingRef] = useState(initial?.trackingRef ?? '')
  const [origin, setOrigin] = useState(initial?.origin ?? '')
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [status, setStatus] = useState<ShipmentStatus>(initial?.status ?? 'planned')
  const [eta, setEta] = useState(initial?.eta ?? '')
  const [ata, setAta] = useState(initial?.ata ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ shipmentNumber, shipmentDate, carrier, trackingRef, origin, destination, status, eta: eta || null, ata: ata || null })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{initial ? 'ویرایش محموله' : 'محموله جدید'}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره محموله</span>
            <input value={shipmentNumber} onChange={(e) => setShipmentNumber(e.target.value)} className="input" dir="ltr" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ ارسال</span>
            <input type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">حمل‌کننده</span>
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کد رهگیری</span>
            <input value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبدا</span>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مقصد</span>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)} className="input">
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SHIPMENT_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ETA</span>
            <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ATA (تاریخ واقعی رسیدن)</span>
            <input type="date" value={ata} onChange={(e) => setAta(e.target.value)} className="input num" />
          </label>
        </div>
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
