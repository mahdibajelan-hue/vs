import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { SCurvePoint } from '../../lib/progress'

export function ReportSCurveMini({ data }: { data: SCurvePoint[] }) {
  if (data.length === 0) return <p className="text-[10px] text-center py-6" style={{ color: '#94a3b8' }}>داده‌ای موجود نیست</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="reportActualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} unit="%" />
        <Area type="monotone" dataKey="actualPercent" name="واقعی" stroke="#0ea5e9" fill="url(#reportActualFill)" strokeWidth={2} />
        <Line type="monotone" dataKey="plannedPercent" name="برنامه‌ای" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
