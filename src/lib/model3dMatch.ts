import type { IsoLine } from '../types'

/** Strips everything but letters/digits and upper-cases, so "16"-CS-1002-A1A" and "16_CS_1002_A1A" compare equal. */
export function normalizeForMatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Auto-links a 3D object (by its FBX node name) to a PipePulse line by checking whether the
 * line's number appears inside the object name — the common case when the CAD/BIM team carried
 * the same piping line numbers into the 3D model. Among every line whose id matches, picks the
 * one with the longest normalized id (the most specific match), and ignores ids under 4
 * characters to avoid matching on short, generic numeric fragments.
 */
export function matchLineByObjectName(objectName: string, lines: IsoLine[]): IsoLine | null {
  const normalizedName = normalizeForMatch(objectName)
  if (!normalizedName) return null
  let best: IsoLine | null = null
  let bestLen = 0
  for (const line of lines) {
    const normalizedId = normalizeForMatch(line.svgElementId)
    if (normalizedId.length < 4) continue
    if (normalizedName.includes(normalizedId) && normalizedId.length > bestLen) {
      best = line
      bestLen = normalizedId.length
    }
  }
  return best
}
