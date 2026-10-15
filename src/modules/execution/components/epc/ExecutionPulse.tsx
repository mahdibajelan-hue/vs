import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { motion, useReducedMotion } from 'framer-motion'
import { ChartTip, PB, axisProps, gridProps } from '../../../finance/components/charts'
import type { ExecutionModel } from '../../lib/useExecutionModel'
import { cumulative, physicalProgress } from '../../lib/progress'
import { forecast } from '../../lib/forecast'
import { metricTotals } from '../../lib/engine/aggregate'
import { addDays, daysBetween, jalaliText } from '../../lib/periods'
import { fa, pct } from '../common'

/**
 * Plan versus actual over time, driven only by the stored curve (weekly points) and approved quantities. «Play» moves the cursor through the real dates;
 * the dashed projection after today is a straight continuation of the recent pace, labelled as such — it is not part of the actual record.
 */
export function ExecutionPulse({ m, kind }: { m: ExecutionModel; kind: 'pipeline' | 'station' | 'all' }) {
  const reduce = useReducedMotion()
  const pts = m.curve
  const [idx, setIdx] = useState(Math.max(0, pts.length - 1))
  const [play, setPlay] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => { setIdx(Math.max(0, pts.length - 1)) }, [pts.length, m.projectId])
  useEffect(() => {
    if (!play) return
    timer.current = window.setInterval(() => setIdx((i) => { if (i >= pts.length - 1) { setPlay(false); return i } return i + 1 }), reduce ? 60 : 450)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [play, pts.length, reduce])
  const fc = useMemo(() => forecast({ curve: m.curve, actual: m.approved.overall, planned: m.planned.overall, activities: m.activities, today: m.today }), [m])
  const cur = pts[Math.min(idx, pts.length - 1)]
  const date = cur?.date ?? m.today
  const atDate = useMemo(() => physicalProgress({ activities: m.activities, baselines: m.baselines, blines: m.blines, reports: m.reports, lines: m.lines, asOf: date, mode: 'approved', groupWeights: m.settings.groupWeights }), [m, date])
  const metrics = useMemo(() => {
    const cum = cumulative(m.reports, m.lines, { until: date, mode: 'approved' })
    const all = metricTotals(m.activities.filter((a) => a.active && a.approval === 'approved').map((a) => ({ id: a.id, metric: a.metric, baseQty: m.baseOf(a, date), unit: a.unit })), cum)
    const pipeline = new Set(['weld_joint', 'rt_joint', 'coat_joint', 'pipe_m', 'excavation_m', 'lowering_m', 'backfill_m', 'reinstate_m', 'bend_count', 'hydrotest_m'])
    return all.filter((x) => (kind === 'all' ? true : kind === 'pipeline' ? pipeline.has(x.key) : !pipeline.has(x.key)))
  }, [m, date, kind])
  const stalled = useMemo(() => atDate.rows.filter((r) => r.activity.plannedEnd && r.activity.plannedEnd < date && r.pct < 1).sort((a, b) => a.pct - b.pct).slice(0, 5), [atDate, date])
  const data = useMemo(() => {
    const rows = pts.map((p) => ({ d: p.date, label: jalaliText(p.date), planned: p.planned == null ? null : +(p.planned * 100).toFixed(2), actual: +(p.actual * 100).toFixed(2), proj: null as number | null }))
    if (fc.ratePerDay && pts.length) {
      const last = pts[pts.length - 1], end = fc.forecastFinish ?? addDays(last.date, 56)
      const span = Math.min(daysBetween(last.date, end), 120)
      rows[rows.length - 1].proj = +(last.actual * 100).toFixed(2)
      for (let k = 7; k <= span; k += 7) { const d = addDays(last.date, k); rows.push({ d, label: jalaliText(d), planned: null, actual: null as unknown as number, proj: Math.min(100, +((last.actual + fc.ratePerDay * k) * 100).toFixed(2)) }) }
    }
    return rows
  }, [pts, fc])
  if (pts.length < 2) return <p className="im-helper" style={{ margin: 16, textAlign: 'center' }}>برای نمایش روند حداقل دو هفته داده (برنامه و کارکرد تأییدشده) لازم است.</p>
  const planned = cur.planned, actual = cur.actual, dev = planned == null ? null : actual - planned
  const lane = (label: string, v: number | null, color: string) => (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{label}</span><b>{v == null ? '—' : pct(v, 1)}</b></div>
      <div style={{ height: 12, borderRadius: 8, background: 'rgba(148,163,184,.18)', overflow: 'hidden' }}>
        <motion.div initial={false} animate={{ width: `${Math.min(100, (v ?? 0) * 100)}%` }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }} style={{ height: '100%', background: color, borderRadius: 8 }} />
      </div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="im-btn im-btn-sm" onClick={() => { if (idx >= pts.length - 1) setIdx(0); setPlay(!play) }} aria-label={play ? 'توقف' : 'پخش'}>{play ? <Pause size={13} /> : <Play size={13} />} {play ? 'توقف' : 'پخش روند'}</button>
        <input type="range" min={0} max={pts.length - 1} value={idx} onChange={(e) => { setPlay(false); setIdx(Number(e.target.value)) }} style={{ flex: 1, minWidth: 180 }} aria-label="تاریخ" />
        <b>{jalaliText(date)}</b>
        {date !== pts[pts.length - 1].date && <button className="im-btn im-btn-sm" onClick={() => { setPlay(false); setIdx(pts.length - 1) }}>امروز</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 14 }} className="mt-two">
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          {lane('برنامه', planned, PB.slate)}
          {lane('واقعی (تأییدشده)', actual, PB.teal)}
          <div className="im-helper" style={{ margin: 0 }}>انحراف در این تاریخ: <b style={{ color: dev != null && dev < -0.05 ? 'var(--im-coral)' : undefined }}>{dev == null ? '—' : `${dev > 0 ? '+' : ''}${(dev * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`}</b>{fc.slipDays != null && date === pts[pts.length - 1].date ? ` · پایان پیش‌بینی ${fc.forecastFinish ? jalaliText(fc.forecastFinish) : '—'} (${fc.slipDays > 0 ? '+' : ''}${fa(fc.slipDays)} روز نسبت به برنامه)` : ''}</div>
        </div>
        <div style={{ height: 210 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} minTickGap={28} /><YAxis {...axisProps} width={36} domain={[0, 100]} unit="٪" />
            <Tooltip content={<ChartTip fmt={(v) => `${v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} />} />
            <Area type="monotone" dataKey="actual" name="واقعی" stroke={PB.teal} fill={PB.teal} fillOpacity={0.12} strokeWidth={2.5} isAnimationActive={!reduce} connectNulls={false} />
            <Line type="monotone" dataKey="planned" name="برنامه" stroke={PB.slate} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls isAnimationActive={!reduce} />
            <Line type="monotone" dataKey="proj" name="ادامهٔ روند اخیر (برآورد)" stroke={PB.sky} strokeDasharray="2 4" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
            <ReferenceLine x={jalaliText(date)} stroke="#f97316" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer></div>
      </div>
      {metrics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {metrics.slice(0, 8).map((x) => (
            <div key={x.key} className="im-card" style={{ padding: '10px 12px', display: 'grid', gap: 4 }}>
              <small style={{ color: 'var(--im-muted)' }}>{x.label}</small>
              <b style={{ fontSize: 18 }}>{fa(x.done, 0)} <small style={{ fontWeight: 400 }}>{x.unit}</small></b>
              <div style={{ height: 6, borderRadius: 6, background: 'rgba(148,163,184,.2)' }}><motion.div initial={false} animate={{ width: `${x.pct * 100}%` }} transition={reduce ? { duration: 0 } : { duration: 0.5 }} style={{ height: '100%', background: PB.teal, borderRadius: 6 }} /></div>
              <small>باقیمانده {fa(x.remaining, 0)} از {fa(x.base, 0)} · {pct(x.pct, 0)}</small>
            </div>))}
        </div>)}
      {stalled.length > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}><b>فعالیت‌های عقب‌افتاده در این تاریخ:</b> {stalled.map((r) => `${r.activity.title} (${pct(r.pct, 0)})`).join('، ')}</div>}
      <p className="im-helper" style={{ margin: 0 }}>مبنای محاسبه: کارکرد تجمعی تأییدشدهٔ نظارت ÷ مقدار مبنا، وزنی در هر مبنای وزن‌دهی؛ برنامه خطی بین شروع و پایان هر فعالیت. خط‌چین آبی صرفاً ادامهٔ خطی نرخ ۲۸ روز اخیر است و بخشی از سوابق واقعی نیست.</p>
    </div>
  )
}
