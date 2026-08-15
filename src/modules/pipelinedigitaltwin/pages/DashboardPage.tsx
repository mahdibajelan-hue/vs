import { useRef } from 'react'
import type * as Cesium from 'cesium'
import { usePdtStore } from '../store/usePdtStore'
import { PipelineViewer } from '../components/PipelineViewer'
import { KPIPanel } from '../components/KPIPanel'
import { Timeline } from '../components/Timeline'

/**
 * The Executive 3D Pipeline Dashboard — the single primary screen for this MVP. Layout follows the
 * spec exactly: KPI/route panel first (renders on the visual right in this RTL app), the Cesium
 * viewer as the dominant area, timeline bar spanning the bottom.
 */
export function DashboardPage() {
  const route = usePdtStore((s) => s.route)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr]">
        <KPIPanel viewerRef={viewerRef} />
        <div className="min-h-0">
          <PipelineViewer
            routePoints={route.points}
            onViewerReady={(v) => {
              viewerRef.current = v
            }}
          />
        </div>
      </div>
      <Timeline />
    </div>
  )
}
