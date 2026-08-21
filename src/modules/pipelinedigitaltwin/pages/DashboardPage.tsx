import { useMemo, useRef, useState } from 'react'
import type * as Cesium from 'cesium'
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react'
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
  const [kpiOpen, setKpiOpen] = useState(true)
  const [dockOpen, setDockOpen] = useState(true)

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
    <div className="relative h-full w-full">
      {/* The map fills the entire page now — every panel below floats on top of it instead of
          sharing a fixed grid, so closing/collapsing any of them gives the map back that space. */}
      <div className="absolute inset-0">
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
      </div>

      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <VisualizationFilters joints={displayedJoints} value={statusFilter} onChange={setStatusFilter} />
      </div>

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

      {/* KPI drawer — floats over the right edge of the map and slides fully out of the way so the
          map can use the whole width when the numbers aren't needed. */}
      <div
        className={`absolute inset-y-3 right-3 z-30 w-80 max-w-[calc(100%-1.5rem)] transition-transform duration-300 ${kpiOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}
      >
        <KPIPanel viewerRef={viewerRef} joints={displayedJoints} />
      </div>
      <button
        onClick={() => setKpiOpen((v) => !v)}
        title={kpiOpen ? 'بستن شاخص‌ها' : 'بازکردن شاخص‌ها'}
        className={`absolute top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[rgba(10,14,20,0.85)] text-white/80 backdrop-blur-md transition-[right] duration-300 hover:bg-white/10 ${kpiOpen ? 'right-[21.5rem]' : 'right-3'}`}
      >
        <ChevronLeft size={14} className={`transition-transform ${kpiOpen ? '' : 'rotate-180'}`} />
      </button>

      {/* Bottom dock — Timeline + Elevation Profile, collapsible to a thin handle so the map can
          use the full page height too. */}
      <div className="absolute inset-x-3 bottom-3 z-20 flex flex-col items-center gap-2">
        {dockOpen && (
          <div className="flex w-full flex-col gap-2">
            <ElevationProfile route={route} joints={displayedJoints} />
            <Timeline />
          </div>
        )}
        <button
          onClick={() => setDockOpen((v) => !v)}
          title={dockOpen ? 'بستن جدول زمانی' : 'بازکردن جدول زمانی'}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(10,14,20,0.85)] px-4 py-1 text-[10px] font-medium text-white/80 backdrop-blur-md hover:bg-white/10"
        >
          {dockOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {dockOpen ? 'بستن پروفایل و جدول زمانی' : 'نمایش پروفایل و جدول زمانی'}
        </button>
      </div>
    </div>
  )
}
