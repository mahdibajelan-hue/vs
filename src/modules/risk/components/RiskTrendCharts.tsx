import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatJalali } from '../../../lib/jalali'
import type { ExposurePoint } from '../lib/riskAnalytics'
import { RM_CATEGORY_LABEL_FA, RM_PROJECT_PHASE_LABEL_FA, RM_RISK_STATUS_COLOR, RM_RISK_STATUS_LABEL_FA, type RmRiskCategory, type RmRiskStatus, type RmProjectPhase } from '../types'

const TOOLTIP_STYLE = {
  background: 'var(--bg-panel-solid)',
  border: '1px solid var(--border-soft)',
  borderRadius: 10,
  fontSize: 12,
}

function EmptyState() {
  return <div className="flex h-full items-center justify-center text-xs text-muted">داده‌ای برای نمایش موجود نیست</div>
}

export function ExposureTrendChart({ data }: { data: ExposurePoint[] }) {
  if (data.length < 2) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="rmExposureFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e74c3c" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#e74c3c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="date" tickFormatter={formatJalali} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <Tooltip labelFormatter={(l) => (typeof l === 'string' ? formatJalali(l) : l)} contentStyle={TOOLTIP_STYLE} />
        <Area type="monotone" dataKey="totalExposure" name="مواجهه کل ریسک" stroke="#e74c3c" fill="url(#rmExposureFill)" strokeWidth={2.5} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CriticalTrendChart({ data }: { data: ExposurePoint[] }) {
  if (data.length < 2) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="date" tickFormatter={formatJalali} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <Tooltip labelFormatter={(l) => (typeof l === 'string' ? formatJalali(l) : l)} contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="criticalCount" name="تعداد ریسک بحرانی" stroke="#c0392b" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryDistributionChart({ data }: { data: { category: RmRiskCategory; count: number }[] }) {
  if (data.length === 0) return <EmptyState />
  const chartData = data.map((d) => ({ name: RM_CATEGORY_LABEL_FA[d.category], count: d.count }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Bar dataKey="count" name="تعداد ریسک" fill="#3498db" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PhaseDistributionChart({ data }: { data: { phase: RmProjectPhase | 'unspecified'; count: number }[] }) {
  if (data.length === 0) return <EmptyState />
  const label = (p: RmProjectPhase | 'unspecified') => (p === 'unspecified' ? 'نامشخص' : RM_PROJECT_PHASE_LABEL_FA[p])
  const chartData = data.map((d) => ({ name: label(d.phase), count: d.count }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Bar dataKey="count" name="تعداد ریسک" fill="#a78bfa" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StatusDistributionChart({ data }: { data: Record<RmRiskStatus, number> }) {
  const chartData = (Object.keys(data) as RmRiskStatus[]).map((status) => ({ status, name: RM_RISK_STATUS_LABEL_FA[status], count: data[status] }))
  if (chartData.every((d) => d.count === 0)) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Bar dataKey="count" name="تعداد" radius={[6, 6, 0, 0]}>
          {chartData.map((d) => (
            <Cell key={d.status} fill={RM_RISK_STATUS_COLOR[d.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function WeeklyIdentificationChart({ data }: { data: { weekStart: string; count: number }[] }) {
  if (data.length < 2) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="weekStart" tickFormatter={formatJalali} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <Tooltip labelFormatter={(l) => (typeof l === 'string' ? formatJalali(l) : l)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Bar dataKey="count" name="ریسک شناسایی‌شده" fill="#e74c3c" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
