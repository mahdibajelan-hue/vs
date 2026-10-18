import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Dices, Plus, Trash2 } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { HBars, PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { fa } from '../../execution/components/common'
import { runMonteCarlo, type McResult, type RiskEvent } from '../lib/monteCarlo'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const money = (v: number) => fa(Math.round(v))
const EMPTY_EVENT = { title: '', probability: 0.3, dMin: 1, dLikely: 3, dMax: 7, cMin: 0, cLikely: 0, cMax: 0, uids: [] as string[] }

/** Quantitative schedule/cost risk analysis: inputs are the planner's own (activity duration ranges, risk events with probability); the engine is Monte Carlo over the real network (see monteCarlo.ts). */
export function SchRisk({ m }: { projectId: string; m: LiveModel }) {
  const st = useSchedulingStore()
  const acts = m.cur!.activities.filter((a) => a.type === 'task' && (m.forecast.byId.get(a.id)?.status ?? 'not_started') !== 'complete')
  const byUid = useMemo(() => new Map(m.cur!.activities.map((a) => [a.uid, a])), [m.cur])
  const [iterations, setIterations] = useState(2000), [seed, setSeed] = useState(12345)
  const [res, setRes] = useState<McResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [drUid, setDrUid] = useState(''), [dr, setDr] = useState({ min: 0, likely: 0, max: 0 }), [drQ, setDrQ] = useState('')
  const [ev, setEv] = useState(EMPTY_EVENT), [evQ, setEvQ] = useState('')
  const can = st.canEdit

  const options = useMemo(() => { const n = drQ.trim().toLowerCase(); return acts.filter((a) => !n || `${a.code} ${a.name}`.toLowerCase().includes(n)).slice(0, 80) }, [acts, drQ])
  const evOptions = useMemo(() => { const n = evQ.trim().toLowerCase(); return acts.filter((a) => !n || `${a.code} ${a.name}`.toLowerCase().includes(n)).slice(0, 80) }, [acts, evQ])
  const pickAct = (uid: string) => { setDrUid(uid); const a = byUid.get(uid); const r = m.forecast.byId.get(a?.id ?? ''); const dur = a ? (a.remDuration ?? a.origDuration) : 0; const ex = st.durationRisks.find((x) => x.uid === uid); setDr(ex ? { min: ex.min, likely: ex.likely, max: ex.max } : { min: Math.max(0, Math.round(dur * 0.8)), likely: dur, max: Math.round(dur * 1.5) }); void r }
  const drOk = drUid && dr.min >= 0 && dr.min <= dr.likely && dr.likely <= dr.max
  const evOk = ev.title.trim() && ev.probability > 0 && ev.probability <= 1 && ev.dMin <= ev.dLikely && ev.dLikely <= ev.dMax && ev.cMin <= ev.cLikely && ev.cLikely <= ev.cMax && ev.uids.length > 0

  const run = () => {
    setBusy(true)
    setTimeout(() => {
      const r = runMonteCarlo({ schedule: { activities: m.cur!.activities, relations: m.cur!.relations, calendar: m.calendar, mode: 'forecast', dataDate: m.dataDate }, durationRisks: st.durationRisks, events: st.riskEvents, iterations, seed })
      setRes(r); setBusy(false)
    }, 30)
  }
  const save = async () => { if (res?.ok) await st.saveSimulation(m.currentV!.id, res.seed, res.iterations, { durationRisks: st.durationRisks.length, events: st.riskEvents.length, dataDate: m.dataDate }, res as unknown as Record<string, unknown>) }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: '10px 14px', fontSize: 12.5 }}>
        <b>این تحلیل فقط با ورودی‌هایی که خودتان تعریف می‌کنید انجام می‌شود</b> <Hint id="mc-sim" /> — هیچ احتمال یا اثری به‌صورت خودکار یا هوشمند ساخته نمی‌شود. برنامه با منطق واقعی شبکه (روابط، تقویم، تاریخ وضعیت {d(m.dataDate)}) هزاران بار حل می‌شود.
      </div>

      <Section title={<span>عدم‌قطعیت مدت فعالیت‌ها <Hint id="mc-duration" /></span>} hint="کمینه، محتمل‌ترین و بیشینهٔ مدت باقی‌مانده (روز کاری)" flush>
        {st.durationRisks.length > 0 && <table className="ex-lines"><thead><tr><th>فعالیت</th><th className="num">کمینه</th><th className="num">محتمل</th><th className="num">بیشینه</th><th /></tr></thead><tbody>
          {st.durationRisks.map((r) => { const a = byUid.get(r.uid); return <tr key={r.uid}><td><b className="fn-code">{a?.code ?? '—'}</b> {a?.name ?? 'فعالیت در این نسخه نیست'}</td><td className="num">{fa(r.min, 1)}</td><td className="num">{fa(r.likely, 1)}</td><td className="num">{fa(r.max, 1)}</td><td>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void st.removeDurationRisk(r.uid)}><Trash2 size={12} /></button>}</td></tr> })}
        </tbody></table>}
        {can && (
          <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ex-lab">جست‌وجو<input value={drQ} onChange={(e) => setDrQ(e.target.value)} dir="auto" style={{ width: 140 }} /></label>
            <label className="ex-lab" style={{ minWidth: 240 }}>فعالیت<select value={drUid} onChange={(e) => pickAct(e.target.value)}><option value="">— انتخاب —</option>{options.map((a) => <option key={a.uid} value={a.uid}>{a.code} — {a.name.slice(0, 50)}</option>)}</select></label>
            {(['min', 'likely', 'max'] as const).map((k) => <label key={k} className="ex-lab">{k === 'min' ? 'کمینه' : k === 'likely' ? 'محتمل' : 'بیشینه'}<input type="number" min={0} step="0.5" value={dr[k]} onChange={(e) => setDr({ ...dr, [k]: Number(e.target.value) })} style={{ width: 70 }} /></label>)}
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!drOk} onClick={() => void st.saveDurationRisk(drUid, dr.min, dr.likely, dr.max).then(() => setDrUid(''))}><Plus size={13} /> ثبت</button>
          </div>
        )}
      </Section>

      <Section title={<span>رویدادهای ریسکی <Hint id="mc-event" /></span>} hint="احتمال وقوع، تأخیر (روز کاری) و هزینه (ریال) در صورت وقوع" flush>
        {st.riskEvents.length > 0 && <table className="ex-lines"><thead><tr><th>رویداد</th><th className="num">احتمال</th><th>تأخیر (کمینه/محتمل/بیشینه)</th><th>هزینه</th><th>فعالیت‌ها</th><th /></tr></thead><tbody>
          {st.riskEvents.map((e: RiskEvent) => <tr key={e.id}><td>{e.title}{!e.active && <Chip tone="neutral">غیرفعال</Chip>}</td><td className="num">{fa(e.probability * 100, 0)}٪</td><td>{fa(e.days.min, 1)} / {fa(e.days.likely, 1)} / {fa(e.days.max, 1)}</td><td>{e.cost.max > 0 ? `${money(e.cost.min)} / ${money(e.cost.likely)} / ${money(e.cost.max)}` : '—'}</td><td className="sub" style={{ whiteSpace: 'normal' }}>{e.activityUids.map((u) => byUid.get(u)?.code ?? '?').join('، ')}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{can && <><button className="im-btn im-btn-sm" onClick={() => void st.saveRiskEvent({ ...e, active: !e.active })}>{e.active ? 'غیرفعال' : 'فعال'}</button> <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void st.removeRiskEvent(e.id)}><Trash2 size={12} /></button></>}</td></tr>)}
        </tbody></table>}
        {can && (
          <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab" style={{ flex: '1 1 220px' }}>عنوان رویداد<input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} dir="auto" list="sch-risk-titles" /></label>
              <datalist id="sch-risk-titles">{[...m.sources.risks.values()].filter((r) => r.open).slice(0, 80).map((r) => <option key={r.id} value={r.title} />)}</datalist>
              <label className="ex-lab">احتمال (۰ تا ۱)<input type="number" min={0} max={1} step="0.05" value={ev.probability} onChange={(e) => setEv({ ...ev, probability: Number(e.target.value) })} style={{ width: 80 }} /></label>
              {(['dMin', 'dLikely', 'dMax'] as const).map((k, i) => <label key={k} className="ex-lab">تأخیر {['کمینه', 'محتمل', 'بیشینه'][i]}<input type="number" min={0} step="0.5" value={ev[k]} onChange={(e) => setEv({ ...ev, [k]: Number(e.target.value) })} style={{ width: 70 }} /></label>)}
              {(['cMin', 'cLikely', 'cMax'] as const).map((k, i) => <label key={k} className="ex-lab">هزینه {['کمینه', 'محتمل', 'بیشینه'][i]}<input type="number" min={0} value={ev[k]} onChange={(e) => setEv({ ...ev, [k]: Number(e.target.value) })} style={{ width: 110 }} /></label>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab">جست‌وجوی فعالیت<input value={evQ} onChange={(e) => setEvQ(e.target.value)} dir="auto" style={{ width: 140 }} /></label>
              <label className="ex-lab" style={{ minWidth: 260 }}>فعالیت‌های اثرپذیر ({fa(ev.uids.length)})<select value="" onChange={(e) => { const u = e.target.value; if (u && !ev.uids.includes(u)) setEv({ ...ev, uids: [...ev.uids, u] }) }}><option value="">— افزودن فعالیت —</option>{evOptions.map((a) => <option key={a.uid} value={a.uid}>{a.code} — {a.name.slice(0, 50)}</option>)}</select></label>
              {ev.uids.map((u) => <Chip key={u} tone="neutral"><button type="button" onClick={() => setEv({ ...ev, uids: ev.uids.filter((x) => x !== u) })} aria-label="حذف از فهرست" style={{ all: 'unset', cursor: 'pointer' }}>{byUid.get(u)?.code ?? '?'} ×</button></Chip>)}
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!evOk} onClick={() => void st.saveRiskEvent({ title: ev.title.trim(), probability: ev.probability, days: { min: ev.dMin, likely: ev.dLikely, max: ev.dMax }, cost: { min: ev.cMin, likely: ev.cLikely, max: ev.cMax }, activityUids: ev.uids, active: true }).then(() => setEv(EMPTY_EVENT))}><Plus size={13} /> ثبت رویداد</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="اجرای شبیه‌سازی">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab">تعداد تکرار<select value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>{[500, 1000, 2000, 5000, 10000].map((n) => <option key={n} value={n}>{fa(n)}</option>)}</select></label>
          <label className="ex-lab">دانهٔ تصادف <Hint id="mc-seed" /><input type="number" value={seed} onChange={(e) => setSeed(Math.round(Number(e.target.value)) || 1)} style={{ width: 100 }} /></label>
          <button className="im-btn im-btn-primary" disabled={busy} onClick={run}><Dices size={14} /> {busy ? 'در حال محاسبه…' : 'اجرا'}</button>
          {res?.ok && can && <button className="im-btn im-btn-sm" onClick={() => void save()}>ذخیرهٔ نتیجه</button>}
        </div>
      </Section>

      {res && (
        <>
          {res.warnings.length > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}>{res.warnings.slice(0, 5).map((w) => <div key={w}>⚠ {w}</div>)}</div>}
          {res.ok && (
            <>
              <div className="fn-kpis">
                <KpiCard i={0} label="پیش‌بینی قطعی" value={d(res.deterministicFinish)} sub="بدون عدم‌قطعیت" />
                <KpiCard i={1} label={<span>P50 <Hint id="p50" /></span>} value={d(res.finish.p50)} sub={res.reserveDays.p50 == null ? undefined : `${res.reserveDays.p50 >= 0 ? '+' : ''}${fa(res.reserveDays.p50)} روز`} />
                <KpiCard i={2} label={<span>P80 <Hint id="p80" /></span>} value={d(res.finish.p80)} sub={res.reserveDays.p80 == null ? undefined : `ذخیرهٔ زمانی ${fa(res.reserveDays.p80)} روز`} tone={(res.reserveDays.p80 ?? 0) > 0 ? 'warn' : 'good'} />
                <KpiCard i={3} label={<span>P90 <Hint id="p90" /></span>} value={d(res.finish.p90)} sub={res.reserveDays.p90 == null ? undefined : `${fa(res.reserveDays.p90)} روز`} tone={(res.reserveDays.p90 ?? 0) > 0 ? 'bad' : 'good'} />
              </div>
              {res.cost && (
                <div className="fn-kpis">
                  <KpiCard i={0} label="هزینهٔ باقی‌ماندهٔ پایه (ریال)" value={money(res.cost.base)} />
                  <KpiCard i={1} label="هزینه P50" value={money(res.cost.p50)} />
                  <KpiCard i={2} label="هزینه P80" value={money(res.cost.p80)} sub={`ذخیره ${money(res.cost.reserveP80)}`} tone="warn" />
                  <KpiCard i={3} label="هزینه P90" value={money(res.cost.p90)} tone="bad" />
                </div>
              )}
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <Tile title="توزیع تاریخ پایان پروژه" hint={`${fa(res.iterations)} اجرا · دانهٔ ${res.seed}`}>
                  <div style={{ height: 230 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={res.histogram.map((h) => ({ x: jalaliText(h.date), n: h.count, date: h.date }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} /><XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={34} />
                    <Tooltip formatter={(v) => [fa(Number(v)), 'تعداد اجرا']} />
                    <Bar dataKey="n" fill={PB.teal} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    {res.finish.p80 && <ReferenceLine x={jalaliText(res.histogram.find((h) => h.date >= res.finish.p80!)?.date ?? res.finish.p80)} stroke={PB.coral} strokeDasharray="4 3" label={{ value: 'P80', fontSize: 10, fill: PB.coral }} />}
                  </BarChart></ResponsiveContainer></div>
                </Tile>
                <Tile title={<span>حساسیت فعالیت‌ها <Hint id="mc-sensitivity" /></span>} hint="همبستگی مدت با تاریخ پایان">
                  {res.sensitivity.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>فعالیتی با اثر قابل‌توجه یافت نشد.</p> : <HBars data={res.sensitivity.slice(0, 10).map((s) => ({ name: s.code, value: Math.max(0, s.correlation) * 100, color: s.criticalityIndex > 0.5 ? PB.coral : PB.blue }))} fmt={(v) => `${fa(v, 0)}٪`} h={Math.max(150, Math.min(10, res.sensitivity.length) * 30 + 20)} />}
                </Tile>
              </div>
              <Section title="شاخص بحرانی بودن و رویدادها" flush>
                <table className="ex-lines"><thead><tr><th>فعالیت</th><th className="num">همبستگی با پایان</th><th className="num">شاخص بحرانی بودن</th></tr></thead><tbody>
                  {res.sensitivity.map((s) => <tr key={s.uid}><td><b className="fn-code">{s.code}</b> {s.name}</td><td className="num">{fa(s.correlation, 2)}</td><td className="num">{fa(s.criticalityIndex * 100, 0)}٪</td></tr>)}
                  {res.eventHits.map((e) => <tr key={e.id}><td colSpan={2}>رویداد «{e.title}»</td><td className="num">وقوع در {fa(e.hitRate * 100, 0)}٪ اجراها</td></tr>)}
                </tbody></table>
              </Section>
            </>
          )}
        </>
      )}
      {st.simulations.length > 0 && (
        <Section title="نتایج ذخیره‌شدهٔ قبلی" flush>
          <table className="ex-lines"><thead><tr><th>زمان</th><th className="num">تکرار</th><th>دانه</th><th>P50</th><th>P80</th><th>P90</th></tr></thead><tbody>
            {st.simulations.map((s) => { const r = s.result as unknown as McResult; return <tr key={s.id}><td className="sub">{new Date(s.createdAt).toLocaleString('fa-IR')}</td><td className="num">{fa(s.iterations)}</td><td>{s.seed}</td><td>{d(r.finish?.p50 ?? null)}</td><td>{d(r.finish?.p80 ?? null)}</td><td>{d(r.finish?.p90 ?? null)}</td></tr> })}
          </tbody></table>
        </Section>
      )}
    </div>
  )
}
