const test = async (name, f) => { try { await f() } catch (e) { e.message = name + ': ' + e.message; throw e } } // plain assert script like the rest of the suite (scripts/run-tests.mjs only awaits the import)
import assert from 'node:assert/strict'
import { setRowHeight, setColWidth, scaleRows, scaleCols, styleCells, sameStructure } from './gridAdjust.ts'
const st = (h = null, sz = 11) => ({ f: ['Arial', sz, false, false, false, null], a: [h, 'center', false, 0, 0], b: [null, null, null, null], bg: null, nf: null })
const base = () => ({ formKey: 'x', sheet: 'S', area: 'A1:B2', source: { file: 'f', sha256: 'h' }, print: { orientation: 'portrait', paperSize: 9, scale: null, fitToPage: true, margins: { left: 0, right: 0, top: 0, bottom: 0 }, center: false }, rtl: false,
  cols: [{ w: 100, hidden: false }, { w: 60, hidden: true }], rows: [{ h: 20, hidden: false }, { h: 30, hidden: false }], styles: [st(), st('left')],
  cells: [{ r: 0, c: 0, s: 0, v: 'الف' }, { r: 0, c: 1, s: 0, v: 'ب' }, { r: 1, c: 0, s: 1, cs: 2, v: 'ج' }], logos: [], stats: { cells: 3, merged: 1, texts: 3, hiddenCols: 1 } })
await test('sizes are clamped and recorded; structure untouched', () => {
  const t = setColWidth(setRowHeight(base(), [0], 5), [0], 9999)
  assert.equal(t.rows[0].h, 8); assert.equal(t.cols[0].w, 600); assert.equal(t.adjusted.ops.length, 2); assert.ok(sameStructure(base(), t))
  const s = scaleCols(scaleRows(base(), 150), 50); assert.equal(s.rows[1].h, 45); assert.equal(s.cols[0].w, 50)
})
await test('alignment by scope shares styles and leaves the original object alone', () => {
  const b = base(), t = styleCells(b, 'row', [0, 0], { h: 'center' })
  assert.equal(b.cells[0].s, 0); assert.equal(t.styles[t.cells[0].s].a[0], 'center'); assert.equal(t.cells[0].s, t.cells[1].s); assert.equal(t.cells[2].s, 1)
  assert.equal(styleCells(t, 'row', [0, 0], { h: 'center' }), t) // no-op returns the same object
  const all = styleCells(b, 'all', [0, 0], { sizeDelta: 2, bold: true }); assert.equal(all.styles[all.cells[2].s].f[1], 13); assert.ok(all.cells.every((c) => all.styles[c.s].f[2]))
  assert.ok(sameStructure(b, all))
})
await test('font size is clamped', () => {
  const t = styleCells(base(), 'cell', [0, 0], { size: 500 }); assert.equal(t.styles[t.cells[0].s].f[1], 40)
})
