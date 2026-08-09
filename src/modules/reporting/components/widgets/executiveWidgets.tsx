import { computeProjectKpis, computeSCurve, type SCurvePoint } from '../../../../lib/progress'
import { SCurveChart } from '../../../../components/Reports/SCurveChart'
import { computeExposureKpi } from '../../../risk/lib/riskAnalytics'
import { computeIssueMetrics } from '../../../issues/lib/issueAnalytics'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, KpiCard } from '../ui'

interface ExecOverviewData {
  progressPercent: number | null
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
  compute: ({ bundle }) => {
    const kpis = bundle.pipepulse ? computeProjectKpis(bundle.pipepulse.project) : null
    const exposure = bundle.risk ? computeExposureKpi(bundle.risk.risks, bundle.risk.assessments) : null
    const issueMetrics = bundle.issues ? computeIssueMetrics(bundle.issues.issues) : null
    return {
      progressPercent: kpis?.overallPercent ?? null,
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
        label="پیشرفت کلی پروژه"
        value={data.progressPercent === null ? '—' : `${data.progressPercent}%`}
        sublabel={data.lineCount === null ? undefined : `${data.completedLines} از ${data.lineCount} خط تکمیل`}
        tone={data.progressPercent === null ? 'neutral' : data.progressPercent >= 70 ? 'good' : data.progressPercent >= 40 ? 'attention' : 'critical'}
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
