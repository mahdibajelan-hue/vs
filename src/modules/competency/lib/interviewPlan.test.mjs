import assert from 'node:assert/strict'
import { planInterview, estimateMinutes } from './interviewPlan.ts'
const c = (id, crit, w, cats = []) => ({ id, isCritical: crit, weight: w, techCategories: cats })
const cs = [c('a', true, 3, ['TECHNICAL']), c('b', false, 2, ['TECHNICAL']), c('c', false, 2), c('d', false, 1), c('e', true, 2), c('f', false, 5, ['SCENARIO'])]
let p = planInterview(cs, new Set(['TECHNICAL']), { needsTechnical: true })
assert.deepEqual(p.covered, ['b'], 'only a non-critical competency already covered by a technical question is parked')
assert.deepEqual(p.primary.slice(0, 2), ['a', 'e'], 'critical ones come first'); assert.equal(p.primary.length, 5)
p = planInterview(cs, new Set(['TECHNICAL']), { needsTechnical: true, max: 3 }); assert.equal(p.primary.length, 3); assert.deepEqual(p.deferred.length, 2)
p = planInterview(cs, new Set(), { needsTechnical: false }); assert.equal(p.covered.length, 0); assert.equal(p.primary.length, 6)
const m = estimateMinutes(Array.from({ length: 15 }, (_, i) => ({ difficulty: i % 2 ? 'L3' : 'L2', category: i % 5 === 0 ? 'SCENARIO' : 'TECHNICAL' })), 12)
assert.ok(m.total >= 150, 'the old default of 15 + 12 is a two-and-a-half-hour session'); assert.equal(estimateMinutes([], 0).total, 0)
const lean = estimateMinutes(Array.from({ length: 8 }, () => ({ difficulty: 'L3', category: 'TECHNICAL' })), 5); assert.ok(lean.total <= 90)
import { deriveRatings } from './interviewPlan.ts'
const dr = deriveRatings([{ id: 'a', techCategories: ['TECHNICAL'] }, { id: 'b', techCategories: ['SCENARIO'] }, { id: 'c', techCategories: [] }], [{ id: 'q1', category: 'TECHNICAL' }, { id: 'q2', category: 'TECHNICAL' }, { id: 'q3', category: 'SCENARIO' }], { q1: 4, q2: 3, q3: 0 })
assert.equal(dr.get('a').rating, 4); assert.equal(dr.get('a').questions, 2); assert.equal(dr.get('b').rating, 1, 'a 0 on the technical scale is the lowest interview rating, not "no rating"'); assert.ok(!dr.has('c'))
console.log('interview plan ok')
