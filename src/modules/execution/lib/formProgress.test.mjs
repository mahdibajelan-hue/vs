import assert from 'node:assert/strict'
import { formWorkRows } from './formProgress.ts'

const R = (id, formKey, status) => ({ id, formKey, status, reportNo: id.toUpperCase(), reportDate: '2026-11-20', front: 'F', completionOf: null, data: {} })
const L = (id, reportId, status, detail) => ({ id, reportId, lineNo: 1, activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail, status, approvedQty: null, reviewNote: '', sourceReportId: null })
const maps = [{ id: 'm1', projectId: 'p', formKey: 'string', metricKey: 'length', groupValue: '', activityId: 'act-string' }]
const reports = [R('s1', 'string', 'partially_approved'), R('s2', 'string', 'approved'), R('b1', 'bend', 'approved'), { ...R('w1', 'work', 'approved'), reportDate: '2026-11-18' }]
const lines = [
  L('a', 's1', 'approved', { pipeNo: 'P1', lengthM: 12 }), L('b', 's1', 'pending', { pipeNo: 'P2', lengthM: 11.5 }), L('c', 's1', 'rejected', { pipeNo: 'P3', lengthM: 12 }),
  L('d', 's2', 'approved', { pipeNo: 'P4', lengthM: 12 }),
  L('e', 'b1', 'approved', { pipeNo: 'P1' }),
  // an older work report copied s2's figures in: s2 must not count twice
  { ...L('w', 'w1', 'approved', {}), activityId: 'act-string', qty: 12, approvedQty: 12, sourceReportId: 's2' },
]
const out = formWorkRows(reports, lines, maps)
assert.deepEqual(out.reports.map((r) => [r.id, r.formKey]), [['form:s1', 'work']])
const byStatus = Object.fromEntries(out.lines.map((l) => [l.status, l]))
assert.equal(byStatus.approved.qty, 12); assert.equal(byStatus.approved.approvedQty, 12); assert.equal(byStatus.approved.activityId, 'act-string')
assert.equal(byStatus.pending.qty, 11.5); assert.equal(byStatus.pending.approvedQty, null)
assert.equal(out.lines.length, 2) // the rejected row counts for nothing; bend has no map
// the same day/front/activity already typed into a work report: the minute is not counted again
const typedWork = [...reports, R('s3', 'string', 'approved'), { ...R('w2', 'work', 'approved'), reportDate: '2026-11-20', front: 'F' }]
const typedLines = [...lines, L('f', 's3', 'approved', { lengthM: 9 }), { ...L('g', 'w2', 'approved', {}), activityId: 'act-string', qty: 9 }]
assert.equal(formWorkRows(typedWork, typedLines, maps).lines.length, 0)
console.log('execution/lib/formProgress: all assertions passed')
