import assert from 'node:assert/strict'
import { runMonteCarlo } from './monteCarlo.ts'
import { runPortfolio } from './portfolio.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
const rel = (p, s) => ({ id: p + s, versionId: 'v', predId: p, succId: s, type: 'FS', lag: 0 })
const CAL = { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }
const proj = (budget = 1000) => ({ schedule: { activities: [act('A', 10, { budgetCost: budget }), act('B', 10, { budgetCost: budget })], relations: [rel('A', 'B')], calendar: CAL, mode: 'plan' }, durationRisks: [{ uid: 'A', min: 8, likely: 10, max: 20 }, { uid: 'B', min: 8, likely: 10, max: 20 }], events: [], iterations: 2000, seed: 5 })

// without coupling cost does not depend on the duration
const plain = runMonteCarlo(proj())
assert.ok(plain.ok); assert.ok(Math.abs(plain.cost.p50 - 2000) < 1e-6); assert.ok(Math.abs(plain.costTime.correlation) < 1e-9)
// variable share + overhead → cost rises with the finish date
const coupled = runMonteCarlo({ ...proj(), costParams: { variableShare: 0.7, indirectPerDay: 50 } })
assert.ok(coupled.costTime.correlation > 0.9, `corr ${coupled.costTime.correlation}`)
assert.ok(coupled.cost.p80 > plain.cost.p80)
assert.ok(coupled.costTime.scatter.length >= 100)
// joint probability ≤ each marginal
const tgt = runMonteCarlo({ ...proj(), costParams: { variableShare: 0.7, indirectPerDay: 50, targetFinish: coupled.finish.p50, targetCost: coupled.cost.p50 } })
assert.ok(tgt.costTime.pJoint <= Math.min(tgt.costTime.pFinish, tgt.costTime.pCost) + 1e-12)
assert.ok(tgt.costTime.pJoint > 0.2)   // positively related → more than the product of ~0.5 × ~0.5
// reproducible
assert.deepEqual(runMonteCarlo({ ...proj(), costParams: { variableShare: 0.7, indirectPerDay: 50 } }).finish, coupled.finish)

// portfolio
const items = [{ id: 'p1', name: 'P1', input: proj(1000) }, { id: 'p2', name: 'P2', input: proj(500) }]
const drv = [{ id: 'd1', title: 'shared', probability: 0.5, days: { min: 5, likely: 10, max: 20 }, cost: { min: 10, likely: 20, max: 40 }, projectIds: ['p1', 'p2'], active: true }]
const ind = runPortfolio(items, [], { iterations: 1500, seed: 3 }), com = runPortfolio(items, drv, { iterations: 1500, seed: 3 })
assert.ok(ind.ok && com.ok)
assert.ok(Math.abs(ind.cost.base - 3000) < 1e-6)
assert.ok(ind.finish.p50 >= ind.projects[0].finishP50 && ind.finish.p50 >= ind.projects[1].finishP50)
assert.ok(com.finish.p80 > ind.finish.p80); assert.ok(com.cost.p90 > ind.cost.p90)
assert.ok(Math.abs(com.driverHits[0].hitRate - 0.5) < 0.05)
assert.ok(Math.abs(ind.projects.reduce((s, p) => s + p.drivesFinish, 0) - 1) < 1e-9)
assert.deepEqual(runPortfolio(items, drv, { iterations: 1500, seed: 3 }).finish, com.finish)
assert.ok(ind.diversification != null)
console.log('costtime: all assertions passed')
