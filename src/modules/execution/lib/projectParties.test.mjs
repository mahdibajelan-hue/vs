import assert from 'node:assert/strict'
import { projectParties } from './projectParties.ts'
const orgs = [{ id: 'a', name: 'کارفرما' }, { id: 'b', name: 'مشاور' }, { id: 'c', name: 'پیمانکار' }, { id: 'd', name: 'مشارکت' }]
const p = projectParties({ employerOrgId: 'a', consultantOrgId: 'b', contractorOrgId: null, partnerOrgId: 'd' }, orgs)
assert.equal(p.employer.name, 'کارفرما'); assert.equal(p.consultant.id, 'b'); assert.equal(p.contractor.id, 'd') // no contractor → the partnership
assert.equal(projectParties({ employerOrgId: 'x', consultantOrgId: null, contractorOrgId: 'c' }, orgs).employer, null) // unknown org id → nothing, never a guess
assert.equal(projectParties(undefined, orgs).contractor, null)
console.log('projectParties ok')
