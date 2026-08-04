export interface SvgCandidate {
  elementId: string
  tagName: string
}

const CANDIDATE_TAGS = new Set(['path', 'line', 'polyline', 'polygon', 'g', 'circle', 'rect'])
const IGNORE_ID_PATTERN = /^(layer|defs|title|metadata|background|border|frame|titleblock|clip|_x3|svg_)/i

export function parseSvgCandidates(svgString: string): SvgCandidate[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('فایل SVG نامعتبر است و قابل خواندن نیست.')
  }

  const all = doc.querySelectorAll('[id]')
  const seen = new Set<string>()
  const candidates: SvgCandidate[] = []

  all.forEach((el) => {
    const id = el.getAttribute('id')
    const tag = el.tagName.toLowerCase()
    if (!id || seen.has(id)) return
    if (!CANDIDATE_TAGS.has(tag)) return
    if (IGNORE_ID_PATTERN.test(id)) return
    seen.add(id)
    candidates.push({ elementId: id, tagName: tag })
  })

  return candidates
}

export function isLikelyLineId(id: string): boolean {
  return /[0-9]/.test(id) && id.length >= 2
}

export function serializeColoredSvg(
  svgString: string,
  colorMap: Map<string, string>,
  defaultStroke = '#94a3b8',
): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.documentElement

  colorMap.forEach((color, elementId) => {
    const el = doc.getElementById(elementId)
    if (!el) return
    el.setAttribute('stroke', color)
    el.setAttribute('data-status-color', color)
    const currentWidth = el.getAttribute('stroke-width')
    if (!currentWidth || parseFloat(currentWidth) < 2) {
      el.setAttribute('stroke-width', '2.5')
    }
  })

  void defaultStroke
  const serializer = new XMLSerializer()
  return serializer.serializeToString(svgEl)
}
