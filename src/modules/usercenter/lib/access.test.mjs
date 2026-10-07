// Run: npx tsx src/modules/usercenter/lib/access.test.mjs
import assert from 'node:assert/strict'
import { permissionCell, moduleGrantCount, scopeCovers, buildProjectRows, rowHasAccess } from './access.ts'

const perms = [['risk', 'view'], ['risk', 'edit'], ['risk', 'configure'], ['issues', 'view']].map(([m, a], i) => ({ id: 'p' + i, moduleKey: m, action: a }))
const roles = [{ id: 'r1', name: 'تحلیل‌گر' }, { id: 'r2', name: 'مدیر' }]
const rolePermissions = { r1: new Set(['p0', 'p1']), r2: new Set(['p0', 'p2']) }
const base = { permissions: perms, roles, rolePermissions, userRoleIds: ['r1', 'r2'], overrides: [] }

let c = permissionCell(base, 'risk', 'view')
assert.deepEqual([c.granted, c.source, c.roleNames], [true, 'role', ['تحلیل‌گر', 'مدیر']])
assert.equal(permissionCell(base, 'risk', 'delete').source, 'none') // permission row does not exist
assert.equal(permissionCell(base, 'issues', 'view').granted, false)
// deny beats role; allow beats nothing; deny beats allow can't coexist (primary key) but allow does not hide the role names
c = permissionCell({ ...base, overrides: [{ permissionId: 'p0', effect: 'deny' }] }, 'risk', 'view')
assert.deepEqual([c.granted, c.source], [false, 'denied']); assert.equal(c.roleNames.length, 2)
c = permissionCell({ ...base, overrides: [{ permissionId: 'p3', effect: 'allow' }] }, 'issues', 'view')
assert.deepEqual([c.granted, c.source], [true, 'direct'])
assert.equal(moduleGrantCount(base, 'risk'), 3)
assert.equal(moduleGrantCount({ ...base, userRoleIds: [] }, 'risk'), 0)

const proj = { masterId: 'm1', portfolioId: 'pf1', programId: 'pg1' }
const sc = (level, extra = {}) => ({ id: 's', userId: 'u', scopeLevel: level, portfolioId: null, programId: null, projectId: null, phaseId: null, ...extra })
assert.equal(scopeCovers(sc('all'), proj), true)
assert.equal(scopeCovers(sc('portfolio', { portfolioId: 'pf1' }), proj), true)
assert.equal(scopeCovers(sc('portfolio', { portfolioId: 'pfX' }), proj), false)
assert.equal(scopeCovers(sc('program', { programId: 'pg1' }), proj), true)
assert.equal(scopeCovers(sc('project', { projectId: 'm1' }), proj), true)
assert.equal(scopeCovers(sc('project', { projectId: 'm2' }), proj), false)
assert.equal(scopeCovers(sc('phase'), proj), false)

const masters = [{ id: 'm1', shortName: 'خط ۴۲', officialName: 'x', projectCode: 'P-1', projectIdCode: '', portfolioId: 'pf1', programId: null }, { id: 'm2', shortName: '', officialName: 'ایستگاه', projectCode: '', projectIdCode: 'ID2', portfolioId: null, programId: null }]
const mappings = [{ masterProjectId: 'm1', sourceModule: 'pipepulse', sourceProjectId: 'a1', status: 'confirmed' }, { masterProjectId: 'm1', sourceModule: 'risk', sourceProjectId: 'b1', status: 'confirmed' }, { masterProjectId: 'm2', sourceModule: 'risk', sourceProjectId: 'b2', status: 'rejected' }]
const products = [{ product: 'pipepulse', id: 'a1', name: 'A1' }, { product: 'risk', id: 'b1', name: 'B1' }, { product: 'risk', id: 'b2', name: 'B2 (بدون نگاشت)' }]
const memberships = [{ product: 'risk', projectId: 'b1', userId: 'u', role: 'viewer' }, { product: 'risk', projectId: 'b2', userId: 'u', role: 'viewer' }]
let rows = buildProjectRows({ masterProjects: masters, mappings, products, memberships, scopes: [] })
assert.equal(rows.length, 3) // m1, m2, + unmapped b2 (rejected mapping does not count)
assert.equal(rows[0].label, 'خط ۴۲'); assert.equal(rows[1].label, 'ایستگاه'); assert.equal(rows[1].code, 'ID2')
assert.equal(rows[0].cells.risk.membership.role, 'viewer'); assert.equal(rows[0].cells.pipepulse.membership, null); assert.equal(rows[0].cells.issues.sourceId, null)
assert.equal(rows[2].masterId, null); assert.equal(rows[2].cells.risk.membership.projectId, 'b2')
assert.deepEqual(rows.map(rowHasAccess), [true, false, true])
rows = buildProjectRows({ masterProjects: masters, mappings, products, memberships: [], scopes: [sc('portfolio', { portfolioId: 'pf1' })] })
assert.deepEqual(rows.map(rowHasAccess), [true, false, false])
rows = buildProjectRows({ masterProjects: masters, mappings, products, memberships: [], scopes: [sc('all')] })
assert.deepEqual(rows.map(rowHasAccess), [true, true, true])
console.log('usercenter/lib/access: all assertions passed')
