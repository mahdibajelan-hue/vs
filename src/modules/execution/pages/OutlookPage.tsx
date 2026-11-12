import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, CloudRain, Minus, Plus, Users } from 'lucide-react'
import { useExecutionModel } from '../lib/useExecutionModel'
import { useExecutionStore } from '../store/useExecutionStore'
import { outlookInputs, type CrewSection } from '../lib/outlookData'
import { CLIMATE_FA, GROUND_FA, WX_CLASSES, WX_FA, isClimate, outlook, type ActivityOutlook, type ClimateKey, type CrewOutlook, type GroundState } from '../lib/engine/outlook'
import { plannedOverall } from '../lib/progress'
import { addDays, jalaliParts, jalaliText } from '../lib/periods'
import { JALALI_MONTHS } from '../../../lib/jalali'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { Bar, Empty, fa, pct } from '../components/common'

const CONF = { high: { t: 'good', l: 'بالا' }, medium: { t: 'warn', l: 'متوسط' }, low: { t: 'bad', l: 'کم' } } as const
const REASON: Record<ActivityOutlook['reason'], string> = { '': '', done: 'تکمیل‌شده', no_history: 'هنوز کارکردی ثبت نشده و به اکیپی هم وصل نیست', no_rate: 'نرخ قابل محاسبه نیست', plan_based: 'بر پایهٔ برنامه', queued: 'در نوبت اکیپ', beyond: 'اکیپ فعلی در افق ۴ ساله به آن نمی‌رسد' }
const WD_PRESETS: { label: string; days: number[] }[] = [
  { label: 'تقویم پروژه', days: [] }, { label: '۵ روز در هفته', days: [0, 1, 2, 3, 4] }, { label: '۶ روز در هفته', days: [0, 1, 2, 3, 4, 5] }, { label: '۷ روز در هفته', days: [0, 1, 2, 3, 4, 5, 6] },
]
const dateOr = (d: string | null) => (d ? jalaliText(d) : '—')
const signDays = (n: number | null) => (n == null ? '—' : n === 0 ? 'طبق برنامه' : n > 0 ? `${fa(n)} روز دیرتر` : `${fa(-n)} روز زودتر`)
const pp = (x: number, d = 2) => `${(x * 100).toLocaleString('fa-IR', { maximumFractionDigits: d })}٪`

/**
 * پیش‌بینی کارکرد و تاریخ اتمام — the output each activity will deliver and when the project will finish, learned from
 * the daily work reports (approved quantities, the complete crews of each work section, weather and ground). The model
 * and its equations are in lib/engine/outlook.ts; the crew compositions, the activity → crew links and the climate are
 * project settings.
 */
export function OutlookPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const save = (patch: Parameters<typeof ex.saveSettings>[1]) => void ex.saveSettings(projectId, patch)
  const climate: ClimateKey = isClimate(m.settings.climate) ? m.settings.climate : 'west_semi_arid'
  const [delta, setDelta] = useState<Record<string, number>>({})
  const [wdIdx, setWdIdx] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [editCrew, setEditCrew] = useState<string | null>(null)
  const inputs = useMemo(() => outlookInputs(m), [m])
  const workDays = WD_PRESETS[wdIdx].days.length ? WD_PRESETS[wdIdx].days : m.settings.workDays
  // recent complete crews per type (scenario-free run), then the scenario = recent + the user's whole-crew changes
  const base = useMemo(() => outlook({ ...inputs, groupWeights: m.settings.groupWeights, today: m.today, scenario: { crews: {}, climate, workDays } }), [inputs, m.settings.groupWeights, m.today, climate, workDays])
  const scenCrews = useMemo(() => Object.fromEntries(base.crews.filter((c) => delta[c.crew]).map((c) => [c.crew, Math.max(0, (c.recent ?? 0) + delta[c.crew])])), [base.crews, delta])
  const o = useMemo(() => (Object.keys(scenCrews).length ? outlook({ ...inputs, groupWeights: m.settings.groupWeights, today: m.today, scenario: { crews: scenCrews, climate, workDays } }) : base), [base, scenCrews, inputs, m.settings.groupWeights, m.today, climate, workDays])

  const chart = useMemo(() => {
    const plan = (d: string) => plannedOverall({ activities: m.activities, baselines: m.baselines, blines: m.blines, asOf: d, groupWeights: m.settings.groupWeights }).overall
    const hist = m.curve.filter((p) => p.date < m.today).map((p) => ({ d: jalaliText(p.date), actual: +(p.actual * 100).toFixed(2), planned: p.planned == null ? null : +(p.planned * 100).toFixed(2), exp: null as number | null, band: null as [number, number] | null }))
    const fut = o.curve.map((p, i) => { const pl = plan(p.date); return { d: jalaliText(p.date), actual: i === 0 ? +(p.expected * 100).toFixed(2) : null, planned: pl == null ? null : +(pl * 100).toFixed(2), exp: +(p.expected * 100).toFixed(2), band: [+(p.low * 100).toFixed(2), +(p.high * 100).toFixed(2)] as [number, number] } })
    return [...hist, ...fut]
  }, [m, o.curve])

  if (!m.activities.length) return <Empty>ابتدا فعالیت‌های پروژه را در «تنظیمات ← فهرست‌ها، مقادیر پیمان…» تعریف کنید.</Empty>
  if (o.historyDays === 0) return <Empty><b style={{ display: 'block', marginBottom: 6 }}>هنوز گزارش روزانهٔ تأییدشده‌ای نیست</b>این بخش از گزارش‌های روزانهٔ کارکرد یاد می‌گیرد: مقدار تأییدشدهٔ هر فعالیت، اکیپ‌های کامل هر بخش کاری، وضعیت هوا و زمین. با تأیید نخستین گزارش‌ها پیش‌بینی ساخته می‌شود.</Empty>

  const plannedFinish = m.activities.filter((a) => a.active && a.approval === 'approved' && a.plannedEnd).map((a) => a.plannedEnd as string).sort().pop() ?? null
  const finish = o.finish ?? o.finishKnown
  const slip = finish && plannedFinish ? Math.round((Date.parse(finish) - Date.parse(plannedFinish)) / 86400000) : null
  const week = o.curve.find((p) => p.date >= addDays(m.today, 7))
  const gain7 = week ? week.expected - o.curve[0].expected : null
  const months3 = o.monthly.slice(0, 3)
  const avgMonth = months3.length ? months3.reduce((s, x) => s + x.gain, 0) / months3.length : null
  const bt = o.activities.map((a) => a.model?.backtest).filter((b): b is NonNullable<typeof b> => !!b)
  const btErr = bt.length ? bt.reduce((s, b) => s + Math.min(b.modelErrPct ?? 0, b.naiveErrPct ?? 0), 0) / bt.length : null
  const conf = o.historyDays >= 30 ? 'high' : o.historyDays >= 10 ? 'medium' : 'low'
  const picked = sel ? o.activities.find((a) => a.activity.id === sel) ?? null : null
  const cur = (picked?.model ? picked : null) || o.activities.filter((a) => a.model && a.remaining > 0).sort((a, b) => b.activity.weight - a.activity.weight)[0] || null
  const secByName = new Map(inputs.sections.map((s) => [s.name, s]))
  const prodSections = inputs.sections.filter((s) => !s.support)
  const setCrewOf = (id: string, v: string) => save({ activityCrew: { ...(m.settings.activityCrew ?? {}), [id]: v } })
  const crewRows: (CrewOutlook & { sec: CrewSection | null })[] = [
    ...o.crews.map((c) => ({ ...c, sec: secByName.get(c.crew) ?? null })),
    ...prodSections.filter((s) => !o.crews.some((c) => c.crew === s.name)).map((s) => ({ crew: s.name, recent: null, scenario: null, activities: 0, finish: null, sec: s })),
  ]

  const cols: Col<ActivityOutlook>[] = [
    { key: 't', label: 'فعالیت', render: (a) => <><span className="strong">{a.activity.title}</span><span className="sub">{a.activity.group || 'کل پروژه'} · وزن {fa(a.activity.weight, 1)}</span></> },
    { key: 'cr', label: 'اکیپ', render: (a) => {
      const src = inputs.crewSource[a.activity.id]
      return (
        <span className="ex-ol-crewcell" onClick={(e) => e.stopPropagation()}>
          {canCfg ? (
            <select className="im-select" value={a.activity.crew ?? ''} onChange={(e) => setCrewOf(a.activity.id, e.target.value)} aria-label={`اکیپ ${a.activity.title}`}>
              <option value="">— بدون اکیپ —</option>
              {inputs.sections.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          ) : <span>{a.activity.crew ?? '—'}</span>}
          {src === 'suggested' && <small>پیشنهادی از عنوان</small>}
        </span>
      )
    } },
    { key: 'r', label: 'باقیمانده', num: true, render: (a) => `${fa(a.remaining, 1)} ${a.activity.unit}`, sort: (a) => a.remaining },
    { key: 'p', label: 'پیشرفت', render: (a) => <><Bar value={a.activity.baseQty > 0 ? Math.min(1, a.activity.doneQty / a.activity.baseQty) : 0} /><span className="sub">{pct(a.activity.baseQty > 0 ? a.activity.doneQty / a.activity.baseQty : 0, 0)}</span></>, sort: (a) => (a.activity.baseQty ? a.activity.doneQty / a.activity.baseQty : 0) },
    { key: 'k', label: 'هر اکیپ در روز صاف', num: true, hint: 'خروجی یک اکیپ کامل در یک روز کاری صاف و خشک', render: (a) => (a.model ? fa(a.model.perCrewRate ?? a.model.clearDayRate, 1) : '—') },
    { key: 'w1', label: 'هفتهٔ آینده', num: true, render: (a) => (a.remaining > 0 && (a.model || a.reason === 'queued') ? fa(a.next7, 1) : '—'), sort: (a) => a.next7 },
    { key: 'w4', label: '۴ هفتهٔ آینده', num: true, render: (a) => (a.remaining > 0 && (a.model || a.reason === 'queued') ? fa(a.next28, 1) : '—'), sort: (a) => a.next28 },
    { key: 'f', label: 'پایان پیش‌بینی', render: (a) => a.finish ? <><span className="strong">{jalaliText(a.finish)}</span><span className="sub">{a.reason === 'plan_based' ? 'مدت برنامه ÷ شاخص عملکرد' : a.reason === 'queued' ? `اکیپ از ${a.start ? jalaliText(a.start) : '—'} به آن می‌رسد` : a.finishP10 && a.finishP90 && a.finish !== m.today ? `بازه ${jalaliText(a.finishP10)} تا ${jalaliText(a.finishP90)}` : ''}</span></> : <span className="sub">{REASON[a.reason] || '—'}</span>, sort: (a) => a.finish ?? '9999' },
    { key: 's', label: 'نسبت به برنامه', render: (a) => (a.slipDays == null ? <span className="sub">{a.activity.plannedEnd ? '—' : 'بدون تاریخ برنامه'}</span> : <Chip tone={a.slipDays > 14 ? 'bad' : a.slipDays > 0 ? 'warn' : 'good'}>{signDays(a.slipDays)}</Chip>), sort: (a) => a.slipDays ?? -9999 },
    { key: 'c', label: 'مبنا', render: (a) => (a.model ? <Chip tone={CONF[a.model.confidence].t}>{`کارکرد خودش · اعتبار ${CONF[a.model.confidence].l}`}</Chip> : a.reason === 'queued' ? <Chip>نوبت اکیپ</Chip> : a.reason === 'plan_based' ? <Chip>برنامه</Chip> : '—') },
  ]
  const months = Array.from({ length: 12 }, (_, i) => (jalaliParts(m.today).jm - 1 + i) % 12)
  const anyDelta = Object.values(delta).some(Boolean) || wdIdx > 0

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="تاریخ اتمام پیش‌بینی‌شده" value={dateOr(finish)} tone={slip == null ? 'neutral' : slip > 30 ? 'bad' : slip > 0 ? 'warn' : 'good'}
          sub={o.unforecastable ? `${fa(o.unforecastable)} فعالیت تاریخ پایان ندارد (نه کارکرد و نه تاریخ برنامه، یا اکیپ فعلی در افق ۴ ساله به آن نمی‌رسد)؛ این تاریخ کمینه است` : o.finishP10 && o.finishP90 ? `بازهٔ ۸۰٪: ${jalaliText(o.finishP10)} تا ${jalaliText(o.finishP90)}` : undefined} />
        <KpiCard i={1} label="نسبت به پایان برنامه‌ای" value={signDays(slip)} tone={slip == null ? 'neutral' : slip > 30 ? 'bad' : slip > 0 ? 'warn' : 'good'} sub={plannedFinish ? `پایان برنامه‌ای ${jalaliText(plannedFinish)}` : 'تاریخ برنامه برای فعالیت‌ها ثبت نشده'} />
        <KpiCard i={2} label="پیشرفت مورد انتظار" value={avgMonth == null ? '—' : `${pp(avgMonth, 1)} در ماه`} sub={`هفتهٔ آینده ${gain7 == null ? '—' : pp(gain7)} · پیشرفت فعلی ${pct(o.curve[0]?.expected ?? 0)}`} />
        <KpiCard i={3} label="پشتوانهٔ پیش‌بینی" value={`${fa(o.historyDays)} روز گزارش`} tone={CONF[conf].t} sub={<>{btErr != null ? `خطای پیش‌بینی روزانهٔ هر فعالیت حدود ${fa(btErr, 0)}٪` : 'برای پس‌آزمون دست‌کم ۸ روز کارکرد لازم است'}{o.queued || o.planBased ? <><br />{[o.queued ? `${fa(o.queued)} فعالیت در نوبت اکیپ خودش` : '', o.planBased ? `${fa(o.planBased)} بر پایهٔ برنامه` : ''].filter(Boolean).join(' · ')}</> : null}</>} />
      </div>

      <Section title="اکیپ‌ها" hint="هر بخش کاری جدول منابع گزارش روزانه یک نوع اکیپ است. اکیپ کامل = ترکیب کامل ماشین‌آلات و نفرات آن؛ ماشین یا نفر اضافه خارج از یک اکیپ کامل کارکردی اضافه نمی‌کند. برای سناریو، اکیپ کامل اضافه یا کم کنید."
        action={anyDelta ? <button type="button" className="im-btn im-btn-sm" onClick={() => { setDelta({}); setWdIdx(0) }}>بازگشت به روند فعلی</button> : undefined}>
        <div className="ex-ol-crews">
          {crewRows.map((c) => {
            const sec = c.sec, d = delta[c.crew] ?? 0, comp = sec?.composition
            return (
              <div key={c.crew} className={`ex-ol-crew${c.activities ? '' : ' is-idle'}`}>
                <div className="ex-ol-crew-h">
                  <Users size={15} aria-hidden /><b>{c.crew}</b>
                  <small>{c.activities ? `${fa(c.activities)} فعالیت${c.finish ? ` · پایان کارها ${jalaliText(c.finish)}` : ''}` : 'به فعالیتی وصل نیست'}</small>
                </div>
                <p className="ex-ol-crew-comp">{comp ? Object.entries(comp).filter(([, v]) => v > 0).map(([k, v]) => `${fa(v)} ${k}`).join(' + ') : 'ترکیب اکیپ تعریف نشده — کل نیرو و ماشین این بخش یک اکیپ فرض شده'}
                  {canCfg && sec && <button type="button" className="im-btn im-btn-sm" onClick={() => setEditCrew(editCrew === c.crew ? null : c.crew)}>{editCrew === c.crew ? 'بستن' : comp ? 'ویرایش ترکیب' : 'تعریف ترکیب اکیپ'}</button>}</p>
                {editCrew === c.crew && sec && <CrewEditor sec={sec} onSave={(v) => { save({ crewComposition: { ...(m.settings.crewComposition ?? {}), [sec.name]: v } }); setEditCrew(null) }} />}
                {c.activities > 0 && (
                  <div className="ex-ol-crew-n">
                    <span>اکیپ کامل در دو هفتهٔ اخیر: <b>{c.recent == null ? '—' : fa(c.recent, 1)}</b></span>
                    <span className="ex-ol-step" role="group" aria-label={`تعداد اکیپ ${c.crew} در سناریو`}>
                      <button type="button" onClick={() => setDelta((x) => ({ ...x, [c.crew]: Math.max(-(c.recent ?? 0), d - 1) }))} aria-label="یک اکیپ کمتر" disabled={(c.recent ?? 0) + d <= 0}><Minus size={14} /></button>
                      <b>{fa((c.recent ?? 0) + d, 1)}</b>
                      <button type="button" onClick={() => setDelta((x) => ({ ...x, [c.crew]: d + 1 }))} aria-label="یک اکیپ کامل بیشتر"><Plus size={14} /></button>
                    </span>
                    {d !== 0 && <Chip tone={d > 0 ? 'good' : 'warn'}>{d > 0 ? `+${fa(d)} اکیپ` : `${fa(d)} اکیپ`}</Chip>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="ex-ol-controls" style={{ marginTop: 12 }}>
          <label className="ex-ol-ctl"><span><CloudRain size={15} aria-hidden /> اقلیم محل پروژه</span>
            {canCfg ? <select className="im-select" value={climate} onChange={(e) => save({ climate: e.target.value })}>{(Object.keys(CLIMATE_FA) as ClimateKey[]).map((k) => <option key={k} value={k}>{CLIMATE_FA[k]}</option>)}</select> : <b style={{ fontSize: 14 }}>{CLIMATE_FA[climate]}</b>}
            <small>در تنظیمات پروژه ذخیره می‌شود؛ با ثبت هوای هر روز، سهم سابقهٔ خود پروژه بیشتر می‌شود</small></label>
          <label className="ex-ol-ctl"><span><CalendarDays size={15} aria-hidden /> روزهای کاری</span>
            <select className="im-select" value={wdIdx} onChange={(e) => setWdIdx(+e.target.value)}>{WD_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}{i === 0 ? ` (${fa(m.settings.workDays.length)} روز)` : ''}</option>)}</select>
            <small>سناریو؛ تقویم پروژه در تنظیمات تغییر می‌کند</small></label>
        </div>
      </Section>

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

      {o.monthly.length > 0 && (
        <Section title="پیشرفت ماه‌های آینده" hint="با اکیپ‌ها و هوای ثابت، پیشرفت هر ماه تقریباً ثابت می‌ماند؛ تفاوت ماه‌ها از هوای فصل، تعداد روزهای کاری ماه و پایان کار اکیپ‌ها می‌آید.">
          <div className="ex-ol-monthly">
            {o.monthly.slice(0, 6).map((x) => { const max = Math.max(...o.monthly.slice(0, 6).map((y) => y.gain), 1e-9); return (
              <div key={x.key} className="ex-ol-mo"><b>{pp(x.gain, 1)}</b><i style={{ height: `${Math.max(3, (x.gain / max) * 100)}%` }} /><span>{JALALI_MONTHS[x.jm - 1]}</span></div>
            ) })}
          </div>
        </Section>
      )}

      <Section title="کارکرد آتی و پایان هر فعالیت" hint={canCfg ? 'اکیپ هر فعالیت را تعیین کنید (پیشنهاد اولیه از عنوان فعالیت است و در تنظیمات پروژه ذخیره می‌شود). روی ردیف بزنید تا عوامل اثرگذار آن را ببینید.' : 'روی ردیف بزنید تا عوامل اثرگذار آن را ببینید. تعیین اکیپ فعالیت‌ها با مدیر یا تنظیم‌کنندهٔ ماژول است.'} flush>
        <DataTable cols={cols} rows={o.activities.filter((a) => a.remaining > 0)} rowKey={(a) => a.activity.id} onRow={(a) => setSel(a.activity.id)} empty="همهٔ فعالیت‌ها تکمیل شده‌اند." />
      </Section>

      {picked && !picked.model && <p className="im-helper" style={{ margin: 0 }}>«{picked.activity.title}» {picked.reason === 'queued' ? 'هنوز کارکردی ندارد؛ اکیپ خودش پس از کارهای جاری به آن می‌رسد.' : picked.reason === 'plan_based' ? 'هنوز کارکردی ندارد و اکیپش هم کارکردی ثبت نکرده؛ پایانش از مدت برنامه‌ای و شاخص عملکرد پروژه برآورد شده است.' : 'مدلی برای نمایش ندارد.'} عوامل زیر مربوط به «{cur?.activity.title}» است.</p>}
      {cur?.model && (() => {
        const md = cur.model, b = md.backtest
        return (
          <Section title={`عوامل اثرگذار: ${cur.activity.title}`} hint={`از ${fa(md.days)} روز کاری اکیپ (${fa(md.positiveDays)} روز با کارکرد) — واحد ${cur.activity.unit}`}>
            <div className="ex-ol-drivers">
              <div className="ex-ol-card"><h4>اکیپ: {cur.activity.crew ?? 'تعیین نشده'}</h4>
                {md.perCrewRate != null ? <>
                  <p><b>کارکرد هر اکیپ کامل در روز صاف: {fa(md.perCrewRate, 1)} {cur.activity.unit}</b><small>میانگین سابقه {fa(md.crewMean ?? 0, 1)} اکیپ کامل در روز</small></p>
                  <p><b>اثر یک اکیپ کامل اضافه: {fa(md.gamma, 2)}</b><small>{md.gamma >= 0.95 ? 'هر اکیپ کامل اضافه تقریباً کارکرد کامل خودش را اضافه می‌کند' : 'اکیپ اضافه کمتر از سهم کامل خود می‌افزاید (تداخل جبهه‌ها)'} · {md.gammaData > 0.5 ? 'برآوردشده از داده' : md.gammaData > 0.15 ? 'ترکیب داده و پیش‌فرض' : 'پیش‌فرض (تعداد اکیپ‌ها ثابت بوده)'}</small></p>
                </> : <p><small>این فعالیت به اکیپی وصل نیست؛ تعداد اکیپ در پیش‌بینی آن اثری ندارد. از ستون «اکیپ» جدول بالا تعیین کنید.</small></p>}
              </div>
              <div className="ex-ol-card"><h4>هوا (نسبت به روز صاف)</h4>
                {WX_CLASSES.map((c) => <p key={c} className="ex-ol-f"><span>{WX_FA[c]}</span><Bar value={Math.min(1, md.wx[c].factor)} /><b>{fa(md.wx[c].factor * 100, 0)}٪</b><small>{md.wx[c].days ? `${fa(md.wx[c].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4>زمین (نسبت به خشک)</h4>
                {(Object.keys(md.ground) as GroundState[]).map((g) => <p key={g} className="ex-ol-f"><span>{GROUND_FA[g]}</span><Bar value={Math.min(1, md.ground[g].factor)} /><b>{fa(md.ground[g].factor * 100, 0)}٪</b><small>{md.ground[g].days ? `${fa(md.ground[g].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4>دقت روی گذشته</h4>
                {b ? <>
                  <p><b>خطای مدل اکیپ و هوا: {fa(b.modelErrPct ?? 0, 0)}٪</b><small>میانگین خطای پیش‌بینی یک‌روز‌جلوتر در {fa(b.origins)} روز اخیر</small></p>
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
          <p dir="ltr" className="ex-ol-eq">Q(day) = p(w) · q · (N / N̄)<sup>γ</sup> · f(w) · g(ground) · S</p>
          <ul>
            <li><b>N</b>: تعداد اکیپ کامل نوع اکیپِ همان فعالیت در آن روز؛ از جدول منابع گزارش، کمینهٔ «تعداد فعال ÷ تعداد در یک اکیپ» روی اقلام ترکیب اکیپ (رو به پایین گرد). سایدبوم اکیپ ریسه برای جوشکاری شمرده نمی‌شود و یک ماشین یا نفر اضافه تا اکیپ کامل نشود اثری ندارد. روزی که هیچ اکیپ کاملی از آن نوع در کارگاه نبوده، از محاسبهٔ بهره‌وری کنار گذاشته می‌شود.</li>
            <li><b>q</b>: کارکرد یک روز صاف و خشک با میانگین اکیپ‌ها؛ <b>γ</b> اثر افزودن اکیپ کامل، با پیش‌فرض ۱ (هر اکیپ کامل روی جبههٔ خودش کارکرد کامل خود را اضافه می‌کند) و رگرسیون ریج بیزی وقتی تعداد اکیپ‌ها در سابقه تغییر کرده باشد.</li>
            <li><b>f(w) و g</b>: اثر هوا و وضعیت زمین نسبت به روز صاف و خشک، از سابقه و به نسبت تعداد روزهای پشتوانه ترکیب با مقدار پیش‌فرض. <b>p(w)</b> سهم روزهای کاری اکیپ که فعالیت کارکرد داشته، به تفکیک هوا. <b>S</b> تصحیح بازگشت از لگاریتم (Duan).</li>
            <li>روزهای اخیر وزن بیشتری دارند (نیمه‌عمر ۲۱ روز). فقط مقادیر تأییدشدهٔ نظارت و روزهایی که دست‌کم یک گزارش کارکردشان بررسی شده شمرده می‌شود.</li>
            <li><b>بهترین برآورد</b>: مدل با «میانگین ساده دو هفتهٔ اخیر» در پس‌آزمون غلتان مقایسه و دو برآورد با وزن معکوس مجذور خطا ترکیب می‌شوند.</li>
            <li><b>ظرفیت اکیپ و پیوستگی کار</b>: ظرفیت روزانهٔ هر نوع اکیپ (به واحد پیشرفت وزنی) میان فعالیت‌هایش به همان نسبت امروز تقسیم می‌شود. وقتی یک فعالیت تمام شد، اکیپ‌هایش با همان بهره‌وری ارزشی به کارهای باقیماندهٔ همان نوع اکیپ می‌روند — اول فعالیت‌های در جریان، بعد فعالیت‌های شروع‌نشده به ترتیب برنامه. به همین دلیل با اکیپ و هوای ثابت، پیشرفت روزانه و ماهانه ثابت می‌ماند و با بسته‌شدن فعالیت‌ها افت نمی‌کند.</li>
            <li><b>فعالیت‌هایی که اکیپشان هنوز هیچ کارکردی ندارد</b>: مدت برنامه‌ای ÷ شاخص عملکرد (میانهٔ وزنی نسبت نرخ واقعی به برنامه‌ای در فعالیت‌های در جریان).</li>
            <li><b>آینده</b>: روزهای کاری تقویم، اکیپ‌های سناریو و ضریب جوی هر ماه (اقلیم پروژه + هوای ثبت‌شده). بازهٔ ۸۰٪ از خطای پس‌آزمون و عدم‌قطعیت نرخ. تاریخ اتمام پروژه = پایان دیرترین فعالیت.</li>
          </ul>
        </div>
      </Section>
    </div>
  )
}

/** Units of each resource of a work section in ONE complete crew; 0 = not part of the crew. */
function CrewEditor({ sec, onSave }: { sec: CrewSection; onSave: (v: Record<string, number>) => void }) {
  const [v, setV] = useState<Record<string, number>>(() => sec.composition ?? {})
  return (
    <div className="ex-ol-comp">
      <p className="im-helper" style={{ margin: 0 }}>برای هر قلم بنویسید یک اکیپ کامل چند واحد از آن دارد (۰ = جزو اکیپ نیست). «معمول روزانه» میانهٔ تعداد فعال در گزارش‌هاست؛ مثلاً اگر معمولاً ۴ سایدبوم و ۸ جوشکار فعال است و هر اکیپ ۱ سایدبوم و ۲ جوشکار دارد، کارگاه ۴ اکیپ دارد.</p>
      <div className="ex-ol-comp-grid">
        {sec.items.map((it) => (
          <label key={it.name}><span>{it.name}<small>{it.kind === 'equip' ? 'ماشین' : 'نفر'} · معمول روزانه {fa(it.usual, 1)}</small></span>
            <input type="number" min={0} step={1} className="im-input" value={v[it.name] ?? 0} onChange={(e) => setV((x) => ({ ...x, [it.name]: Math.max(0, Math.round(+e.target.value || 0)) }))} aria-label={`تعداد ${it.name} در یک اکیپ`} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="im-btn im-btn-primary im-btn-sm" onClick={() => onSave(Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0)))}>ذخیره در تنظیمات پروژه</button>
        <button type="button" className="im-btn im-btn-sm" onClick={() => onSave({})}>حذف ترکیب (کل بخش = یک اکیپ)</button>
      </div>
    </div>
  )
}
