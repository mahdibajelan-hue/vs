import type { ReportPayload } from '../types'
import type { WidgetComputeContext } from '../lib/widgetTypes'
import { getWidget } from '../lib/widgetRegistry'
import { WidgetShell } from './ui'

/**
 * Renders a set of widgets from the Widget Registry (spec #34) — either LIVE (recomputed from
 * `ctx` on every render) or SNAPSHOT (read verbatim from an already-frozen `payload`). Both
 * modes share the exact same Render components, so a widget looks identical whether you're
 * looking at the live dashboard or an issued report.
 */
export function WidgetGrid({
  widgetIds,
  mode,
  ctx,
  payload,
}: {
  widgetIds: string[]
  mode: 'live' | 'snapshot'
  ctx?: WidgetComputeContext
  payload?: ReportPayload
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {widgetIds.map((id) => {
        const widget = getWidget(id)
        if (!widget) return null
        const data = mode === 'live' && ctx ? widget.compute(ctx) : payload?.[id]
        const Render = widget.Render
        return (
          <WidgetShell key={id} title={widget.label} subtitle={widget.description}>
            <Render data={data} />
          </WidgetShell>
        )
      })}
    </div>
  )
}
