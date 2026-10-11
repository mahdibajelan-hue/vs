import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTip, PB, axisProps, gridProps } from '../../../finance/components/charts'
import type { AgingBucket, FunnelStage, Heat, OrderDeadline } from '../../lib/control/insights'
import { bn, fa } from './common'

const FUNNEL_COLORS = [PB.slate, PB.sky, PB.blue, PB.yellow, PB.teal, PB.green]

/** Supply funnel: each bar is the share of the requirement (by value) that reached that step, with the loss against the step before it. */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.value || 0
  if (!top) return <p className="im-helper" style={{ margin: '20px 0', textAlign: 'center' }}>نیازی برای نمایش ثبت نشده است.</p>
  return (
    <div className="mt-funnel" role="img" aria-label="قیف تأمین از نیاز تا مصرف">
      {stages.map((s, i) => {
        const w = Math.max(3, (s.value / top) * 100), prev = i ? stages[i - 1].value : s.value, drop = prev - s.value
        return (
          <div key={s.key} className="mt-funnel-row">
            <span className="mt-funnel-l">{s.label}</span>
            <div className="mt-funnel-t"><i style={{ width: `${w}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} /></div>
            <b>{bn(s.value)}</b><em>{fa((s.value / top) * 100)}٪</em>
            <small className={drop > top * 0.005 ? 'loss' : ''}>{i && drop > top * 0.005 ? `↓ ${bn(drop)}` : ''}</small>
          </div>
        )
      })}
    </div>
  )
}

const AGING_COLORS: Record<string, string> = { over: PB.coral, d30: PB.orange, d60: PB.yellow, d90: PB.sky, far: PB.teal, none: PB.slate }

/** Value still missing at site, grouped by how soon it is needed. */
export function AgingChart({ buckets }: { buckets: AgingBucket[] }) {
  const data = buckets.map((b) => ({ name: b.label, key: b.key, value: Math.round(b.value / 1e7) / 100, count: b.count }))
  if (!data.some((d) => d.count)) return <p className="im-helper" style={{ margin: '20px 0', textAlign: 'center' }}>کسری بازی وجود ندارد.</p>
  return (
    <div dir="ltr" style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 18, right: 6, left: 0, bottom: 0 }}>
      <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval={0} tick={{ fontSize: 10, fill: 'var(--im-muted)' }} /><YAxis {...axisProps} width={34} tickFormatter={(x: number) => fa(x)} />
      <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--im-text) 5%, transparent)' }} content={<ChartTip unit=" میلیارد" />} />
      <Bar dataKey="value" name="ارزش کسری" radius={[6, 6, 0, 0]}>{data.map((d) => <Cell key={d.key} fill={AGING_COLORS[d.key]} />)}<LabelList dataKey="count" position="top" formatter={(v) => (Number(v) ? `${fa(Number(v))} قلم` : '')} style={{ fontSize: 10, fill: 'var(--im-muted-2)' }} /></Bar>
    </BarChart></ResponsiveContainer></div>
  )
}

const heatColor = (r: number) => (r >= 0.95 ? PB.green : r >= 0.7 ? PB.teal : r >= 0.4 ? PB.yellow : r >= 0.15 ? PB.orange : PB.coral)

/** Station × material group: how much of each requirement has arrived. Cells without a requirement stay empty. */
export function HeatMap({ heat }: { heat: Heat }) {
  if (!heat.stations.length || !heat.groups.length) return <p className="im-helper" style={{ margin: '20px 0', textAlign: 'center' }}>داده‌ای برای نقشهٔ حرارتی نیست.</p>
  return (
    <div className="mt-heat-wrap">
      <div className="mt-heat" style={{ gridTemplateColumns: `minmax(90px, 1.2fr) repeat(${heat.groups.length}, minmax(54px, 1fr))` }}>
        <span />{heat.groups.map((g) => <span key={g.id} className="h">{g.title}</span>)}
        {heat.stations.flatMap((s) => [
          <span key={s} className="r">{s}</span>,
          ...heat.groups.map((g) => {
            const c = heat.cells.get(`${s}|${g.id}`)
            if (!c) return <span key={`${s}${g.id}`} className="c empty">·</span>
            const r = c.value ? c.covered / c.value : 0
            return <span key={`${s}${g.id}`} className="c" style={{ background: `color-mix(in srgb, ${heatColor(r)} 70%, var(--im-panel-2))` }} title={`${s} · ${g.title}: ${fa(r * 100)}٪ از ${bn(c.value)} میلیارد رسیده`}>{fa(r * 100)}٪</span>
          }),
        ])}
      </div>
      <div className="mt-heat-key"><span>کمتر</span>{[0.05, 0.3, 0.55, 0.8, 1].map((r) => <i key={r} style={{ background: heatColor(r) }} />)}<span>بیشتر رسیده</span></div>
    </div>
  )
}

/** Order-by calendar: items short of an order, bucketed by the last date an order still makes the need date. */
export function DeadlineChart({ rows }: { rows: OrderDeadline[] }) {
  const b = [
    { name: 'گذشته', test: (d: number) => d < 0, color: PB.coral }, { name: 'تا ۳۰ روز', test: (d: number) => d >= 0 && d <= 30, color: PB.orange },
    { name: '۳۱ تا ۶۰', test: (d: number) => d > 30 && d <= 60, color: PB.yellow }, { name: '۶۱ تا ۹۰', test: (d: number) => d > 60 && d <= 90, color: PB.sky }, { name: 'بعد از ۹۰', test: (d: number) => d > 90, color: PB.teal },
  ].map((x) => { const rs = rows.filter((r) => x.test(r.daysLeft)); return { name: x.name, color: x.color, count: rs.length, value: Math.round(rs.reduce((a, r) => a + r.gapValue, 0) / 1e7) / 100 } })
  if (!rows.length) return <p className="im-helper" style={{ margin: '20px 0', textAlign: 'center' }}>قلمی با نیاز به سفارش‌گذاری و زمان تأمین مشخص نیست.</p>
  return (
    <div dir="ltr" style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={b} margin={{ top: 18, right: 6, left: 0, bottom: 0 }}>
      <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval={0} /><YAxis {...axisProps} width={34} allowDecimals={false} tickFormatter={(x: number) => fa(x)} />
      <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--im-text) 5%, transparent)' }} content={<ChartTip unit=" قلم" />} />
      <Bar dataKey="count" name="تعداد قلم" radius={[6, 6, 0, 0]}>{b.map((d) => <Cell key={d.name} fill={d.color} />)}<LabelList dataKey="value" position="top" formatter={(v) => (Number(v) ? `${fa(Number(v), 1)} م` : '')} style={{ fontSize: 10, fill: 'var(--im-muted-2)' }} /></Bar>
    </BarChart></ResponsiveContainer></div>
  )
}

/** Bullet bars: achieved (fill) against plan (tick) and full scope (track), one per row. */
export function Bullets({ rows }: { rows: { label: string; actual: number; planned: number; note?: string }[] }) {
  if (!rows.length) return <p className="im-helper" style={{ margin: '20px 0', textAlign: 'center' }}>—</p>
  return (
    <div className="mt-bullets">
      {rows.map((r) => {
        const behind = r.planned - r.actual > 0.05
        return (
          <div key={r.label} className="mt-bullet">
            <span className="l">{r.label}</span>
            <div className="t" role="img" aria-label={`${r.label}: واقعی ${fa(r.actual * 100)}٪، برنامه ${fa(r.planned * 100)}٪`}>
              <i className="band" style={{ width: `${Math.min(100, r.planned * 100)}%` }} />
              <i className="v" style={{ width: `${Math.min(100, r.actual * 100)}%`, background: behind ? PB.coral : PB.teal }} />
              <u style={{ insetInlineStart: `${Math.min(100, r.planned * 100)}%` }} />
            </div>
            <b style={{ color: behind ? 'var(--im-coral)' : undefined }}>{fa(r.actual * 100)}٪</b>
            <small>{r.note ?? `برنامه ${fa(r.planned * 100)}٪`}</small>
          </div>
        )
      })}
    </div>
  )
}
