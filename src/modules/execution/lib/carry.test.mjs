import assert from 'node:assert/strict'
import { detectGaps } from './completeness.ts'
import { DEFAULT_EX_SETTINGS } from '../types.ts'
const R = (id, formKey, status, date = '2026-05-01') => ({ id, projectId: 'p', formKey, reportNo: id, reportDate: date, contractorOrgId: null, front: 'f', station: '', shift: 'day', status, data: {}, notes: '', missing: [], completionOf: null, dueDate: null, createdBy: null, createdAt: '2026-05-01', submittedBy: null, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: '' })
const L = (id, reportId, o) => ({ id, reportId, lineNo: 0, activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null, ...o })
const act = { id: 'a1', projectId: 'p', title: 'جوشکاری ۵۶ اینچ', unit: 'سرجوش', baseQty: 1000, weight: 100, weightGroup: 'g', active: true, approval: 'approved', itemNo: '1', sort: 0, front: '' }
// a welding report of three joints, mapped to the welding row
const weldLines = [1, 2, 3].map((k) => L(`w${k}`, 'T1', { detail: { weldNo: `W-${k}`, lengthM: 12 } }))
const maps = [{ id: 'm', projectId: 'p', formKey: 'welding', metricKey: 'joints', groupValue: '', activityId: 'a1' }]
const base = { today: '2026-06-01', settings: { ...DEFAULT_EX_SETTINGS, expectedFronts: [] }, resources: [], activities: [act], baselines: [], blines: [], maps }
const carry = (g) => g.filter((x) => x.fingerprint.startsWith('carry'))
// nothing carried: one gap of 3 joints
let g = carry(detectGaps({ ...base, reports: [R('T1', 'welding', 'approved')], lines: weldLines }))
assert.equal(g.length, 1); assert.ok(g[0].subject.includes('3')); assert.equal(g[0].reportId, 'T1')
// carried in full into a work report: no gap
const work = R('W1', 'work', 'submitted'), wl = L('x', 'W1', { activityId: 'a1', qty: 3, sourceReportId: 'T1' })
g = carry(detectGaps({ ...base, reports: [R('T1', 'welding', 'approved'), work], lines: [...weldLines, wl] }))
assert.equal(g.length, 0, JSON.stringify(g))
// more than the form holds
g = carry(detectGaps({ ...base, reports: [R('T1', 'welding', 'approved'), work], lines: [...weldLines, { ...wl, qty: 5 }] }))
assert.equal(g.length, 1); assert.equal(g[0].fingerprint.split('|')[0], 'carry+')
// the form was rejected later, the work row still counts
g = carry(detectGaps({ ...base, reports: [R('T1', 'welding', 'rejected'), work], lines: [...weldLines, wl] }))
assert.equal(g.length, 1); assert.equal(g[0].fingerprint.split('|')[0], 'carry-x')
// no link defined: nothing is said
assert.equal(carry(detectGaps({ ...base, maps: [], reports: [R('T1', 'welding', 'approved')], lines: weldLines })).length, 0)
console.log('technical form → work carry: ok')
