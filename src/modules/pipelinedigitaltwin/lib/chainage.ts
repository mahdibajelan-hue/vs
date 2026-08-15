import * as Cesium from 'cesium'
import type { GeoPoint } from '../types'

/** Real geodesic distance (meters) between two lon/lat points along the WGS84 ellipsoid — not a flat-plane approximation, so it stays accurate over tens of kilometers. */
function geodesicDistance(a: GeoPoint, b: GeoPoint): number {
  const geodesic = new Cesium.EllipsoidGeodesic(Cesium.Cartographic.fromDegrees(a.lon, a.lat), Cesium.Cartographic.fromDegrees(b.lon, b.lat))
  return geodesic.surfaceDistance
}

export function computeRouteLength(points: GeoPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += geodesicDistance(points[i - 1], points[i])
  return total
}

/** Cumulative distance (meters) from the route's own start at each input vertex — index-aligned with `points`. */
export function cumulativeDistances(points: GeoPoint[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + geodesicDistance(points[i - 1], points[i]))
  return out
}

/** "KP 24+350" — the kilometer-point chainage notation standard in pipeline construction: whole km, then meters into that km, zero-padded to 3 digits. */
export function formatChainage(meters: number): string {
  const km = Math.floor(meters / 1000)
  const rem = Math.round(meters % 1000)
  return `KP ${km}+${String(rem).padStart(3, '0')}`
}
