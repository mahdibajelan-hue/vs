import { useMemo, useState, type ReactNode } from 'react'
import { Download, Printer } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, isOpenTarget, type MaterialModel } from '../../lib/control/useMaterialModel'
import { balanceBy } from '../../lib/control/balance'
import { consumptionReport } from '../../lib/control/consumption'
import { expectedArrival } from '../../lib/control/discrepancies'
import { itemProgress } from '../../lib/control/progress'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../../finance/components/fn'
import { ProgressBar, bn, fa, pct } from '../../components/control/common'
import { ReportPack, PACKS, type PackId } from './ReportPacks'
import { ItemDrawer } from '../../components/control/ItemDrawer'
import { CHANGE_FIELD_LABEL_FA, DISCREPANCY_KIND_LABEL_FA, DISCREPANCY_STATUS_LABEL_FA, INSPECTION_STATUS_LABEL_FA, STAGE_STATUS_LABEL_FA, type Material } from '../../types'

type RId = `pack_${PackId}` | 'overview' | 'station' | 'mto' | 'outside' | 'noorder' | 'shortage' | 'packages' | 'progress' | 'inbound' | 'receiving' | 'consumables' | 'norms' | 'balance' | 'surplus' | 'contractor' | 'history'
const CATALOG: { group: string; items: [RId, string][] }[] = [
  { group: 'بسته‌های چاپی نقش‌محور', items: PACKS.map((k): [RId, string] => [`pack_${k.id}`, k.title]) },
  { group: 'وضعیت و MTO', items: [['overview', 'داشبورد جامع ایستگاه‌ها'], ['station', 'فهرست متریال هر ایستگاه'], ['mto', 'مقایسهٔ MTO پیمان و طراحی'], ['outside', 'خارج از پیمان و اختلاف مقدار'], ['noorder', 'بدون سفارش یا سفارش ناقص'], ['shortage', 'کسری فوری و آتی به‌تفکیک جبهه']] },
  { group: 'تأمین', items: [['packages', 'بسته‌های خرید و مراحل'], ['progress', 'پیشرفت وزنی و ارزش تأمین‌شده'], ['inbound', 'اقلام در راه و تأخیرها'], ['contractor', 'عملکرد پیمانکار و اقدام مشاور/کارفرما']] },
  { group: 'انبار و مصرف', items: [['receiving', 'ورود، پذیرش و مردودی'], ['consumables', 'مصرف الکترود، پوشش و فیلم'], ['norms', 'مصرف واقعی در برابر مبنا'], ['balance', 'بالانس نهایی مقداری و ارزشی'], ['surplus', 'مازاد، قابل‌انتقال و راکد']] },
  { group: 'سوابق', items: [['history', 'تغییرات، تأییدها و مغایرت‌ها']] },
]
const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

function Rep<T>({ cols, rows, rowKey, onRow, xlsx, name, foot, empty }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void; xlsx: (r: T) => Record<string, string | number>; name: string; foot?: boolean; empty?: string }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="no-print" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(rows.map(xlsx), `${name}.xlsx`, name)}><Download size={13} /> اکسل</button>
        <button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button>
      </div>
      <DataTable cols={cols} rows={rows} rowKey={rowKey} onRow={onRow} foot={foot} empty={empty} />
    </div>
  )
}

/** Sixteen filterable, sortable, exportable reports. Rows that stand for an item open its file, so a total can be followed down to the station, the package, the item and where it is used. */
export function ReportsPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const [rid, setRid] = useState<RId>('pack_pm')
  const [station, setStation] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const stations = useMemo(() => [...new Set(m.materials.map((x) => x.facility).filter(Boolean))].sort(), [m.materials])
  const mats = useMemo(() => m.materials.filter((x) => !station || x.facility === station), [m.materials, station])
  const P = (x: Material) => m.positions.get(x.id)!
  const price = (x: Material) => x.unitPrice * (x.fxRate || 1)
  const itemCell = (x: Material): ReactNode => <><span className="strong">{x.description || x.materialCode}</span><span className="sub fn-code">{x.materialCode}{x.facility ? ` · ${x.facility}` : ''}</span></>
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const gname = (x: Material) => m.groupById.get(x.groupId ?? '')?.title ?? '—'
  const meta = CATALOG.flatMap((g) => g.items).find((i) => i[0] === rid)!
  const open0 = (x: Material) => setOpen(x.id)

  const body = (): ReactNode => {
    if (rid.startsWith('pack_')) return <ReportPack id={rid.slice(5) as PackId} projectId={projectId} />
    switch (rid) {
      case 'overview': {
        const rows = stations.length ? stations : ['']
        const acc = rows.map((st) => {
          const ms = m.materials.filter((x) => (x.facility || '') === st)
          const ids = new Set(ms.map((x) => x.id))
          const base = ms.reduce((a, x) => a + P(x).baseValue, 0), ordered = ms.reduce((a, x) => a + P(x).orderedValue, 0), got = ms.reduce((a, x) => a + P(x).receivedValue, 0), used = ms.reduce((a, x) => a + P(x).consumedValue, 0), gap = ms.reduce((a, x) => a + P(x).siteGap * price(x), 0)
          const pg = m.byStation.find((r) => r.key === (st || '—'))
          const risks = new Set<string>(); for (const id of ids) for (const l of m.linksByMaterial.get(id) ?? []) if (isOpenTarget(cs.linkTargets.get(l.targetId))) risks.add(l.targetId)
          return { st: st || 'بدون ایستگاه', n: ms.length, base, ordered, got, used, gap, prog: pg?.actual ?? 0, plan: pg?.planned ?? 0, disc: m.discrepancies.filter((d) => d.materialId && ids.has(d.materialId) && (d.status === 'open' || d.status === 'in_review')).length, risks: risks.size }
        })
        return <Rep name="داشبورد-ایستگاه" rows={acc} rowKey={(r) => r.st} onRow={(r) => { setStation(r.st === 'بدون ایستگاه' ? '' : r.st); setRid('station') }} foot xlsx={(r) => ({ 'ایستگاه': r.st, 'قلم': r.n, 'ارزش پیمان': Math.round(r.base), 'سفارش': Math.round(r.ordered), 'تحویل': Math.round(r.got), 'مصرف': Math.round(r.used), 'کسری': Math.round(r.gap), 'پیشرفت وزنی': Math.round(r.prog * 1000) / 10 })} cols={[
          { key: 's', label: 'ایستگاه', render: (r) => <span className="strong">{r.st}</span> }, { key: 'n', label: 'قلم', num: true, render: (r) => fa(r.n) },
          { key: 'b', label: 'ارزش پیمان (میلیارد)', num: true, render: (r) => bn(r.base), sort: (r) => r.base, foot: <b>{bn(acc.reduce((a, r) => a + r.base, 0))}</b> }, { key: 'o', label: 'سفارش', num: true, render: (r) => bn(r.ordered), foot: <b>{bn(acc.reduce((a, r) => a + r.ordered, 0))}</b> },
          { key: 'g', label: 'تحویل', num: true, render: (r) => bn(r.got), foot: <b>{bn(acc.reduce((a, r) => a + r.got, 0))}</b> }, { key: 'u', label: 'مصرف', num: true, render: (r) => bn(r.used) }, { key: 'k', label: 'کسری', num: true, render: (r) => <b style={{ color: r.gap ? 'var(--im-coral)' : undefined }}>{bn(r.gap)}</b>, sort: (r) => r.gap },
          { key: 'p', label: 'پیشرفت وزنی', render: (r) => <div style={{ minWidth: 110 }}><ProgressBar actual={r.prog} planned={r.plan} /><small>{pct(r.prog)}</small></div> }, { key: 'd', label: 'مغایرت باز', num: true, render: (r) => fa(r.disc) }, { key: 'r', label: 'ریسک/مسئلهٔ باز', num: true, render: (r) => fa(r.risks) },
        ]} />
      }
      case 'station':
        return <Rep name="متریال-ایستگاه" rows={mats} rowKey={(x) => x.id} onRow={open0} xlsx={(x) => ({ 'کد': x.materialCode, 'شرح': x.description, 'ایستگاه': x.facility, 'مورد نیاز': P(x).requiredQty, 'سفارش': P(x).ordered, 'تحویل': P(x).received, 'مصرف': P(x).netConsumed, 'موجودی': P(x).onHand })} cols={[
          { key: 'n', label: 'قلم', render: itemCell, sort: (x) => x.description }, { key: 'u', label: 'واحد', render: (x) => x.unit }, { key: 'r', label: 'مورد نیاز', num: true, render: (x) => fa(P(x).requiredQty, 1), sort: (x) => P(x).requiredQty }, { key: 'o', label: 'سفارش', num: true, render: (x) => fa(P(x).ordered, 1) },
          { key: 'g', label: 'تحویل', num: true, render: (x) => fa(P(x).received, 1) }, { key: 'c', label: 'مصرف', num: true, render: (x) => fa(P(x).netConsumed, 1) }, { key: 'h', label: 'موجودی', num: true, render: (x) => fa(P(x).onHand, 1) }]} />
      case 'mto':
        return <Rep name="مقایسه-MTO" rows={mats} rowKey={(x) => x.id} onRow={open0} xlsx={(x) => ({ 'کد': x.materialCode, 'شرح': x.description, 'پیمان': P(x).contractQty, 'طراحی': P(x).detailQty ?? '', 'اختلاف': P(x).diffQty ?? '' })} cols={[
          { key: 'n', label: 'قلم', render: itemCell }, { key: 'c', label: 'پیمان', num: true, render: (x) => fa(P(x).contractQty, 2) }, { key: 'd', label: 'طراحی', num: true, render: (x) => (P(x).detailQty == null ? '—' : fa(P(x).detailQty!, 2)) },
          { key: 'f', label: 'اختلاف', num: true, render: (x) => (P(x).diffQty == null ? '—' : <span style={{ color: P(x).diffQty ? 'var(--im-amber)' : undefined }}>{P(x).diffQty! > 0 ? '+' : ''}{fa(P(x).diffQty!, 2)}</span>), sort: (x) => P(x).diffQty ?? 0 },
          { key: 'v', label: 'اثر ارزشی (میلیارد)', num: true, render: (x) => (P(x).diffQty ? bn(P(x).diffQty! * price(x), 2) : '—') }]} />
      case 'outside': {
        const rows = mats.filter((x) => !(x.contractQty && x.contractQty > 0) && x.detailQty || (P(x).diffQty ?? 0) !== 0)
        return <Rep name="خارج-از-پیمان" rows={rows} rowKey={(x) => x.id} onRow={open0} xlsx={(x) => ({ 'کد': x.materialCode, 'شرح': x.description, 'پیمان': P(x).contractQty, 'طراحی': P(x).detailQty ?? '', 'نوع': !(x.contractQty && x.contractQty > 0) ? 'خارج از پیمان' : 'اختلاف مقدار' })} cols={[
          { key: 'n', label: 'قلم', render: itemCell }, { key: 't', label: 'نوع', render: (x) => <Chip tone="warn">{!(x.contractQty && x.contractQty > 0) ? 'خارج از MTO پیمان' : 'اختلاف مقدار'}</Chip> }, { key: 'c', label: 'پیمان', num: true, render: (x) => fa(P(x).contractQty, 2) }, { key: 'd', label: 'طراحی', num: true, render: (x) => fa(P(x).detailQty ?? 0, 2) },
          { key: 'v', label: 'ارزش اختلاف (میلیارد)', num: true, render: (x) => bn((P(x).diffQty ?? 0) * price(x), 2) }]} empty="موردی نیست." />
      }
      case 'noorder': {
        const rows = mats.filter((x) => P(x).requiredQty > 0 && P(x).ordered < P(x).requiredQty)
        return <Rep name="بدون-سفارش" rows={rows} rowKey={(x) => x.id} onRow={open0} xlsx={(x) => ({ 'کد': x.materialCode, 'شرح': x.description, 'نیاز': P(x).requiredQty, 'سفارش': P(x).ordered, 'مانده سفارش': P(x).orderGap })} cols={[
          { key: 'n', label: 'قلم', render: itemCell }, { key: 's', label: 'وضعیت', render: (x) => <Chip tone={P(x).ordered === 0 ? 'bad' : 'warn'}>{P(x).ordered === 0 ? 'بدون سفارش' : 'سفارش ناقص'}</Chip> }, { key: 'r', label: 'نیاز', num: true, render: (x) => fa(P(x).requiredQty, 1) }, { key: 'o', label: 'سفارش', num: true, render: (x) => fa(P(x).ordered, 1) },
          { key: 'g', label: 'مانده سفارش', num: true, render: (x) => <b>{fa(P(x).orderGap, 1)} {x.unit}</b>, sort: (x) => P(x).orderGap }, { key: 'd', label: 'تاریخ نیاز', render: (x) => fmtD(x.needDate) }, { key: 'l', label: 'زمان تأمین', num: true, render: (x) => (x.leadTimeDays ? `${fa(x.leadTimeDays)} روز` : '—') }]} />
      }
      case 'shortage': {
        const acc = new Map<string, { front: string; items: Material[]; urgent: number; future: number }>()
        for (const x of mats) { const p = P(x); if (p.siteGap <= 0) continue; const k = x.front || x.facility || 'بدون جبهه'; const e = acc.get(k) ?? { front: k, items: [], urgent: 0, future: 0 }; e.items.push(x); const pr = m.priorityById.get(x.id); if (pr && (pr.stopRisk || (pr.slackDays != null && pr.slackDays <= 30))) e.urgent += p.siteGap * price(x); else e.future += p.siteGap * price(x); acc.set(k, e) }
        const rows = [...acc.values()].sort((a, b) => b.urgent - a.urgent)
        return <Rep name="کسری-جبهه" rows={rows} rowKey={(r) => r.front} xlsx={(r) => ({ 'جبهه': r.front, 'قلم': r.items.length, 'فوری': Math.round(r.urgent), 'آتی': Math.round(r.future) })} cols={[
          { key: 'f', label: 'جبهه / ایستگاه', render: (r) => <span className="strong">{r.front}</span> }, { key: 'n', label: 'قلم', num: true, render: (r) => fa(r.items.length) }, { key: 'u', label: 'کسری فوری (میلیارد)', num: true, render: (r) => <b style={{ color: r.urgent ? 'var(--im-coral)' : undefined }}>{bn(r.urgent, 2)}</b>, sort: (r) => r.urgent },
          { key: 'a', label: 'کسری آتی (میلیارد)', num: true, render: (r) => bn(r.future, 2) }, { key: 'i', label: 'اقلام اصلی', render: (r) => <span style={{ fontSize: 12 }}>{r.items.slice(0, 3).map((x) => x.description).join('، ')}{r.items.length > 3 ? ` و ${fa(r.items.length - 3)} مورد` : ''}</span> }]} empty="کسری شناسایی نشد." />
      }
      case 'packages': {
        const defs = cs.stageDefs.filter((d) => d.active)
        return <Rep name="بسته-ها" rows={m.packages} rowKey={(p) => p.id} xlsx={(p) => ({ 'بسته': p.code, 'عنوان': p.title, 'قلم': m.items.filter((i) => i.packageId === p.id).length })} cols={[
          { key: 'p', label: 'بسته', render: (p) => <><span className="strong">{p.code} · {p.title}</span><span className="sub">{orgName(p.supplierOrgId)}</span></> },
          ...defs.map((d): Col<(typeof m.packages)[number]> => ({ key: d.key, label: d.title, num: true, render: (p) => { const its = m.items.filter((i) => i.packageId === p.id); const ss = m.stages.filter((s) => its.some((i) => i.id === s.itemId) && s.stageKey === d.key && s.applicable); const ok = ss.filter((s) => s.status === 'approved').length; const wait = ss.filter((s) => s.status === 'submitted' || s.status === 'reviewed').length; return ss.length ? <span style={{ color: ok === ss.length ? 'var(--im-mint)' : wait ? 'var(--im-amber)' : undefined }}>{fa(ok)}/{fa(ss.length)}{wait ? <span className="sub">{fa(wait)} در انتظار</span> : null}</span> : '—' } }))]} empty="بسته‌ای نیست." />
      }
      case 'progress':
        return <Rep name="پیشرفت-وزنی" rows={m.byPackage} rowKey={(r) => r.key} foot xlsx={(r) => ({ 'بسته': r.label, 'ارزش': Math.round(r.value), 'واقعی ٪': Math.round(r.actual * 1000) / 10, 'برنامه ٪': Math.round(r.planned * 1000) / 10, 'انحراف ٪': Math.round(r.deviation * 1000) / 10, 'ارزش کسب‌شده': Math.round(r.value * r.actual) })} cols={[
          { key: 'l', label: 'بسته', render: (r) => <span className="strong">{r.label}</span> }, { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (r) => bn(r.value), foot: <b>{bn(m.progress.value)}</b> }, { key: 'a', label: 'واقعی', render: (r) => <div style={{ minWidth: 110 }}><ProgressBar actual={r.actual} planned={r.planned} /><small>{pct(r.actual, 1)}</small></div> },
          { key: 'p', label: 'برنامه‌ای', num: true, render: (r) => pct(r.planned, 1) }, { key: 'd', label: 'انحراف', num: true, render: (r) => <span style={{ color: r.deviation < -0.05 ? 'var(--im-coral)' : undefined }}>{r.deviation >= 0 ? '+' : ''}{fa(r.deviation * 100, 1)}٪</span> }, { key: 'e', label: 'ارزش کسب‌شده (میلیارد)', num: true, render: (r) => bn(r.value * r.actual, 2), foot: <b>{bn(m.progress.value * m.progress.actual, 2)}</b> }]} />
      case 'inbound': {
        const rows = mats.filter((x) => P(x).inbound > 0).map((x) => { const eta = expectedArrival(x, m.data.poLines, m.data.purchaseOrders, P(x).received, P(x).ordered); const late = x.needDate && eta ? day(eta, x.needDate) : null; return { x, eta, late } }).sort((a, b) => (b.late ?? -1e9) - (a.late ?? -1e9))
        const lateStages = m.stages.filter((s) => s.applicable && s.status !== 'approved' && s.plannedDate && s.plannedDate < m.today && ['manufacturing', 'inspection', 'shipping', 'release', 'po_issue'].includes(s.stageKey)).length
        return <div style={{ display: 'grid', gap: 10 }}><div className="fn-kpis"><KpiCard i={0} label="اقلام در راه" value={fa(rows.length)} /><KpiCard i={1} label="دیرتر از نیاز" value={fa(rows.filter((r) => (r.late ?? 0) > 0).length)} tone="bad" /><KpiCard i={2} label="مراحل ساخت/بازرسی/حمل عقب‌افتاده" value={fa(lateStages)} tone={lateStages ? 'warn' : 'good'} /></div>
          <Rep name="در-راه" rows={rows} rowKey={(r) => r.x.id} onRow={(r) => open0(r.x)} xlsx={(r) => ({ 'کد': r.x.materialCode, 'شرح': r.x.description, 'در راه': P(r.x).inbound, 'در حال ساخت': P(r.x).inManufacturing, 'تحویل برنامه‌ای': r.eta ?? '', 'تاریخ نیاز': r.x.needDate ?? '', 'تأخیر نسبت به نیاز (روز)': r.late ?? '' })} cols={[
            { key: 'n', label: 'قلم', render: (r) => itemCell(r.x) }, { key: 'q', label: 'در راه', num: true, render: (r) => `${fa(P(r.x).inbound, 1)} ${r.x.unit}` }, { key: 'm', label: 'در حال ساخت', num: true, render: (r) => fa(P(r.x).inManufacturing, 1) }, { key: 't', label: 'حمل‌شده', num: true, render: (r) => fa(P(r.x).inTransit, 1) },
            { key: 'e', label: 'تحویل برنامه‌ای', render: (r) => fmtD(r.eta) }, { key: 'd', label: 'تاریخ نیاز', render: (r) => fmtD(r.x.needDate) }, { key: 'l', label: 'تأخیر نسبت به نیاز', num: true, render: (r) => (r.late == null ? '—' : <b style={{ color: r.late > 0 ? 'var(--im-coral)' : 'var(--im-mint)' }}>{r.late > 0 ? `${fa(r.late)} روز دیرتر` : `${fa(-r.late)} روز زودتر`}</b>), sort: (r) => r.late ?? -1e9 }]} empty="کالای در راه نیست." /></div>
      }
      case 'receiving': {
        const rows = m.data.warehouseLines
        return <Rep name="ورود-و-پذیرش" rows={rows} rowKey={(l) => l.id} xlsx={(l) => ({ 'قلم': m.materials.find((x) => x.id === l.materialId)?.description ?? '', 'مقدار': l.quantityReceived, 'وضعیت کالا': l.condition, 'بازرسی': INSPECTION_STATUS_LABEL_FA[l.inspectionStatus] })} cols={[
          { key: 'm', label: 'قلم', render: (l) => <span className="strong">{m.materials.find((x) => x.id === l.materialId)?.description ?? '—'}</span> }, { key: 'q', label: 'مقدار', num: true, render: (l) => fa(l.quantityReceived, 2) }, { key: 'c', label: 'وضعیت کالا', render: (l) => (l.condition === 'ok' ? 'سالم' : l.condition === 'damaged' ? 'آسیب‌دیده' : 'کسری') },
          { key: 'i', label: 'بازرسی ورودی', render: (l) => <Chip tone={l.inspectionStatus === 'accepted' ? 'good' : l.inspectionStatus === 'rejected' ? 'bad' : 'warn'}>{INSPECTION_STATUS_LABEL_FA[l.inspectionStatus]}</Chip> }, { key: 'u', label: 'قابل‌مصرف', render: (l) => (l.condition === 'ok' && l.inspectionStatus === 'accepted' ? 'بله' : 'خیر') }]} />
      }
      case 'consumables': {
        const cons = cs.groups.filter((g) => g.isConsumable)
        const rows = mats.filter((x) => cons.some((g) => g.id === x.groupId))
        return <Rep name="اقلام-مصرفی" rows={rows} rowKey={(x) => x.id} onRow={open0} xlsx={(x) => ({ 'گروه': gname(x), 'قلم': x.description, 'ورود': P(x).received, 'مصرف': P(x).netConsumed, 'ضایعات': P(x).scrapped, 'موجودی': P(x).onHand })} cols={[
          { key: 'g', label: 'گروه', render: gname }, { key: 'n', label: 'قلم', render: itemCell }, { key: 'i', label: 'ورود', num: true, render: (x) => fa(P(x).received, 1) }, { key: 'u', label: 'مصرف', num: true, render: (x) => fa(P(x).netConsumed, 1), sort: (x) => P(x).netConsumed },
          { key: 's', label: 'ضایعات', num: true, render: (x) => fa(P(x).scrapped, 1) }, { key: 'h', label: 'موجودی', num: true, render: (x) => fa(P(x).onHand, 1) }, { key: 'un', label: 'واحد', render: (x) => x.unit }]} empty="قلم مصرفی در گروه‌های مصرفی نیست." />
      }
      case 'norms': {
        const rows = consumptionReport({ materials: mats, groups: cs.groups, norms: cs.norms.filter((n) => n.masterProjectId === projectId), txns: m.data.txns, settings: cs.settings }).filter((r) => r.expected != null)
        return <Rep name="مصرف-در-برابر-مبنا" rows={rows} rowKey={(r) => r.key} xlsx={(r) => ({ 'قلم': m.materials.find((x) => x.id === r.materialId)?.description ?? '', 'عملیات': r.workOp, 'واقعی': r.actual, 'مبنا': r.expected ?? '', 'انحراف ٪': r.deviationPct == null ? '' : Math.round(r.deviationPct * 10) / 10 })} cols={[
          { key: 'm', label: 'قلم', render: (r) => <span className="strong">{m.materials.find((x) => x.id === r.materialId)?.description}</span> }, { key: 'o', label: 'عملیات', render: (r) => r.workOp || '—' }, { key: 'a', label: 'واقعی', num: true, render: (r) => fa(r.actual, 2) }, { key: 'e', label: 'مبنا', num: true, render: (r) => fa(r.expected ?? 0, 2) },
          { key: 'd', label: 'انحراف', num: true, render: (r) => <span style={{ color: r.over ? 'var(--im-coral)' : undefined }}>{r.deviationPct! > 0 ? '+' : ''}{fa(r.deviationPct ?? 0, 1)}٪</span>, sort: (r) => r.deviationPct ?? 0 }]} empty="مصرفی با مبنای تعریف‌شده ثبت نشده است." />
      }
      case 'balance': {
        const rows = balanceBy({ materials: mats, positions: m.positions, groups: cs.groups, by: 'group' })
        return <Rep name="بالانس" rows={rows} rowKey={(r) => r.key} foot xlsx={(r) => ({ 'گروه': r.label, 'ارزش پیمان': Math.round(r.contractValue), 'مصرف ارزشی': Math.round(r.consumedValue), 'کسری ارزشی': Math.round(r.shortageValue), 'مازاد ارزشی': Math.round(r.excessValue) })} cols={[
          { key: 'l', label: 'گروه کالا', render: (r) => <span className="strong">{r.label}</span> }, { key: 'c', label: 'ارزش پیمان (میلیارد)', num: true, render: (r) => bn(r.contractValue), foot: <b>{bn(rows.reduce((a, r) => a + r.contractValue, 0))}</b> }, { key: 'u', label: 'مصرف (میلیارد)', num: true, render: (r) => bn(r.consumedValue), foot: <b>{bn(rows.reduce((a, r) => a + r.consumedValue, 0))}</b> },
          { key: 's', label: 'کسری (میلیارد)', num: true, render: (r) => bn(r.shortageValue, 2), foot: <b>{bn(rows.reduce((a, r) => a + r.shortageValue, 0), 2)}</b> }, { key: 'e', label: 'مازاد (میلیارد)', num: true, render: (r) => bn(r.excessValue, 2) }, { key: 'x', label: 'توضیح‌داده‌نشده', render: (r) => (r.unexplained.length ? <Chip tone="warn">{fa(r.unexplained.length)}</Chip> : <Chip tone="good">متوازن</Chip>) }]} />
      }
      case 'surplus': {
        const need = new Map<string, Material[]>(); for (const x of m.materials) if (P(x).uncoveredGap > 0) need.set(x.materialCode, [...(need.get(x.materialCode) ?? []), x])
        const last = new Map<string, string>(); for (const t of m.data.txns) if (t.kind === 'issue' && t.status === 'posted' && (last.get(t.materialId) ?? '') < t.txnDate) last.set(t.materialId, t.txnDate)
        const rows = mats.filter((x) => P(x).onHand > 0).map((x) => { const l = last.get(x.id); const idle = l ? day(m.today, l) : null; const target = (need.get(x.materialCode) ?? []).find((y) => y.id !== x.id && y.facility !== x.facility); return { x, excess: P(x).excess, idle, target, stagnant: idle == null ? P(x).accepted > 0 : idle >= cs.settings.stagnantDays } }).filter((r) => r.excess > 0 || r.stagnant || r.target)
        return <Rep name="مازاد-و-راکد" rows={rows} rowKey={(r) => r.x.id} onRow={(r) => open0(r.x)} xlsx={(r) => ({ 'قلم': r.x.description, 'ایستگاه': r.x.facility, 'مازاد': r.excess, 'مدت بدون مصرف (روز)': r.idle ?? '', 'قابل انتقال به': r.target?.facility ?? '' })} cols={[
          { key: 'n', label: 'قلم', render: (r) => itemCell(r.x) }, { key: 'e', label: 'مازاد', num: true, render: (r) => (r.excess ? `${fa(r.excess, 1)} ${r.x.unit}` : '—') }, { key: 'h', label: 'موجودی', num: true, render: (r) => fa(P(r.x).onHand, 1) },
          { key: 'i', label: 'مدت بدون مصرف', num: true, render: (r) => (r.idle == null ? 'بدون مصرف' : `${fa(r.idle)} روز`) }, { key: 's', label: 'وضعیت', render: (r) => <span style={{ display: 'inline-flex', gap: 4 }}>{r.excess > 0 && <Chip tone="warn">مازاد</Chip>}{r.stagnant && <Chip tone="bad">راکد</Chip>}{r.target && <Chip tone="good">قابل انتقال</Chip>}</span> }, { key: 't', label: 'نیازمند در ایستگاه', render: (r) => r.target?.facility ?? '—' }]} empty="مازاد، راکد یا قابل انتقالی نیست." />
      }
      case 'contractor': {
        const ids = [...new Set(m.packages.map((p) => p.contractorOrgId))]
        const rows = ids.map((id) => {
          const pk = m.packages.filter((p) => p.contractorOrgId === id), pids = new Set(pk.map((p) => p.id)), its = m.items.filter((i) => pids.has(i.packageId)), iids = new Set(its.map((i) => i.id)), st = m.stages.filter((s) => iids.has(s.itemId) && s.applicable)
          const rows2 = its.map((i) => itemProgress(i, m.stages, m.today, m.materials.find((x) => x.id === i.materialId)?.fxRate ?? 1)); const value = rows2.reduce((a, r) => a + r.value, 0)
          const act = value ? rows2.reduce((a, r) => a + r.value * r.actual, 0) / value : 0, plan = value ? rows2.reduce((a, r) => a + r.value * r.planned, 0) / value : 0
          return { id, name: orgName(id), pk: pk.length, value, act, plan, late: st.filter((s) => s.status !== 'approved' && s.plannedDate && s.plannedDate < m.today).length, rejected: st.filter((s) => s.status === 'rejected').length, waiting: st.filter((s) => s.status === 'submitted' || s.status === 'reviewed').length }
        })
        const pendingChanges = cs.changes.filter((c) => c.masterProjectId === projectId && c.status === 'requested').length
        const dueDisc = m.discrepancies.filter((d) => (d.status === 'open' || d.status === 'in_review') && d.dueDate && d.dueDate < m.today).length
        return <div style={{ display: 'grid', gap: 10 }}><div className="fn-kpis"><KpiCard i={0} label="مراحل در انتظار تأیید مشاور/کارفرما" value={fa(rows.reduce((a, r) => a + r.waiting, 0))} tone="warn" /><KpiCard i={1} label="تغییرات در انتظار تصمیم" value={fa(pendingChanges)} tone={pendingChanges ? 'warn' : 'good'} /><KpiCard i={2} label="مغایرت مهلت‌گذشته" value={fa(dueDisc)} tone={dueDisc ? 'bad' : 'good'} /></div>
          <Rep name="عملکرد-پیمانکار" rows={rows} rowKey={(r) => r.id ?? 'x'} xlsx={(r) => ({ 'پیمانکار': r.name, 'بسته': r.pk, 'ارزش': Math.round(r.value), 'واقعی ٪': Math.round(r.act * 1000) / 10, 'برنامه ٪': Math.round(r.plan * 1000) / 10, 'مراحل عقب‌افتاده': r.late, 'ردشده': r.rejected })} cols={[
            { key: 'n', label: 'پیمانکار', render: (r) => <span className="strong">{r.name}</span> }, { key: 'p', label: 'بسته', num: true, render: (r) => fa(r.pk) }, { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (r) => bn(r.value) }, { key: 'a', label: 'پیشرفت وزنی', render: (r) => <div style={{ minWidth: 110 }}><ProgressBar actual={r.act} planned={r.plan} /><small>{pct(r.act)} · برنامه {pct(r.plan)}</small></div> },
            { key: 'l', label: 'مراحل عقب‌افتاده', num: true, render: (r) => <b style={{ color: r.late ? 'var(--im-coral)' : undefined }}>{fa(r.late)}</b>, sort: (r) => r.late }, { key: 'r', label: 'ردشده', num: true, render: (r) => fa(r.rejected) }, { key: 'w', label: 'در انتظار تأیید', num: true, render: (r) => fa(r.waiting) }]} empty="بسته‌ای با پیمانکار مشخص نیست." /></div>
      }
      case 'history': {
        const rows = [
          ...cs.changes.filter((c) => c.masterProjectId === projectId).map((c) => ({ id: `c${c.id}`, at: c.requestedAt, kind: 'تغییر', text: `${CHANGE_FIELD_LABEL_FA[c.field]}: ${c.oldValue || '—'} ← ${c.newValue || '—'} (${c.reason})`, status: c.status === 'approved' ? 'تأیید شد' : c.status === 'rejected' ? 'رد شد' : 'در انتظار', by: c.decidedBy ?? c.requestedBy })),
          ...m.discrepancies.map((d) => ({ id: `d${d.id}`, at: d.decidedAt ?? d.detectedAt, kind: 'مغایرت', text: `${DISCREPANCY_KIND_LABEL_FA[d.kind]}${d.resolution ? ` — ${d.resolution}` : ''}`, status: DISCREPANCY_STATUS_LABEL_FA[d.status], by: d.decidedBy })),
          ...m.stages.filter((s) => s.approvedAt).map((s) => ({ id: `s${s.id}`, at: s.approvedAt!, kind: 'تأیید مرحله', text: `${cs.stageDefs.find((d) => d.key === s.stageKey)?.title}`, status: STAGE_STATUS_LABEL_FA[s.status], by: s.approvedBy })),
        ].sort((a, b) => (a.at < b.at ? 1 : -1))
        return <Rep name="سوابق" rows={rows} rowKey={(r) => r.id} xlsx={(r) => ({ 'زمان': r.at.slice(0, 10), 'نوع': r.kind, 'شرح': r.text, 'وضعیت': r.status, 'کاربر': r.by ? cs.people.get(r.by) ?? '' : '' })} cols={[
          { key: 'd', label: 'زمان', render: (r) => fmtD(r.at), sort: (r) => r.at }, { key: 'k', label: 'نوع', render: (r) => r.kind }, { key: 't', label: 'شرح', render: (r) => <span style={{ fontSize: 12.5 }}>{r.text}</span> }, { key: 's', label: 'وضعیت', render: (r) => r.status }, { key: 'u', label: 'کاربر', render: (r) => (r.by ? cs.people.get(r.by) ?? '—' : '—') }]} />
      }
    }
  }
  return (
    <div className="fn-reports">
      <nav className="fn-rep-nav no-print" aria-label="فهرست گزارش‌ها">
        {CATALOG.map((g) => <div key={g.group}><h4>{g.group}</h4>{g.items.map(([id, label]) => <button key={id} className={id === rid ? 'on' : ''} onClick={() => setRid(id)}><b>{label}</b></button>)}</div>)}
      </nav>
      <div className="fn-rep-body">
        <select className="mt-rep-select no-print" value={rid} onChange={(e) => setRid(e.target.value as RId)} aria-label="انتخاب گزارش">
          {CATALOG.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>)}
        </select>
        <div className="fn-toolbar no-print">
          <div hidden={rid.startsWith('pack_')} style={{ minWidth: 0 }}><h2 className="fn-rep-title">{meta[1]}</h2><p className="im-helper" style={{ margin: 0 }}>{project?.officialName}{station ? ` · ${station}` : ''}</p></div>
          <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="ایستگاه" style={{ maxWidth: 220, marginInlineStart: 'auto' }}><option value="">همهٔ ایستگاه‌ها</option>{stations.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        {rid.startsWith('pack_') ? body() : (
          <div className="mt-printable">
            <div className="mt-print-head"><div><h2>{meta[1]}</h2><p>{project?.officialName}{station ? ` · ${station}` : ''}</p></div><p>{fmtD(m.today)}</p></div>
            {body()}
          </div>
        )}
      </div>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
      {void (null as unknown as MaterialModel)}
    </div>
  )
}
