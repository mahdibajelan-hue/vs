import type { GeoPoint, Route } from '../types'
import { computeRouteLength } from './chainage'

/**
 * A synthetic, clearly-fictional ~50km route (gentle meander, mild elevation change) for the demo
 * project — the spec explicitly requires the demo to carry no real project's real data. Coordinates
 * are an arbitrary generated squiggle, not traced from any real pipeline.
 */
export function generateDemoRoute(): Route {
  const segments = 60
  const points: GeoPoint[] = []
  let lon = 52.0
  let lat = 32.0
  let heading = 0.4
  for (let i = 0; i <= segments; i++) {
    heading += Math.sin(i * 0.35) * 0.12
    const stepDeg = 0.0075
    lon += Math.cos(heading) * stepDeg
    lat += Math.sin(heading) * stepDeg * 0.75
    const elevation = 1250 + Math.sin(i * 0.22) * 90 + i * 1.1
    points.push({ lon, lat, elevation })
  }
  return {
    points,
    hasElevationData: true,
    lengthMeters: computeRouteLength(points),
    source: 'demo',
    fileName: null,
  }
}
