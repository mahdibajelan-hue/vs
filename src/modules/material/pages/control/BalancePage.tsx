import { useMemo, useState } from 'react'
import { Download, TriangleAlert } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { balanceBy, type BalanceRow } from '../../lib/control/balance'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, KpiCard, type Col } from '../../../finance/components/fn'
import { bn, fa } from '../../components/control/common'
import { ItemDrawer } from '../../components/control/ItemDrawer'

const BY: ['item' | 'group' | 'station' | 'front' | 'project', string][] = [['project', 'کل پروژه'], ['group', 'گروه کالا'], ['station', 'ایستگاه'], ['front', 'جبهه کاری'], ['item', 'قلم']]

/** The material balance: contract MTO, design quantity, ordered, delivered, accepted, allocated, consumed, returned, scrap, rejected, stock, surplus and shortage — and what does not add up. */
export function BalancePage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const groups = useMaterialControlStore((s) => s.groups)
  const [by, setBy] = useState<(typeof BY)[number][0]>('group')
  const [open, setOpen] = useState<string | null>(null)
  const [onlyOdd, setOnlyOdd] = useState(false)
  const rows = useMemo(() => balanceBy({ materials: m.materials, positions: m.positions, groups, by }), [m.materials, m.positions, groups, by])
  const shown = onlyOdd ? rows.filter((r) => r.unexplained.length) : rows
  const q = (r: BalanceRow, v: number, d = 1) => (r.sameUnit ? (v ? fa(v, d) : <span style={{ opacity: .3 }}>—</span>) : <span style={{ opacity: .4 }} title="واحدهای مختلف؛ فقط ارزش‌ها قابل جمع‌اند">×</span>)
  const cols: Col<BalanceRow>[] = [
    { key: 'l', label: by === 'item' ? 'قلم' : BY.find((b) => b[0] === by)![1], render: (r) => <span className="strong">{r.label}</span> },
    { key: 'un', label: 'واحد', render: (r) => (r.sameUnit ? r.unit : 'مختلط') },
    { key: 'c', label: 'MTO پیمان', num: true, render: (r) => q(r, r.contractQty) },
    { key: 'd', label: 'نهایی طراحی', num: true, render: (r) => q(r, r.detailQty) },
    { key: 'f', label: 'طراحی − پیمان', num: true, render: (r) => (r.sameUnit ? <span style={{ color: r.designVsContract ? 'var(--im-amber)' : undefined }}>{r.designVsContract > 0 ? '+' : ''}{fa(r.designVsContract, 1)}</span> : '—') },
    { key: 'o', label: 'سفارش', num: true, render: (r) => q(r, r.ordered) },
    { key: 'r', label: 'تحویل', num: true, render: (r) => q(r, r.delivered) },
    { key: 'a', label: 'پذیرفته', num: true, render: (r) => q(r, r.accepted) },
    { key: 'al', label: 'تخصیص', num: true, render: (r) => q(r, r.allocated) },
    { key: 'u', label: 'مصرف', num: true, render: (r) => q(r, r.consumed) },
    { key: 'rt', label: 'برگشت', num: true, render: (r) => q(r, r.returned) },
    { key: 'sc', label: 'ضایعات', num: true, render: (r) => q(r, r.scrapped) },
    { key: 'rj', label: 'مردودی', num: true, render: (r) => q(r, r.rejected) },
    { key: 'h', label: 'موجودی', num: true, render: (r) => q(r, r.onHand) },
    { key: 'e', label: 'مازاد', num: true, render: (r) => q(r, r.excess) },
    { key: 's', label: 'کسری', num: true, render: (r) => (r.sameUnit ? (r.shortage ? <b style={{ color: 'var(--im-coral)' }}>{fa(r.shortage, 1)}</b> : <span style={{ opacity: .3 }}>—</span>) : '×') },
    { key: 'sv', label: 'کسری (میلیارد)', num: true, render: (r) => bn(r.shortageValue, 2), sort: (r) => r.shortageValue },
    { key: 'ev', label: 'مازاد (میلیارد)', num: true, render: (r) => bn(r.excessValue, 2), sort: (r) => r.excessValue },
    { key: 'x', label: 'توضیح‌داده‌نشده', render: (r) => (r.unexplained.length ? <span title={r.unexplained.join('\n')}><Chip tone="warn"><TriangleAlert size={11} /> {fa(r.unexplained.length)}</Chip></span> : <Chip tone="good">متوازن</Chip>) },
  ]
  const totals = useMemo(() => balanceBy({ materials: m.materials, positions: m.positions, groups, by: 'project' })[0], [m.materials, m.positions, groups])
  const odd = useMemo(() => balanceBy({ materials: m.materials, positions: m.positions, groups, by: 'item' }).filter((r) => r.unexplained.length), [m.materials, m.positions, groups])
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="ارزش MTO پیمان" value={bn(totals?.contractValue ?? 0)} unit="میلیارد ریال" />
        <KpiCard i={1} label="ارزش مصرف‌شده" value={bn(totals?.consumedValue ?? 0)} unit="میلیارد ریال" sub={totals?.contractValue ? `${fa(((totals.consumedValue) / totals.contractValue) * 100)}٪ از پیمان` : undefined} />
        <KpiCard i={2} label="کسری (ارزشی)" value={bn(totals?.shortageValue ?? 0)} unit="میلیارد ریال" tone={totals?.shortageValue ? 'warn' : 'good'} />
        <KpiCard i={3} label="اقلام توضیح‌داده‌نشده" value={fa(odd.length)} tone={odd.length ? 'warn' : 'good'} hint="مصرف بیش از پذیرش، تخصیص بیش از موجود، دریافت بیش از سفارش، مصرف بیش از نیاز، یا کالای منتظر بازرسی" />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills">{BY.map(([k, l]) => <button key={k} className={`mt-pill${by === k ? ' on' : ''}`} onClick={() => setBy(k)}>{l}</button>)}</div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={onlyOdd} onChange={(e) => setOnlyOdd(e.target.checked)} style={{ width: 'auto' }} /> فقط توضیح‌داده‌نشده</label>
          <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(shown.map((r) => ({ [BY.find((b) => b[0] === by)![1]]: r.label, 'واحد': r.unit, 'MTO پیمان': r.sameUnit ? r.contractQty : '', 'نهایی طراحی': r.sameUnit ? r.detailQty : '', 'سفارش': r.sameUnit ? r.ordered : '', 'تحویل': r.sameUnit ? r.delivered : '', 'پذیرفته': r.sameUnit ? r.accepted : '', 'تخصیص': r.sameUnit ? r.allocated : '', 'مصرف': r.sameUnit ? r.consumed : '', 'برگشت': r.sameUnit ? r.returned : '', 'ضایعات': r.sameUnit ? r.scrapped : '', 'مردودی': r.sameUnit ? r.rejected : '', 'موجودی': r.sameUnit ? r.onHand : '', 'مازاد': r.sameUnit ? r.excess : '', 'کسری': r.sameUnit ? r.shortage : '', 'کسری ارزشی': Math.round(r.shortageValue), 'مازاد ارزشی': Math.round(r.excessValue), 'توضیح‌داده‌نشده': r.unexplained.join(' | ') })), 'بالانس-متریال.xlsx', 'بالانس')}><Download size={13} /> اکسل</button>
        </span>
      </div>
      <DataTable cols={cols} rows={shown} rowKey={(r) => r.key} onRow={by === 'item' ? (r) => setOpen(r.key) : undefined} empty="داده‌ای برای بالانس نیست." />
      <p className="im-helper" style={{ margin: 0 }}>بالانس از تراکنش‌های ثبت‌شده و تأییدشده محاسبه می‌شود. در سطح گروه یا ایستگاه، اقلامی با واحد متفاوت جمع مقداری ندارند و فقط ارزش‌هایشان جمع می‌شود. تراز موجودی فیزیکی جدا از مقایسهٔ مصرف با طراحی است: مصرف را با «نهایی طراحی» و موجودی را با «پذیرفته منهای مصرف» بسنجید.</p>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
