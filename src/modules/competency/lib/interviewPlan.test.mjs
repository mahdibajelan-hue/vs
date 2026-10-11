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
console.log('interview plan ok')
