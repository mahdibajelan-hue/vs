import assert from 'node:assert/strict'
import { resolveLines, ruleFor, conditionMet, DEFAULT_ACTIONS } from './workActions.ts'
const L = (id, detail, o = {}) => ({ id, reportId: 'r', lineNo: 0, activityId: null, qty: 10, kmFrom: null, kmTo: null, location: '', note: '', detail, status: 'approved', approvedQty: 8, reviewNote: '', sourceReportId: null, ...o })
const rules = [
  { id: '1', actionKey: 'trench', activityId: 'A-soil', factor: 1, whenField: '', whenValue: '', note: '' },
  { id: '2', actionKey: 'trench', activityId: 'A-rock', factor: 1, whenField: 'soil', whenValue: 'سنگی', note: '' },
  { id: '3', actionKey: 'welding', activityId: 'A-weld', factor: 2, whenField: '', whenValue: '', note: '' },
]
const lines = [L('a', { actionKey: 'trench', soil: 'سنگی' }), L('b', { actionKey: 'trench', soil: 'خاکی' }), L('c', { actionKey: 'welding' }), L('d', { actionKey: 'rt', actionTitle: 'رادیوگرافی', actionUnit: 'سرجوش' }), L('e', {}, { activityId: 'X' })]
const r = resolveLines(lines, rules)
assert.deepEqual(r.lines.map((l) => l.activityId), ['A-rock', 'A-soil', 'A-weld', null, 'X'])
assert.equal(r.lines[2].qty, 20); assert.equal(r.lines[2].approvedQty, 16) // factor applies to entered and approved
assert.equal(lines[2].qty, 10) // input untouched
assert.deepEqual(r.unmapped, [{ actionKey: 'rt', title: 'رادیوگرافی', unit: 'سرجوش', qty: 10, lines: 1 }])
assert.equal(ruleFor(L('z', { actionKey: 'trench', soil: 'باتلاقی' }), rules).activityId, 'A-soil') // no matching condition → the default rule
assert.equal(ruleFor(L('z', {}), rules), null)
assert.ok(new Set(DEFAULT_ACTIONS.map((a) => a.key)).size === DEFAULT_ACTIONS.length)
// multiplier fields (length × width × depth → m³) and informational actions
const volRules = [{ id: 'v', actionKey: 'trench', activityId: 'A-vol', factor: 1, whenField: '', whenValue: '', note: '', multFields: 'widthM,depthM' }]
const vol = resolveLines([L('v1', { actionKey: 'trench', widthM: 1.2, depthM: 2 }, { qty: 100, approvedQty: 50 }), L('v2', { actionKey: 'trench', widthM: 1.2 }, { qty: 10 }), L('i', { actionKey: 'fitup' })], volRules, [{ key: 'fitup', billable: false }])
assert.equal(vol.lines[0].qty, 240); assert.equal(vol.lines[0].approvedQty, 120); assert.equal(vol.lines[0].activityId, 'A-vol')
assert.equal(vol.lines[1].activityId, null); assert.equal(vol.unmapped.length, 1); assert.match(vol.unmapped[0].reason, /depthM/) // incomplete line is flagged, not guessed
assert.equal(vol.lines[2].activityId, null) // informational action: untouched and not reported as unmapped
// numeric conditions
assert.ok(conditionMet('48', '48.0')); assert.ok(conditionMet('۴۸', '>=40')); assert.ok(!conditionMet(36, '>=40')); assert.ok(conditionMet(30, '24-36')); assert.ok(conditionMet(12, '<=12')); assert.ok(!conditionMet(12, '<12')); assert.ok(conditionMet('سنگی', 'سنگی')); assert.ok(!conditionMet('', '>=0')); assert.ok(!conditionMet(5, ''))
// rules on the central weld table: diameter class picks the price item, size × thickness is the multiplier
const cRules = [
  { id: 'c1', actionKey: 'welding', activityId: 'W-small', factor: 1, whenField: '', whenValue: '', note: '' },
  { id: 'c2', actionKey: 'welding', activityId: 'W-big', factor: 1, whenField: 'central.size', whenValue: '>=40', note: '', multFields: 'central.size' },
]
const central = { a: { size: '48', thk: '19.1' }, b: { size: '12' } }
const cOf = (l) => central[l.detail.w]
const cr = resolveLines([L('a', { actionKey: 'welding', w: 'a' }, { qty: 1, approvedQty: 1 }), L('b', { actionKey: 'welding', w: 'b' }, { qty: 1 }), L('n', { actionKey: 'welding', w: 'none' }, { qty: 1 })], cRules, [], cOf)
assert.deepEqual(cr.lines.map((l) => l.activityId), ['W-big', 'W-small', 'W-small'])
assert.equal(cr.lines[0].qty, 48) // inch-dia from the central table
assert.equal(ruleFor(L('x', { actionKey: 'welding' }), cRules).activityId, 'W-small') // without the central table the default applies
const miss = resolveLines([L('m', { actionKey: 'welding', w: 'b' }, { qty: 1 })], [{ ...cRules[0], multFields: 'central.thk' }], [], cOf)
assert.equal(miss.lines[0].activityId, null); assert.match(miss.unmapped[0].reason, /جدول مرکزی/) // missing central fact is flagged
console.log('workActions ok')
