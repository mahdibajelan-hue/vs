import { useMemo, useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { parseMtoRows, planMtoImport, type MtoRowIn } from '../../lib/control/mto'
import { readXlsx, writeMtoTemplate } from '../../lib/control/xlsx'
import { Chip, DataTable } from '../../../finance/components/fn'
import { fa } from './common'
import type { Material } from '../../types'
import { ModalPortal } from '../../../../components/common/ModalPortal'

/** Bulk entry of an MTO from a standard sheet. The contract MTO adds lines and proposes changes for the lines whose quantity differs; the detail-design MTO attaches the design quantity (and the differences) and adds lines the contract does not have. */
export function MtoImport({ projectId, mode, onClose }: { projectId: string; mode: 'contract' | 'detail'; onClose: () => void }) {
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === projectId)
  const bulkCreate = useMaterialStore((s) => s.bulkCreateMaterials)
  const updateMaterial = useMaterialStore((s) => s.updateMaterial)
  const groups = useMaterialControlStore((s) => s.groups)
  const requestChange = useMaterialControlStore((s) => s.requestChange)
  const [rows, setRows] = useState<MtoRowIn[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const plan = useMemo(() => (rows ? planMtoImport(materials, rows, mode) : null), [rows, materials, mode])

  const pick = async (f: File | undefined) => {
    if (!f) return
    setName(f.name); setDone('')
    setRows(parseMtoRows(await readXlsx(f)))
  }
  const apply = async () => {
    if (!plan) return
    setBusy(true)
    const groupOf = (code?: string) => groups.find((g) => g.code === code || g.title === code)
    const news: Partial<Material>[] = plan.create.map((r) => {
      const g = groupOf(r.groupCode)
      return { lineNo: r.lineNo || undefined, materialCode: r.materialCode, description: r.description ?? '', spec: r.spec ?? '', size: r.size ?? '', unit: r.unit || g?.defaultUnit || 'EA', unitPrice: r.unitPrice ?? 0, facility: r.facility ?? '', area: r.area ?? '', pipelineNo: r.pipelineNo, isometricNo: r.isometricNo, pidNumber: r.pidNumber ?? '', tagNumber: r.tagNumber ?? '',
        front: r.front ?? '', usageLocation: r.usageLocation ?? '', needDate: r.needDate || null, groupId: g?.id ?? null, criticality: g?.criticality ?? 'B', leadTimeDays: g?.leadTimeDays || null,
        ...(mode === 'contract' ? { contractQty: r.qty, detailStatus: 'none' as const } : { contractQty: null, detailQty: r.qty, detailStatus: 'draft' as const, mtoQuantity: r.qty }) }
    })
    if (news.length) await bulkCreate(projectId, news)
    let proposed = 0
    for (const c of plan.changed) if (await requestChange(c.material.id, 'contract_qty', String(c.to), `ورود گروهی MTO پیمان (${name})`, name)) proposed++
    for (const a of plan.attach) await updateMaterial(a.material.id, a.patch)
    setBusy(false)
    setDone(`${fa(news.length)} قلم جدید ثبت شد${plan.changed.length ? `، ${fa(proposed)} درخواست تغییر مقدار برای تأیید ثبت شد` : ''}${plan.attach.length ? `، مقدار طراحی ${fa(plan.attach.length)} قلم به‌روز شد` : ''}.`)
    setRows(null)
  }
  const title = mode === 'contract' ? 'ورود گروهی MTO پیمان' : 'ورود گروهی MTO طراحی تفصیلی'
  return (
    <ModalPortal>
    <div className="im-overlay">
      <div className="im-modal fn-form" style={{ maxWidth: 820 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="im-modal-head"><div><div className="im-modal-title">{title}</div><p className="im-helper" style={{ margin: 0 }}>{mode === 'contract' ? 'ردیف‌های جدید ثبت می‌شوند؛ ردیفی که مقدارش با ثبت فعلی فرق دارد به‌صورت درخواست تغییر برای تأیید می‌آید و بی‌صدا عوض نمی‌شود.' : 'مقدار طراحی به ردیف هم‌کلید وصل می‌شود و اختلاف مشخصات، واحد، کد و محل مصرف ثبت می‌شود. ردیفی که در MTO پیمان نیست، به‌عنوان «خارج از MTO پیمان» شناسایی می‌شود و تصمیم دربارهٔ آن با کارفرما و مشاور است.'}</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <button className="im-btn im-btn-primary im-btn-sm" onClick={() => input.current?.click()}><FileUp size={14} /> انتخاب فایل</button>
          <button className="im-btn im-btn-sm" onClick={() => void writeMtoTemplate()}><Download size={14} /> فایل نمونه با ستون‌های استاندارد</button>
          {name && <span className="im-helper" style={{ margin: 0 }}>{name}</span>}
        </div>
        {done && <div className="im-card" style={{ padding: '10px 14px', marginTop: 10 }}>{done}</div>}
        {plan && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip tone="good">{fa(plan.create.length)} ردیف جدید</Chip>
              {mode === 'contract' && <Chip tone="warn">{fa(plan.changed.length)} تغییر مقدار برای تأیید</Chip>}
              {mode === 'detail' && <Chip tone="warn">{fa(plan.attach.length)} ردیف به‌روز می‌شود</Chip>}
              <Chip>{fa(plan.unchanged)} بدون تغییر</Chip>
              {plan.errors.length > 0 && <Chip tone="bad">{fa(plan.errors.length)} خطا</Chip>}
            </div>
            {plan.errors.length > 0 && <DataTable rows={plan.errors} rowKey={(e) => `${e.row}`} cols={[{ key: 'r', label: 'ردیف', render: (e) => fa(e.row) }, { key: 'm', label: 'خطا', render: (e) => e.message }]} />}
            {mode === 'detail' && plan.create.length > 0 && <p className="im-helper" style={{ margin: 0 }}>{fa(plan.create.length)} ردیف در MTO پیمان یافت نشد؛ پس از ثبت، به‌عنوان مغایرت «خارج از MTO پیمان» نمایش داده می‌شوند.</p>}
          </div>
        )}
        <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button><button className="im-btn im-btn-primary" disabled={!plan || busy || (plan.create.length + plan.changed.length + plan.attach.length === 0)} onClick={() => void apply()}>{busy ? 'در حال ثبت…' : 'ثبت در سامانه'}</button></div>
      </div>
    </div>
    </ModalPortal>
  )
}
