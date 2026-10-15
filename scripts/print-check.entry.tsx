// Bundled by scripts/print-check.mjs (vite SSR). Renders every bundled approved sheet with N sample records, exactly like the sheet wrapper of
// src/modules/execution/components/TemplatePaper.tsx (page container + printPlan CSS + per-page zoom), but without any app store.
import { renderToStaticMarkup } from 'react-dom/server'
import { BUNDLED_TEMPLATES } from '../src/modules/execution/forms/bundled'
import { GridSheet, printPlan } from '../src/modules/execution/forms/GridTemplate'
import { GRID_SPECS, specPage, specPages } from '../src/modules/execution/forms/gridSpecs'
import { ROWS_PER_PAGE, weldingGridPage } from '../src/modules/execution/forms/weldingGrid'

export interface Case { id: string; formKey: string; records: number; expectedPages: number; scale: number; excelScale: number; orientation: string; margins: { left: number; right: number; top: number; bottom: number }; html: string }

const sample = (i: number) => ({ sec: '12', jointNo: `J${i}`, weldNo: `W${100 + i}`, pipeNo: `P${500 + i}`, lengthM: '11.8', thkIn: '0.5', sizeIn: '48', bendDeg: 'OB 1.5', result: 'acc', remark: 'ok', km: '12+300', wtMm: '12.7', diaIn: '48', dirSO: 'SB 6', dirLR: 'IPR 8', ovalMm: '1.2', ovalPct: '0.8', stamp: 'A12', defectType: 'RP', defectLoc: 'Cm 119-125', repairDone: 'done', vtCheck: 'acc', rtReqNo: `RT-${i}`, odIn: '48', stampRoot: 'W1', stampHot: 'W2', stampFill: 'W3', stampCap: 'W4', stampRootC: 'W5', stampHotC: 'W6', stampFillC: 'W7', stampCapC: 'W8', stNo: 'S1', segment: 'A-B', defect: 'PO 12cm', repairKind: 'RS' })

const page = (css: string, scale: number, inner: string[]) =>
  `<!doctype html><meta charset="utf-8"><body style="margin:0"><div class="mt-printable gt-paper" dir="ltr"><style>${css} @media print { .gt-page { zoom: ${scale}; break-after: page; } .gt-page:last-child { break-after: auto; } }</style>${inner.map((h) => `<div class="gt-page" style="width:fit-content;margin:0 auto">${h}</div>`).join('')}</div></body>`

export function renderCases(only?: string): Case[] {
  const out: Case[] = []
  for (const b of BUNDLED_TEMPLATES) {
    if (only && b.formKey !== only) continue
    const tpl = b.layout, plan = printPlan(tpl)
    const spec = GRID_SPECS[b.formKey]
    const per = b.renderer === 'welding' ? ROWS_PER_PAGE : spec ? spec.rows.per : 0
    const counts = per ? [1, per, per + 1] : [1]
    for (const n of counts) {
      const rows = Array.from({ length: n }, (_, i) => sample(i + 1))
      const pages = per ? Math.max(1, Math.ceil(n / per)) : 1
      const inner: string[] = []
      for (let p = 0; p < pages; p++) {
        let values: Record<string, string> = {}
        if (b.renderer === 'welding') {
          values = weldingGridPage(tpl, { header: { projectTitle: 'TEST', diameterIn: '48', pipeGrade: 'X70', pipeStandard: 'API 1104', wpsNo: 'W1', reportNo: 'R1', dateJalali: '1405.01.01' }, thk: [0.5, 0.6, 0.7, 0.8], rows: rows.map((r) => ({ sec: r.sec, weldNo: r.weldNo, pipeNo: r.pipeNo, lengthM: 11.8, thkIn: 0.5, sizeIn: '48', bendDeg: '', stampsL: ['', '', '', ''] as [string, string, string, string], stampsR: ['', '', '', ''] as [string, string, string, string], vt: 'ACC', remark: '' })), prior: { len: [0, 0, 0, 0], joints: [0, 0, 0, 0] } }, p).values
        } else if (spec) {
          values = specPage(spec, tpl, { header: { date: '1405.01.01', reportNo: 'R1', pipeSpec: 'Pipe 48"', wps: 'W1' }, rows, thk: [0.5, 0.6, 0.7, 0.8], prior: { len: [0, 0, 0, 0], joints: [0, 0, 0, 0] } }, p).values
          void specPages
        }
        inner.push(renderToStaticMarkup(<GridSheet tpl={tpl} values={values} />))
      }
      out.push({ id: `${b.formKey}-n${n}`, formKey: b.formKey, records: n, expectedPages: pages, scale: plan.scale, excelScale: plan.excelScale, orientation: tpl.print.orientation, margins: tpl.print.margins, html: page(plan.css, plan.scale, inner) })
    }
  }
  return out
}
