import type { DraftLine, PlacedSymbol } from '../types'
import { SYMBOL_DEFS } from '../data/pipingSymbols'
import { buildPathD } from './isoGeometry'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildSchematicSvg(
  lines: DraftLine[],
  symbols: PlacedSymbol[],
  width = 1200,
  height = 700,
): string {
  const pathsMarkup = lines
    .map(
      (l) =>
        `<path id="${escapeXml(l.svgElementId)}" d="${buildPathD(l.points)}" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join('\n  ')

  const labelsMarkup = lines
    .map((l) => {
      if (l.points.length === 0) return ''
      const mid = l.points[Math.floor(l.points.length / 2)]
      return `<text x="${mid.x}" y="${mid.y - 8}" font-size="12" fill="#94a3b8" font-family="sans-serif">${escapeXml(
        l.svgElementId,
      )}${l.size ? ` (${escapeXml(l.size)})` : ''}</text>`
    })
    .join('\n  ')

  const symbolsMarkup = symbols
    .map((s) => `<g transform="translate(${s.x} ${s.y}) rotate(${s.rotation})">${SYMBOL_DEFS[s.type].markup}</g>`)
    .join('\n  ')

  const teeLabelsMarkup = symbols
    .filter((s) => s.type === 'fitting-tee' && (s.mainSize || s.branchSize))
    .map(
      (s) =>
        `<text x="${s.x + 8}" y="${s.y - 10}" font-size="10" fill="#94a3b8" font-family="sans-serif">${escapeXml(
          `${s.mainSize || '—'}x${s.branchSize || '—'}`,
        )}</text>`,
    )
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
  ${pathsMarkup}
  ${labelsMarkup}
  ${symbolsMarkup}
  ${teeLabelsMarkup}
</svg>`
}
