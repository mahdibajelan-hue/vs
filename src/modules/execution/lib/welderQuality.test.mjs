import assert from 'node:assert/strict'
import { welderQuality, rankWelders } from './welderQuality.ts'
const month = (iso) => ({ key: `M${iso.slice(0, 7)}`, label: iso.slice(0, 7) })
const W = (date, weldNo, stamps) => ({ formKey: 'welding', date, detail: { sec: 'S1', weldNo, ...stamps } })
const R = (date, weldNo, result) => ({ formKey: 'rt_report', date, detail: { sec: 'S1', weldNo, result } })
const rows = [
  W('2026-01-02', '1', { stampRoot: 'A', stampCap: 'B' }), W('2026-01-02', '2', { stampRoot: 'A' }), W('2026-01-03', '3', { stampRoot: 'B' }), W('2026-02-01', '4', { stampRoot: 'A' }),
  R('2026-01-05', '1', 'rep'), R('2026-01-20', '1', 'acc'),        // first RT says repair; the re-shoot is not counted again
  R('2026-01-05', '2', 'acc'), R('2026-01-06', '3', 'acc'), R('2026-02-10', '4', 'acc'),
  R('2026-01-08', '99', 'rep'),                                      // weld nobody welded in the register: ignored
]
const q = welderQuality(rows, month)
assert.deepEqual(q.get('A').months.map((m) => [m.key, m.tested, m.repaired, m.rate]), [['M2026-01', 2, 1, 50], ['M2026-02', 1, 0, 0]])
assert.equal(q.get('A').tested, 3); assert.equal(q.get('A').repaired, 1); assert.equal(q.get('A').rate, 33.3)
assert.equal(q.get('B').rate, 50) // welds 1 (repair) and 3 (ok)
assert.equal(q.has('99'), false)
// ranking: lowest repair % first; too few radiographed welds → unranked
let r = rankWelders(q, 'ALL', 2)
assert.equal(r.get('A').rank, 1); assert.equal(r.get('B').rank, 2); assert.equal(r.get('A').score, 66.7); assert.equal(r.get('A').of, 2)
r = rankWelders(q, 'ALL', 3)
assert.equal(r.get('A').rank, 1); assert.equal(r.get('B').rank, null); assert.equal(r.get('B').score, null)
// month view: A has 50 % in January, B 50 % → equal rate and equal sample share rank 1
r = rankWelders(q, 'M2026-01', 2)
assert.equal(r.get('A').rank, 1); assert.equal(r.get('B').rank, 1)
// perfect welder beats everybody; a better welder with more tests wins ties
const more = welderQuality([W('2026-01-01', '1', { stampRoot: 'X' }), W('2026-01-01', '2', { stampRoot: 'X' }), W('2026-01-01', '3', { stampRoot: 'Y' }), R('2026-01-02', '1', 'acc'), R('2026-01-02', '2', 'acc'), R('2026-01-02', '3', 'acc')], month)
const rr = rankWelders(more, 'ALL', 1)
assert.equal(rr.get('X').rank, 1); assert.equal(rr.get('Y').rank, 2); assert.equal(rr.get('X').score, 100)
console.log('welder quality: all assertions passed')
