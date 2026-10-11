import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertOctagon, ArrowUpRight, ShieldAlert } from 'lucide-react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, isOpenTarget } from '../../lib/control/useMaterialModel'
import { ChartTip, Donut, HBars, PB, Tile, axisProps, gridProps } from '../../../finance/components/charts'
import { Chip, DataTable, KpiCard, Section, fmtD } from '../../../finance/components/fn'
import { DemoBadge, bn, fa, openRecord, pct } from '../../components/control/common'
import { AgingChart, Bullets, DeadlineChart, FunnelChart, HeatMap } from '../../components/control/InsightCharts'
import type { MatTab } from '../../MaterialApp'

const sevTone = (s: number) => (s >= 70 ? 'bad' : s >= 40 ? 'warn' : 'neutral') as 'bad' | 'warn' | 'neutral'

/** One screen for the state of a project's material: how far supply has got (weighted by value), what is short, which fronts are at risk and which risks and issues are open. */
export function DashboardPage({ projectId, onGo }: { projectId: string; onGo: (t: MatTab, sub?: string) => void }) {
  const m = useMaterialModel(projectId)
  const matLoaded = useMaterialStore((s) => s.loaded)
  const targets = useMaterialControlStore((s) => s.linkTargets)
  const people = useMaterialControlStore((s) => s.people)
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const price = (id: string) => (byId.get(id)?.unitPrice ?? 0) * (byId.get(id)?.fxRate ?? 1)

  const v = useMemo(() => {
    let base = 0, ordered = 0, received = 0, consumedV = 0, onHandV = 0, inboundV = 0, uncoveredV = 0, shortV = 0
    for (const x of m.materials) {
      const p = m.positions.get(x.id); if (!p) continue
      const pr = price(x.id)
      base += p.baseValue; ordered += p.orderedValue; received += p.receivedValue; consumedV += p.consumedValue; onHandV += p.onHand * pr; inboundV += Math.min(p.inbound, Math.max(0, p.requiredQty - p.netConsumed - p.onHand)) * pr; uncoveredV += p.uncoveredGap * pr; shortV += p.siteGap * pr
    }
    return { base, ordered, received, consumedV, onHandV, inboundV, uncoveredV, shortV }
  }, [m.materials, m.positions]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDisc = m.discrepancies.filter((d) => d.status === 'open' || d.status === 'in_review')
  const stopping = m.priorities.filter((p) => p.stopRisk)
  const linked = useMemo(() => { const ids = new Set<string>(); for (const l of m.linksByMaterial.values()) for (const x of l) ids.add(x.targetId); return [...ids].map((id) => targets.get(id)).filter((t): t is NonNullable<typeof t> => !!t) }, [m.linksByMaterial, targets])
  const openTargets = linked.filter(isOpenTarget)
  const openRisks = openTargets.filter((t) => t.kind === 'risk')
  const openIssues = openTargets.filter((t) => t.kind === 'issue')
  const overdue = openIssues.filter((t) => t.dueDate && t.dueDate < m.today)
  const stationExposure = useMemo(() => {
    const acc = new Map<string, { risks: number; issues: number }>()
    for (const [id, ls] of m.linksByMaterial) {
      const st = byId.get(id)?.facility || 'بدون ایستگاه'
      const e = acc.get(st) ?? { risks: 0, issues: 0 }
      const seen = new Set<string>()
      for (const l of ls) { const t = targets.get(l.targetId); if (!t || !isOpenTarget(t) || seen.has(t.id)) continue; seen.add(t.id); if (t.kind === 'risk') e.risks++; else e.issues++ }
      acc.set(st, e)
    }
    return [...acc.entries()].map(([name, e]) => ({ name, ...e, total: e.risks + e.issues })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total)
  }, [m.linksByMaterial, targets, byId])

  if (!matLoaded) return null
  const empty = m.materials.length === 0
  const prog = m.progress
  const curve = m.curve.map((c) => ({ name: fmtD(c.date), planned: Math.round(c.planned * 1000) / 10, actual: Math.round(c.actual * 1000) / 10 }))
  const topItems = m.priorities.slice(0, 8)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {m.hasDemo && <div className="im-card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}><DemoBadge /><span style={{ fontSize: 12.5 }}>بخشی از داده‌های این پروژه با مولد داده آزمایشی ساخته شده و واقعی نیست. داده‌های واقعی را از «بانک متریال ← ورود گروهی» وارد کنید.</span></div>}
      {empty ? (
        <div className="im-card im-empty" style={{ padding: 30 }}>
          برای این پروژه هنوز قلمی ثبت نشده است. از «بانک متریال» اقلام MTO پیمان را وارد کنید؛ پس از آن مغایرت‌ها، کسری‌ها و پیشرفت تأمین خودکار محاسبه می‌شود.
          <div style={{ marginTop: 12 }}><button className="im-btn im-btn-primary" onClick={() => onGo('bank')}>رفتن به بانک متریال</button></div>
        </div>
      ) : (
        <>
          <div className="fn-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <KpiCard i={0} label="پیشرفت وزنی تأمین (ارزش‌محور)" value={pct(prog.actual, 1)} sub={<>برنامه {pct(prog.planned, 0)} · انحراف <b style={{ color: prog.deviation < -0.02 ? 'var(--im-coral)' : undefined }}>{prog.deviation >= 0 ? '+' : ''}{fa(prog.deviation * 100, 1)}٪</b></>} tone={prog.value === 0 ? 'neutral' : prog.deviation < -0.1 ? 'bad' : prog.deviation < -0.02 ? 'warn' : 'good'} hint="جمع وزن مراحل تأییدشدهٔ هر قلم، با وزن ارزش قلم. تحویل فیزیکی جداست." onClick={() => onGo('progress')} />
            <KpiCard i={1} label="ارزش MTO پیمان" value={bn(v.base)} unit="میلیارد ریال" sub={`${fa(m.materials.length)} قلم`} onClick={() => onGo('bank')} />
            <KpiCard i={2} label="ارزش سفارش‌شده" value={bn(v.ordered)} unit="میلیارد ریال" sub={`${v.base ? fa((v.ordered / v.base) * 100) : '۰'}٪ از MTO پیمان`} tone={v.base && v.ordered / v.base < 0.5 ? 'warn' : 'neutral'} />
            <KpiCard i={3} label="ارزش کالای تحویل‌شده" value={bn(v.received)} unit="میلیارد ریال" sub={`${v.base ? fa((v.received / v.base) * 100) : '۰'}٪ از MTO پیمان`} tone="good" onClick={() => onGo('stock')} />
            <KpiCard i={4} label="کسری مؤثر بر اجرا" value={fa(stopping.length)} unit="قلم" sub={stopping.length ? `${fa(m.fronts.length)} جبهه در خطر توقف` : 'بدون خطر توقف'} tone={stopping.length ? 'bad' : 'good'} onClick={() => onGo('discrepancy')} />
            <KpiCard i={5} label="مغایرت‌های باز" value={fa(openDisc.length)} sub={`${fa(m.detected.length)} مورد با داده‌های فعلی شناسایی می‌شود`} tone={openDisc.length ? 'warn' : 'good'} onClick={() => onGo('discrepancy')} />
            <KpiCard i={6} label="ریسک و مسئلهٔ باز تأمین" value={fa(openTargets.length)} sub={`${fa(openRisks.length)} ریسک · ${fa(openIssues.length)} مسئله${overdue.length ? ` · ${fa(overdue.length)} سررسیدگذشته` : ''}`} tone={overdue.length ? 'bad' : openTargets.length ? 'warn' : 'good'} />
            <KpiCard i={7} label="موجودی قابل‌مصرف" value={bn(v.onHandV)} unit="میلیارد ریال" sub="پذیرفته‌شده و بازرسی‌شده" onClick={() => onGo('stock')} />
          </div>

          <div className="mt-two">
            <Tile title="پیشرفت وزنی: برنامه‌ای و واقعی" hint="جمع وزن مراحل برنامه‌ریزی‌شده و مراحل تأییدشده، با وزن ارزش هر قلم (٪)">
              {curve.length < 2 ? <p className="im-helper" style={{ margin: '24px 0', textAlign: 'center' }}>برای رسم منحنی، بسته‌های خرید و تاریخ برنامه‌ای مراحل را ثبت کنید.</p> : (
                <div dir="ltr" style={{ height: 270 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={curve} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs><linearGradient id="mtA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PB.yellow} stopOpacity={0.4} /><stop offset="100%" stopColor={PB.yellow} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(x: number) => fa(x)} />
                  <Tooltip content={<ChartTip unit="٪" />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Line type="monotone" dataKey="planned" name="برنامه‌ای" stroke={PB.blue} strokeWidth={2.4} strokeDasharray="5 4" dot={false} />
                  <Area type="monotone" dataKey="actual" name="واقعی" stroke={PB.yellow} strokeWidth={2.6} fill="url(#mtA)" dot={false} />
                  <ReferenceLine x={fmtD(m.today)} stroke="var(--im-muted)" strokeDasharray="2 4" />
                </ComposedChart></ResponsiveContainer></div>
              )}
            </Tile>
            <Tile title="پوشش نیاز بر مبنای ارزش" hint="MTO پیمان به چهار بخش تقسیم می‌شود">
              <Donut fmt={(x) => `${bn(x)} م`} center={{ v: v.base ? `${fa(((v.consumedV + v.onHandV) / v.base) * 100)}٪` : '—', l: 'مصرف + موجود' }} data={[
                { name: 'مصرف‌شده', value: v.consumedV, color: PB.teal }, { name: 'موجود قابل‌مصرف', value: v.onHandV, color: PB.blue }, { name: 'سفارش‌شده، در راه', value: v.inboundV, color: PB.yellow }, { name: 'پوشش‌داده‌نشده', value: v.uncoveredV, color: PB.coral },
              ]} />
            </Tile>
          </div>

          <div className="mt-two">
            <Tile title="پیشرفت وزنی به‌تفکیک ایستگاه" hint="نوار پررنگ: واقعی · سایه و خط: برنامه‌ای · قرمز: عقب‌تر از برنامه">
              <Bullets rows={m.byStation.slice(0, 8).map((r) => ({ label: r.label, actual: r.actual, planned: r.planned }))} />
            </Tile>
            <Tile title="جبهه‌های در خطر توقف" hint="کسری که با توجه به زمان باقی‌مانده تأمین نمی‌شود">
              {m.fronts.length === 0 ? <p className="im-helper" style={{ margin: '20px 0' }}>جبههٔ در خطر توقف شناسایی نشد.</p> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {m.fronts.slice(0, 6).map((f) => (
                    <div key={f.front} className="mt-link-row">
                      <div style={{ flex: 1 }}><b>{f.front}</b><div><small>{fa(f.items)} قلم{f.critical ? ` · ${fa(f.critical)} بحرانی` : ''}{f.worstSlack != null ? ` · ${f.worstSlack <= 0 ? `${fa(-f.worstSlack)} روز دیرتر از نیاز` : `${fa(f.worstSlack)} روز فرصت`}` : ''}</small></div></div>
                      <Chip tone={sevTone(f.score)}>{fa(f.score)}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </Tile>
          </div>

          <div className="mt-two">
            <Tile title="قیف تأمین: از نیاز تا مصرف" hint="ارزش بخشی از نیاز که به هر گام رسیده است؛ عدد قرمز افت نسبت به گام قبل">
              <FunnelChart stages={m.funnel} />
            </Tile>
            <Tile title="کسری بر حسب فوریت نیاز" hint="ارزش کسری سایت بر اساس فاصلهٔ تاریخ نیاز تا امروز (میلیارد ریال)">
              <AgingChart buckets={m.aging} />
            </Tile>
          </div>

          <div className="mt-two">
            <Tile title="نقشهٔ حرارتی پوشش: ایستگاه × گروه کالا" hint="درصد ارزش نیاز که فیزیکی رسیده است">
              <HeatMap heat={m.heat} />
            </Tile>
            <Tile title="مهلت سفارش‌گذاری" hint="آخرین تاریخ سفارش برای رسیدن به موقع (تاریخ نیاز − زمان تأمین − حاشیهٔ تأخیر)">
              <DeadlineChart rows={m.deadlines} />
            </Tile>
          </div>

          <Section title="اولویت اقدام" hint="امتیاز از بحرانی‌بودن، فاصلهٔ تاریخ نیاز تا زمان لازم تأمین، سهم پوشش‌داده‌نشده و ریسک‌های باز؛ وزن‌ها در تنظیمات قابل تغییر است." flush action={<button className="im-btn im-btn-sm" onClick={() => onGo('discrepancy')}>همهٔ مغایرت‌ها</button>}>
            <DataTable rows={topItems} rowKey={(p) => p.materialId} empty="قلمی با نیاز باز نیست." cols={[
              { key: 'n', label: 'قلم', render: (p) => { const x = byId.get(p.materialId)!; return <><span className="strong">{x.description || x.materialCode}</span><span className="sub fn-code">{x.materialCode}{x.facility ? ` · ${x.facility}` : ''}</span></> } },
              { key: 'c', label: 'کسری پوشش‌داده‌نشده', num: true, render: (p) => { const q = m.positions.get(p.materialId)!; return `${fa(q.uncoveredGap, 1)} ${q.unit}` } },
              { key: 'd', label: 'تاریخ نیاز', render: (p) => <>{fmtD(byId.get(p.materialId)?.needDate)}{p.slackDays != null && <span className="sub" style={{ color: p.slackDays <= 0 ? 'var(--im-coral)' : undefined }}>{p.slackDays <= 0 ? `${fa(-p.slackDays)} روز عقب` : `${fa(p.slackDays)} روز فرصت`}</span>}</> },
              { key: 'r', label: 'دلیل', render: (p) => <span style={{ fontSize: 12 }}>{p.reasons.join(' · ') || '—'}</span> },
              { key: 's', label: 'امتیاز', num: true, render: (p) => <Chip tone={sevTone(p.score)}>{fa(p.score)}</Chip>, sort: (p) => p.score },
            ]} />
          </Section>

          <Section title="ریسک‌ها و مسائل تأمین" hint="رکوردها در مدیریت ریسک و مدیریت مسائل نگهداری می‌شوند؛ وضعیت، مسئول و مهلت از همان‌جا خوانده می‌شود." flush>
            <div className="mt-two" style={{ padding: 12 }}>
              <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                {openTargets.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>ریسک یا مسئلهٔ بازی به اقلام متریال وصل نیست. پیشنهادها را در «تطبیق و مغایرت‌ها» ببینید{m.suggestions.length ? ` (${fa(m.suggestions.length)} پیشنهاد)` : ''}.</p> : openTargets.slice(0, 8).map((t) => (
                  <div key={t.id} className="mt-link-row">
                    {t.kind === 'risk' ? <ShieldAlert size={16} /> : <AlertOctagon size={16} />}
                    <div style={{ flex: 1, minWidth: 0 }}><b>{t.code ? `${t.code} · ` : ''}{t.title}</b><div><small>{t.kind === 'risk' ? 'ریسک' : 'مسئله'}{t.ownerId && people.get(t.ownerId) ? ` · ${people.get(t.ownerId)}` : ''}{t.dueDate ? ` · ${fmtD(t.dueDate)}` : ''}</small></div></div>
                    {t.kind === 'issue' && t.dueDate && t.dueDate < m.today ? <Chip tone="bad">سررسیدگذشته</Chip> : <Chip tone="warn">{t.status}</Chip>}
                    <button className="im-btn im-btn-sm" aria-label="باز کردن" onClick={() => openRecord(t.kind, t.id, projectId)}><ArrowUpRight size={13} /></button>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 12.5 }}>مواجهه با ریسک و مسئلهٔ حل‌نشده به‌تفکیک ایستگاه</p>
                {stationExposure.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>—</p> : <HBars h={Math.max(110, stationExposure.slice(0, 6).length * 38)} fmt={(x) => fa(x)} data={stationExposure.slice(0, 6).map((s, i) => ({ name: s.name, value: s.total, color: i === 0 ? PB.coral : PB.orange }))} />}
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
