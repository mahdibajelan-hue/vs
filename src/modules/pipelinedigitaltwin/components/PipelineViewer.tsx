import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Loader2 } from 'lucide-react'
import type { GeoPoint } from '../types'

// No Cesium ion account for this MVP (per spec: mock/offline terrain, no token dependency) — so
// imagery comes from OpenStreetMap (free, no key) and terrain is a flat WGS84 ellipsoid rather
// than a real elevation mesh. An imported KMZ/KML's own per-point elevation still draws correctly
// (the route sits at its real height above the flat ellipsoid); what's missing is the ground
// surface itself bulging to match — that needs a real terrain dataset, a later phase once
// ion/DEM access is available.
Cesium.Ion.defaultAccessToken = ''

const ROUTE_COLOR = Cesium.Color.fromCssColorString('#38bdf8')

interface PipelineViewerProps {
  routePoints: GeoPoint[]
  onViewerReady?: (viewer: Cesium.Viewer) => void
}

/**
 * Raw Cesium.Viewer — hand-rolled the same way ThreeViewer.tsx hand-rolls three.js, rather than
 * pulling in a React wrapper library, to keep full control over a viewer this central to the app.
 */
export function PipelineViewer({ routePoints, onViewerReady }: PipelineViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
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
    onViewerReady?.(viewer)
    setLoading(false)

    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || routePoints.length < 2) return

    viewer.entities.removeAll()
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(routePoints.flatMap((p) => [p.lon, p.lat, p.elevation ?? 0]))
    viewer.entities.add({
      polyline: {
        positions,
        width: 6,
        material: ROUTE_COLOR,
        clampToGround: false,
      },
    })
    viewer.flyTo(viewer.entities, { duration: 1.2 })
  }, [routePoints])

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
