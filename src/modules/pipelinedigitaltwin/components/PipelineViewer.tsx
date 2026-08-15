import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Loader2 } from 'lucide-react'
import type { Joint, JointFinalStatus, Pipe, Route } from '../types'
import { cumulativeDistances, pointAtChainage, sliceRoutePoints } from '../lib/chainage'
import { computeProgressSpans } from '../lib/routeSegments'
import { FINAL_STATUS_COLOR } from '../lib/progressEngine'

// No Cesium ion account for this MVP (per spec: mock/offline terrain, no token dependency) — so
// imagery comes from OpenStreetMap (free, no key) and terrain is a flat WGS84 ellipsoid rather
// than a real elevation mesh. An imported KMZ/KML's own per-point elevation still draws correctly
// (the route sits at its real height above the flat ellipsoid); what's missing is the ground
// surface itself bulging to match — that needs a real terrain dataset, a later phase once
// ion/DEM access is available.
Cesium.Ion.defaultAccessToken = ''

const INCH_TO_METER = 0.0254
const CROSS_SECTION_SIDES = 16

function pipeCrossSection(radiusMeters: number): Cesium.Cartesian2[] {
  const shape: Cesium.Cartesian2[] = []
  for (let i = 0; i < CROSS_SECTION_SIDES; i++) {
    const angle = (i / CROSS_SECTION_SIDES) * Cesium.Math.TWO_PI
    shape.push(new Cesium.Cartesian2(radiusMeters * Math.cos(angle), radiusMeters * Math.sin(angle)))
  }
  return shape
}

interface PipelineViewerProps {
  route: Route
  pipe: Pipe
  joints: Joint[]
  selectedJointId: string | null
  statusFilter: JointFinalStatus | 'all'
  onSelectJoint: (id: string | null) => void
  onViewerReady?: (viewer: Cesium.Viewer) => void
}

/**
 * Raw Cesium.Viewer — hand-rolled the same way ThreeViewer.tsx hand-rolls three.js, rather than
 * pulling in a React wrapper library, to keep full control over a viewer this central to the app.
 *
 * The pipe itself is a real extruded tube (PolylineVolumeGraphics, one entity per contiguous
 * progress "front" so status color shows on the pipe body) and joints are a PointPrimitiveCollection
 * (cheap for the thousands of joints a real multi-km route generates at one per pipe-stock-length) —
 * both rebuilt whenever the route or joint statuses change.
 */
export function PipelineViewer({ route, pipe, joints, selectedJointId, statusFilter, onSelectJoint, onViewerReady }: PipelineViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const pointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const hasFlownRef = useRef(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewer = new Cesium.Viewer(container, {
      baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'), // keep the OSM attribution out of the viewport; still required to exist somewhere per OSM's tile usage policy — see the small credit line rendered in the panel below instead.
    })
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#11151c')
    viewerRef.current = viewer
    pointsRef.current = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position)
      const id = picked?.id
      onSelectJoint(typeof id === 'string' ? id : null)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    onViewerReady?.(viewer)
    setLoading(false)

    return () => {
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      pointsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A genuinely new route (e.g. a fresh KMZ import) should re-fly the camera once; a joint-status
  // edit on the same route should not yank the view away from what the user is looking at.
  useEffect(() => {
    hasFlownRef.current = false
  }, [route])

  // Pipe tube: one polylineVolume span per contiguous progress-status color.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || route.points.length < 2) return

    viewer.entities.removeAll()
    const cumulative = cumulativeDistances(route.points)
    const radiusMeters = (pipe.diameterInch * INCH_TO_METER) / 2
    const shape = pipeCrossSection(radiusMeters)
    const spans = computeProgressSpans(joints, route.lengthMeters)

    for (const span of spans) {
      const slice = sliceRoutePoints(route.points, cumulative, span.startMeters, span.endMeters)
      if (slice.length < 2) continue
      const positions = Cesium.Cartesian3.fromDegreesArrayHeights(slice.flatMap((p) => [p.lon, p.lat, p.elevation ?? 0]))
      viewer.entities.add({
        polylineVolume: {
          positions,
          shape,
          cornerType: Cesium.CornerType.ROUNDED,
          material: Cesium.Color.fromCssColorString(span.color),
        },
      })
    }

    // flyTo only on the very first geometry for a given route — re-running it every time a joint
    // status changes (which also touches this effect via `spans`) would yank the camera back mid-edit.
    if (!hasFlownRef.current) {
      viewer.flyTo(viewer.entities, { duration: 1.2 })
      hasFlownRef.current = true
    }
  }, [route, joints, pipe])

  // Joint markers — rebuilt whenever joint statuses change (e.g. an edit, or the Timeline scrub date moving).
  useEffect(() => {
    const points = pointsRef.current
    const viewer = viewerRef.current
    if (!points || !viewer) return

    points.removeAll()
    const cumulative = cumulativeDistances(route.points)
    for (const joint of joints) {
      const p = pointAtChainage(route.points, cumulative, joint.chainageMeters)
      const selected = joint.id === selectedJointId
      const dimmed = statusFilter !== 'all' && joint.finalStatus !== statusFilter
      const baseColor = Cesium.Color.fromCssColorString(FINAL_STATUS_COLOR[joint.finalStatus])
      points.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.elevation ?? 0),
        pixelSize: selected ? 14 : dimmed ? 5 : 8,
        color: dimmed ? baseColor.withAlpha(0.25) : baseColor,
        outlineColor: selected ? Cesium.Color.WHITE : Cesium.Color.BLACK.withAlpha(dimmed ? 0.15 : 0.6),
        outlineWidth: selected ? 2.5 : 1,
        id: joint.id,
      })
    }
  }, [joints, route, selectedJointId, statusFilter])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-2xl">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      )}
      <span className="pointer-events-none absolute bottom-1.5 left-2 z-10 text-[9px] text-white/40">© OpenStreetMap contributors</span>
    </div>
  )
}
