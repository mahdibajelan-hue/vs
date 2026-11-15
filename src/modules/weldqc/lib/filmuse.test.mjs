import assert from 'node:assert/strict'
import { filmUse, repeatRate } from './filmuse.ts'
const F = (round, quality, lenMm, date = '2026-01-10') => ({ round, quality, lenMm, date, odMm: 1422 })
const u = filmUse([F(0, 'accepted', 1500), F(0, 'accepted', 1500), F(0, 'reshoot', 1500), F(0, 'retake', 1500, '2026-02-01'), F(1, 'accepted', 400, '2026-02-03'), F(0, 'pending', null, '2026-02-04')], (f) => f.date.slice(0, 7))
assert.deepEqual(u.rows.map((r) => r.key), ['2026-01', '2026-02'])
assert.equal(u.total.films, 6); assert.equal(u.total.first, 3); assert.equal(u.total.rs, 1); assert.equal(u.total.retake, 1); assert.equal(u.total.reshoot, 1); assert.equal(u.total.pending, 1)
assert.ok(Math.abs(u.total.metres - 6.4) < 1e-9); assert.equal(repeatRate(u.total), 0.5); assert.equal(repeatRate(filmUse([], () => '').total), null)
console.log('filmuse: ok')
