import { useId, useMemo } from 'react'
import { Network, PieChart, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { computeExposureTimeline } from '../../risk/lib/riskAnalytics'
import type { RmRisk, RmRiskAssessment } from '../../risk/types'
import { RankedBarChart, type ChartDatum } from '../../masterdata/components/RollupCharts'
import { computeDependencyImpacts, type ProjectDashboardSummary } from '../../reporting/lib/portfolioDashboard'
import type { MasterProject, ProjectDependency } from '../../masterdata/types'

/** The two widgets kept from the former reporting portfolio dashboard, which this module replaced (council review). */
const CAT = { strategic: '#a78bfa', risk: '#f97316' }

// Risk exposure trend — the one genuine time-series in this dashboard, built from real
// risk identification/review dates (riskAnalytics.computeExposureTimeline) — never fabricated.
// ---------------------------------------------------------------------------

export function RiskExposureTrendWidget({ risks, assessments }: { risks: RmRisk[]; assessments: RmRiskAssessment[] }) {
  const gradientId = useId()
  const points = useMemo(() => computeExposureTimeline(risks, assessments), [risks, assessments])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <TrendingUp size={12} style={{ color: CAT.risk }} /> روند مواجهه ریسک پورتفولیو
      </p>
      <p className="mb-2 text-[10px] leading-5 text-muted">مجموع امتیاز ریسک‌های فعال در هر تاریخ شناسایی یا بازبینی واقعی — فقط از سابقهٔ واقعی ساخته می‌شود.</p>
      {points.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-center text-[11px] text-muted">داده تاریخی کافی برای رسم روند ثبت نشده (نیاز به حداقل دو رویداد شناسایی/بازبینی ریسک)</div>
      ) : (
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CAT.risk} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CAT.risk} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={30} />
              <RTooltip
                contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: 'var(--text-secondary)' }}
                formatter={(value) => [value, 'مجموع امتیاز ریسک']}
              />
              <Area type="monotone" dataKey="totalExposure" stroke={CAT.risk} strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function DependencyWidget({
  dependencies,
  summaries,
  allProjects,
  onDrillProject,
}: {
  dependencies: ProjectDependency[]
  summaries: ProjectDashboardSummary[]
  allProjects: MasterProject[]
  onDrillProject: (id: string) => void
}) {
  const impacts = computeDependencyImpacts(dependencies, summaries)
  const fanIn = new Map<string, number>()
  for (const dep of dependencies) fanIn.set(dep.dependsOnProjectId, (fanIn.get(dep.dependsOnProjectId) ?? 0) + 1)
  const data: ChartDatum[] = [...fanIn.entries()].map(([id, count]) => ({
    key: id,
    label: allProjects.find((p) => p.id === id)?.officialName ?? '—',
    value: count,
    color: CAT.strategic,
  }))
  const atRisk = impacts.filter((i) => i.atRisk)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="وابستگی‌های بین‌پروژه‌ای" icon={<Network size={12} style={{ color: CAT.strategic }} />} data={data} unit="پروژه وابسته" onBarClick={onDrillProject} />
      {dependencies.length === 0 ? (
        <p className="mt-2 text-[10px] text-muted">هنوز هیچ وابستگی بین‌پروژه‌ای در شناسنامه پروژه‌ها ثبت نشده است.</p>
      ) : atRisk.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-bold text-red-300">وابستگی‌های در معرض ریسک تاخیر آبشاری:</p>
          {atRisk.map((i) => (
            <button
              key={i.dependency.id}
              onClick={() => onDrillProject(i.fromProject.id)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-right text-[11px] hover:bg-white/5"
            >
              <PieChart size={11} className="text-red-400" />
              {i.fromProject.officialName} ← وابسته به {i.onProject.officialName}
              {i.onProjectDaysLate != null && i.onProjectDaysLate > 0 && <span className="num text-muted">({i.onProjectDaysLate} روز تاخیر)</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-green-300">هیچ‌کدام از پروژه‌های مرجع وابستگی در وضعیت تاخیر یا ناسالم نیستند.</p>
      )}
    </div>
  )
}
