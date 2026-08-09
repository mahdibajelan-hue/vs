import type { ComponentType } from 'react'
import type { Decision, RastaAction, ReportType, WidgetCategory } from '../types'
import type { ProjectIntelligenceBundle } from './dataAdapter'

export interface WidgetComputeContext {
  bundle: ProjectIntelligenceBundle
  /** Prior live fetch (or the most recent snapshot's recomputed bundle) — null when there's nothing to diff against. */
  previousBundle: ProjectIntelligenceBundle | null
  decisions: Decision[]
  actions: RastaAction[]
}

export interface WidgetDefinition<TData = unknown> {
  id: string
  label: string
  category: WidgetCategory
  description: string
  defaultReportTypes: ReportType[]
  /** Pure: same inputs -> same JSON-serializable output. Runs live, or once at snapshot generation time. */
  compute: (ctx: WidgetComputeContext) => TData
  Render: ComponentType<{ data: TData }>
}
