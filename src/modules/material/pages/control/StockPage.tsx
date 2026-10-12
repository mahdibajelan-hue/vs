import { useMemo, useState } from 'react'
import { Check, Download, Plus, X } from 'lucide-react'
import { useAuthStore } from '../../../../store/useAuthStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, type MaterialModel } from '../../lib/control/useMaterialModel'
import { writeXlsx } from '../../lib/control/xlsx'
import { stockByLocation } from '../../lib/control/locations'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { bn, fa } from '../../components/control/common'
import { ItemDrawer } from '../../components/control/ItemDrawer'
import { INSPECTION_STATUS_LABEL_FA, TXN_KIND_LABEL_FA, type Material, type MtlTxn, type TxnKind, type WarehouseLine } from '../../types'
import { Term } from '../../components/control/Term'
import { StockConcepts } from '../../components/control/StockConcepts'
import { useLookupOptions } from '../../lib/control/lookups'
import { ModalPortal } from '../../../../components/common/ModalPortal'

type Dim = 'item' | 'facility' | 'pipeline' | 'area' | 'front'
const DIMS: [Dim, string][] = [['item', 'قلم'], ['facility', 'ایستگاه'], ['pipeline', 'خط'], ['area', 'بخش اجرایی'], ['front', 'جبهه کاری']]
const keyOf = (x: Material, d: Dim) => (d === 'item' ? x.id : d === 'facility' ? x.facility : d === 'pipeline' ? x.pipelineNo : d === 'area' ? x.area : x.front) || '—'

/** Inventory and warehouse. Four views: stock (physical, usable, reserved, on the way, quarantined, rejected), shortages by station / line / area / front / item, receiving with entry inspection, and the movements (transfer, issue, return, scrap, adjustment). */
export function StockPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useMaterialModel(projectId)
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  if (sub === 'locations') return <Locations model={m} byId={byId} projectId={projectId} />
  if (sub === 'shortage') return <Shortage model={m} byId={byId} projectId={projectId} />
  if (sub === 'receiving') return <Receiving model={m} byId={byId} projectId={projectId} />
  if (sub === 'moves') return <Moves model={m} byId={byId} projectId={projectId} />
  return <StockTable model={m} byId={byId} />
}

function StockTable({ model: m, byId }: { model: MaterialModel; byId: Map<string, Material> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const rows = m.materials.filter((x) => !q.trim() || [x.materialCode, x.description, x.facility].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
  const tot = m.materials.reduce((a, x) => { const p = m.positions.get(x.id)!; const pr = x.unitPrice * (x.fxRate || 1); a.onHand += p.onHand * pr; a.inbound += p.inbound * pr; a.quar += p.quarantine * pr; a.rej += p.rejected * pr; return a }, { onHand: 0, inbound: 0, quar: 0, rej: 0 })
  const cols: Col<Material>[] = [
    { key: 'n', label: 'قلم', render: (x) => <><span className="strong">{x.description || x.materialCode}</span><span className="sub fn-code">{x.materialCode}{x.facility ? ` · ${x.facility}` : ''}</span></>, sort: (x) => x.description },
    ...(['onHand', 'reserved', 'available', 'inbound', 'inTransit', 'quarantine', 'rejected'] as const).map((k): Col<Material> => ({ key: k, label: <Term k={({ onHand: 'onhand', reserved: 'reserved', available: 'available', inbound: 'inbound', inTransit: 'intransit', quarantine: 'quarantine', rejected: 'rejected' } as const)[k]}>{{ onHand: 'موجودی قابل‌مصرف', reserved: 'رزرو', available: 'آزاد', inbound: 'تأمین در جریان', inTransit: 'در راه (حمل‌شده)', quarantine: 'قرنطینه / بازرسی', rejected: 'مردودی' }[k]}</Term>, num: true, render: (x) => { const v = m.positions.get(x.id)![k]; return v ? <span style={{ color: k === 'rejected' ? 'var(--im-coral)' : k === 'quarantine' ? 'var(--im-amber)' : undefined }}>{fa(v, 1)}</span> : <span style={{ opacity: .35 }}>—</span> }, sort: (x) => m.positions.get(x.id)![k] })),
    { key: 'u', label: 'واحد', render: (x) => x.unit },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="موجودی قابل‌مصرف" value={bn(tot.onHand)} unit="میلیارد ریال" tone="good" />
        <KpiCard i={1} label="تأمین در جریان" value={bn(tot.inbound)} unit="میلیارد ریال" hint="سفارش‌شده و نرسیده؛ موجودی فیزیکی نیست" />
        <KpiCard i={2} label="در قرنطینه یا انتظار بازرسی" value={bn(tot.quar)} unit="میلیارد ریال" tone={tot.quar ? 'warn' : 'good'} />
        <KpiCard i={3} label="مردودی" value={bn(tot.rej)} unit="میلیارد ریال" tone={tot.rej ? 'bad' : 'good'} />
      </div>
      <div className="mt-filters no-print"><input type="search" placeholder="جست‌وجو…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجو" /></div>
      <DataTable cols={cols} rows={rows} rowKey={(x) => x.id} onRow={(x) => setOpen(x.id)} empty="قلمی نیست." />
      <p className="im-helper" style={{ margin: 0 }}>موجودی فیزیکی فقط کالای رسیده، بازرسی‌شده و پذیرفته‌شده منهای مصرف و ضایعات است. کالای سفارش‌شده و نرسیده در «تأمین در جریان» می‌آید.</p>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
      {void byId}
    </div>
  )
}

function Shortage({ model: m, byId, projectId }: { model: MaterialModel; byId: Map<string, Material>; projectId: string }) {
  const [dim, setDim] = useState<Dim>('facility')
  const [open, setOpen] = useState<string | null>(null)
  const urgent = (x: Material) => { const pr = m.priorityById.get(x.id); return !!pr && (pr.stopRisk || (pr.slackDays != null && pr.slackDays <= 30)) }
  const rows = useMemo(() => {
    const acc = new Map<string, { key: string; items: number; urgentItems: number; gapV: number; urgentV: number; futureV: number; uncoveredV: number; ids: string[] }>()
    for (const x of m.materials) {
      const p = m.positions.get(x.id)!; if (p.siteGap <= 0) continue
      const pr = x.unitPrice * (x.fxRate || 1), k = keyOf(x, dim)
      const e = acc.get(k) ?? { key: k, items: 0, urgentItems: 0, gapV: 0, urgentV: 0, futureV: 0, uncoveredV: 0, ids: [] }
      e.items++; e.gapV += p.siteGap * pr; e.uncoveredV += p.uncoveredGap * pr; e.ids.push(x.id)
      if (urgent(x)) { e.urgentItems++; e.urgentV += p.siteGap * pr } else e.futureV += p.siteGap * pr
      acc.set(k, e)
    }
    return [...acc.values()].sort((a, b) => b.urgentV - a.urgentV || b.gapV - a.gapV)
  }, [m.materials, m.positions, dim, m.priorityById]) // eslint-disable-line react-hooks/exhaustive-deps
  const itemRows = dim === 'item' ? rows.map((r) => ({ r, x: byId.get(r.key)! })) : []
  const toX = () => writeXlsx(rows.map((r) => ({ [DIMS.find((d) => d[0] === dim)![1]]: dim === 'item' ? byId.get(r.key)?.description ?? '' : r.key, 'قلم': r.items, 'فوری (قلم)': r.urgentItems, 'کسری فوری (میلیارد)': Math.round(r.urgentV / 1e7) / 100, 'کسری آتی (میلیارد)': Math.round(r.futureV / 1e7) / 100, 'پوشش‌داده‌نشده (میلیارد)': Math.round(r.uncoveredV / 1e7) / 100 })), 'کسری-متریال.xlsx', 'کسری')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print"><div className="mt-pills">{DIMS.map(([k, l]) => <button key={k} className={`mt-pill${dim === k ? ' on' : ''}`} onClick={() => setDim(k)}>{l}</button>)}</div><button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => void toX()}><Download size={13} /> اکسل</button></div>
      <Section title="کسری متریال" hint="کسری = نیاز طراحی − مصرف‌شده − موجودی. «فوری» یعنی تاریخ نیاز نزدیک‌تر از زمان لازم برای تأمین یا حداکثر ۳۰ روز مانده است. «پوشش‌داده‌نشده» بخشی است که سفارش در راه هم آن را نمی‌پوشاند." flush>
        <DataTable rows={rows} rowKey={(r) => r.key} empty="کسری شناسایی نشد." foot cols={[
          { key: 'k', label: DIMS.find((d) => d[0] === dim)![1], render: (r) => <span className="strong">{dim === 'item' ? byId.get(r.key)?.description : r.key}</span> },
          { key: 'i', label: 'قلم', num: true, render: (r) => fa(r.items) },
          { key: 'u', label: 'کسری فوری (میلیارد)', num: true, render: (r) => <b style={{ color: r.urgentV ? 'var(--im-coral)' : undefined }}>{bn(r.urgentV, 2)}</b>, sort: (r) => r.urgentV, foot: <b>{bn(rows.reduce((a, r) => a + r.urgentV, 0), 2)}</b> },
          { key: 'f', label: 'کسری آتی (میلیارد)', num: true, render: (r) => bn(r.futureV, 2), sort: (r) => r.futureV, foot: <b>{bn(rows.reduce((a, r) => a + r.futureV, 0), 2)}</b> },
          { key: 'c', label: 'پوشش‌داده‌نشده (میلیارد)', num: true, render: (r) => bn(r.uncoveredV, 2), sort: (r) => r.uncoveredV },
          ...(dim === 'item' ? [{ key: 'q', label: 'مقدار کسری', num: true, render: (r: (typeof rows)[number]) => `${fa(m.positions.get(r.key)!.siteGap, 1)} ${byId.get(r.key)!.unit}` } as Col<(typeof rows)[number]>] : []),
        ]} onRow={dim === 'item' ? (r) => setOpen(r.key) : undefined} />
      </Section>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
      {void itemRows}{void projectId}
    </div>
  )
}

function Receiving({ model: m, byId, projectId }: { model: MaterialModel; byId: Map<string, Material>; projectId: string }) {
  const ms = useMaterialStore()
  const cs = useMaterialControlStore()
  const [form, setForm] = useState(false)
  const receipts = ms.warehouseReceipts.filter((r) => r.masterProjectId === projectId).sort((a, b) => (a.receiptDate < b.receiptDate ? 1 : -1))
  const lines = ms.warehouseLines.filter((l) => receipts.some((r) => r.id === l.receiptId))
  const pending = lines.filter((l) => l.inspectionStatus === 'pending' || l.inspectionStatus === 'quarantine')
  const canPost = cs.can(projectId, 'post_txn'), canInspect = cs.can(projectId, 'inspect')
  const decide = async (l: WarehouseLine, st: 'accepted' | 'quarantine' | 'rejected') => { if (await cs.inspect(l.id, st)) await ms.fetchAll() }
  const receiptOf = (id: string) => receipts.find((r) => r.id === id)
  const cols: Col<WarehouseLine>[] = [
    { key: 'd', label: 'رسید', render: (l) => <>{receiptOf(l.receiptId)?.receiptNumber}<span className="sub">{fmtD(receiptOf(l.receiptId)?.receiptDate)} · {receiptOf(l.receiptId)?.warehouseLocation}</span></> },
    { key: 'm', label: 'قلم', render: (l) => <span className="strong">{byId.get(l.materialId)?.description ?? '—'}</span> },
    { key: 'q', label: 'مقدار', num: true, render: (l) => `${fa(l.quantityReceived, 2)} ${byId.get(l.materialId)?.unit ?? ''}` },
    { key: 'c', label: 'وضعیت کالا', render: (l) => (l.condition === 'ok' ? 'سالم' : l.condition === 'damaged' ? 'آسیب‌دیده' : 'کسری هنگام رسید') },
    { key: 'i', label: 'بازرسی ورودی', render: (l) => <Chip tone={l.inspectionStatus === 'accepted' ? 'good' : l.inspectionStatus === 'rejected' ? 'bad' : 'warn'}>{INSPECTION_STATUS_LABEL_FA[l.inspectionStatus]}</Chip> },
    { key: 'a', label: '', render: (l) => canInspect && l.inspectionStatus !== 'accepted' && l.inspectionStatus !== 'rejected' ? <span style={{ display: 'inline-flex', gap: 4 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => void decide(l, 'accepted')}><Check size={13} /> پذیرش</button><button className="im-btn im-btn-sm" onClick={() => void decide(l, 'quarantine')}>قرنطینه</button><button className="im-btn im-btn-sm" onClick={() => void decide(l, 'rejected')}><X size={13} /> مردود</button></span> : null },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis"><KpiCard i={0} label="رسیدها" value={fa(receipts.length)} /><KpiCard i={1} label="در انتظار بازرسی یا قرنطینه" value={fa(pending.length)} tone={pending.length ? 'warn' : 'good'} /><KpiCard i={2} label="مردودی" value={fa(lines.filter((l) => l.inspectionStatus === 'rejected' || l.condition === 'damaged').length)} tone="bad" /></div>
      <div className="mt-filters no-print"><p className="im-helper" style={{ margin: 0 }}>کالا پس از رسید و بازرسی ورودی «پذیرفته» می‌شود و آن‌گاه به موجودی قابل‌مصرف اضافه می‌شود.</p>{canPost && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm(true)}><Plus size={14} /> ثبت رسید کالا</button>}</div>
      <DataTable cols={cols} rows={[...pending, ...lines.filter((l) => !pending.includes(l))]} rowKey={(l) => l.id} empty="رسیدی ثبت نشده است." />
      {form && <ReceiptForm model={m} projectId={projectId} onClose={() => setForm(false)} />}
    </div>
  )
}

function ReceiptForm({ model: m, projectId, onClose }: { model: MaterialModel; projectId: string; onClose: () => void }) {
  const ms = useMaterialStore()
  const [lines, setLines] = useState<{ id: string; qty: number; cond: 'ok' | 'damaged' | 'shortage' }[]>([{ id: '', qty: 0, cond: 'ok' }])
  const [num, setNum] = useState(`R-${String(ms.warehouseReceipts.filter((r) => r.masterProjectId === projectId).length + 1).padStart(3, '0')}`)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [loc, setLoc] = useState('')
  const whOpts = useLookupOptions(projectId, 'warehouse')
  const valid = lines.some((l) => l.id && l.qty > 0) && num.trim() && loc.trim()
  return (
    <ModalPortal>
    <div className="im-overlay"><div className="im-modal fn-form" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="ثبت رسید">
      <div className="im-modal-head"><div className="im-modal-title">ثبت رسید کالا</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
      <div className="fn-form-grid">
        <div className="im-field"><label>شمارهٔ رسید *</label><input value={num} onChange={(e) => setNum(e.target.value)} /></div>
        <div className="im-field"><label>تاریخ</label><JalaliDateInput value={date} onChange={setDate} /></div>
        <div className="im-field" style={{ gridColumn: '1 / -1' }}><label>محل نگهداری (انبار / محوطه)</label><select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="انبار"><option value="">انتخاب کنید…</option>{whOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><p className="im-helper">فهرست انبارها از «تنظیمات ← فهرست‌های پایه» می‌آید.</p></div>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6 }}>
            <select value={l.id} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} aria-label="قلم"><option value="">قلم…</option>{m.materials.map((x) => <option key={x.id} value={x.id}>{x.materialCode} · {x.description}</option>)}</select>
            <input inputMode="decimal" dir="ltr" placeholder="مقدار" value={l.qty || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))} aria-label="مقدار" />
            <select value={l.cond} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cond: e.target.value as 'ok' } : x)))} aria-label="وضعیت"><option value="ok">سالم</option><option value="damaged">آسیب‌دیده</option><option value="shortage">کسری هنگام رسید</option></select>
            <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button>
          </div>
        ))}
        <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} onClick={() => setLines([...lines, { id: '', qty: 0, cond: 'ok' }])}><Plus size={13} /> ردیف</button>
      </div>
      <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={!valid} onClick={async () => {
        const id = await ms.createWarehouseReceipt(projectId, { receiptNumber: num, receiptDate: date, warehouseLocation: loc, shipmentId: null, notes: '' })
        if (id) { for (const l of lines.filter((x) => x.id && x.qty > 0)) await ms.addWarehouseLine(id, l.id, l.qty, l.cond, 'pending'); onClose() }
      }}>ثبت رسید (در انتظار بازرسی)</button></div>
    </div></div>
    </ModalPortal>
  )
}

function Moves({ model: m, byId, projectId }: { model: MaterialModel; byId: Map<string, Material>; projectId: string }) {
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [form, setForm] = useState<TxnKind | null>(null)
  const [decide, setDecide] = useState<{ t: MtlTxn; approve: boolean } | null>(null)
  const txns = m.data.txns
  const pending = txns.filter((t) => t.status === 'pending')
  const canPost = cs.can(projectId, 'post_txn'), canApprove = cs.can(projectId, 'approve_txn')
  const cols: Col<MtlTxn>[] = [
    { key: 'd', label: 'تاریخ', render: (t) => fmtD(t.txnDate), sort: (t) => t.txnDate },
    { key: 'k', label: 'نوع', render: (t) => <Term k={({ issue: 'issue_voucher', transfer: 'transfer', return: 'return', scrap: 'scrap', adjust: 'adjust' } as Record<string, string>)[t.kind] ?? 'transfer'}>{t.kind === 'issue' ? 'خروج برای مصرف (حواله)' : TXN_KIND_LABEL_FA[t.kind]}</Term> },
    { key: 'm', label: 'قلم', render: (t) => <span className="strong">{byId.get(t.materialId)?.description ?? '—'}</span> },
    { key: 'q', label: 'مقدار', num: true, render: (t) => `${t.kind === 'adjust' && t.adjustSign === -1 ? '−' : ''}${fa(t.qty, 2)} ${byId.get(t.materialId)?.unit ?? ''}` },
    { key: 'w', label: 'مبدأ / مقصد / جبهه', render: (t) => [t.fromLoc && `از ${t.fromLoc}`, t.toLoc && `به ${t.toLoc}`, t.facility, t.front, t.workOp].filter(Boolean).join(' · ') || '—' },
    { key: 'r', label: 'سند', render: (t) => t.docRef || '—' },
    { key: 's', label: 'وضعیت', render: (t) => t.status === 'pending' && canApprove ? <span style={{ display: 'inline-flex', gap: 4 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDecide({ t, approve: true })}>تأیید</button><button className="im-btn im-btn-sm" onClick={() => setDecide({ t, approve: false })}>رد</button></span> : <Chip tone={t.status === 'posted' ? 'good' : t.status === 'pending' ? 'warn' : 'neutral'}>{t.status === 'posted' ? 'ثبت‌شده' : t.status === 'pending' ? 'در انتظار تأیید' : `باطل${t.voidReason ? `: ${t.voidReason}` : ''}`}</Chip> },
  ]
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  // goods leave for use only through «درخواست و مجوز خروج»; the direct voucher stays for administrators as a documented exception
  const kinds: TxnKind[] = isAdmin ? ['issue', 'transfer', 'return', 'scrap', 'adjust'] : ['transfer', 'return', 'scrap', 'adjust']
  const allocs = m.data.allocations
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <StockConcepts />
      <div className="fn-kpis"><KpiCard i={0} label="حواله مصرف (از مجوزهای خروج)" value={fa(txns.filter((t) => t.kind === 'issue' && t.status === 'posted').length)} hint="خروج برای مصرف فقط از «درخواست و مجوز خروج» ثبت می‌شود" /><KpiCard i={1} label="ضایعات و تعدیل در انتظار تأیید" value={fa(pending.length)} tone={pending.length ? 'warn' : 'good'} /><KpiCard i={2} label="تخصیص‌ها" value={fa(allocs.length)} /></div>
      {canPost && <div className="mt-filters no-print">{kinds.map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><button className="im-btn im-btn-sm" onClick={() => setForm(k)}><Plus size={13} /> {k === 'issue' ? 'حواله مستقیم (استثنا)' : TXN_KIND_LABEL_FA[k]}</button><Term k={k === 'issue' ? 'issue_voucher' : k}>{''}</Term></span>)}</div>}
      <DataTable cols={cols} rows={txns} rowKey={(t) => t.id} empty="تراکنشی ثبت نشده است." />
      {form && <TxnForm model={m} kind={form} projectId={projectId} orgs={orgs.map((o) => ({ value: o.id, label: o.name }))} onClose={() => setForm(null)} />}
      {decide && <FormModal title={decide.approve ? 'تأیید تراکنش' : 'رد تراکنش'} fields={[{ key: 'note', label: 'توضیح', kind: 'text', required: !decide.approve }]} initial={{ note: '' }} submitLabel={decide.approve ? 'تأیید' : 'رد'} onClose={() => setDecide(null)} onSubmit={async (v) => { await cs.decideTxn(decide.t.id, decide.approve, String(v.note ?? '')) }} />}
    </div>
  )
}

function TxnForm({ model: m, kind, projectId, orgs, onClose }: { model: MaterialModel; kind: TxnKind; projectId: string; orgs: { value: string; label: string }[]; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const options = m.materials.map((x) => ({ value: x.id, label: `${x.materialCode} · ${x.description}` }))
  const wh = useLookupOptions(projectId, 'warehouse'), fac = useLookupOptions(projectId, 'facility'), frn = useLookupOptions(projectId, 'front')
  const consumable = (id: string) => !!cs.groups.find((g) => g.id === m.materials.find((x) => x.id === id)?.groupId)?.isConsumable
  return (
    <FormModal title={TXN_KIND_LABEL_FA[kind]} subtitle={kind === 'scrap' || kind === 'adjust' ? 'ضایعات و تعدیل پس از تأیید کنترل متریال یا مشاور در موجودی اعمال می‌شود.' : undefined} submitLabel="ثبت" onClose={onClose}
      fields={[
        { key: 'materialId', label: 'قلم', kind: 'select', required: true, options, span: 2 },
        { key: 'qty', label: 'مقدار', kind: 'num', required: true }, { key: 'date', label: 'تاریخ', kind: 'date', required: true },
        { key: 'sign', label: 'جهت تعدیل', kind: 'select', required: true, show: () => kind === 'adjust', options: [{ value: '1', label: 'افزایش موجودی' }, { value: '-1', label: 'کاهش موجودی' }] },
        { key: 'from', label: 'از (انبار / محل)', kind: 'select', options: wh, show: () => kind === 'transfer' || kind === 'return' }, { key: 'to', label: 'به (انبار / محل)', kind: 'select', options: wh, show: () => kind === 'transfer' || kind === 'return' },
        { key: 'facility', label: 'ایستگاه', kind: 'select', options: fac, show: () => kind === 'issue' || kind === 'return' }, { key: 'front', label: 'جبهه کاری', kind: 'select', options: frn, show: () => kind === 'issue' || kind === 'return' },
        { key: 'op', label: 'نوع عملیات (مثلاً جوش خط، پوشش سرجوش)', kind: 'text', show: (v) => kind === 'issue' && consumable(String(v.materialId)) },
        { key: 'activityQty', label: 'حجم فعالیت (مثلاً تعداد سرجوش یا طول)', kind: 'num', show: (v) => kind === 'issue' && consumable(String(v.materialId)) }, { key: 'activityUnit', label: 'واحد فعالیت', kind: 'text', show: (v) => kind === 'issue' && consumable(String(v.materialId)) },
        { key: 'contractor', label: 'پیمانکار', kind: 'select', options: orgs, show: () => kind === 'issue' },
        { key: 'doc', label: 'سند مرجع (شمارهٔ حواله)', kind: 'text' }, { key: 'notes', label: kind === 'scrap' ? 'علت ضایعات' : 'یادداشت', kind: 'text', required: kind === 'scrap' || kind === 'adjust', span: 2 },
      ]}
      initial={{ materialId: '', qty: 0, date: new Date().toISOString().slice(0, 10), sign: '-1', from: '', to: '', facility: '', front: '', op: '', activityQty: 0, activityUnit: '', contractor: '', doc: '', notes: '' }}
      preview={(v) => { const x = m.materials.find((y) => y.id === v.materialId); const p = x && m.positions.get(x.id); return p ? <span>موجودی قابل‌مصرف فعلی: <b>{fa(p.onHand, 2)} {x.unit}</b> · رزرو {fa(p.reserved, 2)} · آزاد {fa(p.available, 2)}</span> : null }}
      onSubmit={async (v) => { await cs.postTxn({ materialId: String(v.materialId), kind, qty: Number(v.qty) || 0, date: String(v.date), from: String(v.from ?? ''), to: String(v.to ?? ''), facility: String(v.facility ?? ''), front: String(v.front ?? ''), op: String(v.op ?? ''), activityQty: Number(v.activityQty) || null, activityUnit: String(v.activityUnit ?? ''), contractorId: (v.contractor as string) || null, doc: String(v.doc ?? ''), notes: String(v.notes ?? ''), sign: kind === 'adjust' ? (Number(v.sign) as 1 | -1) : undefined }); void projectId }} />
  )
}

/** Stock per warehouse or yard: what each place holds, from accepted receipts, transfers and vouchers. */
function Locations({ model: m, byId, projectId }: { model: MaterialModel; byId: Map<string, Material>; projectId: string }) {
  const ms = useMaterialStore()
  const rows = useMemo(() => stockByLocation({ receipts: ms.warehouseReceipts.filter((r) => r.masterProjectId === projectId), lines: m.data.warehouseLines, txns: m.data.txns }), [ms.warehouseReceipts, m.data.warehouseLines, m.data.txns, projectId])
  const places = [...new Set(rows.map((r) => r.location))].sort()
  const [loc, setLoc] = useState('')
  const shown = rows.filter((r) => !loc || r.location === loc).sort((a, b) => a.location.localeCompare(b.location, 'fa'))
  const valueOf = (l: string) => rows.filter((r) => r.location === l).reduce((a, r) => a + r.qty * (byId.get(r.materialId)?.unitPrice ?? 0) * (byId.get(r.materialId)?.fxRate ?? 1), 0)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">{places.slice(0, 4).map((p, i) => <KpiCard key={p} i={i} label={p} value={bn(valueOf(p))} unit="میلیارد ریال" sub={`${fa(rows.filter((r) => r.location === p).length)} قلم`} />)}</div>
      <div className="mt-filters"><select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="انبار"><option value="">همهٔ انبارها</option>{places.map((p) => <option key={p}>{p}</option>)}</select></div>
      <DataTable rows={shown} rowKey={(r) => `${r.location}|${r.materialId}`} empty="موجودی پذیرفته‌شده‌ای در انبارها نیست." cols={[
        { key: 'l', label: 'انبار / محل', render: (r) => <span className="strong">{r.location}</span>, sort: (r) => r.location },
        { key: 'm', label: 'قلم', render: (r) => byId.get(r.materialId)?.description ?? '—' }, { key: 'q', label: 'موجودی', num: true, render: (r) => <span style={{ color: r.qty < 0 ? 'var(--im-coral)' : undefined }}>{fa(r.qty, 2)} {byId.get(r.materialId)?.unit}</span>, sort: (r) => r.qty }]} />
      <p className="im-helper" style={{ margin: 0 }}>حواله‌ای که مبدأ ندارد از انباری کم می‌شود که بیشترین موجودی همان قلم را دارد؛ مبدأ را در حواله بنویسید تا تراز هر انبار دقیق باشد.</p>
    </div>
  )
}
