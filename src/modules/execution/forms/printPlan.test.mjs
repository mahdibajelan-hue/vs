import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { printPlan } from './printPlan.ts'

const dir = new URL('./templates/', import.meta.url)
let n = 0
for (const f of readdirSync(dir).filter((x) => x.endsWith('.grid.json'))) {
  const t = JSON.parse(readFileSync(new URL(f, dir)))
  const p = printPlan(t)
  n++
  assert.ok(p.scale > 0 && p.scale <= p.excelScale + 1e-9, `${f}: scale never exceeds the Excel scale`)
  assert.ok(p.sheetW * p.scale <= p.pageW + 1e-6, `${f}: fits the page width`)
  // a sheet meant to be one page (not more than 8% taller) must fit the page height with slack
  const overflow = (p.sheetH * Math.min(p.excelScale, p.pageW / p.sheetW)) / p.pageH
  if (overflow <= 1.08) assert.ok(p.sheetH * p.scale <= p.pageH, `${f}: fits the page height (${(p.sheetH * p.scale / p.pageH).toFixed(3)})`)
  if (overflow <= 1 / 1.025) assert.equal(p.heightFitted, false, `${f}: a sheet that already fits is not shrunk`)
  assert.match(p.css, /@page \{ size: A4 (portrait|landscape);/)
}
assert.ok(n >= 11, 'all bundled sheets are covered')
// a genuinely multi-page sheet is left alone
const tall = { print: { orientation: 'portrait', scale: 100, margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 } }, cols: [{ w: 600, hidden: false }], rows: Array.from({ length: 100 }, () => ({ h: 40, hidden: false })) }
const pt = printPlan(tall)
assert.equal(pt.heightFitted, false); assert.equal(pt.scale, Math.min(1, pt.pageW / 600))
console.log(`printPlan: all assertions passed (${n} sheets)`)
