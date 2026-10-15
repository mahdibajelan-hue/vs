import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addr } from './gridTypes.ts'
import { weldingValues, WELDING_BINDINGS } from './welding.bindings.ts'

const t = JSON.parse(readFileSync(new URL('./templates/welding.grid.json', import.meta.url)))
assert.equal(addr(0, 0), 'A1'); assert.equal(addr(4, 18), 'S5'); assert.equal(addr(0, 26), 'AA1')
assert.equal(t.sheet, 'WELDING'); assert.equal(t.area, 'A1:S55'); assert.equal(t.cols.length, 19); assert.equal(t.rows.length, 55)
assert.equal(t.stats.merged, 298); assert.equal(t.stats.hiddenCols, 1); assert.equal(t.cols[5].hidden, true)
assert.match(t.source.sha256, /^[0-9a-f]{64}$/)
// every bound cell exists in the approved sheet and is a plain text/blank cell (no silent layout change)
const cells = new Map(t.cells.map((c) => [addr(c.r, c.c), c]))
for (const b of WELDING_BINDINGS) assert.ok(cells.has(b.cell), `bound cell ${b.cell} missing in the template`)
const fixed = Object.fromEntries(t.cells.filter((c) => c.v).map((c) => [addr(c.r, c.c), c.v]))
const v = weldingValues({ projectTitle: 'P', diameterIn: '48', pipeGrade: 'X70', pipeStandard: 'API 1104', wpsNo: 'W1', reportNo: 'R1', page: 1, pages: 2, dateJalali: '1405/01/01' }, fixed)
assert.equal(v.A4, 'Pipe 48" , X70 , API 1104'); assert.equal(v.K4, 'WPS NO. : W1'); assert.equal(v.K5, '2')
// fixed texts of the approved sheet are untouched by bindings: unbound cells never appear in the result
assert.ok(!('A3' in v) && fixed.A3 === 'DAILY WELDING REPORT')
console.log('grid template pilot: all assertions passed')
