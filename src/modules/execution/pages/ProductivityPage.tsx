import { useMemo, useState } from 'react'
import { useEpcModel } from '../lib/useEpcModel'
import { compensationScenarios, rankScenarios, resourcesForTarget, type Scenario } from '../lib/engine/scenarios'
import { jalaliText } from '../lib/periods'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { Empty, fa, pct } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import { ActivityPicker } from '../components/ActivityPicker'
import { useEpcStore } from '../store/useEpcStore'
import type { ActivityInsight } from '../lib/useEpcModel'

const RISK_TONE = { low: 'good', medium: 'warn', high: 'bad', unknown: 'neutral' } as const
const RISK_FA = { low: 'کم', medium: 'متوسط', high: 'زیاد', unknown: 'نامشخص' } as const
const CONF_FA = { high: 'بالا', medium: 'متوسط', low: 'کم', none: 'ندارد' } as const
const ISSUE_FA: Record<string, string> = { negative: 'مقدار منفی', no_hours: 'خروجی بدون ساعت مفید', duplicate: 'تکراری', no_composition: 'ترکیب منابع ثبت‌نشده', outlier: 'پرت آماری', unapproved: 'گزارش هنوز تأیید نشده' }
const SC_KIND_FA: Record<Scenario['kind'], string> = { baseline: 'روند فعلی', add_crew: 'اکیپ اضافه', add_units: 'منبع اضافه', extra_shift: 'شیفت دوم', parallel_front: 'جبههٔ موازی', remove_blocker: 'رفع مانع', combined: 'ترکیبی' }
const f2 = (x: number | null, d = 2) => (x == null ? '—' : fa(x, d))

/** Productivity & forecast engine: numbers come from crew logs of approved reports and fixed formulas — no generative model is involved. */
export function ProductivityPage(p: { projectId: string; sub: string }) {
  return <EpcGate><Inner {...p} /></EpcGate>
}
function Inner({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useEpcModel(projectId)
  const crewCount = useEpcStore((s) => s.crewLogs.length)
  const withLogs = useMemo(() => [...m.insights.values()].filter((i) => i.logs.length > 0), [m.insights])
  const [sel, setSel] = useState<string>('')
  const cur = (sel && m.insights.get(sel)) || withLogs[0] || null
  const title = (id: string) => m.ex.actById.get(id)?.title ?? '—'
  if (!crewCount) return <Empty><b style={{ display: 'block', marginBottom: 6 }}>هنوز لاگ اکیپ ثبت نشده است</b>موتور بهره‌وری از «اکیپ‌ها و بهره‌وری» داخل گزارش روزانهٔ کارکرد تغذیه می‌شود: ترکیب منابع هر اکیپ (مثلاً سایدبوم، موتور جوش، جوشکار، فیتر)، ساعت مفید، ساعت توقف و مقدار خروجی. بدون این داده هیچ نرخ یا پیش‌بینی ساخته نمی‌شود.</Empty>

  if (sub === 'forecast') {
    const rows = [...m.insights.values()].filter((i) => i.remaining > 0).sort((a, b) => (a.forecast.onTimeProb ?? 2) - (b.forecast.onTimeProb ?? 2))
    const cols: Col<ActivityInsight>[] = [
      { key: 't', label: 'فعالیت', render: (i) => <><span className="strong">{title(i.activityId)}</span><span className="sub">{m.ex.actById.get(i.activityId)?.unit}</span></> },
      { key: 'r', label: 'باقیمانده', num: true, render: (i) => f2(i.remaining) },
      { key: 'd', label: 'نرخ روزانه (اکیپ)', num: true, render: (i) => f2(i.forecast.perDay) },
      { key: 'w', label: 'ظرفیت هفتگی', num: true, render: (i) => f2(i.forecast.perWeek) },
      { key: 'f', label: 'پایان پیش‌بینی', render: (i) => i.forecast.finish ? <>{jalaliText(i.forecast.finish)}<span className="sub">{i.forecast.finishOptimistic ? `خوش‌بینانه ${jalaliText(i.forecast.finishOptimistic)}` : ''}{i.forecast.finishPessimistic ? ` · بدبینانه ${jalaliText(i.forecast.finishPessimistic)}` : ''}</span></> : '—' },
      { key: 'e', label: 'پایان برنامه‌ای', render: (i) => (m.ex.actById.get(i.activityId)?.plannedEnd ? jalaliText(m.ex.actById.get(i.activityId)!.plannedEnd!) : '—') },
      { key: 'p', label: 'احتمال اتمام در موعد', num: true, render: (i) => pct(i.forecast.onTimeProb, 0), sort: (i) => i.forecast.onTimeProb ?? 2 },
      { key: 'q', label: 'نرخ لازم ÷ نرخ فعلی', num: true, render: (i) => f2(i.forecast.requiredRatio) },
      { key: 'k', label: 'ریسک تأخیر', render: (i) => <Chip tone={RISK_TONE[i.forecast.lateRisk]}>{i.forecast.unreliable ? 'غیرقابل‌اتکا' : RISK_FA[i.forecast.lateRisk]}</Chip> },
      { key: 'c', label: 'اطمینان داده', render: (i) => <Chip>{CONF_FA[i.prod.quality.confidence]}</Chip> },
    ]
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="im-helper" style={{ margin: 0 }}>احتمال اتمام با تقریب نرمال از مجموع خروجی روزهای کاری باقی‌مانده با میانگین و انحراف معیار نرخ اخیر محاسبه می‌شود؛ فرض بر ادامهٔ همین ترکیب منابع و شرایط است. فعالیت‌های دارای پیش‌نیاز مسدود «غیرقابل‌اتکا» علامت می‌خورند.</p>
        <Section title="پیش‌بینی هر فعالیت" hint="مرتب از پرریسک‌ترین" flush><DataTable cols={cols} rows={rows} rowKey={(i) => i.activityId} empty="فعالیت دارای کار باقیمانده نیست." /></Section>
      </div>
    )
  }
  if (!cur) return <Empty>برای هیچ فعالیتی لاگ اکیپ ثبت نشده است.</Empty>
  const picker = <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>فعالیت <ActivityPicker activities={withLogs.map((i) => m.ex.actById.get(i.activityId)).filter((a): a is NonNullable<typeof a> => !!a)} value={cur.activityId} onChange={(id) => id && setSel(id)} width={360} /></label>

  if (sub === 'scenarios') return <Scenarios m={m} cur={cur} picker={picker} />
  const r = cur.prod.rates, q = cur.prod.quality
  const unit = m.ex.actById.get(cur.activityId)?.unit ?? ''
  const byCrew = new Map<string, { out: number; days: Set<string>; hours: number }>()
  for (const l of cur.prod.usedLogs) { const x = byCrew.get(l.crew) ?? { out: 0, days: new Set<string>(), hours: 0 }; x.out += l.outputQty; x.days.add(l.date); x.hours += l.usefulHours; byCrew.set(l.crew, x) }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {picker}
      <div className="fn-kpis">
        <KpiCard i={0} label="نرخ هر اکیپ در روز" value={f2(r.perCrewDay)} unit={unit} tone="good" sub={`میانگین ${cur.prod.params.weighting === 'wma' ? 'وزنی' : cur.prod.params.weighting === 'sma' ? 'متحرک' : 'ساده'} · ${fa(r.days)} روز معتبر`} />
        <KpiCard i={1} label="خروجی به‌ازای ساعت مفید" value={f2(r.perUsefulHour, 3)} unit={`${unit}/ساعت`} />
        <KpiCard i={2} label="خروجی به‌ازای نفرساعت" value={f2(r.perManHour, 3)} unit={`${unit}/نفرساعت`} sub={r.perEquipHour != null ? `ماشین‌ساعت: ${f2(r.perEquipHour, 3)}` : undefined} />
        <KpiCard i={3} label="بهره‌گیری از ساعت حضور" value={pct(r.utilisation, 0)} tone={r.utilisation != null && r.utilisation < 0.7 ? 'warn' : 'good'} sub="ساعت مفید ÷ (مفید + توقف)" />
      </div>
      <div className="fn-kpis">
        <KpiCard i={0} label="پراکندگی (ضریب تغییرات)" value={r.cv == null ? '—' : pct(r.cv, 0)} sub={r.sd == null ? 'کمتر از دو روز داده' : `انحراف معیار ${f2(r.sd)}`} tone={r.cv != null && r.cv > 0.4 ? 'warn' : 'neutral'} />
        <KpiCard i={1} label="دامنهٔ ۱۰ تا ۹۰ درصد روزها" value={r.p10 == null ? '—' : `${f2(r.p10)} تا ${f2(r.p90)}`} />
        <KpiCard i={2} label="روند هفتگی نرخ" value={r.trendPerWeek == null ? '—' : `${r.trendPerWeek > 0 ? '+' : ''}${f2(r.trendPerWeek)}`} sub={r.trendR2 == null ? 'حداقل ۶ روز داده لازم است' : `R² = ${f2(r.trendR2)}`} tone={r.trendPerWeek != null && r.trendPerWeek < 0 ? 'warn' : 'neutral'} />
        <KpiCard i={3} label="اطمینان به داده" value={CONF_FA[q.confidence]} tone={q.confidence === 'high' ? 'good' : q.confidence === 'medium' ? 'neutral' : 'warn'} sub={`${fa(q.used)} از ${fa(q.total)} لاگ استفاده شد`} />
      </div>
      <Section title="کیفیت داده" hint={`پنجرهٔ ${fa(cur.prod.params.windowDays)} روز تا ${jalaliText(m.today)} · پرت‌ها با قاعدهٔ MAD ≥ ${fa(cur.prod.params.outlierSigma, 1)} کنار گذاشته می‌شوند`}>
        {Object.entries(q.excluded).filter(([, v]) => v > 0).length === 0 ? <p className="im-helper" style={{ margin: 0 }}>همهٔ لاگ‌های پنجره معتبر بودند.</p> : <div className="ex-chiprow">{Object.entries(q.excluded).filter(([, v]) => v > 0).map(([k, v]) => <Chip key={k} tone="warn">{ISSUE_FA[k]}: {fa(v)}</Chip>)}</div>}
      </Section>
      <Section title="به‌تفکیک اکیپ" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>اکیپ</th><th className="num">روز</th><th className="num">خروجی</th><th className="num">در روز</th><th className="num">در ساعت مفید</th></tr></thead>
          <tbody>{[...byCrew].map(([c, x]) => <tr key={c}><td>{c}</td><td className="num">{fa(x.days.size)}</td><td className="num">{f2(x.out)}</td><td className="num">{f2(x.out / x.days.size)}</td><td className="num">{f2(x.hours ? x.out / x.hours : null, 3)}</td></tr>)}</tbody></table></div>
      </Section>
    </div>
  )
}

function Scenarios({ m, cur, picker }: { m: ReturnType<typeof useEpcModel>; cur: ActivityInsight; picker: React.ReactNode }) {
  const [fronts, setFronts] = useState(1)
  const [cap, setCap] = useState('')
  const [target, setTarget] = useState('')
  const built = m.stateFor(cur.activityId, { frontsAvailable: fronts, constraints: cap ? [{ key: 'cap', label: 'سقف ورودی (بازرسی/مصالح/جبهه)', maxPerDay: Number(cap) }] : [] })
  if (!built) return <Empty>برای این فعالیت نرخ معتبر وجود ندارد؛ ابتدا لاگ اکیپ ثبت کنید.</Empty>
  const { state, basis } = built
  const all = compensationScenarios(state, m.scenarioParams(), basis)
  const ranked = rankScenarios(all)
  const rt = target ? resourcesForTarget(state, Number(target)) : null
  const cols: Col<Scenario>[] = [
    { key: 'k', label: 'سناریو', render: (s) => <><span className="strong">{s.label}</span><span className="sub">{SC_KIND_FA[s.kind]}{s.basis === 'assumed' && s.kind !== 'baseline' ? ' · فرضی' : ''}</span></> },
    { key: 'r', label: 'خروجی/روز', num: true, render: (s) => f2(s.ratePerDay), sort: (s) => s.ratePerDay },
    { key: 'd', label: 'روز کاری لازم', num: true, render: (s) => (s.daysNeeded == null ? '—' : fa(s.daysNeeded)) },
    { key: 'f', label: 'پایان', render: (s) => (s.finish ? jalaliText(s.finish) : '—') },
    { key: 's', label: 'نسبت به موعد', num: true, render: (s) => (s.slackDays == null ? '—' : `${s.slackDays >= 0 ? '+' : ''}${fa(s.slackDays)} روز`), sort: (s) => s.slackDays ?? -1e9 },
    { key: 'p', label: 'احتمال اتمام در موعد', num: true, render: (s) => pct(s.onTimeProb, 0) },
    { key: 'c', label: 'هزینهٔ تقریبی', num: true, render: (s) => (s.cost == null ? '—' : fa(Math.round(s.cost))) },
    { key: 'e', label: 'وضعیت', render: (s) => <><Chip tone={s.effective ? 'good' : 'bad'}>{s.effective ? 'مؤثر' : 'بی‌اثر'}</Chip>{s.limits.map((l, i) => <span key={i} className="sub">{l}</span>)}</> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {picker}
      <div className="im-card" style={{ padding: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">جبههٔ آزاد برای اجرا<input className="im-input" type="number" min={1} value={fronts} onChange={(e) => setFronts(Math.max(1, Number(e.target.value) || 1))} style={{ width: 90 }} /></label>
        <label className="ex-lab">سقف خروجی روزانه (بازرسی/مصالح/…) — اختیاری<input className="im-input" type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} style={{ width: 130 }} /></label>
        <label className="ex-lab">هدف خروجی روزانه<input className="im-input" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 110 }} /></label>
        <span className="im-helper" style={{ margin: 0, maxWidth: 420 }}>{basis === 'observed' ? 'اثر تغییر منابع از سوابق همین فعالیت برآورد شده است.' : 'داده‌ٔ تاریخی برای برآورد اثر افزایش منابع کافی نیست؛ ضریب فرضی تنظیمات به‌کار رفته و نتایج «سناریوی فرضی» هستند، نه پیش‌بینی قطعی.'}</span>
      </div>
      {state.blockers.length > 0 && <div className="im-card" style={{ padding: 12, borderInlineStart: '3px solid var(--im-coral)' }}><b>فعالیت مسدود است:</b> {state.blockers.join('؛ ')} — افزودن منابع تا رفع این موانع اثری ندارد.</div>}
      {rt && <div className="im-card" style={{ padding: 12 }}>{rt.reachable ? <>برای هدف <b>{f2(Number(target))}</b> در روز، <b>{fa(rt.extraCrews)}</b> اکیپ هم‌ترکیب دیگر لازم است (خروجی {f2(rt.ratePerDay)}).</> : <>هدف <b>{f2(Number(target))}</b> در روز با شرایط فعلی دست‌یافتنی نیست{rt.cap ? <> — سقف «{rt.cap.label}» برابر {f2(rt.cap.maxPerDay)} است</> : ''}؛ حداکثر ممکن {f2(rt.ratePerDay)}.</>}</div>}
      <Section title="مقایسهٔ سناریوها" hint={`باقیمانده ${f2(state.remainingQty)} ${state.unit} · نرخ فعلی ${f2(state.rate)} در روز · تصمیم نهایی و تخصیص منابع با مدیر مجاز است`} flush><DataTable cols={cols} rows={[all[0], ...ranked, ...all.filter((s) => s.kind !== 'baseline' && !ranked.includes(s))]} rowKey={(s) => s.id} /></Section>
    </div>
  )
}
