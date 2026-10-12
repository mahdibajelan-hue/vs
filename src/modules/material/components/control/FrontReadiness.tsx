import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import type { MaterialModel } from '../../lib/control/useMaterialModel'
import { expectedArrival } from '../../lib/control/discrepancies'
import { shortageByFront, FRONT_BY_LABEL_FA, LINE_STATUS_LABEL_FA, VERDICT_LABEL_FA, type FrontBy, type FrontReadiness, type ShortageLine } from '../../lib/control/shortage'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../../finance/components/fn'
import { fa, qtyText } from './common'
import { ItemDrawer } from './ItemDrawer'
import { DISCREPANCY_KIND_LABEL_FA } from '../../types'

const VTONE = { ready: 'good', in_transit: 'warn', blocked: 'bad' } as const
const LTONE = { ready: 'good', inbound: 'warn', late: 'bad', partial: 'bad', not_ordered: 'bad' } as const

/**
 * «Can this work front start?» For each station / executing section / front / place of use: are all its items in the store, on the way in time, or short — and what is the latest standing of every shortage
 * (order placed and when it arrives, nothing ordered, an open discrepancy or linked risk). The project manager reads the verdict, then opens the front for the item list.
 */
export function FrontReadinessReport({ model: m, projectId }: { model: MaterialModel; projectId: string }) {
  const cs = useMaterialControlStore()
  const [by, setBy] = useState<FrontBy>('facility')
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const poNo = useMemo(() => new Map(m.data.purchaseOrders.map((p) => [p.id, p.poNumber])), [m.data.purchaseOrders])
  const fronts = useMemo(() => {
    const arrival = new Map(m.materials.map((x) => { const p = m.positions.get(x.id)!; return [x.id, expectedArrival(x, m.data.poLines, m.data.purchaseOrders, p.received, p.ordered)] as const }))
    return shortageByFront({ materials: m.materials, positions: m.positions, arrival, by })
  }, [m.materials, m.positions, m.data.poLines, m.data.purchaseOrders, by])
  const cur: FrontReadiness | undefined = fronts.find((f) => f.key === sel) ?? fronts[0]
  const standing = (l: ShortageLine): string => {
    const ords = m.data.poLines.filter((x) => x.materialId === l.materialId).map((x) => poNo.get(x.poId)).filter(Boolean)
    const d = m.discrepancies.find((x) => x.materialId === l.materialId && (x.status === 'open' || x.status === 'in_review'))
    const risks = m.openLinkCount.get(l.materialId) ?? 0
    const parts: string[] = []
    if (l.status === 'not_ordered') parts.push('هنوز سفارشی ثبت نشده')
    else if (l.status === 'partial') parts.push(`سفارش ${[...new Set(ords)].join('، ')} کمتر از نیاز است (${qtyText(l.uncovered, l.unit)} بدون پوشش)`)
    else if (l.status === 'inbound' || l.status === 'late') parts.push(`سفارش ${[...new Set(ords)].join('، ')}${l.eta ? `؛ تحویل برنامه‌ای ${fmtD(l.eta)}` : ''}`)
    if (l.status === 'late' && l.needDate) parts.push(`دیرتر از نیاز (${fmtD(l.needDate)})`)
    if (d) parts.push(`مغایرت باز: ${DISCREPANCY_KIND_LABEL_FA[d.kind]}`)
    if (risks) parts.push(`${fa(risks)} ریسک/مسئلهٔ باز`)
    return parts.join(' · ') || '—'
  }
  const cols: Col<ShortageLine>[] = [
    { key: 'i', label: 'قلم', render: (l) => <><span className="strong">{l.description || l.code}</span><span className="sub fn-code">{l.itemUid} · ردیف {l.lineNo || '—'} · {l.code}</span></>, sort: (l) => l.description },
    { key: 's', label: 'وضعیت', render: (l) => <Chip tone={LTONE[l.status]}>{LINE_STATUS_LABEL_FA[l.status]}</Chip>, sort: (l) => l.status },
    { key: 'r', label: 'نیاز', num: true, render: (l) => qtyText(l.required, l.unit, 1) },
    { key: 'h', label: 'موجود در انبار', num: true, render: (l) => fa(l.onHand, 1) },
    { key: 'g', label: 'کسری', num: true, render: (l) => (l.gap > 0 ? <b style={{ color: 'var(--im-coral)' }}>{fa(l.gap, 1)}</b> : <span style={{ opacity: .4 }}>—</span>), sort: (l) => l.gap },
    { key: 'n', label: 'تاریخ نیاز', render: (l) => fmtD(l.needDate), sort: (l) => l.needDate ?? '' },
    { key: 'w', label: 'آخرین وضعیت', render: (l) => <span style={{ whiteSpace: 'normal', display: 'block', minWidth: 220 }}>{standing(l)}</span> },
  ]
  const tot = { fronts: fronts.length, ready: fronts.filter((f) => f.verdict === 'ready').length, blocked: fronts.filter((f) => f.verdict === 'blocked').length, short: fronts.reduce((a, f) => a + f.short, 0) }
  const exportRows = () => (cur ? cur.lines : fronts.flatMap((f) => f.lines)).map((l) => ({ 'محل': cur?.label ?? '', 'کد یکتا': l.itemUid, 'ردیف پیمان': l.lineNo, 'کد': l.code, 'شرح': l.description, 'وضعیت': LINE_STATUS_LABEL_FA[l.status], 'نیاز': l.required, 'موجودی': l.onHand, 'کسری': l.gap, 'تاریخ نیاز': l.needDate ?? '', 'آخرین وضعیت': standing(l) }))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="جبهه / محل بررسی‌شده" value={fa(tot.fronts)} sub={FRONT_BY_LABEL_FA[by]} />
        <KpiCard i={1} label="آمادهٔ شروع" value={fa(tot.ready)} tone="good" />
        <KpiCard i={2} label="کسری دارد" value={fa(tot.blocked)} tone={tot.blocked ? 'bad' : 'good'} />
        <KpiCard i={3} label="اقلام دارای کسری" value={fa(tot.short)} tone={tot.short ? 'bad' : 'good'} />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills">{(Object.keys(FRONT_BY_LABEL_FA) as FrontBy[]).map((k) => <button key={k} className={`mt-pill${by === k ? ' on' : ''}`} onClick={() => { setBy(k); setSel(null) }}>{FRONT_BY_LABEL_FA[k]}</button>)}</div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
          <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(exportRows(), 'کسری-جبهه-کاری.xlsx', 'کسری')}><Download size={13} /> اکسل</button>
          <button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button>
        </span>
      </div>
      {fronts.length === 0 ? <div className="im-card im-empty" style={{ padding: 24 }}>قلمی با نیاز ثبت‌شده نیست.</div> : (
        <div className="mt-fronts">
          {fronts.map((f) => (
            <button key={f.key} className={`mt-front ${f.verdict}${cur?.key === f.key ? ' sel' : ''}`} onClick={() => setSel(f.key)} aria-pressed={cur?.key === f.key}>
              <b>{f.label}</b>
              <span className="mt-front-v">{VERDICT_LABEL_FA[f.verdict]}</span>
              <span className="mt-front-bar" aria-hidden><i className="ok" style={{ flexGrow: f.ready }} /><i className="tr" style={{ flexGrow: f.inTransit }} /><i className="bad" style={{ flexGrow: f.short }} /></span>
              <small>{fa(f.ready)} آماده · {fa(f.inTransit)} در راه · {fa(f.short)} کسری از {fa(f.items)} قلم</small>
            </button>
          ))}
        </div>
      )}
      {cur && (
        <div className="mt-sheet mt-printable">
          <div className="mt-sheet-head"><div><h2 style={{ margin: 0, fontSize: 16 }}>آمادگی شروع کار — {cur.label}</h2><p className="im-helper" style={{ margin: '2px 0 0' }}>{FRONT_BY_LABEL_FA[by]} · {VERDICT_LABEL_FA[cur.verdict]}</p></div><Chip tone={VTONE[cur.verdict]}>{VERDICT_LABEL_FA[cur.verdict]}</Chip></div>
          <DataTable cols={cols} rows={cur.lines} rowKey={(l) => l.materialId} onRow={(l) => setOpen(l.materialId)} empty="قلمی نیست." />
        </div>
      )}
      <p className="im-helper no-print" style={{ margin: 0 }}>«آماده» یعنی نیاز قلم (منهای مصرف‌شده) در انبار موجود است. «در راه» یعنی کسری با سفارش و تاریخ تحویل پیش از تاریخ نیاز پوشش داده شده. «کسری» یعنی سفارش نشده، ناقص سفارش شده، یا تحویل برنامه‌ای دیرتر از نیاز است؛ شروع کار قبل از رفع آن توصیه نمی‌شود. {cs.can(projectId, 'raise') ? 'برای هر قلم می‌توانید از پروندهٔ آن ریسک یا مسئله ثبت کنید.' : ''}</p>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
