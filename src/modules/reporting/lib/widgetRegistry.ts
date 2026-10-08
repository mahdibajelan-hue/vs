import { execOverviewWidget, execSCurveWidget } from '../components/widgets/executiveWidgets'
import { progressLinesWidget, progressMilestonesWidget } from '../components/widgets/progressWidgets'
import { riskDistributionWidget, riskHeatmapWidget, riskTopWidget } from '../components/widgets/riskWidgets'
import { issueAgingWidget, issueClosureWidget, issueLifecycleOriginWidget, issueTopWidget } from '../components/widgets/issueWidgets'
import { earlyWarningWidget, executiveInsightWidget, managementAttentionWidget, whatChangedWidget } from '../components/widgets/intelligenceWidgets'
import { decisionsRequiredWidget, managementActionsWidget } from '../components/widgets/decisionWidgets'
import type { ReportPayload, ReportType, WidgetCategory } from '../types'
import type { WidgetComputeContext, WidgetDefinition } from './widgetTypes'

/** Widget Registry (spec #34): every reporting widget in one place, keyed by id — the Report
 * Builder, the live renderer and the snapshot renderer all read from this single source instead
 * of hard-coding a widget list per report type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WIDGET_REGISTRY: WidgetDefinition<any>[] = [
  execOverviewWidget,
  execSCurveWidget,
  progressLinesWidget,
  progressMilestonesWidget,
  riskHeatmapWidget,
  riskTopWidget,
  riskDistributionWidget,
  issueTopWidget,
  issueClosureWidget,
  issueAgingWidget,
  issueLifecycleOriginWidget,
  whatChangedWidget,
  earlyWarningWidget,
  managementAttentionWidget,
  executiveInsightWidget,
  decisionsRequiredWidget,
  managementActionsWidget,
]

export const WIDGET_MAP = new Map(WIDGET_REGISTRY.map((w) => [w.id, w]))

export function getWidget(id: string) {
  return WIDGET_MAP.get(id)
}

/** Computes every widget's output once — the frozen payload a Report Snapshot stores. */
export function computeReportPayload(widgetIds: string[], ctx: WidgetComputeContext): ReportPayload {
  const payload: ReportPayload = {}
  for (const id of widgetIds) {
    const widget = getWidget(id)
    if (widget) payload[id] = widget.compute(ctx)
  }
  return payload
}

export function widgetsByCategory(): Record<WidgetCategory, typeof WIDGET_REGISTRY> {
  const map: Record<string, typeof WIDGET_REGISTRY> = {}
  for (const w of WIDGET_REGISTRY) {
    if (!map[w.category]) map[w.category] = []
    map[w.category].push(w)
  }
  return map as Record<WidgetCategory, typeof WIDGET_REGISTRY>
}

/** Seed widget lists for the 4 built-in report-type profiles — matches the spec's recommended
 * defaults per report type, scoped to widgets this implementation actually has data for. */
export const DEFAULT_PROFILE_WIDGETS: Record<ReportType, string[]> = {
  daily: ['exec-overview', 'progress-lines', 'risk-top', 'issue-top', 'intel-management-attention', 'decision-actions'],
  weekly: [
    'exec-overview',
    'exec-scurve',
    'progress-lines',
    'risk-heatmap',
    'risk-top',
    'issue-top',
    'issue-closure',
    'intel-what-changed',
    'intel-early-warning',
    'intel-management-attention',
    'decision-actions',
  ],
  monthly: [
    'exec-overview',
    'exec-scurve',
    'progress-lines',
    'progress-milestones',
    'risk-heatmap',
    'risk-distribution',
    'risk-top',
    'issue-closure',
    'issue-aging',
    'issue-top',
    'issue-lifecycle-origin',
    'intel-what-changed',
    'intel-early-warning',
    'intel-management-attention',
    'decision-required',
    'decision-actions',
  ],
  management: [
    'exec-overview',
    'exec-scurve',
    'progress-lines',
    'progress-milestones',
    'intel-early-warning',
    'risk-heatmap',
    'risk-distribution',
    'risk-top',
    'issue-closure',
    'issue-aging',
    'issue-top',
    'issue-lifecycle-origin',
    'intel-what-changed',
    'intel-management-attention',
    'intel-executive-insight',
    'decision-required',
    'decision-actions',
  ],
}
