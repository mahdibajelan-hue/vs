import * as THREE from 'three'
import type { Joint, Point3D } from '../types'

/**
 * Cuts fused pipe runs into one selectable part per spool, using the welds as the cut lines.
 *
 * WHY THIS EXISTS
 * splitMergedMeshes() recovers individual solids from a merged export, but it cannot separate a
 * run that is genuinely ONE continuous welded surface — a model authored or processed so that
 * adjacent pipes share their end-face vertices arrives as a single closed shell, and no
 * connectivity test can divide a surface that is truly connected. On such a file every click
 * selects the whole run.
 *
 * The domain already says where a run should divide: a weld. Joints are placed on the model by
 * the user and their 3D positions are stored, so the polyline through consecutive joints of a
 * line is a cut definition that survives a reload — which matters, because the resulting part
 * names get persisted in Spool.meshObjectNames.
 *
 * HOW
 * Each triangle is assigned to the nearest joint-to-joint segment, accepted only if it lies
 * within that segment's own estimated pipe radius. The radius is measured from the geometry
 * rather than configured: sampling the perpendicular distances of triangles around a segment and
 * taking a high percentile gives the pipe's cross-section without asking the user for a number
 * or adding a column to the schema. Triangles matching no segment (structures, vessels, ground)
 * stay in the parent mesh untouched.
 */

/** Separates a parent mesh name from the spool segment cut out of it: `Cylinder@L1:2`. */
export const JOINT_CUT_SEPARATOR = '@'

export interface JointCutStats {
  /** Segments (consecutive joint pairs) that claimed geometry. */
  segmentsCut: number
  /** Meshes that were divided by at least one segment. */
  meshesCut: number
  /** New selectable parts produced. */
  partsCreated: number
  elapsedMs: number
}

/** A weld-to-weld span: the geometry between two consecutive joints on one line. */
interface Segment {
  key: string
  a: THREE.Vector3
  b: THREE.Vector3
  dir: THREE.Vector3
  length: number
  radius: number
}

/**
 * Consecutive joint pairs per line, in weld order.
 *
 * Only joints that were actually placed on the model carry a position; a joint recorded in the
 * table but never clicked onto the geometry cannot define a cut, so it is skipped rather than
 * silently producing a segment through the origin.
 */
export function buildSegments(joints: Joint[]): Segment[] {
  const byLine = new Map<string, Joint[]>()
  for (const j of joints) {
    if (!j.position) continue
    const list = byLine.get(j.lineId)
    if (list) list.push(j)
    else byLine.set(j.lineId, [j])
  }

  const segments: Segment[] = []
  for (const [lineId, list] of byLine) {
    list.sort((x, y) => x.sequenceNumber - y.sequenceNumber)
    for (let i = 0; i < list.length - 1; i++) {
      const a = toVec(list[i].position as Point3D)
      const b = toVec(list[i + 1].position as Point3D)
      const dir = new THREE.Vector3().subVectors(b, a)
      const length = dir.length()
      if (length < 1e-6) continue
      dir.divideScalar(length)
      segments.push({ key: `${lineId}:${i}`, a, b, dir, length, radius: 0 })
    }
  }
  return segments
}

function toVec(p: Point3D): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z)
}

/** Axial position along the segment (0..1 inside it) and perpendicular distance from its axis. */
function projectOnto(segment: Segment, point: THREE.Vector3): { t: number; d: number } {
  const rel = new THREE.Vector3().subVectors(point, segment.a)
  const along = rel.dot(segment.dir)
  const t = along / segment.length
  const perp = new THREE.Vector3().copy(segment.dir).multiplyScalar(along)
  const d = rel.sub(perp).length()
  return { t, d }
}

/**
 * Estimates each segment's pipe radius from the geometry around it.
 *
 * A configured radius would be wrong for every project with more than one pipe size, so the
 * cross-section is measured instead: of the triangles sitting alongside a segment, the 90th
 * percentile perpendicular distance is the pipe wall, and a small margin over it captures welds
 * and coating without reaching the next pipe over.
 */
function estimateRadii(segments: Segment[], centroids: THREE.Vector3[]) {
  for (const segment of segments) {
    const generous = segment.length * 0.5
    const distances: number[] = []
    for (const c of centroids) {
      const { t, d } = projectOnto(segment, c)
      if (t < 0.15 || t > 0.85) continue // ends are where neighbours crowd in
      if (d > generous) continue
      distances.push(d)
    }
    if (distances.length === 0) {
      segment.radius = 0
      continue
    }
    distances.sort((x, y) => x - y)
    const p90 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.9))]
    segment.radius = Math.max(p90 * 1.3, 1e-6)
  }
}

/** The segment a point belongs to, or -1 — nearest wins when capsules overlap at a weld. */
function claimFor(segments: Segment[], point: THREE.Vector3): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.radius <= 0) continue
    const { t, d } = projectOnto(segment, point)
    if (t < 0 || t > 1) continue
    if (d > segment.radius) continue
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function buildGeometryFrom(source: THREE.BufferGeometry, triangleStarts: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertexIndices: number[] = []
  for (const start of triangleStarts) vertexIndices.push(start, start + 1, start + 2)

  for (const name of Object.keys(source.attributes)) {
    const attr = source.attributes[name] as THREE.BufferAttribute
    const itemSize = attr.itemSize
    const out = new Float32Array(vertexIndices.length * itemSize)
    for (let v = 0; v < vertexIndices.length; v++) {
      const src = vertexIndices[v]
      for (let c = 0; c < itemSize; c++) out[v * itemSize + c] = attr.array[src * itemSize + c] as number
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, itemSize, attr.normalized))
  }
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Divides meshes at the welds. Safe to call on an already-split scene — a mesh no segment claims
 * is left exactly as it was.
 *
 * Parts are named `{parent}@{lineId}:{i}`, derived wholly from stored joint data, so the same
 * model plus the same joints always yields the same names.
 */
export function cutMeshesAtJoints(root: THREE.Object3D, joints: Joint[]): JointCutStats {
  const started = performance.now()
  const stats: JointCutStats = { segmentsCut: 0, meshesCut: 0, partsCreated: 0, elapsedMs: 0 }

  const segments = buildSegments(joints)
  if (segments.length === 0) {
    stats.elapsedMs = Math.round(performance.now() - started)
    return stats
  }

  root.updateMatrixWorld(true)

  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })

  // Radii are estimated once, from every mesh's triangles, before anything is cut — otherwise
  // each mesh would measure a different pipe wall for the same segment.
  const sample: THREE.Vector3[] = []
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position || mesh.geometry.index || position.count % 3 !== 0) continue
    const triangleCount = position.count / 3
    // Sampling is capped: radius estimation only needs the shape of the distance distribution.
    const step = Math.max(1, Math.floor(triangleCount / 20000))
    for (let t = 0; t < triangleCount; t += step) {
      sample.push(triangleCentroid(mesh, position, t * 3))
    }
  }
  estimateRadii(segments, sample)

  const claimedSegments = new Set<string>()

  for (const mesh of meshes) {
    const geometry = mesh.geometry
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position || geometry.index || position.count % 3 !== 0) continue

    const triangleCount = position.count / 3
    const bySegment = new Map<number, number[]>()
    const leftover: number[] = []

    for (let t = 0; t < triangleCount; t++) {
      const start = t * 3
      const claim = claimFor(segments, triangleCentroid(mesh, position, start))
      if (claim === -1) {
        leftover.push(start)
        continue
      }
      const list = bySegment.get(claim)
      if (list) list.push(start)
      else bySegment.set(claim, [start])
    }

    if (bySegment.size === 0) continue

    const parentName = mesh.name || 'mesh'
    const parent = mesh.parent
    if (!parent) continue

    const replacements: THREE.Mesh[] = []
    for (const [segmentIndex, triangleStarts] of [...bySegment.entries()].sort((x, y) => x[0] - y[0])) {
      const sub = new THREE.Mesh(buildGeometryFrom(geometry, triangleStarts), mesh.material)
      sub.name = `${parentName}${JOINT_CUT_SEPARATOR}${segments[segmentIndex].key}`
      sub.position.copy(mesh.position)
      sub.quaternion.copy(mesh.quaternion)
      sub.scale.copy(mesh.scale)
      replacements.push(sub)
      claimedSegments.add(segments[segmentIndex].key)
    }

    // Whatever no weld claimed stays behind under the original name, so unrelated geometry that
    // happened to share the mesh is neither lost nor renamed.
    if (leftover.length > 0) {
      const rest = new THREE.Mesh(buildGeometryFrom(geometry, leftover), mesh.material)
      rest.name = parentName
      rest.position.copy(mesh.position)
      rest.quaternion.copy(mesh.quaternion)
      rest.scale.copy(mesh.scale)
      replacements.push(rest)
    }

    parent.remove(mesh)
    for (const sub of replacements) parent.add(sub)
    geometry.dispose()

    stats.meshesCut++
    stats.partsCreated += replacements.length
  }

  stats.segmentsCut = claimedSegments.size
  stats.elapsedMs = Math.round(performance.now() - started)
  return stats
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()

/** World-space centroid of the triangle starting at vertex slot `start`. */
function triangleCentroid(mesh: THREE.Mesh, position: THREE.BufferAttribute, start: number): THREE.Vector3 {
  _a.fromBufferAttribute(position, start).applyMatrix4(mesh.matrixWorld)
  _b.fromBufferAttribute(position, start + 1).applyMatrix4(mesh.matrixWorld)
  _c.fromBufferAttribute(position, start + 2).applyMatrix4(mesh.matrixWorld)
  return new THREE.Vector3(
    (_a.x + _b.x + _c.x) / 3,
    (_a.y + _b.y + _c.y) / 3,
    (_a.z + _b.z + _c.z) / 3,
  )
}
