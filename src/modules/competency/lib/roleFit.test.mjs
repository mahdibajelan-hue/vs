import assert from 'node:assert/strict'
import { roleFit, rankRoles, readinessOf, meetsCompetencyFilters } from './roleFit.ts'
import { raterAgreement } from './raterAgreement.ts'

const req = (id, level, crit = false, w = 1) => ({ competencyId: id, requiredLevel: level, isCritical: crit, weight: w })
const lv = (id, a) => ({ competencyId: id, actualLevel: a })

// ── fit: attainment is capped at 100 %, unknown competencies are excluded from fit and lower coverage
let f = roleFit('pm', [lv('a', 4), lv('b', 2), lv('c', null)], [req('a', 3), req('b', 4, true, 2), req('c', 3)])
assert.equal(f.fit, Math.round(((1 * 1) + (2 * 0.5)) / 3 * 100)); assert.equal(f.coverage, 3 / 4); assert.deepEqual(f.unknown, ['c'])
assert.equal(f.criticalGaps.length, 1); assert.equal(f.gaps[0].competencyId, 'b'); assert.equal(f.monthsToReady, Math.round(2 * 4 * 1.25))
assert.equal(f.strengths.length, 1)
// ── readiness bands
assert.equal(readinessOf(95, 0, 0.9), 'ready'); assert.equal(readinessOf(95, 1, 0.9), 'near', 'a critical gap blocks "ready"'); assert.equal(readinessOf(95, 0, 0.4), 'near', 'thin evidence blocks "ready"')
assert.equal(readinessOf(60, 3, 1), 'developing'); assert.equal(readinessOf(30, 0, 1), 'far'); assert.equal(readinessOf(90, 0, 0.1), 'unknown'); assert.equal(readinessOf(null, 0, 1), 'unknown')
// ── ranking: a critical gap costs 15 points
const levels = [lv('a', 5), lv('b', 3), lv('c', 5)]
const roles = new Map([['x', [req('a', 5), req('b', 5, true), req('c', 5)]], ['y', [req('a', 4), req('b', 3), req('c', 4)]]])
const rk = rankRoles(levels, roles); assert.equal(rk[0].roleId, 'y'); assert.equal(rk[1].roleId, 'x')
assert.equal(rankRoles([lv('z', null)], roles).length, 0, 'a role with no evidence at all is not ranked')
assert.equal(meetsCompetencyFilters(levels, [{ competencyId: 'a', minLevel: 4 }, { competencyId: 'b', minLevel: 3 }]), true)
assert.equal(meetsCompetencyFilters(levels, [{ competencyId: 'q', minLevel: 1 }]), false)

// ── rater agreement
const sh = (id, scores) => ({ raterId: id, name: id, scores })
let ag = raterAgreement([sh('r1', { q1: 3, q2: 4, q3: 2, q4: 5 }), sh('r2', { q1: 3, q2: 4, q3: 3, q4: 4 }), sh('r3', { q1: 4, q2: 4, q3: 2, q4: 5 })])
assert.equal(ag.level, 'high'); assert.equal(ag.withinOne, 1); assert.equal(ag.raters.every((r) => !r.flag), true)
ag = raterAgreement([sh('a', { q1: 5, q2: 5, q3: 4, q4: 5 }), sh('b', { q1: 2, q2: 3, q3: 2, q4: 3 }), sh('c', { q1: 3, q2: 3, q3: 3, q4: 3 })])
assert.equal(ag.level, 'low'); assert.ok(ag.questions[0].disagree); assert.ok(ag.advice.length >= 2)
assert.equal(ag.raters.find((r) => r.raterId === 'a').flag, 'lenient'); assert.equal(ag.raters.find((r) => r.raterId === 'b').flag, 'harsh')
assert.equal(raterAgreement([sh('a', { q1: 3 })]).level, 'insufficient'); assert.equal(raterAgreement([]).level, 'insufficient')
console.log('role fit & rater agreement ok')
