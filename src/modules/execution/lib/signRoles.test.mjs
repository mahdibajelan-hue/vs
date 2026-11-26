import assert from 'node:assert/strict'
import { desiredSlots, diffSlots, disciplineOf } from './signRoles.ts'
const roles = [{ key: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true, forms: ['welding', 'fitup', 'welding'] }, { key: 'sup', label: 'نظارت', party: 'consultant', userId: null, sort: 2, required: false, forms: ['welding'] }]
const d = desiredSlots(roles)
assert.equal(d.length, 3) // duplicates collapse; one slot per (form, role)
const ex = [{ id: 'a', formKey: 'welding', slotKey: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true }, { id: 'b', formKey: 'bend', slotKey: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true }, { id: 'c', formKey: 'welding', slotKey: 'sup', label: 'قدیمی', party: 'consultant', userId: null, sort: 2, required: false }]
const diff = diffSlots(ex, d)
assert.deepEqual(diff.remove, ['b']) // bend is no longer signed by «prep»
assert.deepEqual(diff.upsert.map((x) => `${x.formKey}|${x.slotKey}`).sort(), ['fitup|prep', 'welding|sup']) // new fitup slot; changed label of sup
// specialist supervisor: the person and the title follow the form's discipline
assert.equal(disciplineOf('welding', 'weld'), 'weld'); assert.equal(disciplineOf('fitup', 'pipeline'), 'weld'); assert.equal(disciplineOf('rt_report', 'rt'), 'rt')
assert.equal(disciplineOf('sand', 'ground'), 'civil'); assert.equal(disciplineOf('string', 'pipeline'), 'line'); assert.equal(disciplineOf('string', 'pipeline', { string: 'civil' }), 'civil')
const sp = desiredSlots([{ key: 'rev', label: 'ناظر تخصصی', party: 'supervision', userId: null, sort: 3, required: true, forms: ['welding', 'rt_report', 'sand'], specialists: { weld: 'u-weld', rt: 'u-rt' } }], (f) => disciplineOf(f, { welding: 'weld', rt_report: 'rt', sand: 'ground' }[f]))
assert.deepEqual(sp.map((x) => [x.formKey, x.userId]), [['welding', 'u-weld'], ['rt_report', 'u-rt'], ['sand', null]])
assert.equal(sp[0].label, 'ناظر تخصصی — ناظر جوش'); assert.equal(sp[1].label, 'ناظر تخصصی — مفسر فیلم رادیوگرافی')
console.log('signRoles ok')
