import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTip, PB, axisProps, gridProps } from '../../finance/components/charts'
import { jalaliText } from '../lib/periods'
import type { CurvePoint } from '../lib/progress'

/** Planned vs. approved vs. registered physical progress, weekly. */
export function ProgressCurve({ data, h = 260 }: { data: CurvePoint[]; h?: number }) {
  const rows = data.map((p) => ({ d: jalaliText(p.date), planned: p.planned == null ? null : +(p.planned * 100).toFixed(2), actual: +(p.actual * 100).toFixed(2), registered: +(p.registered * 100).toFixed(2) }))
  if (rows.length < 2) return <p className="im-helper" style={{ margin: '24px 12px', textAlign: 'center' }}>برای رسم منحنی حداقل دو هفته داده لازم است.</p>
  return (
    <div style={{ height: h }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid {...gridProps} /><XAxis dataKey="d" {...axisProps} minTickGap={24} /><YAxis {...axisProps} width={38} domain={[0, 100]} unit="٪" />
        <Tooltip content={<ChartTip fmt={(v) => `${v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} />} /><Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="planned" name="برنامه" stroke={PB.slate} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey="registered" name="ثبت‌شده" stroke={PB.sky} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="actual" name="تأییدشده" stroke={PB.teal} dot={false} strokeWidth={3} />
      </LineChart>
    </ResponsiveContainer></div>
  )
}
