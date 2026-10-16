import assert from 'node:assert/strict'
import { desiredSlots, diffSlots } from './signRoles.ts'
const roles = [{ key: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true, forms: ['welding', 'fitup', 'welding'] }, { key: 'sup', label: 'نظارت', party: 'consultant', userId: null, sort: 2, required: false, forms: ['welding'] }]
const d = desiredSlots(roles)
assert.equal(d.length, 3) // duplicates collapse; one slot per (form, role)
const ex = [{ id: 'a', formKey: 'welding', slotKey: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true }, { id: 'b', formKey: 'bend', slotKey: 'prep', label: 'تهیه', party: 'contractor', userId: 'u1', sort: 1, required: true }, { id: 'c', formKey: 'welding', slotKey: 'sup', label: 'قدیمی', party: 'consultant', userId: null, sort: 2, required: false }]
const diff = diffSlots(ex, d)
assert.deepEqual(diff.remove, ['b']) // bend is no longer signed by «prep»
assert.deepEqual(diff.upsert.map((x) => `${x.formKey}|${x.slotKey}`).sort(), ['fitup|prep', 'welding|sup']) // new fitup slot; changed label of sup
console.log('signRoles ok')
