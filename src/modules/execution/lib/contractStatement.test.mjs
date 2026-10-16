import assert from 'node:assert/strict'
import { calcRow, totals, executedGroups } from './contractStatement.ts'
const row = (o = {}) => ({ activityId: 'a', unitPrice: 10, baseQty: 100, sys: 60, req: 55, con: 50, prevSys: 40, prevReq: 35, prevCon: 30, ...o })
const c = calcRow(row())
assert.deepEqual([c.sysMonth, c.reqMonth, c.conMonth, c.monthAmt, c.cumAmt, c.prevAmt], [20, 20, 20, 200, 500, 300]) // all three months are cumulative − previous; money follows the consultant column
assert.equal(calcRow(row({ con: null })).conMissing, true); assert.equal(calcRow(row({ con: null })).monthAmt, -300) // no consultant value → basis 0 (flagged), never the contractor's number
assert.equal(calcRow(row({ con: 120 })).over, true); assert.equal(calcRow(row({ con: 105 }), 10).over, false)
assert.deepEqual(totals([row(), row({ con: null, sys: 5 })]), { month: 200 + -300, cum: 500, prev: 600, contract: 2000, missing: 1, over: 0 })
const actions = [{ key: 'welding', title: 'جوشکاری', unit: 'سرجوش', group: 'جوش', fields: [{ key: 'wall', label: 'ضخامت', kind: 'select' }, { key: 'weldNos', label: 'ش', kind: 'text' }] }]
const L = (id, rep, wall, q, status = 'approved', ap = null) => ({ id, reportId: rep, detail: { actionKey: 'welding', wall }, qty: q, approvedQty: ap, status })
const g = executedGroups([L('1', 'r1', '0.750', 10), L('2', 'r2', '0.750', 5, 'approved', 4), L('3', 'r2', '0.875', 3), L('4', 'r2', '0.875', 9, 'pending')], actions, (id) => (id === 'r1' ? '2026-01-10' : '2026-02-10'), '2026-02-01', '2026-02-28')
assert.deepEqual(g.map((x) => [x.fieldKey, x.value, x.cum, x.month, x.lines]), [['', '', 17, 7, 3], ['wall', '0.750', 14, 4, 2], ['wall', '0.875', 3, 3, 1]]) // approved only; approved qty beats entered qty
console.log('contractStatement ok')
