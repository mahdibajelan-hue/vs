import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { WeldsBySize } from '../../lib/progress'

export function ReportWeldsMini({ data }: { data: WeldsBySize[] }) {
  if (data.length === 0) return <p className="text-[10px] text-center py-6" style={{ color: '#94a3b8' }}>داده‌ای موجود نیست</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="size" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} allowDecimals={false} />
        <Bar dataKey="count" name="سرجوش" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
