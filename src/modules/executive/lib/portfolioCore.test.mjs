import assert from 'node:assert/strict'
import { buildViews, criterionValues, decisionQueue, DEFAULT_WEIGHTS, normaliseWeights, priorityOf, quadrantOf, rollup, balanceByPhase } from './portfolioCore.ts'

const snap = (o = {}) => ({ health: 'green', healthScore: 80, drivenBy: null, spi: 1, cpi: 1, bacEvm: 1000, eac: 1000, actual: 40, planned: 40, phase: { code: 'G6', title: 'اجرا' }, ...o })
const proj = (id, o = {}) => ({ id, name: 'P' + id, code: id, portfolioId: null, programId: null, budget: 1000, manualEac: null, snapshot: snap(), riskLevel: 'medium', score: { strategic: 5, benefit: 3, mandatory: false, note: '', updatedAt: null, updatedBy: null }, decisions: [], ...o })

// criterion values: 1–5 scales to 0–100; value relative to the largest budget; missing data stays null
const v = criterionValues(proj('a', { score: null, riskLevel: null, snapshot: null, budget: 500 }), 1000)
assert.deepEqual(v, { strategic: null, benefit: null, value: 50, risk: null, performance: null })
assert.equal(criterionValues(proj('a'), 1000).strategic, 100)
assert.equal(criterionValues(proj('a'), 1000).benefit, 50)

// missing criteria are dropped and weights re-normalised (no default 50s)
const p1 = priorityOf({ strategic: 100, value: null, benefit: null, risk: null, performance: 50 }, DEFAULT_WEIGHTS)
assert.equal(p1.priority, Math.round((100 * 30 + 50 * 20) / 50))
assert.equal(p1.coverage, 0.5)
assert.equal(priorityOf({ strategic: null, value: null, benefit: null, risk: null, performance: null }, DEFAULT_WEIGHTS).priority, null)
// contributions add up to the score
const p2 = priorityOf({ strategic: 100, value: 40, benefit: 50, risk: 65, performance: 80 }, DEFAULT_WEIGHTS)
assert.ok(Math.abs(p2.contributions.reduce((a, c) => a + c.points, 0) - p2.priority) < 0.6)

// views: EAC from EVM when the project has an EPC budget, else the hand-entered one
const views = buildViews([
  proj('a'),
  proj('b', { snapshot: snap({ bacEvm: 0, eac: null, health: 'red', healthScore: 30 }), manualEac: 1300, budget: 1200 }),
  proj('c', { snapshot: null, score: { strategic: 1, benefit: 1, mandatory: true, note: '', updatedAt: null, updatedBy: null } }),
], DEFAULT_WEIGHTS)
assert.equal(views[0].eacSource, 'evm'); assert.equal(views[0].vac, 0)
assert.equal(views[1].eacSource, 'manual'); assert.equal(views[1].vac, -100); assert.equal(views[1].bac, 1200)
assert.equal(views[2].health, 'unknown')
// mandatory projects are not ranked against discretionary ones
assert.equal(views[2].rank, null)
assert.deepEqual(views.filter((x) => x.rank).map((x) => x.input.id), ['a', 'b'])

// decision queue: red health first, no-decision flagged, terminated projects dropped
const q = decisionQueue(views, '1405-08-06')
assert.equal(q[0].view.input.id, 'b'); assert.ok(q[0].reasons.includes('health'))
assert.ok(q.every((x) => x.reasons.includes('no_decision')))
const dec = (decision, reviewBy = null, o = {}) => ({ id: 'd' + decision, projectId: 'a', decision, rationale: 'x', conditions: '', reviewBy, healthAtDecision: null, priorityAtDecision: null, voided: false, voidReason: '', decidedBy: null, decidedAt: '2026-10-01T00:00:00Z', ...o })
const v2 = buildViews([proj('a', { decisions: [dec('continue', '2026-09-01')] }), proj('t', { decisions: [dec('terminate')], snapshot: snap({ health: 'red' }) })], DEFAULT_WEIGHTS)
const q2 = decisionQueue(v2, '2026-10-28')
assert.equal(q2.length, 1); assert.deepEqual(q2[0].reasons, ['review_due'])
// a voided decision does not count
const v3 = buildViews([proj('a', { decisions: [dec('continue', null, { voided: true })] })], DEFAULT_WEIGHTS)
assert.equal(v3[0].lastDecision, null)

// a critical milestone or action running late puts the project in the queue even with a valid decision
const v4 = buildViews([proj('a', { decisions: [dec('continue')], delivery: { milestonesDelayed: 2, criticalMilestonesDelayed: 1, overdueActions: 0, criticalOverdueActions: 0 } }), proj('z', { decisions: [dec('continue')], delivery: { milestonesDelayed: 3, criticalMilestonesDelayed: 0, overdueActions: 4, criticalOverdueActions: 0 } })], DEFAULT_WEIGHTS)
const q4 = decisionQueue(v4, '2026-10-28')
assert.equal(q4.length, 1); assert.deepEqual(q4[0].reasons, ['delivery'])

// half an EVM reading (SPI without CPI) is not a performance alarm
const v5 = buildViews([proj('h', { decisions: [dec('continue')], snapshot: snap({ spi: 0, cpi: null }) })], DEFAULT_WEIGHTS)
assert.equal(decisionQueue(v5, '2026-10-28').length, 0)

// SPI × CPI quadrants with the 0.95 band
assert.equal(quadrantOf(0.97, 1.02), 'on_track')
assert.equal(quadrantOf(0.8, 1.1), 'late_under')
assert.equal(quadrantOf(1.1, 0.8), 'early_over')
assert.equal(quadrantOf(0.8, 0.8), 'late_over')

// roll-up: BAC-weighted SPI/CPI only over projects that have EVM
const r = rollup(buildViews([proj('a', { snapshot: snap({ spi: 0.8, cpi: 1, bacEvm: 3000 }) }), proj('b', { snapshot: snap({ spi: 1.2, cpi: 0.9, bacEvm: 1000 }) }), proj('c', { snapshot: null })], DEFAULT_WEIGHTS))
assert.equal(r.evmCount, 2)
assert.ok(Math.abs(r.spi - (0.8 * 3000 + 1.2 * 1000) / 4000) < 1e-9)
assert.equal(r.health.unknown, 1)
assert.equal(r.eacFrom.none, 1)

// balance across lifecycle phases
assert.deepEqual(balanceByPhase(buildViews([proj('a'), proj('b'), proj('c', { snapshot: null })], DEFAULT_WEIGHTS)).map((x) => [x.code, x.count]), [['G6', 2], ['—', 1]].sort((a, b) => a[0].localeCompare(b[0])))

assert.deepEqual(normaliseWeights({ strategic: 1, value: 1, benefit: 1, risk: 1, performance: 0 }), { strategic: 25, value: 25, benefit: 25, risk: 25, performance: 0 })
console.log('portfolio core ok')
