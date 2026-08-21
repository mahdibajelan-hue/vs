import { computeLevelDistribution, computeTopRisks, type TopRiskRow } from '../../../risk/lib/riskAnalytics'
import { RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, type RiskLevel } from '../../../risk/lib/riskScore'
import { RiskHeatMap } from '../../../risk/components/RiskHeatMap'
import type { RmRisk, RmRiskAssessment } from '../../../risk/types'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, ToneBadge, UnmappedNotice } from '../ui'

export const riskHeatmapWidget: WidgetDefinition<{ risks: RmRisk[]; assessments: RmRiskAssessment[] } | null> = {
  id: 'risk-heatmap',
  label: 'نقشه حرارتی ریسک',
  category: 'risk',
  description: 'شبکه ۵×۵ احتمال × شدت پیامد',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.risk ? { risks: bundle.risk.risks, assessments: bundle.risk.assessments } : null),
  Render: ({ data }) =>
    data === null ? (
      <UnmappedNotice moduleLabel="مدیریت ریسک" />
    ) : (
      <RiskHeatMap risks={data.risks} assessments={data.assessments} activeCell={null} onCellClick={() => {}} />
    ),
}

export const riskTopWidget: WidgetDefinition<TopRiskRow[] | null> = {
  id: 'risk-top',
  label: 'ریسک‌های برتر',
  category: 'risk',
  description: '۵ ریسک با بالاترین امتیاز فعلی',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.risk ? computeTopRisks(bundle.risk.risks, bundle.risk.assessments, bundle.risk.actions, 5) : null),
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="مدیریت ریسک" />
    if (data.length === 0) return <EmptyWidgetState text="ریسک بازی ثبت نشده است" />
    return (
      <div className="space-y-1.5">
        {data.map((row) => (
          <div key={row.risk.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{row.risk.title}</p>
              <p className="text-[10px] text-muted">{row.risk.code}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] font-bold" style={{ color: RISK_LEVEL_COLOR[row.level] }}>
                {row.score}
              </span>
              <ToneBadge tone={row.level === 'critical' ? 'critical' : row.level === 'high' ? 'attention' : 'good'} label={RISK_LEVEL_LABEL_FA[row.level]} />
            </div>
          </div>
        ))}
      </div>
    )
  },
}

export const riskDistributionWidget: WidgetDefinition<Record<RiskLevel, number> | null> = {
  id: 'risk-distribution',
  label: 'توزیع سطح ریسک',
  category: 'risk',
  description: 'تعداد ریسک‌های باز به تفکیک سطح فعلی',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.risk ? computeLevelDistribution(bundle.risk.risks, bundle.risk.assessments) : null),
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="مدیریت ریسک" />
    const total = Object.values(data).reduce((s, n) => s + n, 0)
    if (total === 0) return <EmptyWidgetState text="ریسک باز فعالی وجود ندارد" />
    return (
      <div className="space-y-2">
        {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((lvl) => {
          const count = data[lvl]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={lvl}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-secondary">{RISK_LEVEL_LABEL_FA[lvl]}</span>
                <span className="text-muted">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: RISK_LEVEL_COLOR[lvl] }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  },
}
