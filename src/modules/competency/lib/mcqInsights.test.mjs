import assert from 'node:assert/strict'
import { mcqInsight } from './mcqInsights.ts'
const t = { total: 30, answered: 30, correct: 28, timeSpentSeconds: 1255, difficulty: [{ difficulty: 1, total: 9, correct: 8 }, { difficulty: 2, total: 13, correct: 13 }, { difficulty: 3, total: 8, correct: 7 }] }
let r = mcqInsight(t, { scores: [76.7, 76.7, 96.7, 100, 88, 90] })
assert.equal(Math.round(r.raw * 10) / 10, 93.3); assert.ok(r.weighted > 92 && r.weighted < 95)
assert.equal(Math.round(r.guessCorrected), 91, '28 right, 2 wrong, four options')
assert.ok(r.percentile > 55 && r.percentile < 90); assert.equal(r.cohortSize, 6); assert.ok(!r.flags.includes('FAST')); assert.ok(r.flags.includes('EASY_ONLY'), '8 of 30 hard items is under a third')
r = mcqInsight({ ...t, correct: 30, timeSpentSeconds: 400 }, { scores: [70, 72] })
assert.ok(r.flags.includes('FAST') && r.flags.includes('CEILING') && r.flags.includes('THIN_COHORT')); assert.equal(r.percentile, null)
assert.equal(mcqInsight({ total: 0, answered: 0, correct: 0, timeSpentSeconds: null, difficulty: [] }, { scores: [] }).raw, 0)
console.log('mcq insights ok')
