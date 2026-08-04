/**
 * Merges fragmented CAD-exported SVG pieces (path/line/polyline) into whole
 * pipe runs by tracing connectivity: fragments whose endpoints coincide are
 * chained together, and the chain only breaks at a true end (nothing else
 * attached) or a branch point (3+ fragments meeting, e.g. a tee). This turns
 * "one line = one raw SVG element" into "one line = one connected run",
 * matching how a real isometric line is actually drawn across many elbows.
 */

export interface SegmentEndpoints {
  start: [number, number]
  end: [number, number]
}

const MERGEABLE_TAGS = new Set(['path', 'line', 'polyline'])

/** Extracts the start/end point of each mergeable candidate, normalized into the root <svg>'s own coordinate space. */
export function extractSegmentEndpoints(svgRoot: SVGSVGElement, elementIds: string[]): Map<string, SegmentEndpoints> {
  const result = new Map<string, SegmentEndpoints>()

  for (const id of elementIds) {
    const el = svgRoot.querySelector<SVGGraphicsElement>(`#${cssEscape(id)}`)
    if (!el) continue
    const tag = el.tagName.toLowerCase()
    if (!MERGEABLE_TAGS.has(tag)) continue

    const local = tag === 'path' ? pathEndpoints(el as unknown as SVGPathElement) : lineLikeEndpoints(el, tag)
    if (!local) continue

    const start = toRootSpace(svgRoot, el, local.start)
    const end = toRootSpace(svgRoot, el, local.end)
    if (!start || !end) continue
    result.set(id, { start, end })
  }

  return result
}

function pathEndpoints(el: SVGPathElement): { start: [number, number]; end: [number, number] } | null {
  try {
    const len = el.getTotalLength()
    if (!Number.isFinite(len) || len <= 0) return null
    const p0 = el.getPointAtLength(0)
    const p1 = el.getPointAtLength(len)
    return { start: [p0.x, p0.y], end: [p1.x, p1.y] }
  } catch {
    return null
  }
}

function lineLikeEndpoints(el: SVGGraphicsElement, tag: string): { start: [number, number]; end: [number, number] } | null {
  if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1') ?? '')
    const y1 = parseFloat(el.getAttribute('y1') ?? '')
    const x2 = parseFloat(el.getAttribute('x2') ?? '')
    const y2 = parseFloat(el.getAttribute('y2') ?? '')
    if ([x1, y1, x2, y2].some((n) => Number.isNaN(n))) return null
    return { start: [x1, y1], end: [x2, y2] }
  }
  if (tag === 'polyline') {
    const raw = el.getAttribute('points') ?? ''
    const points = raw
      .trim()
      .split(/\s+|,/)
      .map((n) => parseFloat(n))
      .filter((n) => !Number.isNaN(n))
    if (points.length < 4) return null
    return {
      start: [points[0], points[1]],
      end: [points[points.length - 2], points[points.length - 1]],
    }
  }
  return null
}

function toRootSpace(svgRoot: SVGSVGElement, el: SVGGraphicsElement, [x, y]: [number, number]): [number, number] | null {
  try {
    const ctm = el.getCTM()
    if (!ctm) return [x, y]
    const pt = svgRoot.createSVGPoint()
    pt.x = x
    pt.y = y
    const transformed = pt.matrixTransform(ctm)
    return [transformed.x, transformed.y]
  } catch {
    return [x, y]
  }
}

/** A sensible default snap tolerance (in SVG user units) derived from the drawing's own scale. */
export function defaultMergeTolerance(svgRoot: SVGSVGElement): number {
  const viewBox = svgRoot.viewBox?.baseVal
  const w = viewBox && viewBox.width > 0 ? viewBox.width : svgRoot.clientWidth || 1000
  const h = viewBox && viewBox.height > 0 ? viewBox.height : svgRoot.clientHeight || 1000
  const diagonal = Math.hypot(w, h)
  return Math.max(0.5, diagonal * 0.0015)
}

interface PointRef {
  id: string
  role: 'start' | 'end'
}

/**
 * Groups element ids into chains by connectivity. Elements with no usable
 * geometry (symbols, groups, etc.) are returned as their own single-item
 * group so nothing is silently dropped from the candidate list.
 */
export function computeMergeGroups(allIds: string[], endpoints: Map<string, SegmentEndpoints>, tolerance: number): string[][] {
  const key = (p: [number, number]) => `${Math.round(p[0] / tolerance)}_${Math.round(p[1] / tolerance)}`

  const pointIndex = new Map<string, PointRef[]>()
  for (const [id, seg] of endpoints) {
    if (key(seg.start) === key(seg.end)) continue // degenerate (near-zero-length) — leave standalone
    pushIndex(pointIndex, key(seg.start), { id, role: 'start' })
    pushIndex(pointIndex, key(seg.end), { id, role: 'end' })
  }

  const visited = new Set<string>()
  const groups: string[][] = []

  for (const id of allIds) {
    if (visited.has(id)) continue
    if (!endpoints.has(id)) {
      groups.push([id])
      visited.add(id)
      continue
    }
    visited.add(id)
    const chain = [id]
    walk(id, 'end', +1, chain)
    walk(id, 'start', -1, chain)
    groups.push(chain)
  }

  return groups

  function walk(fromId: string, fromSide: 'start' | 'end', dir: 1 | -1, chain: string[]) {
    let currentId = fromId
    let currentSide = fromSide
    for (let guard = 0; guard < 5000; guard++) {
      const seg = endpoints.get(currentId)
      if (!seg) return
      const pt = currentSide === 'end' ? seg.end : seg.start
      const atPoint = pointIndex.get(key(pt)) ?? []
      const others = atPoint.filter((r) => !(r.id === currentId && r.role === currentSide))
      if (others.length !== 1) return // free end (0) or branch point (2+)
      const next = others[0]
      if (visited.has(next.id)) return
      visited.add(next.id)
      if (dir === 1) chain.push(next.id)
      else chain.unshift(next.id)
      currentId = next.id
      currentSide = next.role === 'start' ? 'end' : 'start'
    }
  }
}

function pushIndex(map: Map<string, PointRef[]>, k: string, ref: PointRef) {
  const arr = map.get(k)
  if (arr) arr.push(ref)
  else map.set(k, [ref])
}

/** Picks the most "line-number-like" id in a merged group to use as the display label. */
export function pickGroupLabel(group: string[], isLikelyLineId: (id: string) => boolean): string {
  return group.find(isLikelyLineId) ?? group[0]
}

function cssEscape(id: string) {
  if (window.CSS?.escape) return window.CSS.escape(id)
  return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
