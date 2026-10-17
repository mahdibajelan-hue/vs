import assert from 'node:assert/strict'
import { courtOf, lensOf, nextMoves, buildEngTasks, courtCounts } from './roles.ts'
import { parseMdl, isMdlLayout } from './mdlImport.ts'

assert.equal(courtOf('required'), 'contractor'); assert.equal(courtOf('issued'), 'consultant'); assert.equal(courtOf('pending_approval'), 'consultant'); assert.equal(courtOf('restricted'), 'consultant'); assert.equal(courtOf('approved'), 'done')
assert.equal(lensOf(['contractor']), 'contractor'); assert.equal(lensOf(['supervision']), 'consultant'); assert.equal(lensOf(['employer', 'contractor']), 'employer'); assert.equal(lensOf(['manager', 'employer']), 'manager')
assert.deepEqual(nextMoves('issued', 'contractor'), []); assert.equal(nextMoves('issued', 'consultant').length, 3); assert.ok(nextMoves('issued', 'consultant').some((m) => m.to === 'restricted')); assert.deepEqual(nextMoves('issued', 'employer'), []); assert.deepEqual(nextMoves('restricted', 'employer'), [])
const d = (id, status, o = {}) => ({ id, docNo: id, title: 't', discipline: 'Civil', category: 'DWG', status, weight: 1, critical: false, plannedPrepared: '2026-10-01', plannedApproved: '2026-10-05', ...o })
const docs = [d('a', 'in_preparation'), d('b', 'issued'), d('c', 'pending_approval', { plannedApproved: '2026-12-01' }), d('e', 'approved'), d('f', 'required', { plannedPrepared: '2027-03-01' })]
const today = '2026-10-15'
assert.deepEqual(buildEngTasks(docs, 'contractor', today).map((t) => t.id), ['a'])
assert.deepEqual(buildEngTasks(docs, 'consultant', today).map((t) => t.id).sort(), ['b', 'c'])
assert.deepEqual(buildEngTasks(docs, 'employer', today).map((t) => t.id), [])
assert.equal(buildEngTasks(docs, 'contractor', today, new Set(['f']))[0].id, 'f')
assert.deepEqual(buildEngTasks(docs, 'manager', today).map((t) => t.id).sort(), ['a', 'b'])
assert.equal(courtCounts(docs).consultant.n, 2)
assert.equal(courtCounts(docs).contractor.n, 2)

const rows = [[], ['Row', 'Discipline', 'Project No.', 'Phase No.', 'Scope', 'Discipline ID', 'Category\n(Doc Type)', 'Serial No.', 'Document No.', 'Action', 'Document Title', 'Final Status\nor\n POI', 'Rev', 'x', 'x', 'x', 'x', 'x', 'x', 'Price Rial', 'W.F'],
  [null, null, null, null, null, null, null, null, null, null, 'Detail Design'],
  [1, 'Mechanic', 1, 'DP1', 'PLN', 'ME', 'DSH', '0003', '791355-DP1-PLN-ME-DSH-0003', null, ' Data Sheets ', 'IFA', null, null, null, null, null, null, null, 100, 0.25],
  [2, 'Civil', 1, 'DP1', 'PLN', 'CV', 'DWG', '0001', '791355-DP1-PLN-CV-DWG-0001', null, 'Drawing', 'IFI', null, null, null, null, null, null, null, 300, 0.75],
  [3, 'Civil', 1, 'DP1', 'PLN', 'CV', 'DWG', '0001', '791355-DP1-PLN-CV-DWG-0001', null, 'Drawing', 'IFI', null, null, null, null, null, null, null, 300, 0.75]]
assert.ok(isMdlLayout(rows))
const r = parseMdl(rows)
assert.equal(r.docs.length, 2); assert.equal(r.duplicates.length, 1); assert.equal(r.sections, 1)
assert.equal(r.docs[0].discipline, 'Mechanical'); assert.equal(r.docs[0].title, 'Data Sheets'); assert.equal(r.docs[0].weight, 25); assert.equal(r.docs[0].targetIssue, 'IFA'); assert.equal(r.docs[0].category, 'DSH'); assert.equal(r.docs[0].phase, 'DP1')
assert.equal(Math.round(r.weightSum), 100)
console.log('engineering roles/mdl: all assertions passed')
