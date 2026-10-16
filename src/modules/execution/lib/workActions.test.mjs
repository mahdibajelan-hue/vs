import assert from 'node:assert/strict'
import { resolveLines, ruleFor, DEFAULT_ACTIONS } from './workActions.ts'
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
console.log('workActions ok')
