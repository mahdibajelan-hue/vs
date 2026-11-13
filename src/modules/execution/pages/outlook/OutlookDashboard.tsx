import { useMemo, type CSSProperties } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, CircleDashed, CircleDot, Gauge, LineChart, Minus, Plus, ShieldCheck, Users } from 'lucide-react'
import type { OutlookCtx } from '../../lib/useOutlook'
import { WD_PRESETS } from '../../lib/useOutlook'
import { plannedOverall } from '../../lib/progress'
import { addDays, jalaliText, weekdayOf } from '../../lib/periods'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { PB, axisProps, gridProps } from '../../../finance/components/charts'
import { CountUp, CountdownHero, OlCard, OlHead } from '../../components/outlook/olUi'
import { GUIDE_STEPS } from './OutlookGuide'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const pp = (x: number, d = 2) => `${(x * 100).toLocaleString('fa-IR', { maximumFractionDigits: d })}٪`

export function OutlookDashboard({ ctx, onGo }: { ctx: OutlookCtx; onGo: (sub: string) => void }) {
  const { m, o, base, delta, setDelta, wdIdx, setWdIdx, workDays, setup } = ctx
  const chart = useMemo(() => {
    const plan = (d: string) => plannedOverall({ activities: m.activities, baselines: m.baselines, blines: m.blines, asOf: d, groupWeights: m.settings.groupWeights }).overall
    const hist = m.curve.filter((p) => p.date < m.today).map((p) => ({ d: jalaliText(p.date), actual: +(p.actual * 100).toFixed(2), planned: p.planned == null ? null : +(p.planned * 100).toFixed(2), exp: null as number | null, band: null as [number, number] | null }))
    const fut = o.curve.map((p, i) => { const pl = plan(p.date); return { d: jalaliText(p.date), actual: i === 0 ? +(p.expected * 100).toFixed(2) : null, planned: pl == null ? null : +(pl * 100).toFixed(2), exp: +(p.expected * 100).toFixed(2), band: [+(p.low * 100).toFixed(2), +(p.high * 100).toFixed(2)] as [number, number] } })
    return [...hist, ...fut]
  }, [m, o.curve])

  const plannedFinish = m.activities.filter((a) => a.active && a.approval === 'approved' && a.plannedEnd).map((a) => a.plannedEnd as string).sort().pop() ?? null
  const finish = o.finish ?? o.finishKnown
  const wdLeft = useMemo(() => { if (!finish) return null; let c = 0; for (let d = addDays(m.today, 1); d <= finish; d = addDays(d, 1)) if (workDays.includes(weekdayOf(d))) c++; return c }, [finish, m.today, workDays])
  const week = o.curve.find((p) => p.date >= addDays(m.today, 7))
  const gain7 = week ? week.expected - o.curve[0].expected : null
  const months3 = o.monthly.slice(0, 3)
  const avgMonth = months3.length ? months3.reduce((s, x) => s + x.gain, 0) / months3.length : null
  const bt = o.activities.map((a) => a.model?.backtest).filter((b): b is NonNullable<typeof b> => !!b)
  const btErr = bt.length ? bt.reduce((s, b) => s + Math.min(b.modelErrPct ?? 0, b.naiveErrPct ?? 0), 0) / bt.length : null
  const done = setup.filter((s) => s.state === 'done').length
  const anyDelta = Object.values(delta).some(Boolean) || wdIdx > 0
  const scenarioShift = o.finish && base.finish ? Math.round((Date.parse(o.finish) - Date.parse(base.finish)) / 86400000) : null

  return (
    <div className="olx-grid">
      <div className="olx-top">
        <CountdownHero today={m.today} finish={finish} p10={o.finishP10} p90={o.finishP90} planned={plannedFinish} workDaysLeft={wdLeft} lowerBound={!o.finish && !!o.finishKnown} />
        <div className="olx-stats">
          <div className="olx-stat" style={{ '--c': '#14b8a6', '--i': 1 } as CSSProperties}><span className="olx-stat-ico"><Gauge size={16} aria-hidden /></span><small>پیشرفت مورد انتظار در ماه</small><b>{avgMonth == null ? '—' : <><CountUp value={avgMonth * 100} digits={1} />٪</>}</b><em>پیشرفت فعلی {pp(o.curve[0]?.expected ?? 0, 1)}</em></div>
          <div className="olx-stat" style={{ '--c': '#0ea5e9', '--i': 2 } as CSSProperties}><span className="olx-stat-ico"><CalendarDays size={16} aria-hidden /></span><small>هفتهٔ آینده</small><b>{gain7 == null ? '—' : <><CountUp value={gain7 * 100} digits={2} />٪</>}</b><em>{anyDelta && scenarioShift != null ? (scenarioShift === 0 ? 'سناریو تاریخ اتمام را تغییر نمی‌دهد' : `سناریو: اتمام ${fa(Math.abs(scenarioShift))} روز ${scenarioShift < 0 ? 'زودتر' : 'دیرتر'}`) : 'با اکیپ‌ها و هوای فعلی'}</em></div>
          <div className="olx-stat" style={{ '--c': '#a855f7', '--i': 3 } as CSSProperties}><span className="olx-stat-ico"><ShieldCheck size={16} aria-hidden /></span><small>پشتوانهٔ پیش‌بینی</small><b><CountUp value={o.historyDays} /> <span className="olx-stat-u">روز گزارش</span></b><em>{btErr != null ? `خطای روزانهٔ هر فعالیت ≈ ${fa(btErr)}٪` : 'پس‌آزمون از ۸ روز کارکرد'}{o.unforecastable ? ` · ${fa(o.unforecastable)} فعالیت بی‌تاریخ` : ''}</em></div>
        </div>
      </div>

      {done < setup.length && (
        <OlCard i={1} className="olx-setup">
          <div className="olx-setup-h"><b>راه‌اندازی پیش‌بینی: {fa(done)} از {fa(setup.length)} گام</b><button type="button" className="olx-link" onClick={() => onGo('guide')}>راهنمای گام‌به‌گام <ArrowLeft size={14} aria-hidden /></button></div>
          <div className="olx-setup-steps">
            {setup.map((s) => { const g = GUIDE_STEPS.find((x) => x.setup === s.key)!; const I = s.state === 'done' ? CheckCircle2 : s.state === 'partial' ? CircleDot : CircleDashed; return (
              <button key={s.key} type="button" className={`olx-setup-step is-${s.state}`} style={{ '--c': g.color } as CSSProperties} onClick={() => onGo(g.go)}>
                <I size={16} aria-hidden /><span><b>{g.short}</b><small>{s.note}</small></span>
              </button>
            ) })}
          </div>
        </OlCard>
      )}

      <OlCard i={2}>
        <OlHead icon={Users} color="#f97316" title="سناریوی اکیپ‌ها" hint="اکیپ کامل اضافه یا کم کنید و اثرش را روی تاریخ اتمام ببینید. ترکیب اکیپ‌ها در «تعاریف و تنظیمات» تعیین می‌شود."
          action={anyDelta ? <button type="button" className="olx-btn" onClick={() => { setDelta({}); setWdIdx(0) }}>بازگشت به روند فعلی</button> : undefined} />
        <div className="olx-crews">
          {o.crews.filter((c) => c.activities > 0).map((c) => {
            const d = delta[c.crew] ?? 0, recent = c.recent ?? 0
            return (
              <div key={c.crew} className={`olx-crew${d ? ' is-changed' : ''}`}>
                <div className="olx-crew-t"><b>{c.crew}</b><small>{fa(c.activities)} فعالیت{c.finish ? ` · پایان کارها ${jalaliText(c.finish)}` : ''}</small></div>
                <div className="olx-step" role="group" aria-label={`تعداد اکیپ کامل ${c.crew}`}>
                  <button type="button" onClick={() => setDelta((x) => ({ ...x, [c.crew]: Math.max(-recent, d - 1) }))} disabled={recent + d <= 0} aria-label="یک اکیپ کامل کمتر"><Minus size={15} /></button>
                  <b>{fa(recent + d, 1)}</b>
                  <button type="button" onClick={() => setDelta((x) => ({ ...x, [c.crew]: d + 1 }))} aria-label="یک اکیپ کامل بیشتر"><Plus size={15} /></button>
                </div>
                {d !== 0 && <span className={`olx-pill ${d > 0 ? 'is-good' : 'is-warn'}`}>{d > 0 ? `+${fa(d)}` : fa(d)} اکیپ</span>}
              </div>
            )
          })}
          <label className="olx-crew olx-wd"><div className="olx-crew-t"><b>روزهای کاری</b><small>سناریو؛ تقویم اصلی در تنظیمات پروژه</small></div>
            <select className="im-select" value={wdIdx} onChange={(e) => setWdIdx(+e.target.value)}>{WD_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}{i === 0 ? ` (${fa(m.settings.workDays.length)} روز)` : ''}</option>)}</select>
          </label>
        </div>
      </OlCard>

      <OlCard i={3}>
        <OlHead icon={LineChart} color="#8b5cf6" title="پیشرفت فیزیکی: گذشته، برنامه و پیش‌بینی" hint="خط سبزآبی: تأییدشده تا امروز · خط‌چین: برنامه · بنفش: پیش‌بینی · نوار: بازهٔ ۸۰٪" />
        <div style={{ height: 300 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs><linearGradient id="olx-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a855f7" stopOpacity={0.32} /><stop offset="1" stopColor="#a855f7" stopOpacity={0.06} /></linearGradient></defs>
            <CartesianGrid {...gridProps} /><XAxis dataKey="d" {...axisProps} minTickGap={28} /><YAxis {...axisProps} width={38} domain={[0, 100]} unit="٪" />
            <Tooltip formatter={(v: unknown) => (Array.isArray(v) ? `${(+v[0]).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪ تا ${(+v[1]).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪` : `${(+(v as number)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`)} contentStyle={{ background: 'var(--im-panel)', border: '1px solid var(--im-line)', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="band" name="بازهٔ ۸۰٪" stroke="none" fill="url(#olx-band)" connectNulls animationDuration={900} />
            <Line type="monotone" dataKey="planned" name="برنامه" stroke={PB.slate} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls animationDuration={900} />
            <Line type="monotone" dataKey="actual" name="تأییدشده" stroke={PB.teal} dot={false} strokeWidth={3} connectNulls animationDuration={900} />
            <Line type="monotone" dataKey="exp" name="پیش‌بینی" stroke="#a855f7" dot={false} strokeWidth={2.6} connectNulls animationDuration={1100} />
          </ComposedChart>
        </ResponsiveContainer></div>
      </OlCard>

      {o.monthly.length > 0 && (
        <OlCard i={4}>
          <OlHead icon={BarChart3} color="#14b8a6" title="پیشرفت ماه‌های آینده" hint="با اکیپ و هوای ثابت تقریباً ثابت می‌ماند؛ تفاوت ماه‌ها از هوای فصل، روزهای کاری ماه و پایان کار اکیپ‌هاست." />
          <div className="olx-months">
            {(() => { const list = o.monthly.slice(0, 6), max = Math.max(...list.map((y) => y.gain), 1e-9); return list.map((x, k) => (
              <div key={x.key} className="olx-mo" style={{ '--h': `${Math.max(4, (x.gain / max) * 100)}%`, '--i': k } as CSSProperties}><b>{pp(x.gain, 1)}</b><i /><span>{JALALI_MONTHS[x.jm - 1]}</span></div>
            )) })()}
          </div>
        </OlCard>
      )}
    </div>
  )
}
