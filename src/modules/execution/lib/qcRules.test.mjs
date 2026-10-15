import assert from 'node:assert/strict'
import { evaluateQc, QC_RULE_EXAMPLE as P } from './qcRules.ts'

const day = (n) => `2026-01-${String(n).padStart(2, '0')}`
let id = 0
const rt = (d, result, extra = {}) => ({ lineId: 'l' + ++id, reportId: 'r', formKey: 'rt_report', date: day(d), result, ...extra })
const many = (d, total, bad, extra = {}) => Array.from({ length: total }, (_, i) => rt(d, i < bad ? 'rep' : 'acc', extra))

// no rows → no alerts
assert.deepEqual(evaluateQc([], P, day(10)), [])
// a lone defect → exactly one "single" alert (short path), no rate/repeat
let a = evaluateQc([rt(1, 'rep', { weld: 'W-1' }), ...many(1, 39, 0)], P, day(1))
assert.deepEqual(a.map((x) => x.kind), ['single']); assert.equal(a[0].subject, 'W-1'); assert.equal(a[0].lineIds.length, 1)
// steady 3% repair rate with enough rows → no rate alert
a = evaluateQc(many(1, 100, 3), P, day(1)); assert.ok(!a.some((x) => x.kind === 'rate'))
// 12% → rate alert with evidence = exactly the repair rows
a = evaluateQc(many(1, 100, 12), P, day(1)); const r = a.find((x) => x.kind === 'rate')
assert.ok(r); assert.equal(r.lineIds.length, 12); assert.equal(Math.round(r.value), 12)
// equal to the threshold is not an alert; just above is
assert.ok(!evaluateQc(many(1, 100, 8), P, day(1)).some((x) => x.kind === 'rate'))
assert.ok(evaluateQc(many(1, 100, 9), P, day(1)).some((x) => x.kind === 'rate'))
// too few rows → no rate alert (noise guard)
assert.ok(!evaluateQc(many(1, 10, 5), P, day(1)).some((x) => x.kind === 'rate'))
// rows outside the window and after asOf are ignored
assert.ok(!evaluateQc(many(1, 100, 30), P, day(20)).some((x) => x.kind === 'rate'))
assert.ok(!evaluateQc(many(10, 100, 30), P, day(5)).some((x) => x.kind === 'rate'))
// per welder
a = evaluateQc([...many(1, 25, 5, { welder: 'W-07' }), ...many(1, 75, 1, { welder: 'W-02' })], P, day(1))
assert.deepEqual(a.filter((x) => x.kind === 'rate').map((x) => x.subject), ['W-07']) // overall 6% is under the threshold; welder W-07 at 20% is not
// repeat: same defect (case/space-insensitive) N times within the window
const cov = (d, defect) => ({ lineId: 'l' + ++id, reportId: 'r', formKey: 'weld_repair', date: day(d), defect })
a = evaluateQc([cov(1, 'po 12'), cov(2, 'PO  12'), cov(3, 'Po 12')], P, day(3)); assert.ok(a.some((x) => x.kind === 'repeat' && x.lineIds.length === 3))
a = evaluateQc([cov(1, 'PO'), cov(2, 'PO')], P, day(3)); assert.ok(!a.some((x) => x.kind === 'repeat'))
a = evaluateQc([cov(1, 'PO'), cov(2, 'PO'), cov(3, 'PO')], P, day(20)); assert.ok(!a.some((x) => x.kind === 'repeat')) // outside the window
a = evaluateQc([cov(1, 'PO'), cov(2, 'CR'), cov(3, 'BT')], P, day(3)); assert.ok(!a.some((x) => x.kind === 'repeat')) // different defects
// inputs are not mutated and the result is deterministic
const rows = many(1, 100, 12); const copy = JSON.stringify(rows)
assert.deepEqual(evaluateQc(rows, P, day(1)), evaluateQc(rows, P, day(1))); assert.equal(JSON.stringify(rows), copy)
console.log('qcRules: all assertions passed')
