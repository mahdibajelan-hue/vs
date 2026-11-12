import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CloudRain, HardHat, Truck } from 'lucide-react'
import { useExecutionModel } from '../lib/useExecutionModel'
import { outlookInputs } from '../lib/outlookData'
import { CLIMATE_FA, GROUND_FA, WX_CLASSES, WX_FA, outlook, type ActivityOutlook, type ClimateKey, type GroundState } from '../lib/engine/outlook'
import { plannedOverall } from '../lib/progress'
import { addDays, jalaliParts, jalaliText } from '../lib/periods'
import { JALALI_MONTHS } from '../../../lib/jalali'
import { useRemembered } from '../../../lib/navMemory'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { Bar, Empty, fa, pct } from '../components/common'

const CONF = { high: { t: 'good', l: 'بالا' }, medium: { t: 'warn', l: 'متوسط' }, low: { t: 'bad', l: 'کم' } } as const
const REASON: Record<ActivityOutlook['reason'], string> = { '': '', done: 'تکمیل‌شده', no_history: 'هنوز کارکردی ثبت نشده', no_rate: 'نرخ قابل محاسبه نیست', plan_based: 'بر پایهٔ برنامه' }
const WD_PRESETS: { label: string; days: number[] }[] = [
  { label: 'تقویم پروژه', days: [] }, { label: '۵ روز در هفته', days: [0, 1, 2, 3, 4] }, { label: '۶ روز در هفته', days: [0, 1, 2, 3, 4, 5] }, { label: '۷ روز در هفته', days: [0, 1, 2, 3, 4, 5, 6] },
]
const dateOr = (d: string | null) => (d ? jalaliText(d) : '—')
const signDays = (n: number | null) => (n == null ? '—' : n === 0 ? 'طبق برنامه' : n > 0 ? `${fa(n)} روز دیرتر` : `${fa(-n)} روز زودتر`)

/**
 * پیش‌بینی کارکرد و تاریخ اتمام — the output each activity will deliver and when the project will finish, learned from
 * the daily work reports (approved quantities, manpower and machinery on site, weather and ground). The model and its
 * equations are in lib/engine/outlook.ts; every figure here comes from it, nothing is typed in.
 */
export function OutlookPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const [manPct, setManPct] = useState(0)
  const [equipPct, setEquipPct] = useState(0)
  const [climate, setClimate] = useRemembered<ClimateKey>('outlook-climate', 'west_semi_arid', (v) => typeof v === 'string' && v in CLIMATE_FA)
  const [wdIdx, setWdIdx] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const inputs = useMemo(() => outlookInputs(m), [m])
  const workDays = WD_PRESETS[wdIdx].days.length ? WD_PRESETS[wdIdx].days : m.settings.workDays
  const o = useMemo(() => outlook({ ...inputs, groupWeights: m.settings.groupWeights, today: m.today, scenario: { manPct, equipPct, climate, workDays } }), [inputs, m.settings.groupWeights, m.today, manPct, equipPct, climate, workDays])

  // planned overall progress on the same weekly dates, history and future, to set the forecast against
  const chart = useMemo(() => {
    const plan = (d: string) => plannedOverall({ activities: m.activities, baselines: m.baselines, blines: m.blines, asOf: d, groupWeights: m.settings.groupWeights }).overall
    const hist = m.curve.filter((p) => p.date < m.today).map((p) => ({ d: jalaliText(p.date), actual: +(p.actual * 100).toFixed(2), planned: p.planned == null ? null : +(p.planned * 100).toFixed(2), exp: null as number | null, band: null as [number, number] | null }))
    const fut = o.curve.map((p, i) => { const pl = plan(p.date); return { d: jalaliText(p.date), actual: i === 0 ? +(p.expected * 100).toFixed(2) : null, planned: pl == null ? null : +(pl * 100).toFixed(2), exp: +(p.expected * 100).toFixed(2), band: [+(p.low * 100).toFixed(2), +(p.high * 100).toFixed(2)] as [number, number] } })
    return [...hist, ...fut]
  }, [m, o.curve])

  if (!m.activities.length) return <Empty>ابتدا فعالیت‌های پروژه را در «تنظیمات ← فهرست‌ها، مقادیر پیمان…» تعریف کنید.</Empty>
  if (o.historyDays === 0) return <Empty><b style={{ display: 'block', marginBottom: 6 }}>هنوز گزارش روزانهٔ تأییدشده‌ای نیست</b>این بخش از گزارش‌های روزانهٔ کارکرد یاد می‌گیرد: مقدار تأییدشدهٔ هر فعالیت، نیروی انسانی و ماشین‌آلات فعال، وضعیت هوا و زمین. با تأیید نخستین گزارش‌ها پیش‌بینی ساخته می‌شود؛ هر روز گزارش بیشتر، پیش‌بینی دقیق‌تر.</Empty>

  const plannedFinish = m.activities.filter((a) => a.active && a.approval === 'approved' && a.plannedEnd).map((a) => a.plannedEnd as string).sort().pop() ?? null
  const finish = o.finish ?? o.finishKnown
  const slip = finish && plannedFinish ? Math.round((Date.parse(finish) - Date.parse(plannedFinish)) / 86400000) : null
  const week = o.curve.find((p) => p.date >= addDays(m.today, 7))
  const gain7 = week ? week.expected - o.curve[0].expected : null
  const fitted = o.activities.filter((a) => a.model)
  const bt = fitted.map((a) => a.model!.backtest).filter((b): b is NonNullable<typeof b> => !!b)
  const btErr = bt.length ? bt.reduce((s, b) => s + Math.min(b.modelErrPct ?? 0, b.naiveErrPct ?? 0), 0) / bt.length : null
  const conf = o.historyDays >= 30 ? 'high' : o.historyDays >= 10 ? 'medium' : 'low'
  const picked = sel ? o.activities.find((a) => a.activity.id === sel) ?? null : null
  const cur = (picked?.model ? picked : null) || o.activities.filter((a) => a.model && a.remaining > 0).sort((a, b) => b.activity.weight - a.activity.weight)[0] || null

  const cols: Col<ActivityOutlook>[] = [
    { key: 't', label: 'فعالیت', render: (a) => <><span className="strong">{a.activity.title}</span><span className="sub">{a.activity.group || 'کل پروژه'} · وزن {fa(a.activity.weight, 1)}</span></> },
    { key: 'r', label: 'باقیمانده', num: true, render: (a) => `${fa(a.remaining, 1)} ${a.activity.unit}`, sort: (a) => a.remaining },
    { key: 'p', label: 'پیشرفت', render: (a) => <><Bar value={a.activity.baseQty > 0 ? Math.min(1, a.activity.doneQty / a.activity.baseQty) : 0} /><span className="sub">{pct(a.activity.baseQty > 0 ? a.activity.doneQty / a.activity.baseQty : 0, 0)}</span></>, sort: (a) => (a.activity.baseQty ? a.activity.doneQty / a.activity.baseQty : 0) },
    { key: 'k', label: 'کارکرد روز صاف', num: true, hint: 'خروجی مورد انتظار یک روز کاری صاف و خشک با نیروی فعلی', render: (a) => (a.model ? fa(a.model.clearDayRate, 1) : '—') },
    { key: 'w1', label: 'هفتهٔ آینده', num: true, render: (a) => (a.remaining > 0 && a.model ? fa(a.next7, 1) : '—'), sort: (a) => a.next7 },
    { key: 'w4', label: '۴ هفتهٔ آینده', num: true, render: (a) => (a.remaining > 0 && a.model ? fa(a.next28, 1) : '—'), sort: (a) => a.next28 },
    { key: 'f', label: 'پایان پیش‌بینی', render: (a) => a.finish ? <><span className="strong">{jalaliText(a.finish)}</span><span className="sub">{a.reason === 'plan_based' ? 'هنوز شروع نشده · مدت برنامه × شاخص عملکرد' : a.finishP10 && a.finishP90 && a.finish !== m.today ? `بازه ${jalaliText(a.finishP10)} تا ${jalaliText(a.finishP90)}` : ''}</span></> : <span className="sub">{REASON[a.reason] || '—'}</span>, sort: (a) => a.finish ?? '9999' },
    { key: 's', label: 'نسبت به برنامه', render: (a) => (a.slipDays == null ? <span className="sub">{a.activity.plannedEnd ? '—' : 'بدون تاریخ برنامه'}</span> : <Chip tone={a.slipDays > 14 ? 'bad' : a.slipDays > 0 ? 'warn' : 'good'}>{signDays(a.slipDays)}</Chip>), sort: (a) => a.slipDays ?? -9999 },
    { key: 'c', label: 'اعتبار', render: (a) => (a.model ? <Chip tone={CONF[a.model.confidence].t}>{CONF[a.model.confidence].l}</Chip> : a.reason === 'plan_based' ? <Chip>بر پایهٔ برنامه</Chip> : '—') },
  ]
  const months = Array.from({ length: 12 }, (_, i) => (jalaliParts(m.today).jm - 1 + i) % 12)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="فرض‌های پیش‌بینی" hint="نیروی انسانی و ماشین‌آلات از میانگین دو هفتهٔ اخیر گزارش‌ها شروع می‌شوند؛ تغییر هر کدام اثرش را با ضریب کشش همان فعالیت (بازده نزولی) روی کارکرد آینده نشان می‌دهد.">
        <div className="ex-ol-controls">
          <label className="ex-ol-ctl"><span><HardHat size={15} aria-hidden /> نیروی انسانی</span>
            <input type="range" min={-50} max={100} step={5} value={manPct} onChange={(e) => setManPct(+e.target.value)} aria-label="تغییر نیروی انسانی (درصد)" />
            <b>{manPct > 0 ? '+' : ''}{fa(manPct)}٪</b><small>{o.resources.man == null ? 'در گزارش‌ها ثبت نشده' : `${fa(o.resources.man, 0)} ← ${fa(o.resources.manScenario ?? 0, 0)} نفر`}</small></label>
          <label className="ex-ol-ctl"><span><Truck size={15} aria-hidden /> ماشین‌آلات</span>
            <input type="range" min={-50} max={100} step={5} value={equipPct} onChange={(e) => setEquipPct(+e.target.value)} aria-label="تغییر ماشین‌آلات (درصد)" />
            <b>{equipPct > 0 ? '+' : ''}{fa(equipPct)}٪</b><small>{o.resources.equip == null ? 'در گزارش‌ها ثبت نشده' : `${fa(o.resources.equip, 0)} ← ${fa(o.resources.equipScenario ?? 0, 0)} دستگاه`}</small></label>
          <label className="ex-ol-ctl"><span><CloudRain size={15} aria-hidden /> اقلیم محل پروژه</span>
            <select className="im-select" value={climate} onChange={(e) => setClimate(e.target.value as ClimateKey)}>{(Object.keys(CLIMATE_FA) as ClimateKey[]).map((k) => <option key={k} value={k}>{CLIMATE_FA[k]}</option>)}</select>
            <small>با ثبت هوای هر روز، سهم سابقهٔ خود پروژه بیشتر می‌شود</small></label>
          <label className="ex-ol-ctl"><span>روزهای کاری</span>
            <select className="im-select" value={wdIdx} onChange={(e) => setWdIdx(+e.target.value)}>{WD_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}{i === 0 ? ` (${fa(m.settings.workDays.length)} روز)` : ''}</option>)}</select>
            <small>{manPct || equipPct || wdIdx ? <button type="button" className="im-btn im-btn-sm" onClick={() => { setManPct(0); setEquipPct(0); setWdIdx(0) }}>بازگشت به روند فعلی</button> : 'روند فعلی'}</small></label>
        </div>
      </Section>

      <div className="fn-kpis">
        <KpiCard i={0} label="تاریخ اتمام پیش‌بینی‌شده" value={dateOr(finish)} tone={slip == null ? 'neutral' : slip > 30 ? 'bad' : slip > 0 ? 'warn' : 'good'}
          sub={o.unforecastable ? `${fa(o.unforecastable)} فعالیت نه کارکردی دارد نه تاریخ برنامه؛ این تاریخ کمینه است` : o.finishP10 && o.finishP90 ? `بازهٔ ۸۰٪: ${jalaliText(o.finishP10)} تا ${jalaliText(o.finishP90)}` : undefined} />
        <KpiCard i={1} label="نسبت به پایان برنامه‌ای" value={signDays(slip)} tone={slip == null ? 'neutral' : slip > 30 ? 'bad' : slip > 0 ? 'warn' : 'good'} sub={plannedFinish ? `پایان برنامه‌ای ${jalaliText(plannedFinish)}` : 'تاریخ برنامه برای فعالیت‌ها ثبت نشده'} />
        <KpiCard i={2} label="پیشرفت مورد انتظار هفتهٔ آینده" value={gain7 == null ? '—' : `${(gain7 * 100).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`} sub={`پیشرفت فعلی ${pct(o.curve[0]?.expected ?? 0)}`} />
        <KpiCard i={3} label="پشتوانهٔ پیش‌بینی" value={`${fa(o.historyDays)} روز گزارش`} tone={CONF[conf].t} sub={<>{btErr != null ? `خطای پیش‌بینی روزانهٔ هر فعالیت حدود ${fa(btErr, 0)}٪` : 'برای پس‌آزمون دست‌کم ۸ روز کارکرد لازم است'}{o.planBased ? <><br />{`${fa(o.planBased)} فعالیت شروع‌نشده بر پایهٔ برنامه × شاخص عملکرد ${o.performanceIndex == null ? '—' : fa(o.performanceIndex, 2)}`}</> : null}</>} />
      </div>

      <Tile title="پیشرفت فیزیکی: گذشته، برنامه و پیش‌بینی" hint="خط پررنگ: پیشرفت تأییدشده تا امروز · خط‌چین: برنامه · خط بنفش: پیش‌بینی · نوار: بازهٔ ۸۰٪ (P10 تا P90)">
        <div style={{ height: 290 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} /><XAxis dataKey="d" {...axisProps} minTickGap={28} /><YAxis {...axisProps} width={38} domain={[0, 100]} unit="٪" />
            <Tooltip formatter={(v: unknown) => (Array.isArray(v) ? `${(+v[0]).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪ تا ${(+v[1]).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪` : `${(+(v as number)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`)} contentStyle={{ background: 'var(--im-panel)', border: '1px solid var(--im-line)', borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="band" name="بازهٔ ۸۰٪" stroke="none" fill={PB.violet} fillOpacity={0.18} connectNulls />
            <Line type="monotone" dataKey="planned" name="برنامه" stroke={PB.slate} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="actual" name="تأییدشده" stroke={PB.teal} dot={false} strokeWidth={3} connectNulls />
            <Line type="monotone" dataKey="exp" name="پیش‌بینی" stroke={PB.violet} dot={false} strokeWidth={2.5} connectNulls />
          </ComposedChart>
        </ResponsiveContainer></div>
      </Tile>

      <Section title="کارکرد آتی و پایان هر فعالیت" hint="روی هر ردیف بزنید تا عوامل اثرگذار همان فعالیت را ببینید" flush>
        <DataTable cols={cols} rows={o.activities.filter((a) => a.remaining > 0)} rowKey={(a) => a.activity.id} onRow={(a) => setSel(a.activity.id)} empty="همهٔ فعالیت‌ها تکمیل شده‌اند." />
      </Section>

      {picked && !picked.model && <p className="im-helper" style={{ margin: 0 }}>«{picked.activity.title}» {picked.reason === 'plan_based' ? 'هنوز کارکردی در گزارش‌ها ندارد؛ پایانش از مدت برنامه‌ای و شاخص عملکرد پروژه برآورد شده است.' : 'مدلی برای نمایش ندارد.'} عوامل زیر مربوط به «{cur?.activity.title}» است.</p>}
      {cur?.model && (() => {
        const md = cur.model, b = md.backtest
        return (
          <Section title={`عوامل اثرگذار: ${cur.activity.title}`} hint={`از ${fa(md.days)} روز گزارش (${fa(md.positiveDays)} روز با کارکرد) — واحد ${cur.activity.unit}`}>
            <div className="ex-ol-drivers">
              <div className="ex-ol-card"><h4>منابع</h4>
                <p><b>کشش نسبت به نیروی انسانی: {fa(md.alpha, 2)}</b><small>{fa(10)}٪ نیروی بیشتر ≈ {fa((1.1 ** md.alpha - 1) * 100, 1)}٪ کارکرد بیشتر · {md.alphaData > 0.5 ? 'برآوردشده از داده' : md.alphaData > 0.15 ? 'ترکیب داده و پیش‌فرض' : 'پیش‌فرض (تعداد نفرات تقریباً ثابت بوده)'}</small></p>
                <p><b>کشش نسبت به ماشین‌آلات: {fa(md.beta, 2)}</b><small>{fa(10)}٪ ماشین بیشتر ≈ {fa((1.1 ** md.beta - 1) * 100, 1)}٪ کارکرد بیشتر · {md.betaData > 0.5 ? 'برآوردشده از داده' : md.betaData > 0.15 ? 'ترکیب داده و پیش‌فرض' : 'پیش‌فرض (تعداد ماشین تقریباً ثابت بوده)'}</small></p>
                <p><small>میانگین سابقه: {fa(md.manMean, 0)} نفر و {fa(md.equipMean, 0)} دستگاه</small></p>
              </div>
              <div className="ex-ol-card"><h4>هوا (نسبت به روز صاف)</h4>
                {WX_CLASSES.map((c) => <p key={c} className="ex-ol-f"><span>{WX_FA[c]}</span><Bar value={Math.min(1, md.wx[c].factor)} /><b>{fa(md.wx[c].factor * 100, 0)}٪</b><small>{md.wx[c].days ? `${fa(md.wx[c].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4>زمین (نسبت به خشک)</h4>
                {(Object.keys(md.ground) as GroundState[]).map((g) => <p key={g} className="ex-ol-f"><span>{GROUND_FA[g]}</span><Bar value={Math.min(1, md.ground[g].factor)} /><b>{fa(md.ground[g].factor * 100, 0)}٪</b><small>{md.ground[g].days ? `${fa(md.ground[g].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4>دقت روی گذشته</h4>
                {b ? <>
                  <p><b>خطای مدل منابع و هوا: {fa(b.modelErrPct ?? 0, 0)}٪</b><small>میانگین خطای پیش‌بینی یک‌روز‌جلوتر در {fa(b.origins)} روز اخیر</small></p>
                  <p><b>خطای میانگین ساده: {fa(b.naiveErrPct ?? 0, 0)}٪</b><small>همان آزمون با میانگین دو هفتهٔ قبل</small></p>
                  <p><small>سهم مدل در برآورد نهایی: {pct(b.blendWeight, 0)} (هر کدام دقیق‌تر بوده سهم بیشتری گرفته)</small></p>
                </> : <p><small>برای پس‌آزمون دست‌کم ۸ روز کارکرد این فعالیت لازم است؛ تا آن زمان مدل و میانگین ساده هم‌وزن‌اند.</small></p>}
                <p><b>نوسان روزانه: {pct(md.cv, 0)}</b><small>پهنای بازهٔ پیش‌بینی از همین عدد می‌آید</small></p>
              </div>
            </div>
          </Section>
        )
      })()}

      <Section title="تقویم جوی کارکرد" hint={`سهم کارکرد مورد انتظار هر ماه نسبت به ماهی که همهٔ روزهایش صاف باشد — اقلیم «${CLIMATE_FA[climate]}» همراه با هوای ثبت‌شده در گزارش‌های همین پروژه`}>
        <div className="ex-ol-months">
          {months.map((mi) => <div key={mi} className="ex-ol-month"><span>{JALALI_MONTHS[mi]}</span><i style={{ height: `${Math.round(o.monthFactor[mi] * 100)}%`, opacity: 0.45 + 0.55 * o.monthFactor[mi] }} /><b>{fa(o.monthFactor[mi] * 100, 0)}٪</b></div>)}
        </div>
      </Section>

      <Section title="روش محاسبه" hint="برای کارشناس برنامه‌ریزی و کنترل پروژه">
        <div className="ex-ol-method">
          <p>کارکرد هر فعالیت جداگانه و با واحد خودش مدل می‌شود (مقدارهای ناهم‌جنس هرگز جمع نمی‌شوند):</p>
          <p dir="ltr" className="ex-ol-eq">Q(day) = p(w) · K · (L / L̄)<sup>α</sup> · (E / Ē)<sup>β</sup> · f(w) · g(ground) · S</p>
          <ul>
            <li><b>L و E</b>: نیروی انسانی و ماشین‌آلات فعال همان روز از جدول منابع گزارش‌ها؛ <b>α و β</b> کشش کارکرد نسبت به آن‌ها، با رگرسیون ریج بیزی در فضای لگاریتمی و پیش‌فرض ۰٫۶ و ۰٫۳ (بازده نزولی). وقتی تعداد نفرات یا ماشین‌ها در سابقه تغییر چندانی نکرده، داده چیزی دربارهٔ اثرشان نمی‌گوید و عدد نزدیک پیش‌فرض می‌ماند.</li>
            <li><b>f(w) و g</b>: اثر هوا و وضعیت زمین نسبت به روز صاف و خشک؛ از سابقه برآورد و به نسبت تعداد روزهای پشتوانه با مقدار مهندسی پیش‌فرض ترکیب می‌شود (هر طبقه با کمتر از ۵ روز بیشتر به پیش‌فرض تکیه دارد).</li>
            <li><b>p(w)</b>: سهم روزهایی که فعالیت کارکرد داشته، به تفکیک هوا — روز بارانیِ بی‌کارکرد صفر حساب می‌شود، نه داده‌ٔ گمشده. <b>S</b> ضریب تصحیح بازگشت از لگاریتم (Duan) است.</li>
            <li>روزهای اخیر وزن بیشتری دارند (نیمه‌عمر ۲۱ روز). روزی در محاسبه می‌آید که دست‌کم یک گزارش کارکرد آن بررسی شده باشد و فقط مقادیر تأییدشدهٔ نظارت شمرده می‌شود.</li>
            <li><b>بهترین برآورد</b>: مدل با «میانگین ساده دو هفتهٔ اخیر» در یک پس‌آزمون غلتان (پیش‌بینی هر روز فقط با داده‌های قبل از آن) مقایسه و دو برآورد با وزن معکوس مجذور خطا ترکیب می‌شوند.</li>
            <li><b>فعالیت‌های شروع‌نشده</b>: کارکردی برای یادگیری ندارند؛ مدت برنامه‌ای آن‌ها بر «شاخص عملکرد» تقسیم می‌شود — میانهٔ وزنی نسبت نرخ واقعی به نرخ برنامه‌ای در فعالیت‌های شروع‌شده — و با تغییر منابع سناریو هم تنظیم می‌شود. این ردیف‌ها در جدول با برچسب «بر پایهٔ برنامه» مشخص‌اند.</li>
            <li><b>آینده</b>: برای هر روز کاری تقویم پروژه، منابع سناریو و ضریب جوی ماه آن (اقلیم انتخابی + هوای ثبت‌شده) اعمال و کارکرد تجمعی تا رسیدن به باقیماندهٔ هر فعالیت جمع می‌شود. بازهٔ ۸۰٪ از خطای پس‌آزمون و عدم‌قطعیت خود نرخ ساخته می‌شود. تاریخ اتمام پروژه، پایان دیرترین فعالیت است.</li>
          </ul>
        </div>
      </Section>
    </div>
  )
}
