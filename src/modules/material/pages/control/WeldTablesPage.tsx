import { useMemo, useState } from 'react'
import { Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { NEED_STATUS_LABEL_FA, setTotals, weldNeeds, type MaterialNeed, type WeldSet } from '../../lib/control/weldPlan'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, KpiCard, NumInput, Section, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { CommodityIcon } from '../../components/control/CommodityIcon'
import { Term } from '../../components/control/Term'
import { fa, qtyText } from '../../components/control/common'

const TONE = { ok: 'good', inbound: 'warn', short: 'bad', no_order: 'bad' } as const

/** Weld consumption tables: one table per kind of weld joint (size, thickness, process) says how much of each consumable — electrodes by grade and size, radiography film, developer and fixer, coating — goes into ONE joint; with the joint count the total need of every item is computed and set against orders and stock. */
export function WeldTablesPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const canEdit = cs.can(projectId, 'edit_items')
  const [form, setForm] = useState<WeldSet | 'new' | null>(null)
  const sets = useMemo(() => cs.weldSets.filter((s) => s.masterProjectId === projectId), [cs.weldSets, projectId])
  const setIds = new Set(sets.map((s) => s.id))
  const lines = useMemo(() => cs.weldLines.filter((l) => setIds.has(l.setId)), [cs.weldLines, sets]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const needs = useMemo(() => weldNeeds(sets, lines, m.positions), [sets, lines, m.positions])
  const consumableGroups = useMemo(() => cs.groups.filter((g) => g.active && g.isConsumable), [cs.groups])
  const totalJoints = sets.reduce((a, s) => a + s.jointCount, 0)

  const needCols: Col<MaterialNeed>[] = [
    { key: 'm', label: 'کالا', render: (n) => { const x = byId.get(n.materialId); return <><span className="strong mt-name"><CommodityIcon code={m.groupById.get(x?.groupId ?? '')?.code} />{x?.description ?? '—'}</span><span className="sub fn-code">{x?.itemUid} · ردیف {x?.lineNo || '—'}</span></> }, sort: (n) => byId.get(n.materialId)?.description ?? '' },
    { key: 'n', label: 'نیاز کل', num: true, render: (n) => <span title={n.parts.map((p) => `${p.title}: ${p.joints} × ${p.perJoint} = ${p.qty}`).join('\n')}><b>{qtyText(n.need, byId.get(n.materialId)?.unit ?? '', 1)}</b></span>, sort: (n) => n.need },
    { key: 'o', label: 'سفارش‌شده', num: true, render: (n) => fa(n.ordered, 1) }, { key: 'r', label: 'تحویل‌شده', num: true, render: (n) => fa(n.received, 1) },
    { key: 'c', label: 'مصرف‌شده', num: true, render: (n) => fa(n.issued, 1) }, { key: 'h', label: 'موجودی انبار', num: true, render: (n) => fa(n.onHand, 1) },
    { key: 'g', label: 'کسری سفارش', num: true, render: (n) => (n.orderGap > 0 ? <b style={{ color: 'var(--im-coral)' }}>{fa(n.orderGap, 1)}</b> : <span style={{ opacity: .35 }}>—</span>), sort: (n) => n.orderGap },
    { key: 's', label: 'وضعیت', render: (n) => <Chip tone={TONE[n.status]}>{NEED_STATUS_LABEL_FA[n.status]}</Chip> },
  ]
  const exportRows = () => writeXlsx(needs.map((n) => { const x = byId.get(n.materialId); return { 'کد یکتا': x?.itemUid ?? '', 'کالا': x?.description ?? '', 'واحد': x?.unit ?? '', 'نیاز کل': n.need, 'سفارش': n.ordered, 'تحویل': n.received, 'مصرف': n.issued, 'موجودی': n.onHand, 'کسری سفارش': n.orderGap, 'وضعیت': NEED_STATUS_LABEL_FA[n.status] } }), 'نیاز-مصرفی-سرجوش.xlsx', 'نیاز')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="جدول‌های سرجوش" value={fa(sets.length)} />
        <KpiCard i={1} label="مجموع سرجوش‌های برنامه‌ای" value={fa(totalJoints)} />
        <KpiCard i={2} label="کالای مصرفی درگیر" value={fa(needs.length)} />
        <KpiCard i={3} label="بدون سفارش یا ناقص" value={fa(needs.filter((n) => n.status === 'no_order' || n.status === 'short').length)} tone={needs.some((n) => n.status === 'no_order' || n.status === 'short') ? 'bad' : 'good'} />
      </div>
      <div className="mt-filters no-print">
        <p className="im-helper" style={{ margin: 0 }}><Term k="weld_table">جدول مصرف سرجوش</Term>: به‌ازای یک سرجوش از هر کالا چقدر لازم است؛ با ضرب در تعداد سرجوش، نیاز کل می‌آید. کالاها را از بانک متریال (گروه‌های مصرفی) انتخاب می‌کنید.</p>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
          <button className="im-btn im-btn-sm" onClick={() => void exportRows()}><Download size={13} /> اکسل</button>
          {canEdit && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm('new')}><Plus size={14} /> جدول جدید</button>}
        </span>
      </div>
      {sets.length === 0 ? <div className="im-card im-empty" style={{ padding: 28 }}>هنوز جدولی ساخته نشده است. «جدول جدید» را بزنید؛ مثلاً «سرجوش ۳۰ اینچ — ضخامت ۱۴ میلی‌متر» با تعداد کل سرجوش‌ها، سپس الکترودها (مثلاً E6010 نمرهٔ ۲٫۵: ۱ کیلوگرم، E7010 نمرهٔ ۴: ۲ کیلوگرم)، فیلم رادیوگرافی و مواد دیگر را اضافه کنید.</div> : sets.map((s) => (
        <WeldSetCard key={s.id} set={s} canEdit={canEdit} byId={byId} groups={consumableGroups} onEdit={() => setForm(s)} />
      ))}
      {needs.length > 0 && <Section title="نیاز کل به‌تفکیک کالا" hint="مجموع همهٔ جدول‌ها. «کسری سفارش» یعنی نیاز بیش از مقدار سفارش‌شده؛ نشانهٔ روی مقدار، تفکیک هر جدول را نشان می‌دهد." flush><DataTable cols={needCols} rows={needs} rowKey={(n) => n.materialId} /></Section>}
      {form && <FormModal title={form === 'new' ? 'جدول مصرف سرجوش جدید' : `ویرایش ${form.title}`} submitLabel="ذخیره" onClose={() => setForm(null)}
        fields={[{ key: 'title', label: 'عنوان جدول', kind: 'text', required: true, span: 2, hint: 'مثلاً سرجوش ۳۰ اینچ — ضخامت ۱۴ میلی‌متر' }, { key: 'jointSize', label: 'قطر سرجوش', kind: 'text', hint: 'مثلاً ۳۰ اینچ' }, { key: 'thickness', label: 'ضخامت', kind: 'text', hint: 'مثلاً ۱۴ میلی‌متر' }, { key: 'process', label: 'روش جوشکاری', kind: 'text', hint: 'مثلاً SMAW' }, { key: 'jointCount', label: 'تعداد کل سرجوش‌ها', kind: 'num', required: true, hint: 'برای محاسبهٔ نیاز کل' }, { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 }]}
        initial={form === 'new' ? { title: '', jointSize: '', thickness: '', process: '', jointCount: 0, notes: '' } : { title: form.title, jointSize: form.jointSize, thickness: form.thickness, process: form.process, jointCount: form.jointCount, notes: form.notes }}
        onSubmit={async (v) => { await cs.saveWeldSet(projectId, { id: form === 'new' ? undefined : form.id, title: String(v.title), jointSize: String(v.jointSize ?? ''), thickness: String(v.thickness ?? ''), process: String(v.process ?? ''), jointCount: Number(v.jointCount) || 0, notes: String(v.notes ?? '') }) }} />}
    </div>
  )
}

function WeldSetCard({ set, canEdit, byId, groups, onEdit }: { set: WeldSet; canEdit: boolean; byId: Map<string, import('../../types').Material>; groups: import('../../types').MtlGroup[]; onEdit: () => void }) {
  const cs = useMaterialControlStore()
  const lines = setTotals(set, cs.weldLines)
  const [group, setGroup] = useState('')
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState(1)
  const m = useMaterialModelFromStore(set.masterProjectId)
  const options = m.materials.filter((x) => (!group ? groups.some((g) => g.id === x.groupId) : x.groupId === group) && !lines.some((l) => l.line.materialId === x.id))
  return (
    <div className="im-card mt-weld">
      <div className="mt-weld-head">
        <div style={{ minWidth: 0 }}><b>{set.title}</b><div className="im-helper" style={{ margin: 0 }}>{[set.jointSize, set.thickness, set.process].filter(Boolean).join(' · ') || 'بدون مشخصات'}{set.notes ? ` — ${set.notes}` : ''}</div></div>
        <span className="mt-weld-count"><small>تعداد سرجوش</small>{canEdit ? <NumInput value={set.jointCount} label="تعداد سرجوش" decimals={0} onCommit={(n) => void cs.saveWeldSet(set.masterProjectId, { ...set, jointCount: n })} /> : <b>{fa(set.jointCount)}</b>}</span>
        {canEdit && <span style={{ display: 'inline-flex', gap: 6 }}>
          <button className="im-btn im-btn-sm" onClick={onEdit}><Pencil size={13} /> ویرایش</button>
          <button className="im-btn im-btn-sm" onClick={() => { const t = window.prompt('عنوان جدول جدید (ردیف‌ها کپی می‌شود، تعداد سرجوش صفر است)', `${set.title} (کپی)`); if (t?.trim()) void cs.duplicateWeldSet(set.id, t.trim()) }}><Copy size={13} /> کپی</button>
          <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف جدول" onClick={() => { if (window.confirm(`جدول «${set.title}» با همهٔ ردیف‌هایش حذف شود؟`)) void cs.removeWeldSet(set.id) }}><Trash2 size={13} /></button>
        </span>}
      </div>
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
        <table className="fn-tbl"><thead><tr><th>کالا (به‌ازای یک سرجوش)</th><th>مشخصات</th><th className="num">مقدار برای یک سرجوش</th><th className="num">× {fa(set.jointCount)} سرجوش = مصرف کل</th><th /></tr></thead>
          <tbody>{lines.length === 0 ? <tr><td colSpan={5} className="fn-empty">هنوز کالایی در این جدول نیست.</td></tr> : lines.map(({ line, total }) => { const x = byId.get(line.materialId); return (
            <tr key={line.id}>
              <td><span className="strong mt-name"><CommodityIcon code={m.groupById.get(x?.groupId ?? '')?.code} />{x?.description ?? '—'}</span><span className="sub fn-code">{x?.itemUid} · {x?.materialCode}</span></td>
              <td>{[x?.spec, x?.size].filter(Boolean).join(' · ') || '—'}</td>
              <td className="num">{canEdit ? <NumInput value={line.qtyPerJoint} label="مقدار برای یک سرجوش" decimals={3} onCommit={(n) => void cs.updateWeldLine(line.id, n)} /> : fa(line.qtyPerJoint, 3)} {x?.unit}</td>
              <td className="num"><b>{qtyText(total, x?.unit ?? '', 1)}</b></td>
              <td>{canEdit && <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => void cs.removeWeldLine(line.id)}><Trash2 size={13} /></button>}</td>
            </tr>) })}</tbody></table>
      </div>
      {canEdit && (
        <div className="mt-weld-add">
          <div className="mt-grp-chips"><button className={`mt-grp${!group ? ' on' : ''}`} onClick={() => setGroup('')}>همهٔ مصرفی‌ها</button>{groups.map((g) => <button key={g.id} className={`mt-grp${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}><CommodityIcon code={g.code} size={15} tinted={false} />{g.title}</button>)}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="کالا" style={{ flex: 1, minWidth: 220 }}><option value="">کالا را انتخاب کنید (از بانک متریال)…</option>{options.map((x) => <option key={x.id} value={x.id}>{x.itemUid} · {x.description || x.materialCode}{x.spec ? ` — ${x.spec}` : ''}</option>)}</select>
            <input dir="ltr" inputMode="decimal" value={qty || ''} onChange={(e) => setQty(Number(e.target.value) || 0)} aria-label="مقدار برای یک سرجوش" placeholder="مقدار برای یک سرجوش" style={{ width: 150 }} />
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!pick || qty <= 0} onClick={async () => { if (await cs.addWeldLine(set.id, pick, qty)) { setPick(''); setQty(1) } }}><Plus size={13} /> افزودن</button>
          </div>
          {options.length === 0 && <p className="im-helper" style={{ margin: 0 }}>کالایی برای انتخاب نیست؛ ابتدا الکترود، فیلم، مواد ظهور و ثبوت یا عایق را در «بانک متریال» با گروه مصرفی ثبت کنید.</p>}
        </div>
      )}
    </div>
  )
}

const useMaterialModelFromStore = (projectId: string) => useMaterialModel(projectId)
