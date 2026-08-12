import { useRef, useState } from 'react'
import { FileSpreadsheet, Package, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { ResponsiveTable, type ResponsiveTableColumn } from '../../../components/common/ResponsiveTable'
import { fmtQty, fmtValue, fmtWeight } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { COMMODITY_TYPE_LABEL_FA, COMMODITY_TYPES, MTO_REVISION_STATUS_LABEL_FA, MTO_REVISION_STATUSES, type CommodityType, type Material, type MtoRevisionStatus } from '../types'

const COMMODITY_TONE: Record<CommodityType, string> = {
  pipe: '#38bdf8',
  fitting: '#a78bfa',
  valve: '#f59e0b',
  flange: '#2ecc71',
  gasket: '#64748b',
  bolt_nut: '#64748b',
  instrument: '#e879f9',
  equipment: '#e74c3c',
  support: '#64748b',
  other: '#64748b',
}

const IMPORT_FIELD_ALIASES: Record<string, keyof Material> = {
  lineno: 'lineNo',
  'line no': 'lineNo',
  materialcode: 'materialCode',
  'material code': 'materialCode',
  code: 'materialCode',
  description: 'description',
  commoditytype: 'commodityType',
  'commodity type': 'commodityType',
  spec: 'spec',
  size: 'size',
  rating: 'rating',
  unit: 'unit',
  facility: 'facility',
  area: 'area',
  system: 'systemName',
  systemname: 'systemName',
  'p&id': 'pidNumber',
  pid: 'pidNumber',
  pidnumber: 'pidNumber',
  'pid revision': 'pidRevision',
  pidrevision: 'pidRevision',
  tag: 'tagNumber',
  tagnumber: 'tagNumber',
  'tag number': 'tagNumber',
  quantity: 'mtoQuantity',
  mtoquantity: 'mtoQuantity',
  'mto quantity': 'mtoQuantity',
  unitweight: 'unitWeightKg',
  'unit weight': 'unitWeightKg',
  'unit weight (kg)': 'unitWeightKg',
  unitprice: 'unitPrice',
  'unit price': 'unitPrice',
  currency: 'currency',
}

const NUMERIC_FIELDS = new Set<keyof Material>(['mtoQuantity', 'unitWeightKg', 'unitPrice'])

export function MaterialsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const revisions = useMaterialStore((s) => s.mtoRevisions).filter((r) => r.masterProjectId === masterProjectId)
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const createMtoRevision = useMaterialStore((s) => s.createMtoRevision)
  const createMaterial = useMaterialStore((s) => s.createMaterial)
  const bulkCreateMaterials = useMaterialStore((s) => s.bulkCreateMaterials)
  const updateMaterial = useMaterialStore((s) => s.updateMaterial)
  const deleteMaterial = useMaterialStore((s) => s.deleteMaterial)

  const [revisionFilter, setRevisionFilter] = useState<string>('')
  const [showNewRevision, setShowNewRevision] = useState(false)
  const [showNewMaterial, setShowNewMaterial] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = revisionFilter ? materials.filter((m) => m.mtoRevisionId === revisionFilter) : materials
  const revisionLabel = (id: string | null) => revisions.find((r) => r.id === id)?.revisionNumber ?? '—'

  const columns: ResponsiveTableColumn<Material>[] = [
    {
      key: 'code',
      label: 'کد کالا',
      primary: true,
      render: (m) => (
        <div>
          <p className="num text-xs font-bold" dir="ltr">
            {m.materialCode || '—'}
          </p>
          <p className="text-[11px] text-secondary">{m.description}</p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'نوع کالا',
      primary: true,
      render: (m) => (
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${COMMODITY_TONE[m.commodityType]}55`, color: COMMODITY_TONE[m.commodityType] }}>
          {COMMODITY_TYPE_LABEL_FA[m.commodityType]}
        </span>
      ),
    },
    { key: 'spec', label: 'مشخصات فنی', render: (m) => <span className="text-xs">{[m.spec, m.size, m.rating].filter(Boolean).join(' / ') || '—'}</span> },
    { key: 'tag', label: 'Tag', render: (m) => <span className="num text-xs" dir="ltr">{m.tagNumber || '—'}</span> },
    { key: 'qty', label: 'مقدار MTO', render: (m) => <span className="num text-xs font-bold">{fmtQty(m.mtoQuantity, m.unit)}</span> },
    { key: 'weight', label: 'وزن کل', render: (m) => <span className="num text-xs">{fmtWeight(m.totalWeightKg)}</span> },
    { key: 'value', label: 'ارزش کل', render: (m) => <span className="num text-xs">{fmtValue(m.totalValue, m.currency)}</span> },
    { key: 'rev', label: 'ریویژن', render: (m) => <span className="text-xs text-muted">{revisionLabel(m.mtoRevisionId)}</span> },
    {
      key: 'actions',
      label: 'عملیات',
      render: (m) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(m)} className="text-xs text-secondary hover:underline">
            ویرایش
          </button>
          <button onClick={() => deleteMaterial(m.id)} className="text-muted hover:text-red-400">
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ]

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const mapped: Partial<Material>[] = rows.map((row) => {
        const out: Partial<Material> = {}
        for (const [key, value] of Object.entries(row)) {
          const field = IMPORT_FIELD_ALIASES[key.trim().toLowerCase()]
          if (!field) continue
          ;(out as Record<string, unknown>)[field] = NUMERIC_FIELDS.has(field) ? Number(value) || 0 : String(value)
        }
        return out
      })
      const withRevision = revisionFilter ? mapped.map((m) => ({ ...m, mtoRevisionId: revisionFilter })) : mapped
      await bulkCreateMaterials(masterProjectId, withRevision)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs text-muted">کالا و برآورد مصالح (MTO)</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={revisionFilter} onChange={(e) => setRevisionFilter(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400">
            <option value="">همه ریویژن‌ها</option>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.revisionNumber} — {MTO_REVISION_STATUS_LABEL_FA[r.status]}
              </option>
            ))}
          </select>
          <button onClick={() => setShowNewRevision(true)} className="rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5">
            ریویژن جدید
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 disabled:opacity-40"
          >
            <FileSpreadsheet size={13} /> {importing ? 'در حال وارد کردن...' : 'وارد کردن از Excel/CSV'}
          </button>
          <button onClick={() => setShowNewMaterial(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: MATERIAL_ACCENT }}>
            <Plus size={13} /> کالای جدید
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <ResponsiveTable columns={columns} rows={filtered} rowKey={(m) => m.id} emptyText="هنوز کالایی برای این پروژه ثبت نشده است." />
      </div>

      {showNewRevision && (
        <NewRevisionModal
          onClose={() => setShowNewRevision(false)}
          onSave={async (data) => {
            const id = await createMtoRevision(masterProjectId, data)
            if (id) setRevisionFilter(id)
            setShowNewRevision(false)
          }}
        />
      )}
      {showNewMaterial && (
        <MaterialModal
          title="کالای جدید"
          revisions={revisions}
          initial={revisionFilter ? { mtoRevisionId: revisionFilter } : undefined}
          onClose={() => setShowNewMaterial(false)}
          onSave={async (data) => {
            await createMaterial(masterProjectId, data)
            setShowNewMaterial(false)
          }}
        />
      )}
      {editing && (
        <MaterialModal
          title="ویرایش کالا"
          revisions={revisions}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateMaterial(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function NewRevisionModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { revisionNumber: string; revisionDate: string; status: MtoRevisionStatus; notes: string }) => Promise<void> }) {
  const [revisionNumber, setRevisionNumber] = useState('')
  const [revisionDate, setRevisionDate] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<MtoRevisionStatus>('issued')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!revisionNumber) return
    setSaving(true)
    await onSave({ revisionNumber, revisionDate, status, notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">ریویژن جدید MTO</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره ریویژن</span>
          <input value={revisionNumber} onChange={(e) => setRevisionNumber(e.target.value)} className="input" dir="ltr" autoFocus placeholder="Rev.1" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <input type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as MtoRevisionStatus)} className="input">
            {MTO_REVISION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MTO_REVISION_STATUS_LABEL_FA[s]}
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
          <button onClick={submit} disabled={!revisionNumber || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: MATERIAL_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'ایجاد'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MaterialModal({
  title,
  revisions,
  initial,
  onClose,
  onSave,
}: {
  title: string
  revisions: { id: string; revisionNumber: string }[]
  initial?: Partial<Material>
  onClose: () => void
  onSave: (data: Partial<Material>) => Promise<void>
}) {
  const [lineNo, setLineNo] = useState(initial?.lineNo ?? '')
  const [materialCode, setMaterialCode] = useState(initial?.materialCode ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [commodityType, setCommodityType] = useState<CommodityType>(initial?.commodityType ?? 'other')
  const [spec, setSpec] = useState(initial?.spec ?? '')
  const [size, setSize] = useState(initial?.size ?? '')
  const [rating, setRating] = useState(initial?.rating ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? 'EA')
  const [mtoQuantity, setMtoQuantity] = useState(initial?.mtoQuantity != null ? String(initial.mtoQuantity) : '')
  const [unitWeightKg, setUnitWeightKg] = useState(initial?.unitWeightKg != null ? String(initial.unitWeightKg) : '0')
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice != null ? String(initial.unitPrice) : '0')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [facility, setFacility] = useState(initial?.facility ?? '')
  const [area, setArea] = useState(initial?.area ?? '')
  const [systemName, setSystemName] = useState(initial?.systemName ?? '')
  const [pidNumber, setPidNumber] = useState(initial?.pidNumber ?? '')
  const [tagNumber, setTagNumber] = useState(initial?.tagNumber ?? '')
  const [mtoRevisionId, setMtoRevisionId] = useState(initial?.mtoRevisionId ?? '')
  const [isConstructionBlocking, setIsConstructionBlocking] = useState(initial?.isConstructionBlocking ?? false)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({
      lineNo,
      materialCode,
      description,
      commodityType,
      spec,
      size,
      rating,
      unit,
      mtoQuantity: mtoQuantity === '' ? 0 : Number(mtoQuantity),
      unitWeightKg: Number(unitWeightKg) || 0,
      unitPrice: Number(unitPrice) || 0,
      currency,
      facility,
      area,
      systemName,
      pidNumber,
      tagNumber,
      mtoRevisionId: mtoRevisionId || null,
      isConstructionBlocking,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-sm font-extrabold">
          <Package size={15} style={{ color: MATERIAL_ACCENT }} /> {title}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره ردیف</span>
            <input value={lineNo} onChange={(e) => setLineNo(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کد کالا</span>
            <input value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} className="input" dir="ltr" autoFocus />
          </label>
          <label className="col-span-full block">
            <span className="mb-1 block text-xs text-secondary">شرح کالا</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نوع کالا</span>
            <select value={commodityType} onChange={(e) => setCommodityType(e.target.value as CommodityType)} className="input">
              {COMMODITY_TYPES.map((c) => (
                <option key={c} value={c}>
                  {COMMODITY_TYPE_LABEL_FA[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ریویژن MTO</span>
            <select value={mtoRevisionId} onChange={(e) => setMtoRevisionId(e.target.value)} className="input">
              <option value="">—</option>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.revisionNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Spec</span>
            <input value={spec} onChange={(e) => setSpec(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Size</span>
            <input value={size} onChange={(e) => setSize(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Rating/Schedule</span>
            <input value={rating} onChange={(e) => setRating(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">واحد</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مقدار MTO</span>
            <input type="number" value={mtoQuantity} onChange={(e) => setMtoQuantity(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وزن واحد (کیلوگرم)</span>
            <input type="number" value={unitWeightKg} onChange={(e) => setUnitWeightKg(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">قیمت واحد</span>
            <div className="flex gap-1.5">
              <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="input num" />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Facility</span>
            <input value={facility} onChange={(e) => setFacility(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Area</span>
            <input value={area} onChange={(e) => setArea(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">System</span>
            <input value={systemName} onChange={(e) => setSystemName(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">P&ID</span>
            <input value={pidNumber} onChange={(e) => setPidNumber(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Tag</span>
            <input value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={isConstructionBlocking} onChange={(e) => setIsConstructionBlocking(e.target.checked)} className="h-4 w-4" />
            <span className="text-xs text-secondary">این کالا مسدودکننده اجرای ساخت است</span>
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
