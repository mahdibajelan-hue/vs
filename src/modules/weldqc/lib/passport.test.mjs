import assert from 'node:assert/strict'
import { natural, pipeEnds, proposeWelds, timeline, NUMBER_RULE_DEFAULT } from './passport.ts'
assert.ok(natural('W-9', 'W-10') < 0)
const strung = ['P-1', 'P-2', 'P-3', 'P-4'].map((p, i) => ({ pipeNo: p, lengthM: 12 + i / 10, thkIn: 0.5, origin: '', date: '2026-01-01', reportNo: 'S-1', front: 'A', order: i }))
const ends = pipeEnds([{ id: 'b', sec: '1', weld: 'W-10', pipe: 'p-3' }, { id: 'a', sec: '1', weld: 'W-9', pipe: 'P-2' }, { id: 'c', sec: '2', weld: 'W-1', pipe: 'P-4' }], strung)
assert.equal(ends.get('b').a, 'P-2'); assert.equal(ends.get('b').b, 'p-3'); assert.equal(ends.get('b').bLen, 12.2); assert.equal(ends.get('a').a, ''); assert.equal(ends.get('c').a, '')
const pr = proposeWelds(strung, { ...NUMBER_RULE_DEFAULT, perSection: 2 })
assert.deepEqual(pr.map((x) => [x.sec, x.weld, x.a, x.b]), [['1', 'W-001', 'P-1', 'P-2'], ['1', 'W-002', 'P-2', 'P-3'], ['2', 'W-001', 'P-3', 'P-4']])
assert.equal(proposeWelds(strung, { ...NUMBER_RULE_DEFAULT, perSection: 2, restart: false })[2].weld, 'W-003')
const t = timeline({ weld: { welding: { date: '2026-02-02', reportNo: 'WL-1', tieIn: false }, coat: { fj: { date: '2026-02-10', reportNo: 'C-1' } } }, vts: [{ id: 'v', round: 0, at: '2026-02-03T08:00:00Z', byName: 'ناظر', result: 'accept' }], films: [{ round: 0, shotAt: '2026-02-04', createdAt: '2026-02-05', uploadedName: 'RT' }], evals: [{ round: 0, evaluatedAt: '2026-02-05', evaluatedName: 'مفسر', overall: 'accept', signedAt: '2026-02-06', signedName: 'بازرس' }], repairs: [], coatings: [], closedAt: '2026-02-06', finalFa: 'قابل قبول', nameOf: (k) => k })
assert.deepEqual(t.map((x) => x.key), ['weld', 'vtv', 'rt0', 'ev0', 'sg0', 'closed', 'fj'])
assert.equal(t[2].date, '2026-02-04')
console.log('passport: ok')
