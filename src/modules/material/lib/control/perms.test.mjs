import assert from 'node:assert/strict'
import { roleAllows, DEFAULT_PERMS } from './perms.ts'
assert.equal(roleAllows(['contractor'], 'submit_stage'), true)
assert.equal(roleAllows(['contractor'], 'approve_stage'), false, 'contractor cannot approve their own evidence')
assert.equal(roleAllows(['consultant'], 'approve_stage'), false)
assert.equal(roleAllows(['employer'], 'approve_stage'), true)
assert.equal(roleAllows(['storekeeper', 'inspector'], 'inspect'), true)
assert.equal(roleAllows(['manager'], 'anything'), true)
assert.equal(roleAllows([], 'raise'), false)
assert.equal(roleAllows(['contractor'], 'approve_stage', { rolePerms: { contractor: ['approve_stage'] } }), true, 'matrix can be reconfigured')
assert.ok(DEFAULT_PERMS.employer.includes('approve_baseline'))
console.log('material perms ok')
