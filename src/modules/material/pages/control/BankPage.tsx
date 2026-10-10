import { useMemo, useState } from 'react'
import { Download, FileUp, Plus, Search } from 'lucide-react'

import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { writeXlsx } from '../../lib/control/xlsx'
import { dataGaps } from '../../lib/control/quality'
import { Chip, DataTable, KpiCard, type Col } from '../../../finance/components/fn'
import { DemoBadge, bn, fa } from '../../components/control/common'
import { ItemDrawer } from '../../components/control/ItemDrawer'
import { MaterialForm } from '../../components/control/MaterialForm'
import { MtoImport } from '../../components/control/MtoImport'
import type { Material } from '../../types'

type Flt = 'all' | 'noOrder' | 'under' | 'short' | 'disc' | 'excess' | 'outside' | 'done' | 'gaps'
const FLT: [Flt, string][] = [['all', 'همه'], ['noOrder', 'بدون سفارش'], ['under', 'سفارش ناقص'], ['short', 'کسری'], ['disc', 'دارای مغایرت'], ['excess', 'مازاد'], ['outside', 'خارج از پیمان'], ['done', 'تحویل کامل'], ['gaps', 'داده ناقص']]

/** The material bank: every item with its place of use, the contract and design quantities, and where its supply stands. Click a row for the full file of the item. */
export function BankPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const can = useMaterialControlStore((s) => s.can)
  const [q, setQ] = useState('')
  const [station, setStation] = useState('')
  const [group, setGroup] = useState('')
  const [flt, setFlt] = useState<Flt>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<Material | 'new' | null>(null)
  const [imp, setImp] = useState<'contract' | 'detail' | null>(null)

  const discByMat = useMemo(() => { const s = new Map<string, number>(); for (const d of m.detected) s.set(d.materialId, (s.get(d.materialId) ?? 0) + 1); return s }, [m.detected])
  const stationsList = useMemo(() => [...new Set(m.materials.map((x) => x.facility).filter(Boolean))].sort(), [m.materials])
  const flags = (x: Material) => {
    const p = m.positions.get(x.id)!
    return { noOrder: p.requiredQty > 0 && p.ordered === 0, under: p.ordered > 0 && p.ordered < p.requiredQty, short: p.uncoveredGap > 0, disc: (discByMat.get(x.id) ?? 0) > 0, excess: p.excess > 0, outside: !(x.contractQty && x.contractQty > 0) && !!x.detailQty, done: p.requiredQty > 0 && p.received >= p.requiredQty, gaps: dataGaps(x).length > 0 }
  }
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return m.materials.filter((x) => (!station || x.facility === station) && (!group || x.groupId === group) && (!t || [x.materialCode, x.description, x.tagNumber, x.pipelineNo, x.isometricNo, x.pidNumber, x.usageLocation, x.spec].join(' ').toLowerCase().includes(t)) && (flt === 'all' || flags(x)[flt]))
  }, [m.materials, m.positions, q, station, group, flt, discByMat]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => { const c: Record<Flt, number> = { all: m.materials.length, noOrder: 0, under: 0, short: 0, disc: 0, excess: 0, outside: 0, done: 0, gaps: 0 }; for (const x of m.materials) { const f = flags(x); for (const k of Object.keys(f) as (keyof typeof f)[]) if (f[k]) c[k]++ } return c }, [m.materials, m.positions, discByMat]) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: Col<Material>[] = [
    { key: 'n', label: 'قلم', render: (x) => <><span className="strong">{x.description || x.materialCode} {x.isDemo && <DemoBadge />}</span><span className="sub fn-code">{x.materialCode}{x.groupId ? ` · ${m.groupById.get(x.groupId)?.title ?? ''}` : ''}</span></>, sort: (x) => x.description },
    { key: 'l', label: 'محل مصرف', render: (x) => <>{x.facility || '—'}<span className="sub">{[x.pipelineNo, x.tagNumber, x.front].filter(Boolean).join(' · ')}</span></> },
    { key: 'c', label: 'پیمان', num: true, render: (x) => <>{fa(m.positions.get(x.id)!.contractQty, 1)}<span className="sub">{x.unit}</span></>, sort: (x) => m.positions.get(x.id)!.contractQty },
    { key: 'd', label: 'طراحی', num: true, render: (x) => { const p = m.positions.get(x.id)!; return p.detailQty == null ? <span style={{ opacity: .4 }}>—</span> : <span style={{ color: p.diffQty ? 'var(--im-amber)' : undefined }}>{fa(p.detailQty, 1)}</span> } },
    { key: 'o', label: 'سفارش', num: true, render: (x) => fa(m.positions.get(x.id)!.ordered, 1), sort: (x) => m.positions.get(x.id)!.ordered },
    { key: 'r', label: 'تحویل', num: true, render: (x) => fa(m.positions.get(x.id)!.received, 1), sort: (x) => m.positions.get(x.id)!.received },
    { key: 'u', label: 'مصرف', num: true, render: (x) => fa(m.positions.get(x.id)!.netConsumed, 1) },
    { key: 'h', label: 'موجودی', num: true, render: (x) => fa(m.positions.get(x.id)!.onHand, 1), sort: (x) => m.positions.get(x.id)!.onHand },
    { key: 'g', label: 'کسری', num: true, render: (x) => { const g = m.positions.get(x.id)!.uncoveredGap; return g > 0 ? <b style={{ color: 'var(--im-coral)' }}>{fa(g, 1)}</b> : <span style={{ opacity: .4 }}>—</span> }, sort: (x) => m.positions.get(x.id)!.uncoveredGap },
    { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (x) => bn(m.positions.get(x.id)!.baseValue), sort: (x) => m.positions.get(x.id)!.baseValue },
    { key: 's', label: 'وضعیت', render: (x) => { const f = flags(x); return <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{f.outside && <Chip tone="warn">خارج از پیمان</Chip>}{f.noOrder && <Chip tone="bad">بدون سفارش</Chip>}{f.under && <Chip tone="warn">ناقص</Chip>}{f.disc && !f.outside && <Chip tone="warn">مغایرت</Chip>}{f.done && <Chip tone="good">تحویل کامل</Chip>}{f.gaps && <span title={dataGaps(x).join('، ')}><Chip>ناقص: {dataGaps(x)[0]}{dataGaps(x).length > 1 ? ` +${fa(dataGaps(x).length - 1)}` : ''}</Chip></span>}</span> } },
  ]
  const totalValue = m.materials.reduce((a, x) => a + (m.positions.get(x.id)?.baseValue ?? 0), 0)
  const exportRows = () => writeXlsx(rows.map((x) => { const p = m.positions.get(x.id)!; return { 'کد': x.materialCode, 'شرح': x.description, 'گروه': m.groupById.get(x.groupId ?? '')?.title ?? '', 'مشخصات': x.spec, 'سایز': x.size, 'واحد': x.unit, 'ایستگاه': x.facility, 'بخش': x.area, 'خط': x.pipelineNo, 'ایزو': x.isometricNo, 'نقشه': x.pidNumber, 'تگ': x.tagNumber, 'جبهه': x.front, 'مقدار پیمان': p.contractQty, 'مقدار طراحی': p.detailQty ?? '', 'سفارش': p.ordered, 'تحویل': p.received, 'پذیرفته': p.accepted, 'مصرف': p.netConsumed, 'موجودی': p.onHand, 'کسری': p.uncoveredGap, 'قیمت واحد': x.unitPrice, 'ارزش': Math.round(p.baseValue), 'تاریخ نیاز': x.needDate ?? '' } }), 'بانک-متریال.xlsx', 'بانک متریال')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="اقلام" value={fa(m.materials.length)} sub={`${fa(counts.outside)} خارج از MTO پیمان`} />
        <KpiCard i={1} label="ارزش MTO پیمان" value={bn(totalValue)} unit="میلیارد ریال" />
        <KpiCard i={2} label="بدون سفارش یا ناقص" value={fa(counts.noOrder + counts.under)} tone={counts.noOrder + counts.under ? 'warn' : 'good'} />
        <KpiCard i={3} label="با کسری پوشش‌داده‌نشده" value={fa(counts.short)} tone={counts.short ? 'bad' : 'good'} />
      </div>
      <div className="mt-filters no-print">
        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}><Search size={14} style={{ position: 'absolute', insetInlineStart: 10, opacity: .55 }} /><input type="search" placeholder="جست‌وجوی کد، شرح، تگ، خط، نقشه…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 32, minWidth: 260 }} aria-label="جست‌وجو" /></label>
        <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="ایستگاه"><option value="">همهٔ ایستگاه‌ها</option>{stationsList.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="گروه کالا"><option value="">همهٔ گروه‌ها</option>{m.groups.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => void exportRows()}><Download size={14} /> اکسل</button>
          {can(projectId, 'edit_items') && <><button className="im-btn im-btn-sm" onClick={() => setImp('contract')}><FileUp size={14} /> ورود MTO پیمان</button><button className="im-btn im-btn-sm" onClick={() => setImp('detail')}><FileUp size={14} /> ورود MTO طراحی</button><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm('new')}><Plus size={14} /> قلم جدید</button></>}
        </span>
      </div>
      <div className="mt-pills no-print">{FLT.map(([k, l]) => <button key={k} className={`mt-pill${flt === k ? ' on' : ''}`} onClick={() => setFlt(k)}>{l}<em>{fa(counts[k])}</em></button>)}</div>
      <DataTable cols={cols} rows={rows} rowKey={(x) => x.id} onRow={(x) => setOpen(x.id)} empty={m.materials.length ? 'قلمی با این فیلترها نیست.' : 'هنوز قلمی ثبت نشده است؛ MTO پیمان را وارد کنید.'} />
      <p className="im-helper no-print" style={{ margin: 0 }}>تاریخ نیاز، ارزش و مقدارها بر پایهٔ MTO پیمان و ثبت‌های تأییدشده است. {can(projectId, 'edit_items') && 'برای حذف قلم، آن را باز کنید و از ویرایش استفاده کنید.'}</p>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
      {form && <MaterialForm projectId={projectId} material={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {imp && <MtoImport projectId={projectId} mode={imp} onClose={() => setImp(null)} />}
    </div>
  )
}
