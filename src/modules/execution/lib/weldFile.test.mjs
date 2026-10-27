import assert from 'node:assert/strict'
import { buildWeldFiles, weldFileStats, coatTestVerdict } from './weldFile.ts'

const W = (id, sec, weld, central = {}) => ({ id, projectId: 'p', sectionRaw: sec, weldRaw: weld, pipeNo: null, status: 'auto', central })
const R = (id, formKey, date, status = 'approved') => ({ id, formKey, reportDate: date, reportNo: id, status })
const L = (id, reportId, detail) => ({ id, reportId, detail })
const K = (lineId, weldId) => ({ lineId, weldId, projectId: 'p' })

const reports = [R('f1', 'fitup', '2026-01-01'), R('w1', 'welding', '2026-01-02'), R('q1', 'rt_request', '2026-01-03'), R('t1', 'rt_report', '2026-01-04'),
  R('p1', 'weld_repair', '2026-01-05'), R('t2', 'rt_report', '2026-01-06'), R('c1', 'fj_coating', '2026-01-07'), R('b1', 'bond_test', '2026-01-08', 'submitted'), R('x1', 'rt_report', '2026-01-09', 'rejected')]
const lines = [
  L('a', 'f1', { sec: 'S1', jointNo: 'W1', result: 'acc' }),
  L('b', 'w1', { sec: 'S1', weldNo: 'W1', stampRoot: 'A1', stampRootC: 'A2', stampCap: 'B7', vt: 'acc' }),
  L('c', 'q1', { sec: 'S1', weldNo: 'W1', reqNo: 'RQ-9' }),
  L('d', 't1', { sec: 'S1', weldNo: 'W1', result: 'rep', defect: 'PO 12cm', repairKind: 'RS' }),
  L('e', 'p1', { sec: 'S1', weldNo: 'W1', defectType: 'RP', repairDone: 'done', vtCheck: 'acc' }),
  L('f', 't2', { sec: 'S1', weldNo: 'W1', result: 'acc' }),
  L('g', 'c1', { sec: 'S1', weldNo: 'W1', thk12: 900, thk3: 850, thk6: 870, thk9: '', result: 'acc' }),
  L('h', 'b1', { weldNo: 'W1', adhPipeOk: 'ok', adhMainOk: 'ok', appearance: 'ok', holVolt: 'ok', holAction: 'final' }),
  L('i', 'x1', { sec: 'S1', weldNo: 'W1', result: 'rep' }),
  L('j', 'w1', { sec: 'S1', weldNo: 'W2', vt: 'rej' }),
]
const files = buildWeldFiles({ projectId: 'p', welds: [W('w1', 'S1', 'W1', { pipe: 'P-10', thk: '0.625' }), W('w2', 'S1', 'W2'), { ...W('m', 'S1', 'W1X'), status: 'merged' }], links: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((x) => K(x, 'w1')).concat([K('j', 'w2')]), lines, reports })
assert.equal(files.length, 2)
const f = files[0]
assert.equal(f.pipe, 'P-10'); assert.equal(f.fitup.result, 'acc')
assert.deepEqual(f.welding.stamps, { root: 'A1 / A2', hot: '', fill: '', cap: 'B7' })
assert.equal(f.rtRequest.reqNo, 'RQ-9')
assert.equal(f.rt.result, 'acc'); assert.equal(f.rt.count, 2) // the rejected report is not part of the file
assert.equal(f.repairs.length, 1); assert.equal(f.repairs[0].done, true)
assert.equal(f.coating.thicknessUm, 850)
assert.equal(f.coatTest.verdict, 'ok'); assert.equal(f.coatTest.approved, false)
assert.equal(f.state, 'coat_tested'); assert.equal(f.cycle, 1); assert.equal(f.pending, 1); assert.equal(f.lastDate, '2026-01-08')
assert.equal(files[1].state, 'needs_repair')

// a coating test sheet fails on any failing check, not only on a «result» field the sheet does not have
assert.equal(coatTestVerdict({ adhPipeOk: 'ok', appearance: 'rej' }), 'rej')
assert.equal(coatTestVerdict({ holAction: 'repair' }), 'rej')
assert.equal(coatTestVerdict({ holAction: 'final' }), 'ok')
assert.equal(coatTestVerdict({}), '')

const st = weldFileStats(files)
assert.equal(st.welds, 2); assert.equal(st.welded, 2); assert.equal(st.rtDone, 1); assert.equal(st.withoutRt, 1); assert.equal(st.repairRate, 1); assert.equal(st.needsRepair, 1); assert.equal(st.coatTested, 1)
console.log('weld file: all assertions passed')
