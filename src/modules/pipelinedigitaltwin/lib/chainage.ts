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

/**
 * The lon/lat/elevation at a given distance along the route, linearly interpolated between the
 * two route vertices that bracket it. Used to place joints/valves in 3D space and to draw the
 * elevation profile — always derived from the route's own vertices, never a separate coordinate.
 */
export function pointAtChainage(points: GeoPoint[], cumulative: number[], meters: number): GeoPoint {
  if (points.length === 0) return { lon: 0, lat: 0, elevation: 0 }
  if (meters <= cumulative[0]) return points[0]
  const total = cumulative[cumulative.length - 1]
  if (meters >= total) return points[points.length - 1]

  let i = 0
  while (i < cumulative.length - 1 && cumulative[i + 1] < meters) i++
  const segStart = cumulative[i]
  const segEnd = cumulative[i + 1]
  const t = segEnd > segStart ? (meters - segStart) / (segEnd - segStart) : 0
  const a = points[i]
  const b = points[i + 1]
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    elevation: a.elevation != null && b.elevation != null ? a.elevation + (b.elevation - a.elevation) * t : null,
  }
}

/** The route's own vertices between two chainages, with exact interpolated points at both ends — used to draw one pipe span per progress color without losing the route's real shape. */
export function sliceRoutePoints(points: GeoPoint[], cumulative: number[], startMeters: number, endMeters: number): GeoPoint[] {
  const result: GeoPoint[] = [pointAtChainage(points, cumulative, startMeters)]
  for (let i = 0; i < points.length; i++) {
    if (cumulative[i] > startMeters && cumulative[i] < endMeters) result.push(points[i])
  }
  result.push(pointAtChainage(points, cumulative, endMeters))
  return result
}
