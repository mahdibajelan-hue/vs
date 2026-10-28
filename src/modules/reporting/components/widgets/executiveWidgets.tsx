import { computeProjectKpis, computeSCurve, type SCurvePoint } from '../../../../lib/progress'
import { SCurveChart } from '../../../../components/Reports/SCurveChart'
import { computeExposureKpi } from '../../../risk/lib/riskAnalytics'
import { computeIssueMetrics } from '../../../issues/lib/issueAnalytics'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, KpiCard } from '../ui'

interface ExecOverviewData {
  progressPercent: number | null
  /** where the progress came from: the project dashboard engine, or the legacy PipePulse lines */
  progressSource?: 'metrics' | 'pipepulse' | null
  plannedPercent?: number | null
  completedLines: number | null
  lineCount: number | null
  riskExposureCurrent: number | null
  riskImprovementPercent: number | null
  openRiskCount: number | null
  openIssues: number | null
  totalIssues: number | null
  onTimeRate: number | null
}

export const execOverviewWidget: WidgetDefinition<ExecOverviewData> = {
  id: 'exec-overview',
  label: 'شاخص‌های کلیدی اجرایی',
  category: 'executive',
  description: 'خلاصه پیشرفت، ریسک و مسائل در چهار کارت وضعیت',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle, metrics }) => {
    const kpis = !metrics && bundle.pipepulse ? computeProjectKpis(bundle.pipepulse.project) : null
    const exposure = bundle.risk ? computeExposureKpi(bundle.risk.risks, bundle.risk.assessments) : null
    const issueMetrics = bundle.issues ? computeIssueMetrics(bundle.issues.issues) : null
    return {
      progressPercent: metrics ? Math.round(metrics.lifecycle.actual * 10) / 10 : kpis?.overallPercent ?? null,
      progressSource: metrics ? 'metrics' : kpis ? 'pipepulse' : null,
      plannedPercent: metrics ? Math.round(metrics.lifecycle.planned * 10) / 10 : null,
      completedLines: kpis?.completedLines ?? null,
      lineCount: kpis?.lineCount ?? null,
      riskExposureCurrent: exposure?.current ?? null,
      riskImprovementPercent: exposure?.improvementPercent ?? null,
      openRiskCount: bundle.risk ? bundle.risk.risks.filter((r) => r.status !== 'closed').length : null,
      openIssues: issueMetrics ? issueMetrics.total - issueMetrics.closedCount : null,
      totalIssues: issueMetrics?.total ?? null,
      onTimeRate: issueMetrics?.onTimeRate ?? null,
    }
  },
  Render: ({ data }) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label={data.progressSource === 'pipepulse' ? 'پیشرفت خطوط (PipePulse)' : 'پیشرفت چرخهٔ عمر'}
        value={data.progressPercent === null ? '—' : `${data.progressPercent}%`}
        sublabel={data.plannedPercent != null ? `برنامه ${data.plannedPercent}% · ${data.plannedPercent - data.progressPercent! > 0 ? `${Math.round((data.plannedPercent - data.progressPercent!) * 10) / 10} واحد عقب` : 'هم‌پای برنامه'}` : data.lineCount === null ? undefined : `${data.completedLines} از ${data.lineCount} خط تکمیل`}
        // tone only against the plan (council thresholds: ≥ 8 behind material, ≥ 3 watch) — never from the absolute percentage
        tone={data.plannedPercent == null || data.progressPercent == null ? 'neutral' : data.plannedPercent - data.progressPercent >= 8 ? 'critical' : data.plannedPercent - data.progressPercent >= 3 ? 'attention' : 'good'}
      />
      <KpiCard
        label="اکسپوژر ریسک فعلی"
        value={data.riskExposureCurrent === null ? '—' : data.riskExposureCurrent}
        sublabel={data.openRiskCount === null ? undefined : `${data.openRiskCount} ریسک باز`}
        trend={data.riskImprovementPercent === null ? undefined : `${data.riskImprovementPercent}% نسبت به شروع`}
        tone={data.riskImprovementPercent === null ? 'neutral' : data.riskImprovementPercent >= 0 ? 'good' : 'critical'}
      />
      <KpiCard
        label="مسائل باز"
        value={data.openIssues === null ? '—' : data.openIssues}
        sublabel={data.totalIssues === null ? undefined : `از مجموع ${data.totalIssues} مسئله`}
        tone={data.openIssues === null ? 'neutral' : data.openIssues === 0 ? 'good' : 'attention'}
      />
      <KpiCard
        label="نرخ پیگیری به‌موقع مسائل"
        value={data.onTimeRate === null ? '—' : `${data.onTimeRate}%`}
        tone={data.onTimeRate === null ? 'neutral' : data.onTimeRate >= 70 ? 'good' : data.onTimeRate >= 40 ? 'attention' : 'critical'}
      />
    </div>
  ),
}

export const execSCurveWidget: WidgetDefinition<SCurvePoint[] | null> = {
  id: 'exec-scurve',
  label: 'نمودار S-Curve پیشرفت',
  category: 'executive',
  description: 'مقایسه پیشرفت برنامه‌ای و واقعی پروژه',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.pipepulse ? computeSCurve(bundle.pipepulse.project) : null),
  Render: ({ data }) =>
    data === null ? (
      <EmptyWidgetState text="پروژه به PipePulse نگاشت نشده است" />
    ) : (
      <div style={{ height: 240 }}>
        <SCurveChart data={data} />
      </div>
    ),
}
