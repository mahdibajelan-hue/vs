import assert from 'node:assert/strict'
import { docKey, titleKey, buildTemplate, planTemplate } from './linkTemplates.ts'

assert.equal(docKey('791355-DP1-PLN-CP-CAL-0002'), 'DP1-PLN-CP-CAL-0002')
assert.equal(docKey('DP1-PLN-CV-DWG-0023-802011'), 'DP1-PLN-CV-DWG-0023')
assert.equal(docKey('۷۹۱۳۵۵-DP1 PLN cp/cal_0002'), 'DP1-PLN-CP-CAL-0002')
assert.equal(titleKey('LBV Area Road & Paving Drawing-791355'), 'lbv area road paving drawing')
assert.equal(titleKey('نقشه‌های ايستگاه  TR'), 'نقشههای ایستگاه tr')

// source project
const sDocs = [{ id: 'd1', docNo: '791355-DP1-PLN-CP-CAL-0002', title: 'Calculation for Cathodic Protection' }, { id: 'd2', docNo: '791355-DP1-PLN-CV-DWG-0023', title: 'LBV Area Road' }, { id: 'd3', docNo: 'X-1', title: 'Pipe Jacking Method Statement' }]
const sActs = [{ id: 'a1', itemNo: '030103', title: 'عبور لوله به روش پایپ جکینگ', plannedStart: '2026-05-01' }, { id: 'a2', itemNo: '020101', title: 'خاکبرداری', plannedStart: null }, { id: 'a3', itemNo: '', title: 'نصب حفاظت کاتدی', plannedStart: '2026-06-01' }]
const L = (docId, activityId, o = {}) => ({ docId, activityId, front: '', contract: '', needKind: 'start', needDate: null, minStatus: 'approved', allowRestricted: false, altActivityId: null, note: '', ...o })
const items = buildTemplate([L('d1', 'a3', { needDate: '2026-05-20' }), L('d2', 'a2', { altActivityId: 'a1' }), L('d3', 'a1'), L('dx', 'a1')], sDocs, sActs)
assert.equal(items.length, 3) // a link to an unknown document is skipped
assert.equal(items[0].needOffset, -12); assert.equal(items[0].docKey, 'DP1-PLN-CP-CAL-0002')

// target project: other project number, one document renamed number but same title, activities in another order
const tDocs = [{ id: 'T1', docNo: '802011-DP1-PLN-CP-CAL-0002', title: 'Calc CP' }, { id: 'T2', docNo: '802011-DP1-PLN-CV-DWG-0099', title: 'LBV Area Road' }, { id: 'T9', docNo: '802011-Z', title: 'Other' }]
const tActs = [{ id: 'B3', itemNo: '', title: 'نصب حفاظت کاتدی', plannedStart: '2027-01-10' }, { id: 'B1', itemNo: '030103', title: 'عبور لوله به روش پایپ جکینگ', plannedStart: null }, { id: 'B2', itemNo: '020101', title: 'خاکبرداری با ماشین', plannedStart: null }]
const plan = planTemplate(items, tDocs, tActs, [])
const [r1, r2, r3] = plan.rows
assert.equal(r1.doc.id, 'T1'); assert.equal(r1.docBy, 'number'); assert.equal(r1.act.id, 'B3'); assert.equal(r1.actBy, 'title'); assert.equal(r1.link.needDate, '2026-12-29')
assert.equal(r2.doc.id, 'T2'); assert.equal(r2.docBy, 'title'); assert.equal(r2.act.id, 'B2'); assert.equal(r2.actBy, 'item'); assert.equal(r2.alt.id, 'B1')
assert.equal(r3.doc, null); assert.equal(r3.link, null) // the method statement does not exist in the target project
assert.equal(plan.create.length, 2); assert.equal(plan.missingDoc, 1); assert.equal(plan.missingAct, 0)
// existing links are not created again
const again = planTemplate(items, tDocs, tActs, [{ docId: 'T1', activityId: 'B3' }])
assert.equal(again.create.length, 1); assert.equal(again.existing, 1)
// an ambiguous match (two activities with the same item number and no title match) is not guessed
const amb = planTemplate(items, tDocs, [...tActs, { id: 'B4', itemNo: '020101', title: 'خاکبرداری دستی', plannedStart: null }], [])
assert.equal(amb.rows[1].act, null)
// repeated item + title in one estimate: the specification, then the row number, tell them apart
const rep = [{ id: 'r1', itemNo: '592105', title: 'کابل', spec: '16-40', rowNo: '3' }, { id: 'r2', itemNo: '592105', title: 'کابل', spec: '16-40', rowNo: '4' }, { id: 'r3', itemNo: '592105', title: 'کابل', spec: '64-100', rowNo: '2' }]
const repItems = buildTemplate([L('d1', 'r2'), L('d1', 'r3')], sDocs, rep)
const repPlan = planTemplate(repItems, sDocs, rep, [])
assert.deepEqual(repPlan.rows.map((r) => r.act?.id), ['r2', 'r3'])
console.log('engineering link templates: all assertions passed')
