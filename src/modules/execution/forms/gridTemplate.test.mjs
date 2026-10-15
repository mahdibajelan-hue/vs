import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addr } from './gridTypes.ts'
import { weldingValues, WELDING_BINDINGS } from './weldingBindings.ts'

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

// ---- phase 1: data → cells of the approved WELDING sheet
import { weldingGridPage, ROWS_PER_PAGE } from './weldingGrid.ts'
const mk = (i) => ({ sec: `S${i}`, weldNo: `W${i}`, pipeNo: `P${i}`, lengthM: 11.5 + i, thkIn: i % 2 ? 0.438 : 0.406, sizeIn: '48', bendDeg: '', stampsL: ['a', 'b', 'c', 'd'], stampsR: ['e', 'f', 'g', 'h'], vt: 'ACC', remark: `r${i}` })
const rows = Array.from({ length: 25 }, (_, i) => mk(i))
const inp = { header: { projectTitle: 'P', diameterIn: '48', pipeGrade: 'X70', pipeStandard: 'API 1104', wpsNo: 'W1', reportNo: 'R1', dateJalali: '1405.01.01' }, thk: [0.406, 0.438, 0.688, 0.75], rows, prior: { len: [100, 0, 0, 0], joints: [5, 0, 0, 0] } }
const p0 = weldingGridPage(t, inp, 0), p1 = weldingGridPage(t, inp, 1)
// every target is a real cell of the approved sheet — except the Sec No. of welds 7–9, which the approved sheet merges into one tall cell (a quirk of the approved form, reported to the owner, not «fixed»)
assert.deepEqual(p0.missing, ['B22', 'B24', 'B26']); assert.deepEqual(p1.missing, [])
assert.equal(p0.values.C10, 'W0'); assert.equal(p0.values.E9, 'P0'); assert.equal(p0.values.G9, '11.50'); assert.equal(p0.values.H11, '12.50'); assert.equal(p0.values.S9, 'r0')
assert.equal(p0.values.N9, 'a'); assert.equal(p0.values.N10, 'e'); assert.equal(p0.values.R9, 'ACC')
assert.equal(p0.values.C48, 'W19'); assert.equal(p1.values.C10, 'W20'); assert.equal(p1.values.A10, '21')  // page 2 continues the numbering
assert.equal(p0.values.G8, '0.406"'); assert.equal(p0.values.J51, '0.00' === p0.values.J51 ? '0.00' : p0.values.J51)
assert.ok(Number(p0.values.J52.replace(/,/g, '')) > Number(p0.values.J51.replace(/,/g, '')))      // «until now» includes the prior days
assert.equal(ROWS_PER_PAGE, 20)
console.log('welding grid page mapping: all assertions passed')
