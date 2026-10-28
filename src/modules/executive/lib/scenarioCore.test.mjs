import assert from 'node:assert/strict'
import { applyChoice, autoFit, buildProfile, evaluate, fundingOrder, monthIndex, yearOf } from './scenarioCore.ts'

const now = monthIndex(1405, 8)
assert.equal(yearOf(now), 1405)

// linear: 1000 cost, 40% done, finish 5 months after now → 6 months of 100
const lin = buildProfile({ id: 'a', name: 'A', rank: 1, priority: 80, mandatory: false, costAtCompletion: 1000, progressPct: 40, now, finishMonth: now + 5 })
assert.equal(lin.source, 'linear'); assert.equal(lin.profile.length, 6); assert.ok(Math.abs(lin.remaining - 600) < 1e-9)
assert.ok(Math.abs(lin.profile.reduce((a, b) => a + b, 0) - 600) < 1e-9)

// cash plan: past months ignored, future scaled to remaining
const plan = new Map([[now - 2, 500], [now, 100], [now + 2, 300]])
const cp = buildProfile({ id: 'b', name: 'B', rank: 2, priority: 50, mandatory: false, costAtCompletion: 800, progressPct: 50, now, cashPlan: plan, finishMonth: null })
assert.equal(cp.source, 'cash_plan'); assert.deepEqual(cp.profile, [100, 0, 300])

// overdue finish → fallback spread, unknown progress flagged
const od = buildProfile({ id: 'c', name: 'C', rank: null, priority: null, mandatory: false, costAtCompletion: 1200, progressPct: null, now, finishMonth: now - 3 })
assert.equal(od.source, 'overdue'); assert.equal(od.profile.length, 12); assert.equal(od.progressKnown, false)
assert.equal(buildProfile({ id: 'd', name: 'D', rank: null, priority: null, mandatory: false, costAtCompletion: null, progressPct: 10, now, finishMonth: now }).source, 'none')

// defer shifts, terminate books only the termination cost
const shifted = applyChoice(lin, { action: 'defer', deferMonths: 3 }, 0)
assert.equal(Math.min(...shifted.keys()), now + 3)
assert.deepEqual([...applyChoice(lin, { action: 'terminate', deferMonths: 0 }, 10)], [[now, 60]])
assert.equal(applyChoice(lin, { action: 'terminate', deferMonths: 0 }, 0).size, 0)

// evaluate: caps per year, released money and value kept
const projects = [lin, cp, od]
const base = evaluate(projects, { caps: { 1405: 500 }, choices: {}, terminationPct: 0 })
assert.ok(Math.abs(base.baseSpend - base.totalSpend) < 1e-6)
assert.ok(base.overCapYears.includes(1405))
const stop = evaluate(projects, { caps: { 1405: 500 }, choices: { a: { action: 'terminate', deferMonths: 0 } }, terminationPct: 0 })
assert.ok(Math.abs(stop.released - 600) < 1e-6)
assert.ok(stop.valueKept != null && stop.valueKept < 1)
assert.deepEqual(stop.terminated, ['a'])

// funding order: mandatory, then rank, then unranked
const m = { ...od, id: 'm', mandatory: true }
assert.deepEqual(fundingOrder([od, cp, m, lin]).map((p) => p.id), ['m', 'a', 'b', 'c'])

// autoFit keeps the top-ranked project on plan and defers lower ones until each capped year holds
const caps = { 1405: 700, 1406: 2000 }
const fit = autoFit(projects, { caps, choices: {}, terminationPct: 0 })
assert.equal(fit.choices.a.action, 'base')
const after = evaluate(projects, { caps, choices: fit.choices, terminationPct: 0 })
assert.equal(after.overCapYears.length, 0)
assert.deepEqual(fit.unfunded, [])
// impossible cap → reported as unfunded, never terminated automatically
const tight = autoFit(projects, { caps: { 1405: 1, 1406: 1, 1407: 1, 1408: 1, 1409: 1 }, choices: {}, terminationPct: 0 }, 12)
assert.ok(tight.unfunded.length > 0)
assert.ok(Object.values(tight.choices).every((c) => c.action !== 'terminate'))
// a terminated choice survives autoFit
assert.equal(autoFit(projects, { caps, choices: { b: { action: 'terminate', deferMonths: 0 } }, terminationPct: 0 }).choices.b.action, 'terminate')
console.log('scenarioCore ok')
