import assert from 'node:assert/strict'
import { combineEpc, weightsFromReport, EQUAL_EPC_WEIGHTS } from './epcProgress.ts'

// all three disciplines, report weights 15/35/50
{
  const r = combineEpc({ eng: { actual: 80, planned: 90 }, proc: { actual: 60, planned: 70 }, cons: { actual: 20, planned: 40 } }, { e: 15, p: 35, c: 50 })
  assert.equal(r.overall.actual, (80 * 15 + 60 * 35 + 20 * 50) / 100)
  assert.equal(r.overall.planned, (90 * 15 + 70 * 35 + 40 * 50) / 100)
}
// a module with no data is left out and the rest re-weighted (no drag toward zero)
{
  const r = combineEpc({ eng: null, proc: { actual: 60, planned: 70 }, cons: { actual: 20, planned: 40 } }, { e: 15, p: 35, c: 50 })
  assert.equal(r.overall.actual, (60 * 35 + 20 * 50) / 85)
}
// no plan in one counted discipline → no overall plan; nothing at all → no overall
assert.equal(combineEpc({ eng: { actual: 50, planned: null }, proc: null, cons: { actual: 10, planned: 20 } }).overall.planned, null)
assert.equal(combineEpc({ eng: null, proc: null, cons: null }).overall, null)
// weights from the client report, equal shares otherwise
assert.deepEqual(weightsFromReport({ progress_engineering_weight: 15, progress_procurement_weight: 35, progress_construction_weight: 50 }), { e: 15, p: 35, c: 50 })
assert.deepEqual(weightsFromReport({}), EQUAL_EPC_WEIGHTS)
assert.deepEqual(weightsFromReport(null), EQUAL_EPC_WEIGHTS)
console.log('epc/epcProgress: all assertions passed')
