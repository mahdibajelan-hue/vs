import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { REPORT_TYPES, REPORT_TYPE_LABEL_FA, type ReportType } from '../types'
import { EMPTY_ARRAY, useReportingStore } from '../store/useReportingStore'
import { useProjectIntelligence } from '../lib/useProjectIntelligence'
import { DEFAULT_PROFILE_WIDGETS } from '../lib/widgetRegistry'
import { WidgetGrid } from '../components/WidgetGrid'
import type { WidgetComputeContext } from '../lib/widgetTypes'

export function DashboardPage({ masterProjectId }: { masterProjectId: string }) {
  const [reportType, setReportType] = useState<ReportType>('management')
  const { bundle, previousBundle, loading } = useProjectIntelligence(masterProjectId)
  const decisions = useReportingStore((s) => s.decisionsByProject[masterProjectId] ?? EMPTY_ARRAY)
  const actions = useReportingStore((s) => s.actionsByProject[masterProjectId] ?? EMPTY_ARRAY)

  if (loading || !bundle) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={22} className="animate-spin text-brand-400" />
      </div>
    )
  }

  const ctx: WidgetComputeContext = { bundle, previousBundle, decisions, actions }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt}
            onClick={() => setReportType(rt)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              reportType === rt ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'
            }`}
          >
            {REPORT_TYPE_LABEL_FA[rt]}
          </button>
        ))}
      </div>
      <WidgetGrid widgetIds={DEFAULT_PROFILE_WIDGETS[reportType]} mode="live" ctx={ctx} />
    </div>
  )
}
