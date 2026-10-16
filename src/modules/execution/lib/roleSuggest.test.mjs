import assert from 'node:assert/strict'
import { suggestExRole } from './roleSuggest.ts'
const pr = { employerOrgId: 'E', consultantOrgId: 'C', contractorOrgId: 'K', partnerOrgId: 'P' }
assert.equal(suggestExRole('other', 'E', pr), 'employer'); assert.equal(suggestExRole('consultant_rep', 'C', pr), 'consultant'); assert.equal(suggestExRole('qc_manager', 'C', pr), 'supervision')
assert.equal(suggestExRole('project_manager', 'K', pr), 'manager'); assert.equal(suggestExRole('qc_manager', 'P', pr), 'contractor'); assert.equal(suggestExRole('site_manager', 'K', pr), 'site_head')
assert.equal(suggestExRole('planning_manager', null, pr), 'planner'); assert.equal(suggestExRole('hse_manager', null, pr), null); assert.equal(suggestExRole('executive', 'X', pr), 'manager')
console.log('roleSuggest ok')
