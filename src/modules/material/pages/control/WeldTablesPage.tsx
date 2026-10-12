import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { WELD_BASIS_LABEL_FA, type WeldBasis, type WeldLine, type WeldSet } from '../../lib/control/weldPlan'
import { KpiCard, NumInput, parseNum } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { CommodityIcon } from '../../components/control/CommodityIcon'
import { Term } from '../../components/control/Term'
import { fa } from '../../components/control/common'
import type { Material, MtlGroup } from '../../types'

/**
 * «جداول مبنای محاسبه اقلام مصرفی»: only the BASIS lives here — how much of each consumable one joint (electrodes, film, developer…) or one metre of pipe (coating, wrap…) takes.
 * No totals are asked for: the total joint count / pipe length is entered in the Balance, and the consumption is computed from it and these tables.
 */
export function WeldTablesPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const canEdit = cs.can(projectId, 'edit_items')
  const [form, setForm] = useState<WeldSet | 'new' | null>(null)
  const sets = useMemo(() => cs.weldSets.filter((s) => s.masterProjectId === projectId), [cs.weldSets, projectId])
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const consumableGroups = useMemo(() => cs.groups.filter((g) => g.active && g.isConsumable), [cs.groups])
  const ids = new Set(sets.map((s) => s.id))
  const lines = cs.weldLines.filter((l) => ids.has(l.setId))
  const items = new Set(lines.map((l) => l.materialId)).size
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="جدول‌های مبنا" value={fa(sets.length)} />
        <KpiCard i={1} label="کالای تعریف‌شده" value={fa(items)} />
        <KpiCard i={2} label="بر پایهٔ هر سرجوش" value={fa(lines.filter((l) => (l.basis ?? 'joint') === 'joint').length)} />
        <KpiCard i={3} label="بر پایهٔ هر متر" value={fa(lines.filter((l) => l.basis === 'meter').length)} />
      </div>
      <div className="mt-filters no-print">
        <p className="im-helper" style={{ margin: 0 }}><Term k="weld_table">جدول مبنا</Term>: فقط بنویسید به‌ازای <b>یک سرجوش</b> (الکترود، فیلم، ظهور و ثبوت…) یا <b>یک متر طول</b> (پوشش لوله و اتصالات) چقدر از هر کالا مصرف می‌شود؛ مقدار می‌تواند اعشاری باشد. تعداد کل سرجوش و طول لوله را در «بالانس ← برآورد اقلام مصرفی» وارد می‌کنید و مصرف از روی آن حساب می‌شود.</p>
        {canEdit && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm('new')}><Plus size={14} /> جدول جدید</button>}
      </div>
      {sets.length === 0 ? <div className="im-card im-empty" style={{ padding: 28 }}>هنوز جدولی ساخته نشده است. «جدول جدید» را بزنید؛ مثلاً «سرجوش ۳۰ اینچ — ضخامت ۱۴ میلی‌متر»، سپس الکترودها (E6010 نمرهٔ ۲٫۵: ۰٫۸ کیلوگرم)، فیلم رادیوگرافی و پوشش (به‌ازای هر متر) را اضافه کنید.</div> : sets.map((s) => (
        <WeldSetCard key={s.id} set={s} canEdit={canEdit} byId={byId} materials={m.materials} consumableGroups={consumableGroups} allGroups={cs.groups.filter((g) => g.active)} groupCode={(id) => m.groupById.get(id ?? '')?.code} onEdit={() => setForm(s)} />
      ))}
      {form && <FormModal title={form === 'new' ? 'جدول مبنای جدید' : `ویرایش ${form.title}`} submitLabel="ذخیره" onClose={() => setForm(null)}
        fields={[{ key: 'title', label: 'عنوان جدول', kind: 'text', required: true, span: 2, hint: 'مثلاً سرجوش ۳۰ اینچ — ضخامت ۱۴ میلی‌متر' }, { key: 'jointSize', label: 'قطر', kind: 'text', hint: 'مثلاً ۳۰ اینچ' }, { key: 'thickness', label: 'ضخامت', kind: 'text', hint: 'مثلاً ۱۴ میلی‌متر' }, { key: 'process', label: 'روش جوشکاری', kind: 'text', hint: 'مثلاً SMAW' }, { key: 'notes', label: 'یادداشت', kind: 'text' }]}
        initial={form === 'new' ? { title: '', jointSize: '', thickness: '', process: '', notes: '' } : { title: form.title, jointSize: form.jointSize, thickness: form.thickness, process: form.process, notes: form.notes }}
        onSubmit={async (v) => { const base = form === 'new' ? { jointCount: 0, pipeLengthM: 0 } : { jointCount: form.jointCount, pipeLengthM: form.pipeLengthM }; await cs.saveWeldSet(projectId, { id: form === 'new' ? undefined : form.id, ...base, title: String(v.title), jointSize: String(v.jointSize ?? ''), thickness: String(v.thickness ?? ''), process: String(v.process ?? ''), notes: String(v.notes ?? '') }) }} />}
    </div>
  )
}

function WeldSetCard({ set, canEdit, byId, materials, consumableGroups, allGroups, groupCode, onEdit }: { set: WeldSet; canEdit: boolean; byId: Map<string, Material>; materials: Material[]; consumableGroups: MtlGroup[]; allGroups: MtlGroup[]; groupCode: (id: string | null) => string | undefined; onEdit: () => void }) {
  const cs = useMaterialControlStore()
  const lines = cs.weldLines.filter((l) => l.setId === set.id)
  const [group, setGroup] = useState('')
  const [all, setAll] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('')
  const [basis, setBasis] = useState<WeldBasis>('joint')
  const pool = all ? allGroups : consumableGroups
  const options = materials.filter((x) => (!group ? pool.some((g) => g.id === x.groupId) : x.groupId === group) && !lines.some((l) => l.materialId === x.id))
  const q = parseNum(qty)
  return (
    <div className="im-card mt-weld">
      <div className="mt-weld-head">
        <div style={{ minWidth: 0 }}><b>{set.title}</b><div className="im-helper" style={{ margin: 0 }}>{[set.jointSize, set.thickness, set.process].filter(Boolean).join(' · ') || 'بدون مشخصات'}{set.notes ? ` — ${set.notes}` : ''}</div></div>
        {canEdit && <span style={{ display: 'inline-flex', gap: 6 }}>
          <button className="im-btn im-btn-sm" onClick={onEdit}><Pencil size={13} /> ویرایش</button>
          <button className="im-btn im-btn-sm" onClick={() => { const t = window.prompt('عنوان جدول جدید (ردیف‌ها کپی می‌شود)', `${set.title} (کپی)`); if (t?.trim()) void cs.duplicateWeldSet(set.id, t.trim()) }}><Copy size={13} /> کپی</button>
          <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف جدول" onClick={() => { if (window.confirm(`جدول «${set.title}» با همهٔ ردیف‌هایش حذف شود؟`)) void cs.removeWeldSet(set.id) }}><Trash2 size={13} /></button>
        </span>}
      </div>
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
        <table className="fn-tbl"><thead><tr><th>کالا</th><th>مشخصات</th><th>مبنا (به‌ازای)</th><th className="num">مقدار مصرف</th><th /></tr></thead>
          <tbody>{lines.length === 0 ? <tr><td colSpan={5} className="fn-empty">هنوز کالایی در این جدول نیست.</td></tr> : lines.map((line: WeldLine) => { const x = byId.get(line.materialId); const b = line.basis ?? 'joint'; return (
            <tr key={line.id}>
              <td><span className="strong mt-name"><CommodityIcon code={groupCode(x?.groupId ?? null)} />{x?.description ?? '—'}</span><span className="sub fn-code">{x?.itemUid} · {x?.materialCode}</span></td>
              <td>{[x?.spec, x?.size].filter(Boolean).join(' · ') || '—'}</td>
              <td>{canEdit ? <select value={b} aria-label="مبنا" onChange={(e) => void cs.updateWeldLine(line.id, { basis: e.target.value as WeldBasis })}>{(['joint', 'meter'] as const).map((k) => <option key={k} value={k}>{WELD_BASIS_LABEL_FA[k]}</option>)}</select> : WELD_BASIS_LABEL_FA[b]}</td>
              <td className="num">{canEdit ? <NumInput value={line.qtyPerJoint} label="مقدار مصرف" decimals={4} onCommit={(n) => void cs.updateWeldLine(line.id, { qtyPerJoint: n })} /> : fa(line.qtyPerJoint, 4)} <span className="sub">{x?.unit} / {b === 'meter' ? 'متر' : 'سرجوش'}</span></td>
              <td>{canEdit && <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => void cs.removeWeldLine(line.id)}><Trash2 size={13} /></button>}</td>
            </tr>) })}</tbody></table>
      </div>
      {canEdit && (
        <div className="mt-weld-add">
          <div className="mt-grp-chips"><button className={`mt-grp${!group ? ' on' : ''}`} onClick={() => setGroup('')}>{all ? 'همهٔ گروه‌ها' : 'همهٔ مصرفی‌ها'}</button>{pool.map((g) => <button key={g.id} className={`mt-grp${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}><CommodityIcon code={g.code} size={15} tinted={false} />{g.title}</button>)}
            <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 11.5 }}><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setGroup('') }} style={{ width: 'auto' }} /> گروه‌های غیرمصرفی هم نشان داده شود</label></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="کالا" style={{ flex: 1, minWidth: 220 }}><option value="">کالا را انتخاب کنید (از بانک متریال)…</option>{options.map((x) => <option key={x.id} value={x.id}>{x.itemUid} · {x.description || x.materialCode}{x.spec ? ` — ${x.spec}` : ''}</option>)}</select>
            <select value={basis} onChange={(e) => setBasis(e.target.value as WeldBasis)} aria-label="مبنا" style={{ width: 175 }}>{(['joint', 'meter'] as const).map((k) => <option key={k} value={k}>به‌ازای {WELD_BASIS_LABEL_FA[k]}</option>)}</select>
            <input dir="ltr" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="مقدار مصرف" placeholder={`مقدار (اعشار مجاز) ${basis === 'meter' ? 'برای هر متر' : 'برای هر سرجوش'}`} style={{ width: 190 }} />
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!pick || q <= 0} onClick={async () => { if (await cs.addWeldLine(set.id, pick, q, basis)) { setPick(''); setQty('') } }}><Plus size={13} /> افزودن</button>
          </div>
          {options.length === 0 && <p className="im-helper" style={{ margin: 0 }}>کالایی برای انتخاب نیست؛ الکترود، فیلم، مواد ظهور و ثبوت، پوشش یا عایق را در «بانک متریال» ثبت کنید، یا گزینهٔ «گروه‌های غیرمصرفی هم نشان داده شود» را بزنید.</p>}
        </div>
      )}
    </div>
  )
}
