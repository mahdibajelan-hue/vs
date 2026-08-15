import { useMemo, useRef } from 'react'
import type * as Cesium from 'cesium'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { jointStageStateAsOf } from '../lib/jointHistory'
import { deriveFinalStatus } from '../lib/progressEngine'
import { PipelineViewer } from '../components/PipelineViewer'
import { KPIPanel } from '../components/KPIPanel'
import { Timeline } from '../components/Timeline'
import { ElevationProfile } from '../components/ElevationProfile'
import { JointPanel } from '../components/JointPanel'
import { VisualizationFilters } from '../components/VisualizationFilters'

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
            {selectedJoint && (
              <JointPanel
                joint={selectedJoint}
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
