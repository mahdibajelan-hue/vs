import assert from 'node:assert/strict'
import { evaluate, mergeApi, API1104_DEFAULT, quadrantOf, positionOfClock, clockOfPosition, codeOfType, adviceFor } from './api1104.ts'

const J56 = { odMm: 1422.4, thkMm: 19.05 } // 56 in: weld length ≈ 4469 mm
const J2 = { odMm: 60.3, thkMm: 3.9 }      // 2⅜ in: weld length ≈ 189 mm (< 300 mm)
const D = (id, code, lengthMm, o = {}) => ({ id, code, lengthMm, positionMm: 0, ...o })
const V = (j, ds) => evaluate(j, ds)

// weld length and window
let r = V(J56, [])
assert.ok(Math.abs(r.weldLengthMm - Math.PI * 1422.4) < 1e-6); assert.equal(r.windowMm, 300); assert.equal(r.overall, 'accept')
assert.ok(Math.abs(V(J2, []).windowMm - Math.PI * 60.3) < 1e-6) // the window is never longer than the weld

// IP: 25 mm single, 25 mm in 300 mm — fixed lengths, not multiples of t
assert.equal(V(J56, [D('a', 'IP', 25)]).overall, 'accept')
assert.equal(V(J56, [D('a', 'IP', 26)]).overall, 'repair')
assert.equal(V(J56, [D('a', 'IP', 15, { positionMm: 0 }), D('b', 'IP', 15, { positionMm: 200 })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'IP', 15, { positionMm: 0 }), D('b', 'IP', 15, { positionMm: 400 })]).overall, 'accept')
// the window wraps round the circumference (12 o'clock is next to 11:59)
assert.equal(V(J56, [D('a', 'IP', 15, { positionMm: 4400 }), D('b', 'IP', 15, { positionMm: 100 })]).overall, 'repair')
// a thin-wall weld does not get a tighter IP limit (old rule was t × 1)
assert.equal(V({ odMm: 1066.8, thkMm: 12 }, [D('a', 'IP', 20)]).overall, 'accept')
// short weld: aggregate IP > 8 % of the weld length (189 mm → 15.2 mm)
assert.equal(V(J2, [D('a', 'IP', 8, { positionMm: 0 }), D('b', 'IP', 8, { positionMm: 90 })]).overall, 'repair')
assert.equal(V(J2, [D('a', 'IP', 7, { positionMm: 0 }), D('b', 'IP', 7, { positionMm: 90 })]).overall, 'accept')

// IPD 50 / 75, ICP 50 / 50
assert.equal(V(J56, [D('a', 'IPD', 50)]).overall, 'accept'); assert.equal(V(J56, [D('a', 'IPD', 51)]).overall, 'repair')
assert.equal(V(J56, [D('a', 'IPD', 40), D('b', 'IPD', 40, { positionMm: 100 })]).overall, 'repair')
// IF: 8 % of weld length applies to every weld
assert.equal(V(J56, [D('a', 'IF', 24)]).overall, 'accept'); assert.equal(V(J56, [D('a', 'IF', 26)]).overall, 'repair')

// slag: ESI 50 mm long or wider than 1.6 mm; ISI wider than 3 mm or more than 13 mm in 300 mm
assert.equal(V(J56, [D('a', 'ESI', 45, { widthMm: 1.5 })]).overall, 'accept')
assert.equal(V(J56, [D('a', 'ESI', 45, { widthMm: 1.8 })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'ESI', 55, { widthMm: 1 })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'ISI', 6, { widthMm: 2 }), D('b', 'ISI', 6, { widthMm: 2, positionMm: 50 })]).overall, 'accept')
assert.equal(V(J56, [D('a', 'ISI', 7, { widthMm: 2 }), D('b', 'ISI', 7, { widthMm: 2, positionMm: 50 })]).overall, 'repair')
// more than four ISI of the maximum width in 300 mm
assert.equal(V(J56, [0, 1, 2, 3, 4].map((k) => D(`i${k}`, 'ISI', 2, { widthMm: 3, positionMm: k * 40 }))).overall, 'repair')

// porosity: pore > min(3 mm, 25 % t)
assert.equal(V(J56, [D('a', 'P', 3)]).overall, 'accept'); assert.equal(V(J56, [D('a', 'P', 3.2)]).overall, 'repair')
assert.equal(V({ odMm: 323.9, thkMm: 8 }, [D('a', 'P', 2.5)]).overall, 'repair') // 25 % of 8 mm = 2 mm
// cluster porosity: dia 13, pore in cluster 2 mm
assert.equal(V(J56, [D('a', 'CP', 12, { widthMm: 1.5 })]).overall, 'accept'); assert.equal(V(J56, [D('a', 'CP', 12, { widthMm: 2.5 })]).overall, 'repair')
// hollow bead: two > 6 mm closer than 50 mm
assert.equal(V(J56, [D('a', 'HB', 7), D('b', 'HB', 7, { positionMm: 30 })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'HB', 7), D('b', 'HB', 7, { positionMm: 400 })]).overall, 'accept')

// burn-through only counts when darker than the base metal
assert.equal(V(J56, [D('a', 'BT', 8)]).overall, 'accept')
assert.equal(V(J56, [D('a', 'BT', 8, { densityOver: true })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'IC', 300)]).overall, 'accept')
assert.equal(V(J56, [D('a', 'IC', 10, { densityOver: true })]).overall, 'repair')

// cracks: crater ≤ 4 mm acceptable; longer and < 8 % weld length → repair (with approval); longer → cut out
assert.equal(V(J56, [D('a', 'C', 4)]).overall, 'accept')
assert.equal(V(J56, [D('a', 'C', 30)]).overall, 'repair')
assert.equal(V(J56, [D('a', 'C', 400)]).overall, 'cut_out')
assert.equal(V(J2, [D('a', 'C', 20)]).overall, 'cut_out') // 8 % of 189 mm = 15 mm

// undercut: 50 mm in 300 mm, 1/6 of weld length, depth min(0.8, 12.5 % t)
assert.equal(V(J56, [D('a', 'EU', 30, { depthMm: 0.5 }), D('b', 'IU', 30, { depthMm: 0.5, positionMm: 100 })]).overall, 'repair')
assert.equal(V(J56, [D('a', 'EU', 45, { depthMm: 0.5 })]).overall, 'accept')
assert.equal(V(J56, [D('a', 'EU', 10, { depthMm: 0.9 })]).overall, 'repair')
assert.equal(V(J2, [D('a', 'EU', 33, { depthMm: 0.2 })]).overall, 'repair') // 1/6 of 189 = 31.6 mm

// accumulation: IP 20 + ESI 20 + P 3 + IF 10 = 53 mm in 300 mm → all rejected, even though each passes alone
r = V(J56, [D('a', 'IP', 20), D('b', 'ESI', 20, { widthMm: 1, positionMm: 60 }), D('c', 'P', 3, { positionMm: 120 }), D('d', 'IF', 10, { positionMm: 200 })])
assert.equal(r.overall, 'repair'); assert.ok(r.findings.every((f) => f.verdict === 'repair')); assert.ok(r.findings[0].reasons.some((x) => x.includes('9.3.12')))
// IPD and undercut are not in the accumulation
assert.equal(V(J56, [D('a', 'IPD', 45), D('b', 'EU', 45, { depthMm: 0.2, positionMm: 600 }), D('c', 'IP', 20, { positionMm: 20 })]).overall, 'accept')

// reasons cite the clause; advice follows the verdict
r = V(J56, [D('a', 'IP', 30)]); assert.match(r.findings[0].reasons[0], /9\.3\.1/)
assert.match(adviceFor('IP', 'repair'), /ریشه/); assert.match(adviceFor('C', 'cut_out'), /برش/)

// criteria merge
const c = mergeApi({ ip: { single: 30 }, windowMm: 'x', junk: 1 }); assert.equal(c.ip.single, 30); assert.equal(c.windowMm, 300); assert.equal(API1104_DEFAULT.ip.single, 25)
assert.equal(evaluate(J56, [D('a', 'IP', 28)], c).overall, 'accept')

// clock ↔ position ↔ quadrant
assert.equal(quadrantOf(0), 1); assert.equal(quadrantOf(2.9), 1); assert.equal(quadrantOf(3), 2); assert.equal(quadrantOf(6), 3); assert.equal(quadrantOf(11.9), 4); assert.equal(quadrantOf(12), 1)
assert.ok(Math.abs(positionOfClock(6, 1000) - Math.PI * 500) < 1e-9); assert.ok(Math.abs(clockOfPosition(positionOfClock(4.5, 1422.4), 1422.4) - 4.5) < 1e-9)
assert.equal(codeOfType('slag_inclusion'), 'ESI'); assert.equal(codeOfType('other'), '')
console.log('api1104: ok')
