import assert from 'node:assert/strict'
import { cycleScore, jalaliQuarter, BAND_FA } from './inservice.ts'
import { disciplineState } from './discipline.ts'

// ── weighted score over the sources that have data
let r = cycleScore({ ratings: [{ kind: 'employer', rating: 5 }, { kind: 'employer', rating: 3 }, { kind: 'peer', rating: 4 }], technical: 80, results: [{ label: 'a', score: 90, weight: 2 }, { label: 'b', score: 60, weight: 1 }] })
assert.equal(r.components.find((c) => c.key === 'employer').score, 75); assert.equal(r.components.find((c) => c.key === 'peers').score, 75)
assert.equal(r.components.find((c) => c.key === 'results').score, 80)
assert.equal(r.final, Math.round((75 * 35 + 75 * 15 + 80 * 20 + 80 * 20) / (35 + 15 + 20 + 20))); assert.deepEqual(r.missing, ['زیردستان (۳۶۰)']); assert.equal(r.coverage, 90 / 100)
r = cycleScore({ ratings: [], technical: null, results: [] }); assert.equal(r.final, null); assert.equal(BAND_FA(null).label, 'بدون دادهٔ کافی')
assert.equal(cycleScore({ ratings: [{ kind: 'employer', rating: 1 }], technical: null, results: [] }).final, 0, 'the lowest rating is 0, not "no data"')
assert.equal(cycleScore({ ratings: [{ kind: 'supervisor', rating: 5 }], technical: null, results: [] }).final, null, 'a source with weight 0 does not count')
// ── Jalali quarter: 2026-10-11 is in Mehr 1405, the third quarter
const q = jalaliQuarter('2026-10-11'); assert.ok(q.label.includes('فصل ۳')); assert.equal(q.start, '2026-09-23'); assert.ok(q.end >= '2026-12-20' && q.end <= '2026-12-22')

// ── discipline
const d = (kind, status, o = {}) => ({ id: Math.random() + '', kind, points: null, startDate: '2026-09-01', endDate: null, status, ...o })
let s = disciplineState([d('score_deduction', 'approved', { points: 10 }), d('score_deduction', 'approved', { points: 5 }), d('score_deduction', 'proposed', { points: 50 }), d('score_deduction', 'revoked', { points: 20 })], '2026-10-11')
assert.equal(s.conductScore, 85); assert.equal(s.pending, 1); assert.ok(s.eligible); assert.equal(s.label, 'دارای کسر امتیاز')
s = disciplineState([d('suspension', 'approved', { endDate: '2026-10-20' })], '2026-10-11'); assert.equal(s.suspendedUntil, '2026-10-20'); assert.ok(!s.eligible)
assert.ok(disciplineState([d('suspension', 'approved', { endDate: '2026-10-05' })], '2026-10-11').eligible, 'an expired suspension no longer blocks')
s = disciplineState([d('work_ban', 'approved')], '2026-10-11'); assert.ok(s.banned && !s.eligible && s.label === 'ممنوع‌الکار')
assert.ok(disciplineState([d('work_ban', 'proposed')], '2026-10-11').eligible, 'a proposal changes nothing until it is approved')
assert.equal(disciplineState([d('score_deduction', 'approved', { points: 90 }), d('score_deduction', 'approved', { points: 40 })], '2026-10-11').conductScore, 0)
console.log('inservice & discipline ok')
