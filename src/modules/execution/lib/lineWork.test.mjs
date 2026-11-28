import assert from 'node:assert/strict'
import { bendRow, bendsByPipe, carriedHeader, dayReport, jointRecords, lineEndKm, stampField, strungPipes, weldRow } from './lineWork.ts'
import { registerKey } from './registers.ts'

const pipe = (raw, wt, len) => ({ id: raw, projectId: 'p', key: registerKey(raw), raw, entryDate: '2026-10-27', heatNo: '', odIn: 42, wtIn: wt, lengthM: len, grade: '', coating: '', supplier: '', wayBill: '', materialId: null, entryLineId: null, receiptId: null, status: 'in_stock', note: '' })
const reports = [
  { id: 'S1', formKey: 'string', reportDate: '2026-11-01', front: 'F', status: 'approved', data: { thkSet: '0.562', seed: 'x' } },
  { id: 'F1', formKey: 'fitup', reportDate: '2026-11-02', front: 'F', status: 'approved', data: { wpsNo: 'WPS-1', pipeSpec: 'X70' } },
  { id: 'W1', formKey: 'welding', reportDate: '2026-11-03', front: 'F', status: 'draft', data: {} },
  { id: 'B1', formKey: 'bend', reportDate: '2026-11-03', front: 'F', status: 'approved', data: {} },
  { id: 'F2', formKey: 'fitup', reportDate: '2026-11-04', front: 'G', status: 'draft', data: { wpsNo: 'WPS-2' } },
]
const lines = [
  { id: 'a', reportId: 'S1', status: 'approved', detail: { pipeNo: 'sp-1', km: 40, lengthM: 12 } },
  { id: 'b', reportId: 'S1', status: 'approved', detail: { pipeNo: 'SP-2', km: 40.012, lengthM: '' } },
  { id: 'c', reportId: 'S1', status: 'rejected', detail: { pipeNo: 'SP-3', km: 40.024 } },
  { id: 'd', reportId: 'F1', status: 'approved', detail: { sec: '3', jointNo: 'J-1', pipeNo2: 'SP-1', pipeNo: 'SP-2' } },
  { id: 'e', reportId: 'W1', status: 'pending', detail: { sec: '3', weldNo: 'J-1' } },
  { id: 'f', reportId: 'B1', status: 'approved', detail: { pipeNo: 'SP-2', dirLR: 'IPR 6°', dirSO: '', result: 'acc' } },
]
const pipes = [pipe('SP-1', 0.562, 11.9), pipe('SP-2', 0.688, 12.2)]

const sp = strungPipes(lines, reports, pipes)
assert.deepEqual(sp.map((p) => [p.raw, p.km, p.lengthM, p.thkIn]), [['SP-1', 40, 12, 0.562], ['SP-2', 40.012, 12.2, 0.688]]) // rejected row out, length from register when the row has none
assert.equal(lineEndKm(sp), 40.024)
const js = jointRecords(lines, reports)
assert.deepEqual(js.map((j) => [j.before, j.after, j.no, j.welded]), [['SP-1', 'SP-2', 'J-1', true]])
assert.equal(jointRecords(lines, reports, 'F1', [{ sec: '3', jointNo: 'J-2', pipeNo2: 'SP-2', pipeNo: 'SP-3' }]).map((j) => j.no + (j.mine ? '*' : '')).join(), 'J-2*')
assert.deepEqual(bendsByPipe(lines, reports).get('SP-2'), { lr: 'IPR 6°', so: '', result: 'acc' })

assert.equal(dayReport(reports, 'welding', '2026-11-03', 'F').id, 'W1')
assert.equal(dayReport(reports, 'welding', '2026-11-03', 'G'), undefined)
assert.deepEqual(carriedHeader(reports, 'fitup', 'F'), { wpsNo: 'WPS-1', pipeSpec: 'X70' })
assert.deepEqual(carriedHeader(reports, 'fitup', 'Z'), { wpsNo: 'WPS-2' }) // no minute on that front yet: the latest of the form
assert.deepEqual(carriedHeader(reports, 'string', 'F'), { thkSet: '0.562' })

assert.deepEqual(bendRow(sp[1], { plan: 'IPL', planDeg: 6.25, profile: 'SB', profileDeg: 3, ovalPct: 1.2, ovalMm: null, result: 'acc' }),
  { km: 40.012, pipeNo: 'SP-2', diaIn: 42, lengthM: 12.2, wtMm: 17.48, dirLR: 'IPL 6.3°', dirSO: 'SB 3°', ovalPct: 1.2, result: 'acc' })
assert.equal(bendRow(sp[1], { plan: '', planDeg: null, profile: 'OB', profileDeg: 0, ovalPct: null, ovalMm: null, result: 'rej' }).dirSO, '')

assert.equal(stampField('Root', 'C'), 'stampRootC')
assert.deepEqual(weldRow(js[0], sp[1], { stampRoot: 'A1', stampHot: '', stampCapC: '4' }, 'acc'),
  { sec: '3', weldNo: 'J-1', pipeNo: 'SP-2', lengthM: 12.2, thkIn: 0.688, sizeIn: 42, stampRoot: 'A1', stampCapC: '4', vt: 'acc' })
console.log('lineWork ok')
