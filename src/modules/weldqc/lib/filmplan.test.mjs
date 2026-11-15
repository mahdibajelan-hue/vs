import assert from 'node:assert/strict'
import { circOf, clockOfMm, clockOnFilm, covered, crewMinOf, crewShort, defaultFilmCount, mergeCrewMin, plan, repairZone, uncovered } from './filmplan.ts'
const od = 56 * 25.4, c = circOf(od) // 4469 mm
assert.equal(defaultFilmCount(od), 3); assert.equal(defaultFilmCount(10 * 25.4), 3); assert.equal(defaultFilmCount(od, 400), 12)
const p = plan(od, 3); assert.equal(p.length, 3); assert.equal(p[0].startMm, 0); assert.equal(p[1].clockFrom, 4); assert.equal(p[2].clockTo, 12)
assert.equal(clockOfMm(c / 4, c), 3); assert.equal(clockOfMm(c * 1.5, c), 6)
// a point 372 mm along the second film of three on 56″: (1490 + 372) / 4469 × 12 = 5.0
assert.equal(clockOnFilm({ startMm: p[1].startMm, lenMm: p[1].lenMm }, 500, 2000, null, od), 5)
assert.equal(clockOnFilm({ startMm: p[1].startMm, lenMm: p[1].lenMm }, 744, 2000, 2, od), 5) // calibrated: 744 px ÷ 2 px/mm
assert.equal(clockOnFilm({ startMm: null, lenMm: null }, 10, 100, null, od), null)
const all = covered(p, c); assert.ok(Math.abs(all.mm - c) < 10 && !all.gaps.length)
const two = covered([p[0], p[2]], c); assert.equal(two.gaps.length, 1); assert.ok(Math.abs(two.gaps[0][0] - p[1].startMm) < 15)
assert.equal(covered([{ startMm: null, lenMm: null }], c).mm, 0)
// after a repair at 5 o'clock, a 400 mm film over it is enough; one elsewhere is not
const z = repairZone([{ clock: 5, lengthMm: 40 }, { clock: 5.4, lengthMm: 20 }], c)
assert.ok(z.from < 5 && z.from > 4.7 && z.to > 5.4 && z.to < 5.7, JSON.stringify(z))
const zf = (z.from / 12) * c, zt = (z.to / 12) * c
assert.equal(uncovered([{ startMm: zf - 60, lenMm: 400 }], zf, zt, c), 0)
assert.ok(uncovered([{ startMm: 0, lenMm: 400 }], zf, zt, c) > 100)
const zz = repairZone([{ clock: 11.8, lengthMm: 30 }, { clock: 0.3, lengthMm: 30 }], c); assert.ok(zz.from > 11 && zz.to < 1, JSON.stringify(zz)) // across 12 o'clock
assert.equal(repairZone([{ clock: null, lengthMm: 5 }], c), null)
// welders: 8″ → 1, 24″ → 2, 56″ → 4 on root and hot
assert.equal(crewMinOf(8).root, 1); assert.equal(crewMinOf(24).root, 2); assert.equal(crewMinOf(36).hot, 4); assert.equal(crewMinOf(56).fill, 2); assert.equal(crewMinOf(null), null)
assert.deepEqual(crewShort(56, { root: ['1', '2'], hot: ['1', '2', '3', '4'], fill: [], cap: ['5', '6'] }), [{ pass: 'root', have: 2, need: 4 }])
assert.equal(mergeCrewMin([{ maxIn: 20, root: 2, hot: 2, fill: 1, cap: 1 }]).length, 1); assert.equal(mergeCrewMin('x').length, 3)
console.log('filmplan: ok')
