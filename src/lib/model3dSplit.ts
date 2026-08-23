import * as THREE from 'three'

/**
 * Splits merged CAD meshes back into their individual solids.
 *
 * THE PROBLEM THIS SOLVES
 * Navisworks (and most CAD exporters) merge geometry by material/layer on FBX export, so an
 * entire connected run of pipe arrives as ONE THREE.Mesh with ONE name. Since the model-linking
 * UI selects whole meshes by name (see ThreeViewer's raycast handler and Spool.meshObjectNames),
 * clicking any pipe selects the whole run — while valves/fittings/equipment stay individually
 * selectable, because in the source model they are distinct blocks with distinct materials.
 *
 * THE APPROACH
 * A merged mesh is not one connected surface: it is N separate closed shells sharing one buffer.
 * Walking the triangle connectivity and grouping triangles into connected components recovers
 * those shells, which map 1:1 to the original solids. Each component becomes its own mesh named
 * `{parent}#{k}`, so a click can land on a single pipe segment.
 *
 * WHERE IT CAN UNDER-SPLIT
 * FBXLoader emits non-indexed geometry, so connectivity has to be reconstructed by matching
 * vertex positions. Two butt-welded pipes whose end faces are tessellated identically *and* are
 * in the same rotational phase will share exact vertex positions and stay fused. That is why
 * splitMergedMeshes reports stats rather than failing silently — if a model comes back
 * "1 mesh → 1 part", position welding is fusing the solids and the fallback is to cut geometry
 * by the two bounding joint positions instead (the spool already carries both).
 */

/** Separates a parent mesh name from its component index: `PIPE_RUN_04#12`. */
export const SUBMESH_SEPARATOR = '#'

/**
 * The parent mesh name a (possibly split) mesh name belongs to.
 *
 * Links saved before splitting existed store the *parent* name, so every lookup against stored
 * `meshObjectNames` has to accept both the exact sub-mesh name and its base — otherwise turning
 * splitting on would silently orphan every existing spool/equipment link.
 */
export function baseMeshName(name: string): string {
  const i = name.lastIndexOf(SUBMESH_SEPARATOR)
  if (i <= 0) return name
  const suffix = name.slice(i + 1)
  return /^\d+$/.test(suffix) ? name.slice(0, i) : name
}

export interface SplitStats {
  /** Meshes in the model as loaded. */
  meshesBefore: number
  /** Meshes after splitting. */
  meshesAfter: number
  /** How many parent meshes actually contained more than one solid. */
  meshesSplit: number
  /** Largest component count produced by a single parent — the headline "was 1, now N" number. */
  largestSplit: number
  /** Meshes left alone because they exceeded the vertex budget. */
  skipped: number
  triangles: number
  elapsedMs: number
}

/**
 * Above this many vertices in a single mesh, welding + union-find costs more than the interaction
 * it buys. Such a mesh is left intact and counted in `skipped` so the UI can say so.
 */
const MAX_VERTICES_PER_MESH = 1_500_000

/** Positions are welded on an exact quantised match — see the under-split note in the file header. */
const QUANT = 10_000

/**
 * Packs an ordered vertex-id pair into one numeric edge key. 2^22 keeps the product inside the
 * exact-integer range of a double for every mesh under MAX_VERTICES_PER_MESH.
 */
const EDGE_KEY_STRIDE = 4_194_304

class UnionFind {
  private parent: Int32Array

  constructor(size: number) {
    this.parent = new Int32Array(size)
    for (let i = 0; i < size; i++) this.parent[i] = i
  }

  find(x: number): number {
    let root = x
    while (this.parent[root] !== root) root = this.parent[root]
    // Path compression, iterative — recursion blows the stack on CAD-sized buffers.
    let cur = x
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]
      this.parent[cur] = root
      cur = next
    }
    return root
  }

  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

/**
 * Maps every vertex to a welded id, so triangles that meet at a shared corner are seen as
 * connected even though FBXLoader gave each triangle its own copy of that corner.
 */
function buildWeldedIds(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Int32Array {
  const count = position.count
  const ids = new Int32Array(count)
  const lookup = new Map<string, number>()
  let next = 0
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(position.getX(i) * QUANT)},${Math.round(position.getY(i) * QUANT)},${Math.round(position.getZ(i) * QUANT)}`
    const existing = lookup.get(key)
    if (existing === undefined) {
      lookup.set(key, next)
      ids[i] = next
      next++
    } else {
      ids[i] = existing
    }
  }
  return ids
}

/** Builds one sub-geometry from a subset of a parent's triangles, copying every attribute. */
function buildComponentGeometry(source: THREE.BufferGeometry, triangleStarts: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertexIndices: number[] = []
  for (const start of triangleStarts) {
    vertexIndices.push(start, start + 1, start + 2)
  }

  for (const name of Object.keys(source.attributes)) {
    const attr = source.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    const itemSize = attr.itemSize
    const out = new Float32Array(vertexIndices.length * itemSize)
    for (let v = 0; v < vertexIndices.length; v++) {
      const src = vertexIndices[v]
      for (let c = 0; c < itemSize; c++) {
        out[v * itemSize + c] = attr.array[src * itemSize + c] as number
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, itemSize, attr.normalized))
  }

  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Replaces every merged mesh under `root` with one mesh per connected solid.
 *
 * Components are named `{parent}#{k}` where k is assigned after sorting by centroid, so the same
 * file always produces the same names — links persisted against a sub-mesh must survive a reload.
 */
export function splitMergedMeshes(root: THREE.Object3D): SplitStats {
  const started = performance.now()
  const stats: SplitStats = {
    meshesBefore: 0,
    meshesAfter: 0,
    meshesSplit: 0,
    largestSplit: 1,
    skipped: 0,
    triangles: 0,
    elapsedMs: 0,
  }

  // Collected up-front: the traversal must not observe meshes added while it is running.
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  stats.meshesBefore = meshes.length

  for (const mesh of meshes) {
    const geometry = mesh.geometry
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position) {
      stats.meshesAfter++
      continue
    }

    // Only non-indexed geometry is handled here: that is what FBXLoader produces, and supporting
    // both paths would mean two connectivity implementations to keep honest.
    if (geometry.index || position.count % 3 !== 0) {
      stats.meshesAfter++
      stats.triangles += (geometry.index?.count ?? position.count) / 3
      continue
    }

    const triangleCount = position.count / 3
    stats.triangles += triangleCount

    if (position.count > MAX_VERTICES_PER_MESH) {
      stats.skipped++
      stats.meshesAfter++
      continue
    }

    const welded = buildWeldedIds(position)
    const uf = new UnionFind(triangleCount)

    // Connectivity is by shared EDGE, not shared vertex. Two distinct solids frequently touch at a
    // single point — the coincident cap-centre where two butt-joined pipes meet is the standard
    // example — and unioning on a shared vertex would fuse the whole run back into one part on
    // that one point. A genuinely continuous surface shares an edge (two vertices), so that is the
    // test used here.
    const edgeOwner = new Map<number, number>()
    for (let t = 0; t < triangleCount; t++) {
      const v = t * 3
      const a = welded[v]
      const b = welded[v + 1]
      const c = welded[v + 2]
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
        if (p === q) continue // degenerate edge on a zero-area triangle
        const key = p < q ? p * EDGE_KEY_STRIDE + q : q * EDGE_KEY_STRIDE + p
        const owner = edgeOwner.get(key)
        if (owner === undefined) edgeOwner.set(key, t)
        else uf.union(owner, t)
      }
    }

    const byRoot = new Map<number, number[]>()
    for (let t = 0; t < triangleCount; t++) {
      const r = uf.find(t)
      const list = byRoot.get(r)
      if (list) list.push(t * 3)
      else byRoot.set(r, [t * 3])
    }

    if (byRoot.size <= 1) {
      stats.meshesAfter++
      continue
    }

    // Deterministic ordering: names are persisted in Spool.meshObjectNames, so component k must
    // mean the same solid on every load of the same file.
    const components = [...byRoot.values()].map((triangleStarts) => {
      let cx = 0
      let cy = 0
      let cz = 0
      for (const start of triangleStarts) {
        for (let k = 0; k < 3; k++) {
          cx += position.getX(start + k)
          cy += position.getY(start + k)
          cz += position.getZ(start + k)
        }
      }
      const n = triangleStarts.length * 3
      return { triangleStarts, cx: cx / n, cy: cy / n, cz: cz / n }
    })
    components.sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.cz - b.cz)

    const parentName = mesh.name || 'mesh'
    const material = mesh.material
    const parent = mesh.parent
    const replacements: THREE.Mesh[] = components.map((component, k) => {
      const sub = new THREE.Mesh(buildComponentGeometry(geometry, component.triangleStarts), material)
      sub.name = `${parentName}${SUBMESH_SEPARATOR}${k}`
      sub.position.copy(mesh.position)
      sub.quaternion.copy(mesh.quaternion)
      sub.scale.copy(mesh.scale)
      return sub
    })

    if (parent) {
      parent.remove(mesh)
      for (const sub of replacements) parent.add(sub)
    }
    geometry.dispose()

    stats.meshesSplit++
    stats.meshesAfter += replacements.length
    stats.largestSplit = Math.max(stats.largestSplit, replacements.length)
  }

  stats.elapsedMs = Math.round(performance.now() - started)
  return stats
}
