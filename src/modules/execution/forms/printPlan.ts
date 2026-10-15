import type { GridTemplate } from './gridTypes'

/** Slack kept below the page so that borders and rounding never push a sheet over the page edge (measured sheets are up to ~1.5% taller than the sum of their row heights because wrapped text enlarges some rows). */
const HEIGHT_SLACK = 1.025
/** A sheet that overflows one page by more than this ratio is a genuinely multi-page sheet and is not shrunk to fit. */
const MAX_FIT_SHRINK = 1.08

export interface PrintPlan { css: string; scale: number; pageW: number; pageH: number; excelScale: number; sheetW: number; sheetH: number; heightFitted: boolean }

/** Print geometry taken from the sheet's page setup. The scale is the Excel scale, reduced when needed so that the sheet fits one page wide and — for a sheet that is meant to be one page — one page high. */
export function printPlan(tpl: GridTemplate): PrintPlan {
  const A4 = tpl.print.orientation === 'landscape' ? { w: 11.69, h: 8.27 } : { w: 8.27, h: 11.69 }
  const m = tpl.print.margins
  const pageW = (A4.w - m.left - m.right) * 96, pageH = (A4.h - m.top - m.bottom) * 96
  const sheetW = tpl.cols.filter((c) => !c.hidden).reduce((s, c) => s + c.w, 0)
  const sheetH = tpl.rows.filter((r) => !r.hidden).reduce((s, r) => s + r.h, 0)
  const excelScale = (tpl.print.scale ?? 100) / 100
  let scale = Math.min(excelScale, pageW / sheetW)
  const hFit = pageH / (sheetH * HEIGHT_SLACK)
  const heightFitted = scale > hFit && scale / hFit <= MAX_FIT_SHRINK
  if (heightFitted) scale = hFit
  const css = `@page { size: A4 ${tpl.print.orientation}; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; }`
  return { css, scale, pageW, pageH, excelScale, sheetW, sheetH, heightFitted }
}
