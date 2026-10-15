import assert from 'node:assert/strict'
import { designGrid, designShape, designValues } from './designGrid.ts'
const t = designGrid({ formKey: 'x', title: 'فرم آزمون', headerLabels: ['تاریخ', 'محل', 'شماره'], columns: [{ label: 'شرح' }, { label: 'مقدار' }], rows: 5, signers: ['الف', 'ب'] })
const sh = designShape(t)
assert.deepEqual(sh.headers.map((h) => h.label), ['تاریخ', 'محل', 'شماره'])
assert.deepEqual(sh.columns, ['شرح', 'مقدار']); assert.equal(sh.rows, 5)
const v = designValues(t, ['۱', '', '۳'], [['a', '1'], ['b', '2']])
const have = new Set(t.cells.map((c) => { let n = c.c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s + (c.r + 1) }))
for (const a of Object.keys(v)) assert.ok(have.has(a), `value written outside the sheet: ${a}`)
assert.equal(Object.keys(v).length, 2 + 4)
console.log('designGrid: all assertions passed')
