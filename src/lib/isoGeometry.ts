export interface Point {
  x: number
  y: number
}

const GRID = 10
const ISO_ANGLES_DEG = [30, 90, 150, 210, 270, 330]

export function snapToGrid(p: Point): Point {
  return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
}

/** Snaps the vector from `prev` to `raw` onto the nearest isometric axis (30/90/150/210/270/330deg). */
export function snapIsoPoint(prev: Point, raw: Point): Point {
  const dx = raw.x - prev.x
  const dy = raw.y - prev.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return { ...prev }

  const angleMath = Math.atan2(-dy, dx) * (180 / Math.PI)
  const angleNorm = (angleMath + 360) % 360

  let best = ISO_ANGLES_DEG[0]
  let bestDiff = 999
  for (const a of ISO_ANGLES_DEG) {
    const diff = Math.min(Math.abs(angleNorm - a), 360 - Math.abs(angleNorm - a))
    if (diff < bestDiff) {
      bestDiff = diff
      best = a
    }
  }

  const snappedDist = Math.round(dist / GRID) * GRID || GRID
  const rad = (best * Math.PI) / 180
  return {
    x: prev.x + Math.cos(rad) * snappedDist,
    y: prev.y - Math.sin(rad) * snappedDist,
  }
}

export function buildPathD(points: Point[]): string {
  if (points.length === 0) return ''
  return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface SegmentProjection {
  point: Point
  angleDeg: number
  dist: number
}

export function projectPointToSegment(p: Point, a: Point, b: Point): SegmentProjection {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + abx * t, y: a.y + aby * t }
  const angleDeg = Math.atan2(aby, abx) * (180 / Math.PI)
  return { point, angleDeg, dist: distance(p, point) }
}

export function nearestPointOnPolylines(
  p: Point,
  polylines: { points: Point[] }[],
  threshold: number,
): { point: Point; angleDeg: number } | null {
  let best: SegmentProjection | null = null
  for (const line of polylines) {
    for (let i = 0; i < line.points.length - 1; i++) {
      const proj = projectPointToSegment(p, line.points[i], line.points[i + 1])
      if (!best || proj.dist < best.dist) best = proj
    }
  }
  if (best && best.dist <= threshold) return { point: best.point, angleDeg: best.angleDeg }
  return null
}
