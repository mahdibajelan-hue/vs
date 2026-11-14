import assert from 'node:assert/strict'
import { train, pReal, learnedCode, report, MIN_REAL } from './learn.ts'

let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const F = (o) => ({ cnr: 8, area: 60, len: 12, wid: 6, elong: 2, angle: 0, pos: 0.5, fill: 0.8, voidLike: 1, lenRel: 0.2, widRel: 0.1, through: 0, ...o })
// the interpreters keep dismissing faint specks at the bead edge and keep accepting strong central lines
const samples = []
for (let i = 0; i < 40; i++) samples.push({ f: F({ cnr: 4 + rnd() * 2, area: 10 + rnd() * 10, pos: rnd() < 0.5 ? 0.05 : 0.95, elong: 1 + rnd() }), real: false, code: null })
for (let i = 0; i < 40; i++) samples.push({ f: F({ cnr: 12 + rnd() * 8, area: 150 + rnd() * 100, pos: 0.45 + rnd() * 0.1, elong: 8 + rnd() * 6 }), real: true, code: 'IP' })
for (let i = 0; i < 25; i++) samples.push({ f: F({ cnr: 10 + rnd() * 5, area: 30 + rnd() * 20, pos: 0.25 + rnd() * 0.5, elong: 1 + rnd() * 0.4 }), real: true, code: 'P' })
assert.equal(train(samples.slice(0, MIN_REAL - 1)), null) // too few
assert.equal(train(samples.slice(0, 40)), null) // one kind only
const m = train(samples)
assert.ok(m && m.n === 105 && m.cv > 0.9, JSON.stringify(m && m.cv))
assert.ok(pReal(m, F({ cnr: 4.5, area: 12, pos: 0.04, elong: 1.2 })) < 0.25)
assert.ok(pReal(m, F({ cnr: 15, area: 200, pos: 0.5, elong: 10 })) > 0.8)
assert.equal(learnedCode(m, F({ cnr: 15, area: 200, pos: 0.5, elong: 10 })).code, 'IP')
assert.equal(learnedCode(m, F({ cnr: 12, area: 40, pos: 0.4, elong: 1.1 })).code, 'P')

const r = report([
  { action: 'accepted', aiCode: 'IP', finalCode: 'IP', filmId: 'a', detector: 'cv2.0' }, { action: 'modified', aiCode: 'ISI', finalCode: 'P', filmId: 'a', detector: 'cv2.0' },
  { action: 'dismissed', aiCode: 'P', finalCode: null, filmId: 'b', detector: 'cv2.0' }, { action: 'dismissed', aiCode: null, finalCode: null, filmId: 'b', detector: 'cv2.0' },
  { action: 'missed', aiCode: null, finalCode: 'C', filmId: 'b', detector: 'cv2.0' },
])
assert.equal(r.reviewed, 4); assert.equal(r.precision, 0.5); assert.equal(r.codeAgreement, 0.5); assert.ok(Math.abs(r.recall - 2 / 3) < 1e-9); assert.equal(r.films, 2)
assert.equal(r.byCode.find((x) => x.code === 'C').missed, 1)
console.log('learn: ok')
