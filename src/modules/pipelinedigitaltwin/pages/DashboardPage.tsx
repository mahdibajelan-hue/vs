import { useMemo, useRef } from 'react'
import type * as Cesium from 'cesium'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { jointStageStateAsOf } from '../lib/jointHistory'
import { deriveFinalStatus } from '../lib/progressEngine'
import { cumulativeDistances, pointAtChainage } from '../lib/chainage'
import { PipelineViewer } from '../components/PipelineViewer'
import { KPIPanel } from '../components/KPIPanel'
import { Timeline } from '../components/Timeline'
import { ElevationProfile } from '../components/ElevationProfile'
import { JointPanel } from '../components/JointPanel'
import { VisualizationFilters } from '../components/VisualizationFilters'
import { ConstructionStatusLegend } from '../components/ConstructionStatusLegend'
import { RouteInfoBar } from '../components/RouteInfoBar'

export function DashboardPage() {
  const route = usePdtStore((s) => s.route)
  const pipe = usePdtStore((s) => s.pipe)
  const joints = usePdtStore((s) => s.joints)
  const scrubDate = usePdtStore((s) => s.scrubDate)
  const selectedJointId = usePdtStore((s) => s.selectedJointId)
  const selectJoint = usePdtStore((s) => s.selectJoint)
  const updateJointField = usePdtStore((s) => s.updateJointField)
  const statusFilter = usePdtStore((s) => s.statusFilter)
  const setStatusFilter = usePdtStore((s) => s.setStatusFilter)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  // Timeline scrubbing recomputes each joint's five stage fields (and derived finalStatus) as of
  // the scrubbed moment by replaying its own history log — nothing here is a separate snapshot, so
  // the 3D pipe, joint markers, KPI numbers and elevation dots all stay consistent with each other
  // and with what was actually logged.
  const displayedJoints: Joint[] = useMemo(() => {
    if (!scrubDate) return joints
    return joints.map((j) => {
      const stage = jointStageStateAsOf(j, scrubDate)
      return { ...j, ...stage, finalStatus: deriveFinalStatus(stage), history: j.history.filter((h) => h.at <= scrubDate) }
    })
  }, [joints, scrubDate])

  const selectedJoint = displayedJoints.find((j) => j.id === selectedJointId) ?? null

  const selectedJointContext = useMemo(() => {
    if (!selectedJoint) return null
    const cumulative = cumulativeDistances(route.points)
    const position = pointAtChainage(route.points, cumulative, selectedJoint.chainageMeters)
    const sorted = [...displayedJoints].sort((a, b) => a.chainageMeters - b.chainageMeters)
    const idx = sorted.findIndex((j) => j.id === selectedJoint.id)
    return {
      position,
      prevJointNumber: idx > 0 ? sorted[idx - 1].jointNumber : null,
      nextJointNumber: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].jointNumber : null,
    }
  }, [selectedJoint, displayedJoints, route.points])

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr]">
        <KPIPanel viewerRef={viewerRef} joints={displayedJoints} />
        <div className="flex min-h-0 flex-col gap-2">
          <VisualizationFilters joints={displayedJoints} value={statusFilter} onChange={setStatusFilter} />
          <div className="relative min-h-0 flex-1">
            <PipelineViewer
              route={route}
              pipe={pipe}
              joints={displayedJoints}
              selectedJointId={selectedJointId}
              statusFilter={statusFilter}
              onSelectJoint={selectJoint}
              onViewerReady={(v) => {
                viewerRef.current = v
              }}
            />
            <ConstructionStatusLegend />
            {/* Hidden while a joint is selected — the JointPanel is anchored top-left and, at full
                height (pipe info + all 5 activities + notes), grows tall enough to overlap this
                bottom-left bar; its own "مشخصات لوله" section already restates diameter/material. */}
            {!selectedJoint && <RouteInfoBar route={route} pipe={pipe} />}
            {selectedJoint && selectedJointContext && (
              <JointPanel
                joint={selectedJoint}
                pipe={pipe}
                position={selectedJointContext.position}
                prevJointNumber={selectedJointContext.prevJointNumber}
                nextJointNumber={selectedJointContext.nextJointNumber}
                editable={!scrubDate}
                onUpdate={(field, value) => updateJointField(selectedJoint.id, field, value)}
                onClose={() => selectJoint(null)}
              />
            )}
          </div>
        </div>
      </div>
      <ElevationProfile route={route} joints={displayedJoints} />
      <Timeline />
    </div>
  )
}
