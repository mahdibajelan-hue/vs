import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialStore } from '../../store/useMaterialStore'
import { missingValues } from '../../lib/control/lookups'
import { Chip } from '../../../finance/components/fn'
import { fa } from './common'
import { LOOKUP_HINT_FA, LOOKUP_KINDS, LOOKUP_LABEL_FA, type LookupKind, type Material } from '../../types'

const valueOf = (m: Material, k: LookupKind): string => (k === 'facility' ? m.facility : k === 'area' ? m.area : k === 'front' ? m.front : k === 'usage' ? m.usageLocation : k === 'pipeline' ? m.pipelineNo : '')

/** The project's own lists of stations, sections, fronts, places of use, warehouses and pipelines. Forms and imports pick from these, so search, allocation and reports never see two spellings of one place. */
export function LookupSettings({ projectId }: { projectId: string }) {
  const cs = useMaterialControlStore()
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === projectId)
  const receipts = useMaterialStore((s) => s.warehouseReceipts).filter((r) => r.masterProjectId === projectId)
  const [kind, setKind] = useState<LookupKind>('facility')
  const [text, setText] = useState('')
  const rows = useMemo(() => cs.lookups.filter((l) => l.masterProjectId === projectId && l.kind === kind).sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label, 'fa')), [cs.lookups, projectId, kind])
  const used = useMemo(() => { const c = new Map<string, number>(); if (kind === 'warehouse') for (const r of receipts) c.set(r.warehouseLocation, (c.get(r.warehouseLocation) ?? 0) + 1); else for (const m of materials) { const v = valueOf(m, kind).trim(); if (v) c.set(v, (c.get(v) ?? 0) + 1) } return c }, [materials, receipts, kind])
  const missing = missingValues(cs.lookups, projectId, kind, kind === 'warehouse' ? receipts.map((r) => r.warehouseLocation) : materials.map((m) => valueOf(m, kind)))
  const add = async () => { if (await cs.addLookups(projectId, kind, text.split(/[\n،,]/))) setText('') }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: '12px 16px' }}>
        <b>چرا فهرست؟</b>
        <p className="im-helper" style={{ margin: '4px 0 0' }}>اگر هر کاربر محل مصرف یا انبار را به شکل خودش بنویسد («ایستگاه ۱»، «ایستگاه تقویت فشار ۱»، «ST-1»)، جست‌وجو، تخصیص و گزارش جبهه‌ها آن‌ها را جدا می‌شمارد. اینجا یک‌بار مقدارها را تعریف کنید؛ فرم‌ها (اقلام، رسید انبار، حرکت انبار، تخصیص، مجوز خروج) فقط از همین فهرست انتخاب می‌کنند. هر مورد را می‌توانید تغییر نام دهید یا با تغییر نام به مورد دیگر ادغام کنید؛ همهٔ رکوردهای قبلی هم یکسان می‌شوند.</p>
      </div>
      <div className="mt-pills">{LOOKUP_KINDS.map((k) => <button key={k} className={`mt-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{LOOKUP_LABEL_FA[k]}<em>{fa(cs.lookups.filter((l) => l.masterProjectId === projectId && l.kind === k && l.active).length)}</em></button>)}</div>
      <div className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div><b>{LOOKUP_LABEL_FA[kind]}</b><p className="im-helper" style={{ margin: 0 }}>{LOOKUP_HINT_FA[kind]}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="im-field" style={{ margin: 0, flex: 1, minWidth: 240 }}><label htmlFor="lk-add">افزودن (چند مورد را با Enter یا ویرگول جدا کنید)</label><textarea id="lk-add" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={LOOKUP_HINT_FA[kind]} /></div>
          <button className="im-btn im-btn-primary" disabled={!text.trim()} onClick={() => void add()}><Plus size={14} /> افزودن به فهرست</button>
        </div>
        {missing.length > 0 && (
          <div className="mt-warn" style={{ alignItems: 'center' }}>
            <div style={{ flex: 1 }}><b>{fa(missing.length)} مقدار در رکوردها هست ولی در فهرست نیست</b><div className="im-helper" style={{ margin: 0 }}>{missing.slice(0, 8).join('، ')}{missing.length > 8 ? '…' : ''}</div></div>
            <button className="im-btn im-btn-sm" onClick={() => void cs.addLookups(projectId, kind, missing)}>افزودن همه به فهرست</button>
          </div>
        )}
        <div className="mt-lk-list">
          {rows.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>هنوز موردی تعریف نشده است.</p> : rows.map((l) => (
            <div key={l.id} className={`mt-lk${l.active ? '' : ' off'}`}>
              <b>{l.label}</b>
              <Chip tone={l.active ? 'good' : 'neutral'}>{l.active ? 'فعال' : 'غیرفعال'}</Chip>
              <small>{used.get(l.label) ? `${fa(used.get(l.label)!)} رکورد` : 'بدون استفاده'}</small>
              <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
                <button className="im-btn im-btn-sm" onClick={async () => { const n = window.prompt('نام جدید (اگر نام یکی از موارد دیگر را بنویسید، دو مورد ادغام می‌شوند)', l.label); if (n && n.trim() && n.trim() !== l.label) { const c = await cs.renameLookup(projectId, kind, l.label, n.trim()); if (c != null) window.alert(`${fa(c)} رکورد به‌روز شد.`) } }}><Pencil size={13} /> تغییر نام / ادغام</button>
                <button className="im-btn im-btn-sm" onClick={() => void cs.setLookupActive(l.id, !l.active)}>{l.active ? 'غیرفعال' : 'فعال‌سازی'}</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
