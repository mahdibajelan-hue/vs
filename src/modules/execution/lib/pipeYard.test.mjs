import assert from 'node:assert/strict'
import { NO_DEPOT, NO_FILTER, filterYard, stringRows, yardFacets, yardPipes } from './pipeYard.ts'
import { registerKey } from './registers.ts'

const P = (raw, wt, len, entryLineId, entryDate, status = 'in_stock') => ({ id: raw, projectId: 'p', key: registerKey(raw), raw, entryDate, heatNo: '', odIn: 42, wtIn: wt, lengthM: len, grade: '', coating: '', supplier: '', wayBill: '', materialId: null, entryLineId, receiptId: null, status, note: '' })
const pipes = [P('SP-0003', 0.688, 12.1, 'e2', '2026-10-28'), P('SP-0001', 0.562, 11.9, 'e1', '2026-10-27'), P('SP-0002', 0.562, 12.0, 'e1', '2026-10-27'), P('SP-0004', 0.75, 12.3, null, '2026-10-29'), P('SP-0005', 0.562, 12, 'e1', '2026-10-27', 'rejected')]
const reports = [{ id: 'E1', formKey: 'pipe_entry', front: 'جبههٔ جنوب', data: { depot: 'دپوی کیلومتر ۴۰' } }, { id: 'E2', formKey: 'pipe_entry', front: 'جبههٔ جنوب', data: {} }, { id: 'S1', formKey: 'string', front: '', data: {} }, { id: 'S2', formKey: 'string', front: '', data: {} }]
const lines = [{ id: 'e1', reportId: 'E1', status: 'approved', detail: {} }, { id: 'e2', reportId: 'E2', status: 'pending', detail: {} }, { id: 's1', reportId: 'S1', status: 'approved', detail: { pipeNo: 'sp-0002' } }, { id: 's2', reportId: 'S2', status: 'pending', detail: { pipeNo: 'SP-0003' } }]

// strung elsewhere, rejected, and this record's own rows are out; oldest delivery first; depot from the record, else its front
const y = yardPipes(pipes, lines, reports, 'S2', [])
assert.deepEqual(y.map((p) => p.raw), ['SP-0001', 'SP-0003', 'SP-0004'])
assert.equal(y[0].depot, 'دپوی کیلومتر ۴۰')
assert.equal(y[1].depot, 'جبههٔ جنوب')
assert.equal(y[1].pending, true)
assert.equal(y[2].depot, NO_DEPOT)
assert.deepEqual(yardPipes(pipes, lines, reports, 'S2', ['SP-0001']).map((p) => p.raw), ['SP-0003', 'SP-0004'])
assert.deepEqual(yardPipes(pipes, lines, reports, 'S9', []).map((p) => p.raw), ['SP-0001', 'SP-0004']) // S2's pipe is strung for another record

// filters and facets
assert.deepEqual(filterYard(y, { ...NO_FILTER, thks: [0.562] }).map((p) => p.raw), ['SP-0001'])
assert.deepEqual(filterYard(y, { ...NO_FILTER, depots: ['جبههٔ جنوب', NO_DEPOT] }).map((p) => p.raw), ['SP-0003', 'SP-0004'])
assert.deepEqual(filterYard(y, { ...NO_FILTER, q: '0004' }).map((p) => p.raw), ['SP-0004'])
const f = yardFacets(y)
assert.deepEqual(f.thks.map((x) => [x.value, x.count]), [[0.562, 1], [0.688, 1], [0.75, 1]])
assert.equal(Math.round(f.sizes[0].meters * 10) / 10, 36.3)

// rows: length/thickness from the register, chainage laid end to end from the start
const rows = stringRows(y, 40)
assert.deepEqual(rows[0], { pipeNo: 'SP-0001', origin: 'depot', lengthM: 11.9, thkIn: 0.562, km: 40 })
assert.equal(rows[1].km, 40.012)
assert.equal(rows[2].km, 40.024)
assert.equal('km' in stringRows(y, null)[0], false)
console.log('pipeYard ok')
