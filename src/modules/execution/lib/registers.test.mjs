import assert from 'node:assert/strict'
import { splitStamps, checkWelderCell, checkPipeCell, qualProblems, welderQualified, pipeFillPatch, pipeProgress, welderStats, registerKey, findByCode } from './registers.ts'
import { weldLifecycle } from './weldLifecycle.ts'

const W = (key, status = 'active') => ({ id: key, projectId: 'p', key, raw: key, fullName: '', nationalId: '', orgId: null, status, note: '', kind: 'welder', photo: '', card: {}, cardStatus: 'draft', cardConfirmedBy: null, cardConfirmedAt: null, cardNo: '', cardIssuedAt: null, cardIssuedBy: null, createdBy: null, cardSignA: null, cardSignB: null })
assert.deepEqual(splitStamps('a12 / b-3 ، ۱۴ و c9'), ['A12', 'B-3', '14', 'C9'])
assert.deepEqual(checkWelderCell('A12/Z9/S1', [W('A12'), W('S1', 'suspended')]), { unknown: ['Z9'], blocked: ['S1'] })
assert.equal(registerKey(' p-۱۰۰۱ '), 'P-1001')
const P = { id: 'x', projectId: 'p', key: 'P-1001', raw: 'P-1001', entryDate: '2026-01-01', heatNo: 'H1', odIn: 30, wtIn: 0.438, lengthM: 12.1, grade: '', coating: '', supplier: '', wayBill: '', materialId: null, entryLineId: null, status: 'in_stock', note: '' }
assert.deepEqual(checkPipeCell('p-1001', [P]), { unknown: false, bad: false })
assert.deepEqual(checkPipeCell('P-9', [P]), { unknown: true, bad: false })
assert.equal(checkPipeCell('P-1001', [{ ...P, status: 'rejected' }]).bad, true)
// fill only empty fields; length only on pipe-level forms
assert.deepEqual(pipeFillPatch('string', new Set(['pipeNo', 'lengthM', 'thkIn', 'diaIn']), { thkIn: '' }, P), { diaIn: '30', thkIn: '0.438', lengthM: '12.1' })
assert.deepEqual(pipeFillPatch('fitup', new Set(['lengthM', 'thkIn', 'sizeIn']), { thkIn: '0.5' }, P), { sizeIn: '30' })

const Q = { id: 'q', projectId: 'p', welderId: 'W1', wqtNo: '1', process: 'SMAW/GTAW', position: '', materialGroup: '', thkMin: 0.2, thkMax: 0.8, diaMin: null, diaMax: null, issueDate: '2026-01-01', expiryDate: '2026-06-30', wqtReportId: null, status: 'valid', note: '', wqt: {}, wqtStatus: 'draft', wqtConfirmedBy: null, wqtConfirmedAt: null, createdBy: null, wqtSignA: null, wqtSignB: null }
assert.deepEqual(qualProblems(Q, { date: '2026-03-01', thk: 0.438, process: 'smaw' }), [])
assert.deepEqual(qualProblems(Q, { date: '2026-07-01', thk: 1 }), ['منقضی', 'خارج از محدودهٔ ضخامت'])
assert.equal(welderQualified([], { date: '2026-03-01' }).ok, false)
assert.equal(welderQualified([Q, { ...Q, thkMax: 2 }], { date: '2026-03-01', thk: 1 }).ok, true)

const pr = pipeProgress([{ pipe: 'p-1', stage: 'strung', date: '2026-02-02' }, { pipe: 'P-1', stage: 'welded', date: '2026-02-05' }, { pipe: 'P-1', stage: 'strung', date: '2026-02-01' }])
assert.equal(pr.get('P-1').last, 'welded'); assert.equal(pr.get('P-1').stages.strung, '2026-02-01')

const L = (formKey, detail) => ({ formKey, detail })
const st = welderStats([L('welding', { sec: 'S1', weldNo: 'W1', stampRoot: 'A1', stampCap: 'B2' }), L('welding', { sec: 'S1', weldNo: 'W2', stampRoot: 'A1' }), L('rt_report', { sec: 'S1', weldNo: 'W1', result: 'rep' }), L('rt_report', { sec: 'S1', weldNo: 'W1', result: 'acc' }), L('rt_report', { sec: 'S1', weldNo: 'W2', result: 'acc' })])
assert.deepEqual(st.get('A1'), { welds: 2, rtWelds: 2, rtRepair: 1 }); assert.deepEqual(st.get('B2'), { welds: 1, rtWelds: 1, rtRepair: 1 })

// weld quality chain: RT reject → repair → RT again → coating → coating test
const E = (formKey, date, x = {}) => ({ formKey, date, ...x })
const run = (evs) => weldLifecycle(evs)
assert.equal(run([E('fitup', '1'), E('welding', '2', { vt: 'acc' })]).state, 'welded')
let r = run([E('fitup', '1'), E('welding', '2'), E('rt_request', '3'), E('rt_report', '4', { result: 'rep' })])
assert.equal(r.state, 'needs_repair'); assert.equal(r.next, 'ثبت تعمیر')
r = run([E('welding', '2'), E('rt_report', '4', { result: 'rep' }), E('weld_repair', '5', { repairDone: 'done' })])
assert.equal(r.state, 'repaired'); assert.equal(r.cycle, 1); assert.equal(r.next, 'درخواست RT مجدد')
r = run([E('welding', '2'), E('rt_report', '4', { result: 'rep' }), E('weld_repair', '5', { repairDone: 'done' }), E('rt_request', '6'), E('rt_report', '7', { result: 'acc' })])
assert.equal(r.state, 'rt_accepted'); assert.equal(r.next, 'پوشش سرجوش')
r = run([E('welding', '2'), E('rt_report', '4', { result: 'acc' }), E('fj_coating', '8', { result: 'acc' }), E('bond_test', '9', { result: 'acc' })])
assert.equal(r.state, 'coat_tested'); assert.equal(r.next, null)
r = run([E('welding', '2'), E('rt_report', '4', { result: 'acc' }), E('fj_coating', '8'), E('bond_test', '9', { result: 'rej' })])
assert.equal(r.state, 'coat_failed')
r = run([E('welding', '2'), E('fj_coating', '3')])
assert.ok(r.anomalies.includes('پوشش سرجوش پیش از پذیرفته‌شدن RT'))
// a re-weld / new VT reject after acceptance drops the acceptance
r = run([E('welding', '2'), E('rt_report', '3', { result: 'acc' }), E('welding', '4', { vt: 'rej' })])
assert.equal(r.state, 'needs_repair')
const people = [{ key: 'A12', cardNo: 'WLD-0001', nationalId: '146-122037-8' }, { key: 'B5', cardNo: '' }]
assert.equal(findByCode('146-122037-8', people).key, 'A12')
assert.equal(findByCode('a12', people).key, 'A12'); assert.equal(findByCode('wld-0001', people).key, 'A12'); assert.equal(findByCode('Z1', people), undefined); assert.equal(findByCode('  ', people), undefined)
console.log('registers + weld lifecycle: all assertions passed')
