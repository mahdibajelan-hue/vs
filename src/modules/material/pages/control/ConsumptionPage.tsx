import { useMemo, useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { consumptionReport, type ConsumptionRow } from '../../lib/control/consumption'
import { writeXlsx } from '../../lib/control/xlsx'
import { PB, HBars, Tile } from '../../../finance/components/charts'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { bn, fa } from '../../components/control/common'
import type { MtlNorm } from '../../types'

type Dim = 'contractor' | 'facility' | 'front' | 'month' | 'op'
const DIMS: [Dim, string][] = [['facility', 'ایستگاه'], ['front', 'جبهه کاری'], ['contractor', 'پیمانکار'], ['op', 'نوع عملیات'], ['month', 'ماه']]

/** Use of consumables (electrodes, coating, radiography film, gases…) by contractor, station, front, period and operation, set against the norm where there is one. */
export function ConsumptionPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [org, setOrg] = useState('')
  const [dim, setDim] = useState<Dim>('facility')
  const [norm, setNorm] = useState<MtlNorm | 'new' | null>(null)
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const norms = cs.norms.filter((n) => n.masterProjectId === projectId)
  const groupName = (id: string | null) => cs.groups.find((g) => g.id === id)?.title ?? '—'
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id
  const canEdit = cs.can(projectId, 'edit_items')

  const report = useMemo(() => consumptionReport({ materials: m.materials, groups: cs.groups, norms, txns: m.data.txns, settings: cs.settings, from: from || undefined, to: to || undefined, contractorId: org || undefined }), [m.materials, cs.groups, norms, m.data.txns, cs.settings, from, to, org])
  const valueBy = useMemo(() => {
    const acc = new Map<string, number>()
    for (const t of m.data.txns) {
      if (t.status !== 'posted' || (t.kind !== 'issue' && t.kind !== 'return')) continue
      if ((from && t.txnDate < from) || (to && t.txnDate > to) || (org && t.contractorOrgId !== org)) continue
      const x = byId.get(t.materialId); if (!x || !cs.groups.find((g) => g.id === x.groupId)?.isConsumable) continue
      const k = dim === 'contractor' ? (t.contractorOrgId ? orgName(t.contractorOrgId) : '—') : dim === 'facility' ? t.facility || '—' : dim === 'front' ? t.front || '—' : dim === 'month' ? t.txnDate.slice(0, 7) : t.workOp || '—'
      acc.set(k, (acc.get(k) ?? 0) + (t.kind === 'issue' ? 1 : -1) * t.qty * x.unitPrice * (x.fxRate || 1))
    }
    return [...acc.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [m.data.txns, byId, cs.groups, from, to, org, dim]) // eslint-disable-line react-hooks/exhaustive-deps
  const over = report.filter((r) => r.over)
  const scrap = m.materials.map((x) => { const p = m.positions.get(x.id)!; return { x, p, pct: p.received > 0 ? p.scrapped / p.received : 0 } }).filter((r) => r.p.scrapped > 0).sort((a, b) => b.pct - a.pct)

  if (sub === 'norms') {
    const cols: Col<MtlNorm>[] = [
      { key: 'w', label: 'شامل', render: (n) => (n.materialId ? <><span className="strong">{byId.get(n.materialId)?.description ?? '—'}</span><span className="sub">قلم</span></> : <><span className="strong">{groupName(n.groupId)}</span><span className="sub">گروه کالا</span></>) },
      { key: 'o', label: 'نوع عملیات', render: (n) => n.workOp || 'همهٔ عملیات‌ها' },
      { key: 'u', label: 'به ازای', render: (n) => n.perUnit || '—' },
      { key: 'q', label: 'مصرف استاندارد', num: true, render: (n) => fa(n.qtyPerUnit, 4) },
      { key: 'a', label: '', render: (n) => canEdit ? <span className="fn-row-actions"><button aria-label="ویرایش" onClick={() => setNorm(n)}><Pencil size={14} /></button><button aria-label="حذف" className="danger" onClick={() => { if (window.confirm('این مبنا حذف شود؟')) void cs.removeNorm(n.id) }}><Trash2 size={14} /></button></span> : null },
    ]
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="mt-filters"><p className="im-helper" style={{ margin: 0 }}>مبنای مصرف را فقط برای اقلامی بنویسید که واقعاً مبنا دارند (مثلاً کیلوگرم الکترود به ازای هر سرجوش ۶ اینچ). اقلام بدون مبنا فقط مصرفشان گزارش می‌شود.</p>{canEdit && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setNorm('new')}><Plus size={14} /> مبنای جدید</button>}</div>
        <DataTable cols={cols} rows={norms} rowKey={(n) => n.id} empty="مبنای مصرفی تعریف نشده است." />
        {norm && <FormModal title={norm === 'new' ? 'مبنای مصرف جدید' : 'ویرایش مبنای مصرف'} submitLabel="ذخیره" onClose={() => setNorm(null)}
          fields={[
            { key: 'scope', label: 'مبنا برای', kind: 'select', required: true, options: [{ value: 'material', label: 'یک قلم مشخص' }, { value: 'group', label: 'همهٔ اقلام یک گروه' }] },
            { key: 'materialId', label: 'قلم', kind: 'select', required: true, options: m.materials.map((x) => ({ value: x.id, label: `${x.materialCode} · ${x.description}` })), show: (v) => v.scope === 'material' },
            { key: 'groupId', label: 'گروه کالا', kind: 'select', required: true, options: cs.groups.filter((g) => g.isConsumable || g.measureKind === 'consumable').map((g) => ({ value: g.id, label: g.title })), show: (v) => v.scope === 'group' },
            { key: 'workOp', label: 'نوع عملیات', kind: 'text', hint: 'مثلاً «جوش ۶ اینچ»؛ همان متنی که در حواله مصرف می‌نویسید' }, { key: 'perUnit', label: 'به ازای (واحد فعالیت)', kind: 'text' },
            { key: 'qty', label: 'مصرف استاندارد به ازای هر واحد فعالیت', kind: 'num', required: true, span: 2 },
          ]}
          initial={{ scope: norm !== 'new' && norm.groupId && !norm.materialId ? 'group' : 'material', materialId: norm === 'new' ? '' : norm.materialId ?? '', groupId: norm === 'new' ? '' : norm.groupId ?? '', workOp: norm === 'new' ? '' : norm.workOp, perUnit: norm === 'new' ? '' : norm.perUnit, qty: norm === 'new' ? 0 : norm.qtyPerUnit }}
          onSubmit={async (v) => { await cs.saveNorm(projectId, { id: norm === 'new' ? undefined : norm.id, materialId: v.scope === 'material' ? String(v.materialId) : null, groupId: v.scope === 'group' ? String(v.groupId) : null, workOp: String(v.workOp ?? ''), perUnit: String(v.perUnit ?? ''), qtyPerUnit: Number(v.qty) || 0 }) }} />}
      </div>
    )
  }

  const cols: Col<ConsumptionRow>[] = [
    { key: 'm', label: 'قلم', render: (r) => <><span className="strong">{byId.get(r.materialId)?.description ?? '—'}</span><span className="sub fn-code">{byId.get(r.materialId)?.materialCode}</span></> },
    { key: 'o', label: 'عملیات', render: (r) => r.workOp || '—' },
    { key: 'a', label: 'مصرف واقعی', num: true, render: (r) => `${fa(r.actual, 2)} ${byId.get(r.materialId)?.unit ?? ''}`, sort: (r) => r.actual },
    { key: 'v', label: 'حجم فعالیت', num: true, render: (r) => (r.activityQty ? fa(r.activityQty, 1) : '—') },
    { key: 'e', label: 'مصرف مبنا', num: true, render: (r) => (r.expected == null ? <span style={{ opacity: .4 }}>بدون مبنا</span> : fa(r.expected, 2)) },
    { key: 'd', label: 'انحراف', num: true, render: (r) => r.deviationPct == null ? '—' : <span style={{ color: r.over ? 'var(--im-coral)' : undefined }}>{r.deviationPct > 0 ? '+' : ''}{fa(r.deviationPct, 1)}٪</span>, sort: (r) => r.deviationPct ?? -1e9 },
    { key: 's', label: 'وضعیت', render: (r) => (r.expected == null ? <Chip>بدون مبنا</Chip> : <Chip tone={r.over ? 'bad' : 'good'}>{r.over ? 'بیش از حد مجاز' : 'در محدوده'}</Chip>) },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="سطرهای مصرف" value={fa(report.length)} sub={`${fa(report.filter((r) => r.expected != null).length)} دارای مبنا`} />
        <KpiCard i={1} label="مصرف بیش از حد مجاز" value={fa(over.length)} tone={over.length ? 'bad' : 'good'} sub={`حد مجاز انحراف ${fa(cs.settings.consumptionTolerancePct)}٪`} />
        <KpiCard i={2} label="اقلام دارای ضایعات" value={fa(scrap.length)} tone={scrap.some((r) => r.pct * 100 > cs.settings.scrapWarnPct) ? 'warn' : 'neutral'} sub={`هشدار بالای ${fa(cs.settings.scrapWarnPct)}٪ از دریافتی`} />
        <KpiCard i={3} label="ارزش مصرف اقلام مصرفی" value={bn(valueBy.reduce((a, x) => a + x.value, 0))} unit="میلیارد ریال" />
      </div>
      <div className="mt-filters no-print">
        <span className="im-helper" style={{ margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>از <span style={{ minWidth: 150 }}><JalaliDateInput value={from} onChange={setFrom} /></span></span>
        <span className="im-helper" style={{ margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>تا <span style={{ minWidth: 150 }}><JalaliDateInput value={to} onChange={setTo} /></span></span>
        <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="پیمانکار"><option value="">همهٔ پیمانکارها</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => void writeXlsx(report.map((r) => ({ 'قلم': byId.get(r.materialId)?.description ?? '', 'عملیات': r.workOp, 'مصرف واقعی': r.actual, 'حجم فعالیت': r.activityQty, 'مصرف مبنا': r.expected ?? '', 'انحراف ٪': r.deviationPct == null ? '' : Math.round(r.deviationPct * 10) / 10 })), 'مصرف.xlsx', 'مصرف')}><Download size={13} /> اکسل</button>
      </div>
      <div className="mt-two">
        <Section title="مصرف و انحراف از مبنا" hint="فقط اقلام مصرفی؛ انحراف = مصرف واقعی نسبت به مصرف مبنا برای حجم فعالیتی که ثبت شده" flush><DataTable cols={cols} rows={report} rowKey={(r) => r.key} empty="مصرفی ثبت نشده است. حواله مصرف را در «موجودی و انبار ← انتقال و مصرف» ثبت کنید." /></Section>
        <Tile title="ارزش مصرف" hint="میلیارد ریال" action={<select value={dim} onChange={(e) => setDim(e.target.value as Dim)} aria-label="بر پایهٔ" style={{ width: 'auto' }}>{DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}>
          {valueBy.length === 0 ? <p className="im-helper" style={{ margin: '20px 0' }}>—</p> : <HBars fmt={(x) => fa(x / 1e9, 2)} data={valueBy.map((x, i) => ({ ...x, color: [PB.teal, PB.blue, PB.yellow, PB.violet, PB.orange, PB.sky, PB.green, PB.slate][i % 8] }))} />}
        </Tile>
      </div>
      <Section title="ضایعات" hint="ضایعات تأییدشده نسبت به کالای دریافتی هر قلم" flush>
        <DataTable rows={scrap} rowKey={(r) => r.x.id} empty="ضایعاتی ثبت نشده است." cols={[{ key: 'm', label: 'قلم', render: (r) => <span className="strong">{r.x.description}</span> }, { key: 's', label: 'ضایعات', num: true, render: (r) => `${fa(r.p.scrapped, 2)} ${r.x.unit}` }, { key: 'r', label: 'دریافتی', num: true, render: (r) => fa(r.p.received, 2) }, { key: 'p', label: 'سهم ضایعات', num: true, render: (r) => <span style={{ color: r.pct * 100 > cs.settings.scrapWarnPct ? 'var(--im-coral)' : undefined }}>{fa(r.pct * 100, 1)}٪</span>, sort: (r) => r.pct }]} />
      </Section>
    </div>
  )
}
