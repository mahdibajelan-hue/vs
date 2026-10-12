import assert from 'node:assert/strict'
import { weldNeeds, setTotals } from './weldPlan.ts'

const sets = [{ id: 's30', title: '۳۰ اینچ', jointCount: 1000, pipeLengthM: 12000 }, { id: 's16', title: '۱۶ اینچ', jointCount: 400, pipeLengthM: 4800 }]
const lines = [
  { id: 'a', setId: 's30', materialId: 'e6010', qtyPerJoint: 1 }, { id: 'b', setId: 's30', materialId: 'e7010-3', qtyPerJoint: 1 }, { id: 'c', setId: 's30', materialId: 'e7010-4', qtyPerJoint: 2 },
  { id: 'd', setId: 's16', materialId: 'e6010', qtyPerJoint: 0.4 },
]
assert.deepEqual(setTotals(sets[0], lines).map((x) => x.total), [1000, 1000, 2000])
const pos = new Map([['e6010', { ordered: 1200, received: 600, onHand: 500, netConsumed: 100 }], ['e7010-3', { ordered: 0, received: 0, onHand: 0, netConsumed: 0 }], ['e7010-4', { ordered: 2000, received: 2000, onHand: 1500, netConsumed: 500 }]])
const n = Object.fromEntries(weldNeeds(sets, lines, pos).map((x) => [x.materialId, x]))
assert.equal(n.e6010.need, 1160); assert.equal(n.e6010.parts.length, 2); assert.equal(n.e6010.status, 'inbound'); assert.equal(n.e6010.supplyGap, 560)
assert.equal(n['e7010-3'].status, 'no_order'); assert.equal(n['e7010-3'].orderGap, 1000)
assert.equal(n['e7010-4'].status, 'ok'); assert.equal(n['e7010-4'].supplyGap, 0)
// ordered less than the need
const p2 = new Map([['e6010', { ordered: 800, received: 0, onHand: 0, netConsumed: 0 }]])
assert.equal(weldNeeds(sets, lines.slice(0, 1), p2)[0].status, 'short')
// ordered enough but not yet arrived
const p3 = new Map([['e6010', { ordered: 1000, received: 0, onHand: 0, netConsumed: 0 }]])
assert.equal(weldNeeds(sets, lines.slice(0, 1), p3)[0].status, 'inbound')
// metre basis (coating) and decimal per-unit quantities
const cl = [{ id: 'x', setId: 's30', materialId: 'coat', qtyPerJoint: 0.25, basis: 'meter' }, { id: 'y', setId: 's30', materialId: 'film', qtyPerJoint: 0.35, basis: 'joint' }]
assert.deepEqual(setTotals(sets[0], cl).map((x) => x.total), [3000, 350])
const nn = Object.fromEntries(weldNeeds(sets, cl, new Map()).map((x) => [x.materialId, x]))
assert.equal(nn.coat.need, 3000); assert.equal(nn.coat.parts[0].basis, 'meter'); assert.equal(nn.film.need, 350)
console.log('weldPlan ok')
