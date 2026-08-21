import * as Cesium from 'cesium'
import type { GeoPoint, Route } from '../types'
import { computeRouteLength } from './chainage'

export interface KmlImportResult {
  route: Route | null
  error: string | null
}

/**
 * Parses an uploaded KML/KMZ file with Cesium's own KmlDataSource (handles KMZ unzipping
 * internally, no extra parsing library needed) and flattens every LineString placemark's
 * positions, in encounter order, into a single route. Point placemarks some KML exports include
 * (POIs, valve markers, etc.) are ignored here — the route is the polyline geometry only.
 */
export async function importRouteFromKml(file: File, viewer: Cesium.Viewer): Promise<KmlImportResult> {
  let dataSource: Cesium.KmlDataSource
  try {
    dataSource = await Cesium.KmlDataSource.load(file, {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
      clampToGround: false,
    })
  } catch {
    return { route: null, error: 'فایل قابل خواندن نبود — یک KML/KMZ معتبر انتخاب کنید.' }
  }

  const points: GeoPoint[] = []
  let hasElevationData = true
  const now = Cesium.JulianDate.now()

  for (const entity of dataSource.entities.values) {
    if (!entity.polyline) continue
    const positions = entity.polyline.positions?.getValue(now) as Cesium.Cartesian3[] | undefined
    if (!positions) continue
    for (const pos of positions) {
      const carto = Cesium.Cartographic.fromCartesian(pos)
      const elevation = carto.height
      if (elevation == null || Math.abs(elevation) < 0.01) hasElevationData = false
      points.push({
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        elevation: elevation ?? null,
      })
    }
  }

  if (points.length < 2) {
    return { route: null, error: 'هیچ مسیر خطی (LineString) در این فایل پیدا نشد.' }
  }

  return {
    route: {
      points,
      hasElevationData,
      lengthMeters: computeRouteLength(points),
      source: file.name.toLowerCase().endsWith('.kmz') ? 'kmz' : 'kml',
      fileName: file.name,
    },
    error: null,
  }
}
