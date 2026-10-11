import { useMemo, type ReactNode } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Printer } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, isOpenTarget, type MaterialModel } from '../../lib/control/useMaterialModel'
import { dataGaps } from '../../lib/control/quality'
import { PB, axisProps, gridProps } from '../../../finance/components/charts'
import { Chip, DataTable, fmtD } from '../../../finance/components/fn'
import { AgingChart, Bullets, DeadlineChart, FunnelChart, HeatMap } from '../../components/control/InsightCharts'
import { bn, fa, pct } from '../../components/control/common'
import { DISCREPANCY_KIND_LABEL_FA } from '../../types'

export type PackId = 'pm' | 'control' | 'procure' | 'eng'
export const PACKS: { id: PackId; title: string; audience: string; purpose: string }[] = [
  { id: 'pm', title: 'گزارش مدیریتی تأمین کالا', audience: 'مدیر پروژه و کارفرما', purpose: 'وضعیت کلی، جبهه‌های در خطر، ریسک‌ها و اقدام‌های لازم در دو صفحه' },
  { id: 'control', title: 'گزارش کنترل پروژه: پیشرفت و ارزش کسب‌شده', audience: 'کنترل پروژه', purpose: 'پیشرفت وزنی، انحراف از برنامه، شاخص عملکرد زمانی و مراحل عقب‌افتاده' },
  { id: 'procure', title: 'گزارش بازرگانی و تأمین به‌موقع', audience: 'بازرگانی و تدارکات', purpose: 'مهلت سفارش‌گذاری، سفارش‌های باز، اقلام در راه و کسری به‌تفکیک فوریت' },
  { id: 'eng', title: 'گزارش مهندسی کالا: کنترل MTO', audience: 'مهندسی کالا', purpose: 'مقایسهٔ پیمان و طراحی، مغایرت‌ها، نواقص اطلاعاتی و پوشش به‌تفکیک گروه' },
]

function Sheet({ title, audience, projectName, today, children }: { title: string; audience: string; projectName: string; today: string; children: ReactNode }) {
  return (
    <article className="mt-sheet mt-printable">
      <header className="mt-sheet-head">
        <div><p className="eyebrow">کنترل و پایش متریال · {audience}</p><h2>{title}</h2><p className="proj">{projectName}</p></div>
        <div className="meta"><span>تاریخ گزارش</span><b>{fmtD(today)}</b></div>
      </header>
      {children}
      <footer className="mt-sheet-foot"><span>سامانهٔ فرین · {projectName}</span><span>داده تا {fmtD(today)}؛ ارقام ارزشی به میلیارد ریال</span></footer>
    </article>
  )
}
const Stat = ({ l, v, s, tone }: { l: string; v: ReactNode; s?: ReactNode; tone?: 'bad' | 'warn' | 'good' }) => <div className={`mt-stat${tone ? ` ${tone}` : ''}`}><span>{l}</span><b>{v}</b>{s && <small>{s}</small>}</div>
const Block = ({ title, note, children, keep = true }: { title: string; note?: string; children: ReactNode; keep?: boolean }) => <section className={`mt-block${keep ? ' keep' : ''}`}><h3>{title}</h3>{note && <p>{note}</p>}{children}</section>

function Curve({ m }: { m: MaterialModel }) {
  const curve = m.curve.map((c) => ({ name: fmtD(c.date), planned: Math.round(c.planned * 1000) / 10, actual: Math.round(c.actual * 1000) / 10 }))
  if (curve.length < 2) return <p className="im-helper">برای رسم منحنی، تاریخ برنامه‌ای مراحل بسته‌ها را ثبت کنید.</p>
  return (
    <div dir="ltr" style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={curve} margin={{ left: 0, right: 8, top: 6 }}>
      <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={34} domain={[0, 100]} tickFormatter={(x: number) => fa(x)} />
      <Line type="monotone" dataKey="planned" name="برنامه‌ای" stroke={PB.blue} strokeWidth={2.2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      <Area type="monotone" dataKey="actual" name="واقعی" stroke={PB.yellow} strokeWidth={2.4} fill={PB.yellow} fillOpacity={0.18} dot={false} isAnimationActive={false} />
    </ComposedChart></ResponsiveContainer></div>
  )
}

/** Four print-ready documents, one per reader. Each opens as an A4 sheet (header, key figures, charts, tables, footer) and prints without the application chrome. */
export function ReportPack({ id, projectId }: { id: PackId; projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const meta = PACKS.find((p) => p.id === id)!
  const P = (mid: string) => m.positions.get(mid)!
  const name = (mid: string) => byId.get(mid)?.description || byId.get(mid)?.materialCode || '—'
  const price = (mid: string) => (byId.get(mid)?.unitPrice ?? 0) * (byId.get(mid)?.fxRate ?? 1)
  const orgName = (oid: string | null) => orgs.find((o) => o.id === oid)?.name ?? '—'
  const v = useMemo(() => {
    let base = 0, ordered = 0, received = 0, onHand = 0, short = 0
    for (const x of m.materials) { const p = m.positions.get(x.id); if (!p) continue; base += p.baseValue; ordered += p.orderedValue; received += p.receivedValue; onHand += p.onHand * x.unitPrice * (x.fxRate || 1); short += p.siteGap * x.unitPrice * (x.fxRate || 1) }
    return { base, ordered, received, onHand, short }
  }, [m.materials, m.positions])
  const targets = useMemo(() => { const ids = new Set<string>(); for (const l of m.linksByMaterial.values()) for (const x of l) ids.add(x.targetId); return [...ids].map((t) => cs.linkTargets.get(t)).filter((t): t is NonNullable<typeof t> => !!t && isOpenTarget(t)) }, [m.linksByMaterial, cs.linkTargets])
  const openDisc = m.discrepancies.filter((d) => d.status === 'open' || d.status === 'in_review')
  const prog = m.progress
  const sheetProps = { title: meta.title, audience: meta.audience, projectName: project?.officialName ?? '', today: m.today }
  const itemCell = (mid: string) => <><span className="strong">{name(mid)}</span><span className="sub fn-code">{byId.get(mid)?.materialCode}{byId.get(mid)?.facility ? ` · ${byId.get(mid)?.facility}` : ''}</span></>
  const tone = (dev: number) => (dev < -0.1 ? 'bad' : dev < -0.02 ? 'warn' : 'good') as 'bad' | 'warn' | 'good'

  const content = (): ReactNode => {
    if (id === 'pm') return (
      <>
        <div className="mt-stats">
          <Stat l="پیشرفت وزنی تأمین" v={pct(prog.actual, 1)} s={`برنامه ${pct(prog.planned)} · انحراف ${prog.deviation >= 0 ? '+' : ''}${fa(prog.deviation * 100, 1)}٪`} tone={prog.value ? tone(prog.deviation) : undefined} />
          <Stat l="ارزش MTO پیمان" v={bn(v.base)} s={`${fa(m.materials.length)} قلم`} />
          <Stat l="سفارش‌شده" v={bn(v.ordered)} s={`${v.base ? fa((v.ordered / v.base) * 100) : '۰'}٪ پیمان`} />
          <Stat l="تحویل‌شده" v={bn(v.received)} s={`${v.base ? fa((v.received / v.base) * 100) : '۰'}٪ پیمان`} />
          <Stat l="اقلام مؤثر بر توقف" v={fa(m.priorities.filter((p) => p.stopRisk).length)} s={`${fa(m.fronts.length)} جبهه در خطر`} tone={m.fronts.length ? 'bad' : 'good'} />
          <Stat l="مغایرت باز" v={fa(openDisc.length)} tone={openDisc.length ? 'warn' : 'good'} />
          <Stat l="ریسک و مسئلهٔ باز" v={fa(targets.length)} s={`${fa(targets.filter((t) => t.kind === 'risk').length)} ریسک · ${fa(targets.filter((t) => t.kind === 'issue').length)} مسئله`} tone={targets.length ? 'warn' : 'good'} />
          <Stat l="کسری سایت" v={bn(v.short)} s="میلیارد ریال" tone={v.short ? 'warn' : 'good'} />
        </div>
        <div className="mt-sheet-cols">
          <Block title="پیشرفت وزنی: برنامه‌ای و واقعی" note="درصد تجمعی، بر مبنای ارزش"><Curve m={m} /></Block>
          <Block title="قیف تأمین" note="ارزش نیاز در هر گام"><FunnelChart stages={m.funnel} /></Block>
        </div>
        <Block title="جبهه‌های در خطر توقف" note="کسری که با زمان باقی‌مانده تأمین نمی‌شود">
          <DataTable rows={m.fronts.slice(0, 6)} rowKey={(f) => f.front} empty="جبههٔ در خطری شناسایی نشد." cols={[
            { key: 'f', label: 'جبهه', render: (f) => <span className="strong">{f.front}</span> }, { key: 'i', label: 'قلم', num: true, render: (f) => fa(f.items) }, { key: 'c', label: 'بحرانی', num: true, render: (f) => fa(f.critical) },
            { key: 's', label: 'فرصت', render: (f) => (f.worstSlack == null ? '—' : f.worstSlack <= 0 ? `${fa(-f.worstSlack)} روز دیرتر از نیاز` : `${fa(f.worstSlack)} روز`) }, { key: 'k', label: 'امتیاز', num: true, render: (f) => <Chip tone={f.score >= 70 ? 'bad' : 'warn'}>{fa(f.score)}</Chip> }]} />
        </Block>
        <Block title="اقدام‌های اولویت‌دار" note="۸ قلم با بیشترین امتیاز">
          <DataTable rows={m.priorities.slice(0, 8)} rowKey={(p) => p.materialId} empty="قلمی با نیاز باز نیست." cols={[
            { key: 'n', label: 'قلم', render: (p) => itemCell(p.materialId) }, { key: 'g', label: 'کسری', num: true, render: (p) => `${fa(P(p.materialId).uncoveredGap, 1)} ${P(p.materialId).unit}` },
            { key: 'd', label: 'تاریخ نیاز', render: (p) => fmtD(byId.get(p.materialId)?.needDate) }, { key: 'r', label: 'دلیل', render: (p) => <span style={{ fontSize: 11.5 }}>{p.reasons.slice(0, 2).join(' · ') || '—'}</span> }, { key: 's', label: 'امتیاز', num: true, render: (p) => fa(p.score) }]} />
        </Block>
        <Block title="ریسک‌ها و مسائل باز تأمین" keep={false}>
          <DataTable rows={targets.slice(0, 8)} rowKey={(t) => t.id} empty="ریسک یا مسئلهٔ بازی به متریال وصل نیست." cols={[
            { key: 'k', label: 'نوع', render: (t) => (t.kind === 'risk' ? 'ریسک' : 'مسئله') }, { key: 't', label: 'عنوان', render: (t) => <span className="strong">{t.code ? `${t.code} · ` : ''}{t.title}</span> },
            { key: 'o', label: 'مسئول', render: (t) => (t.ownerId ? cs.people.get(t.ownerId) ?? '—' : '—') }, { key: 'd', label: 'مهلت', render: (t) => fmtD(t.dueDate) }]} />
        </Block>
      </>
    )
    if (id === 'control') {
      const late = m.stages.filter((s) => s.applicable && s.status !== 'approved' && s.plannedDate && s.plannedDate < m.today)
      const awaiting = m.stages.filter((s) => s.status === 'submitted' || s.status === 'reviewed').length
      const spi = prog.planned > 0 ? prog.actual / prog.planned : null
      return (
        <>
          <div className="mt-stats">
            <Stat l="پیشرفت واقعی" v={pct(prog.actual, 1)} tone={prog.value ? tone(prog.deviation) : undefined} />
            <Stat l="پیشرفت برنامه‌ای" v={pct(prog.planned, 1)} />
            <Stat l="انحراف" v={`${prog.deviation >= 0 ? '+' : ''}${fa(prog.deviation * 100, 1)}٪`} tone={prog.value ? tone(prog.deviation) : undefined} />
            <Stat l="شاخص عملکرد زمانی (SPI)" v={spi == null ? '—' : fa(spi, 2)} s="واقعی ÷ برنامه‌ای" tone={spi == null ? undefined : spi < 0.9 ? 'bad' : spi < 1 ? 'warn' : 'good'} />
            <Stat l="ارزش کسب‌شده" v={bn(prog.value * prog.actual)} s="میلیارد ریال" />
            <Stat l="ارزش برنامه‌ای" v={bn(prog.value * prog.planned)} s="میلیارد ریال" />
            <Stat l="مراحل عقب‌افتاده" v={fa(late.length)} tone={late.length ? 'bad' : 'good'} />
            <Stat l="در انتظار تأیید" v={fa(awaiting)} tone={awaiting ? 'warn' : 'good'} />
          </div>
          <Block title="منحنی پیشرفت وزنی (S)" note="درصد تجمعی ارزش‌محور"><Curve m={m} /></Block>
          <div className="mt-sheet-cols">
            <Block title="پیشرفت به‌تفکیک ایستگاه"><Bullets rows={m.byStation.slice(0, 8).map((r) => ({ label: r.label, actual: r.actual, planned: r.planned }))} /></Block>
            <Block title="پیشرفت به‌تفکیک گروه کالا"><Bullets rows={m.byGroup.slice(0, 8).map((r) => ({ label: r.label, actual: r.actual, planned: r.planned }))} /></Block>
          </div>
          <Block title="پیشرفت و ارزش کسب‌شدهٔ بسته‌ها">
            <DataTable foot rows={m.byPackage} rowKey={(r) => r.key} empty="بسته‌ای نیست." cols={[
              { key: 'l', label: 'بسته', render: (r) => <span className="strong">{r.label}</span> }, { key: 'v', label: 'ارزش', num: true, render: (r) => bn(r.value), foot: <b>{bn(prog.value)}</b> },
              { key: 'a', label: 'واقعی', num: true, render: (r) => pct(r.actual, 1) }, { key: 'p', label: 'برنامه', num: true, render: (r) => pct(r.planned, 1) },
              { key: 'd', label: 'انحراف', num: true, render: (r) => <span style={{ color: r.deviation < -0.05 ? 'var(--im-coral)' : undefined }}>{r.deviation >= 0 ? '+' : ''}{fa(r.deviation * 100, 1)}٪</span> },
              { key: 'e', label: 'ارزش کسب‌شده', num: true, render: (r) => bn(r.value * r.actual, 2), foot: <b>{bn(prog.value * prog.actual, 2)}</b> }]} />
          </Block>
          <Block title="مراحل عقب‌افتاده" note="۱۰ مرحلهٔ با بیشترین تأخیر" keep={false}>
            <DataTable rows={late.map((s) => ({ s, days: Math.round((Date.parse(m.today) - Date.parse(s.plannedDate!)) / 86400000) })).sort((a, b) => b.days - a.days).slice(0, 10)} rowKey={(r) => r.s.id} empty="مرحلهٔ عقب‌افتاده‌ای نیست." cols={[
              { key: 'i', label: 'قلم', render: (r) => { const it = m.items.find((i) => i.id === r.s.itemId); return it ? itemCell(it.materialId) : '—' } }, { key: 'g', label: 'مرحله', render: (r) => cs.stageDefs.find((d) => d.key === r.s.stageKey)?.title ?? r.s.stageKey },
              { key: 'p', label: 'تاریخ برنامه', render: (r) => fmtD(r.s.plannedDate) }, { key: 'd', label: 'تأخیر', num: true, render: (r) => <b style={{ color: 'var(--im-coral)' }}>{fa(r.days)} روز</b> }]} />
          </Block>
        </>
      )
    }
    if (id === 'procure') {
      const open = m.deadlines.filter((d) => d.daysLeft <= 60).slice(0, 12)
      const poOpen = m.data.purchaseOrders.filter((p) => p.status === 'issued' || p.status === 'active')
      const inbound = m.materials.filter((x) => P(x.id).inbound > 0).map((x) => ({ x, v: P(x.id).inbound * price(x.id) })).sort((a, b) => b.v - a.v).slice(0, 8)
      return (
        <>
          <div className="mt-stats">
            <Stat l="ارزش سفارش‌شده" v={bn(v.ordered)} s={`${v.base ? fa((v.ordered / v.base) * 100) : '۰'}٪ پیمان`} />
            <Stat l="ارزش تحویل‌شده" v={bn(v.received)} tone="good" />
            <Stat l="سفارش باز" v={fa(poOpen.length)} />
            <Stat l="اقلام نیازمند سفارش" v={fa(m.deadlines.length)} tone={m.deadlines.length ? 'warn' : 'good'} />
            <Stat l="مهلت سفارش گذشته" v={fa(m.deadlines.filter((d) => d.daysLeft < 0).length)} tone={m.deadlines.some((d) => d.daysLeft < 0) ? 'bad' : 'good'} />
            <Stat l="کسری سایت" v={bn(v.short)} tone={v.short ? 'warn' : 'good'} />
            <Stat l="موجودی قابل‌مصرف" v={bn(v.onHand)} />
            <Stat l="قلم با زمان تأمین منفی" v={fa(m.leadExposure.filter((l) => (l.slackDays ?? 0) < 0).length)} s="دیگر به موقع نمی‌رسد" tone={m.leadExposure.some((l) => (l.slackDays ?? 0) < 0) ? 'bad' : 'good'} />
          </div>
          <div className="mt-sheet-cols">
            <Block title="مهلت سفارش‌گذاری" note="تاریخ نیاز − زمان تأمین − حاشیه"><DeadlineChart rows={m.deadlines} /></Block>
            <Block title="کسری بر حسب فوریت نیاز" note="میلیارد ریال"><AgingChart buckets={m.aging} /></Block>
          </div>
          <Block title="سفارش‌هایی که باید به‌زودی ثبت شوند" note="مهلت تا ۶۰ روز آینده یا گذشته">
            <DataTable rows={open} rowKey={(d) => d.materialId} empty="سفارش فوری لازم نیست." cols={[
              { key: 'n', label: 'قلم', render: (d) => itemCell(d.materialId) }, { key: 'q', label: 'مانده سفارش', num: true, render: (d) => `${fa(P(d.materialId).orderGap, 1)} ${P(d.materialId).unit}` },
              { key: 'l', label: 'زمان تأمین', num: true, render: (d) => `${fa(byId.get(d.materialId)?.leadTimeDays ?? 0)} روز` }, { key: 'o', label: 'مهلت سفارش', render: (d) => fmtD(d.orderBy) },
              { key: 'r', label: 'وضعیت', render: (d) => (d.daysLeft < 0 ? <Chip tone="bad">{fa(-d.daysLeft)} روز گذشته</Chip> : <Chip tone="warn">{fa(d.daysLeft)} روز مانده</Chip>) }, { key: 'v', label: 'ارزش', num: true, render: (d) => bn(d.gapValue, 2) }]} />
          </Block>
          <Block title="بسته‌های خرید">
            <DataTable rows={m.packages} rowKey={(p) => p.id} empty="بسته‌ای نیست." cols={[
              { key: 'p', label: 'بسته', render: (p) => <span className="strong">{p.code} · {p.title}</span> }, { key: 's', label: 'تأمین‌کننده', render: (p) => orgName(p.supplierOrgId) }, { key: 'i', label: 'قلم', num: true, render: (p) => fa(m.items.filter((i) => i.packageId === p.id).length) },
              { key: 'a', label: 'پیشرفت وزنی', num: true, render: (p) => pct(m.byPackage.find((r) => r.key === p.id)?.actual ?? 0, 1) }]} />
          </Block>
          <Block title="بزرگ‌ترین اقلام در راه" keep={false}>
            <DataTable rows={inbound} rowKey={(r) => r.x.id} empty="کالای در راه نیست." cols={[
              { key: 'n', label: 'قلم', render: (r) => itemCell(r.x.id) }, { key: 'q', label: 'در راه', num: true, render: (r) => `${fa(P(r.x.id).inbound, 1)} ${r.x.unit}` }, { key: 'd', label: 'تاریخ نیاز', render: (r) => fmtD(r.x.needDate) }, { key: 'v', label: 'ارزش', num: true, render: (r) => bn(r.v, 2) }]} />
          </Block>
        </>
      )
    }
    const diffs = m.materials.filter((x) => (P(x.id).diffQty ?? 0) !== 0)
    const gaps = m.materials.map((x) => ({ x, g: dataGaps(x) })).filter((r) => r.g.length)
    const kinds = new Map<string, number>(); for (const d of openDisc) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1)
    const diffValue = diffs.reduce((a, x) => a + (P(x.id).diffQty ?? 0) * price(x.id), 0)
    return (
      <>
        <div className="mt-stats">
          <Stat l="اقلام بانک" v={fa(m.materials.length)} />
          <Stat l="دارای MTO طراحی" v={fa(m.materials.filter((x) => x.detailQty != null).length)} s={`${m.materials.length ? fa((m.materials.filter((x) => x.detailQty != null).length / m.materials.length) * 100) : '۰'}٪`} />
          <Stat l="اقلام با اختلاف مقدار" v={fa(diffs.length)} tone={diffs.length ? 'warn' : 'good'} />
          <Stat l="اثر ارزشی اختلاف" v={`${diffValue >= 0 ? '+' : ''}${bn(diffValue, 2)}`} s="میلیارد ریال" tone={diffValue ? 'warn' : 'good'} />
          <Stat l="مغایرت باز" v={fa(openDisc.length)} tone={openDisc.length ? 'warn' : 'good'} />
          <Stat l="اقلام دارای نقص اطلاعات" v={fa(gaps.length)} tone={gaps.length ? 'warn' : 'good'} />
          <Stat l="خارج از MTO پیمان" v={fa(m.materials.filter((x) => !((x.contractQty ?? 0) > 0)).length)} />
          <Stat l="در انتظار تصمیم تغییر" v={fa(cs.changes.filter((c) => c.masterProjectId === projectId && c.status === 'requested').length)} />
        </div>
        <div className="mt-sheet-cols">
          <Block title="پوشش نیاز: ایستگاه × گروه کالا"><HeatMap heat={m.heat} /></Block>
          <Block title="مغایرت‌های باز بر حسب نوع">
            <DataTable rows={[...kinds].map(([k, n]) => ({ k, n }))} rowKey={(r) => r.k} empty="مغایرت بازی نیست." cols={[{ key: 'k', label: 'نوع', render: (r) => DISCREPANCY_KIND_LABEL_FA[r.k as keyof typeof DISCREPANCY_KIND_LABEL_FA] ?? r.k }, { key: 'n', label: 'تعداد', num: true, render: (r) => fa(r.n) }]} />
          </Block>
        </div>
        <Block title="اختلاف MTO پیمان و طراحی تفصیلی" note="۱۵ قلم با بیشترین اثر ارزشی">
          <DataTable rows={diffs.sort((a, b) => Math.abs((P(b.id).diffQty ?? 0) * price(b.id)) - Math.abs((P(a.id).diffQty ?? 0) * price(a.id))).slice(0, 15)} rowKey={(x) => x.id} empty="اختلافی نیست." cols={[
            { key: 'n', label: 'قلم', render: (x) => itemCell(x.id) }, { key: 'c', label: 'پیمان', num: true, render: (x) => fa(P(x.id).contractQty, 2) }, { key: 'd', label: 'طراحی', num: true, render: (x) => fa(P(x.id).detailQty ?? 0, 2) },
            { key: 'f', label: 'اختلاف', num: true, render: (x) => `${(P(x.id).diffQty ?? 0) > 0 ? '+' : ''}${fa(P(x.id).diffQty ?? 0, 2)}` }, { key: 'v', label: 'اثر ارزشی', num: true, render: (x) => bn((P(x.id).diffQty ?? 0) * price(x.id), 2) }]} />
        </Block>
        <Block title="نواقص اطلاعات اقلام" note="موارد لازم برای محاسبهٔ کسری، اولویت و پیشرفت" keep={false}>
          <DataTable rows={gaps.slice(0, 15)} rowKey={(r) => r.x.id} empty="نقصی نیست." cols={[{ key: 'n', label: 'قلم', render: (r) => itemCell(r.x.id) }, { key: 'g', label: 'اطلاعات ناقص', render: (r) => r.g.join('، ') }]} />
        </Block>
      </>
    )
  }
  return (
    <div className="mt-pack">
      <div className="mt-pack-bar no-print">
        <div><b>{meta.title}</b><span>{meta.purpose}</span></div>
        <button className="im-btn im-btn-primary" onClick={() => window.print()}><Printer size={14} /> چاپ / ذخیره PDF</button>
      </div>
      <Sheet {...sheetProps}>{content()}</Sheet>
    </div>
  )
}
