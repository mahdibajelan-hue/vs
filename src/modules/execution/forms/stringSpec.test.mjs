import assert from 'node:assert/strict'
import { GRID_SPECS, specPage, cellTarget, specPages } from './gridSpecs.ts'

// the stringing sheet («حمل و ریسه لوله»): two side-by-side blocks of 20 rows from sheet row 8, thickness summary from row 31
const spec = GRID_SPECS.string, tpl = { cells: [] }
const rows = Array.from({ length: 23 }, (_, i) => ({ pipeNo: `P-${100 + i}`, lengthM: '12', thkIn: i < 21 ? '0.438' : '0.688', origin: i % 2 ? 'depot' : 'factory' }))
const pg = specPage(spec, tpl, { header: { date: '1405.08.29', reportNo: 'STRING-001' }, rows, priorByThk: { '0.438': { len: 120, joints: 10 } } }, 0)
assert.equal(specPages(spec, 23), 1)                       // 40 records per page
assert.equal(pg.values.B8, 'P-100'); assert.equal(pg.values.A8, '1'); assert.equal(pg.values.E8, '✓')     // record 1: left block
assert.equal(pg.values.H8, 'P-120'); assert.equal(pg.values.G8, '21'); assert.equal(pg.values.K8, '✓')    // record 21: right block, factory tick
assert.equal(pg.values.H10, 'P-122')
assert.match(pg.values.C5, /1405\/08\/29/)                   // date written next to «تاریخ :»
// thickness summary: 0.438 → earlier 10 / 120 m, today 21 / 252 m, to date 31 / 372 m; 0.688 → 2 today
assert.equal(pg.values.B31, '0.438"'); assert.equal(pg.values.C31, '10'); assert.equal(pg.values.E31, '21'); assert.equal(pg.values.G31, '252.00'); assert.equal(pg.values.I31, '31'); assert.equal(pg.values.J31, '372.00')
assert.equal(pg.values.B32, '0.688"'); assert.equal(pg.values.E32, '2')
// clicking the right block's pipe cell edits record 21
assert.deepEqual(cellTarget(spec, 'H8', 0), { kind: 'row', row: 20, key: 'pipeNo' })
assert.deepEqual(cellTarget(spec, 'B27', 0), { kind: 'row', row: 19, key: 'pipeNo' })
console.log('stringSpec ok')
