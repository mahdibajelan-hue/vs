import assert from 'node:assert/strict'
import { evaluateJoint, mergeCriteria, DEFAULT_CRITERIA, suggestRepair, thicknessMm } from './rules.ts'
import { welderReport, repairAnalysis, qcState } from './analytics.ts'
import { detectCandidates, otsu } from './detect.ts'

const D = (id, type, lengthMm, o = {}) => ({ id, type, lengthMm, depthMm: 0, positionMm: 0, ...o })

// ── single-length rules against t (t = 12.7 → limit 12.7; t = 25 → cap 19)
assert.equal(evaluateJoint(12.7, [D('a', 'slag_inclusion', 10)]).overall, 'accept')
assert.equal(evaluateJoint(12.7, [D('a', 'slag_inclusion', 13)]).overall, 'repair')
assert.equal(evaluateJoint(25, [D('a', 'incomplete_fusion', 18.9)]).overall, 'accept')
assert.equal(evaluateJoint(25, [D('a', 'incomplete_fusion', 19.5)]).overall, 'repair')
// cracks: crater crack → repair, anything else → cut out
assert.equal(evaluateJoint(10, [D('c', 'crack', 4, { depthMm: 0.5 })]).overall, 'repair')
assert.equal(evaluateJoint(10, [D('c', 'crack', 8)]).overall, 'cut_out')
// burn-through
assert.equal(evaluateJoint(10, [D('b', 'burn_through', 3)]).overall, 'repair')
assert.equal(evaluateJoint(10, [D('b', 'burn_through', 6)]).overall, 'cut_out')
// undercut: depth limit = min(0.8, 12.5% t)
assert.equal(evaluateJoint(10, [D('u', 'external_undercut', 20, { depthMm: 0.7 })]).overall, 'accept')
assert.equal(evaluateJoint(5, [D('u', 'external_undercut', 20, { depthMm: 0.7 })]).overall, 'repair')
assert.equal(evaluateJoint(10, [D('u', 'internal_undercut', 60, { depthMm: 0.2 })]).overall, 'repair')
// Hi-Lo 15% t
assert.equal(evaluateJoint(10, [D('h', 'hi_lo', 0, { depthMm: 1.4 })]).overall, 'accept')
assert.equal(evaluateJoint(10, [D('h', 'hi_lo', 0, { depthMm: 1.6 })]).overall, 'repair')
// unknown type → repair; no defects → accept
assert.equal(evaluateJoint(10, [D('o', 'other', 1)]).overall, 'repair')
assert.equal(evaluateJoint(10, []).overall, 'accept')

// ── aggregate window: three slag lines each within single limit (8 ≤ 10) but 24 > 2t = 20 within 300 mm → all repair
let ev = evaluateJoint(10, [D('1', 'slag_inclusion', 8, { positionMm: 0 }), D('2', 'slag_inclusion', 8, { positionMm: 100 }), D('3', 'slag_inclusion', 8, { positionMm: 250 })])
assert.equal(ev.overall, 'repair'); assert.ok(ev.verdicts.every((v) => v.verdict === 'repair'))
// spread over more than the window → each pair ≤ 20 → accept
ev = evaluateJoint(10, [D('1', 'slag_inclusion', 8, { positionMm: 0 }), D('2', 'slag_inclusion', 8, { positionMm: 400 }), D('3', 'slag_inclusion', 8, { positionMm: 800 })])
assert.equal(ev.overall, 'accept')
// aggregate cap 25 mm for thick walls
ev = evaluateJoint(20, [D('1', 'porosity', 13, { positionMm: 0 }), D('2', 'porosity', 13, { positionMm: 10 })])
assert.equal(ev.overall, 'repair'); assert.equal(ev.limits.aggregateMm, 25)
// advice follows the verdict
assert.match(ev.verdicts[0].advice, /سنگ‌زنی/)
assert.equal(suggestRepair('porosity', 'accept'), 'عیب قابل قبول است؛ تعمیری لازم نیست.')

// ── criteria merge: saved values override, broken ones are ignored
const c = mergeCriteria({ windowMm: 150, aggregate: { capMm: 'x' }, crater: { allow: false }, nope: 1 })
assert.equal(c.windowMm, 150); assert.equal(c.aggregate.capMm, 25); assert.equal(c.crater.allow, false); assert.equal(DEFAULT_CRITERIA.windowMm, 300)
assert.equal(evaluateJoint(10, [D('c', 'crack', 4, { depthMm: 0.5 })], c).overall, 'cut_out')

// thickness from the weld register: inches below 3, else mm
assert.equal(thicknessMm('0.5'), 12.7); assert.equal(thicknessMm('12.7'), 12.7); assert.equal(thicknessMm(''), null)

// ── welder report
const S = (root, fill = [], cap = []) => ({ root, hot: [], fill, cap })
const welds = [
  { id: 'w1', label: '1', date: '2026-01-02', stamps: S(['A'], ['B'], ['B']) },
  { id: 'w2', label: '2', date: '2026-01-03', stamps: S(['A'], ['C']) },
  { id: 'w3', label: '3', date: '2026-02-03', stamps: S(['C']) },
]
const evals = [
  { weldId: 'w1', round: 0, overall: 'repair', at: '2026-01-05T08:00:00Z', signed: true },
  { weldId: 'w1', round: 1, overall: 'accept', at: '2026-01-09T08:00:00Z', signed: true },
  { weldId: 'w2', round: 0, overall: 'accept', at: '2026-01-06T08:00:00Z', signed: true },
  { weldId: 'w3', round: 0, overall: 'accept', at: '2026-02-01T08:00:00Z', signed: false },
  { weldId: 'w3', round: 0, overall: 'repair', at: '2026-02-05T08:00:00Z', signed: true },
]
const defects = [
  { id: 'd1', weldId: 'w1', round: 0, type: 'incomplete_penetration', pass: 'root', welders: ['A'], verdict: 'repair', lengthMm: 30, removed: false },
  { id: 'd2', weldId: 'w1', round: 0, type: 'porosity', pass: 'fill', welders: ['B'], verdict: 'accept', lengthMm: 2, removed: false },
  { id: 'd3', weldId: 'w3', round: 0, type: 'slag_inclusion', pass: 'root', welders: ['C'], verdict: 'repair', lengthMm: 20, removed: false },
  { id: 'd4', weldId: 'w3', round: 0, type: 'crack', pass: 'root', welders: ['C'], verdict: 'cut_out', lengthMm: 20, removed: true },
]
const monthOf = (iso) => iso.slice(0, 7)
const rep = welderReport({ welds, evals, defects, monthOf })
const A = rep.find((r) => r.key === 'A'), B = rep.find((r) => r.key === 'B'), C = rep.find((r) => r.key === 'C')
assert.equal(A.welds, 2); assert.equal(A.evaluated, 2); assert.equal(A.firstRepair, 1); assert.equal(A.repairPct, 50)
assert.equal(A.top, 'incomplete_penetration'); assert.equal(A.byPass.root, 1)
assert.equal(B.welds, 1); assert.equal(B.repairPct, 100); assert.equal(B.defects, 1); assert.equal(B.rejectable, 0)
// C: w2 accepted, w3 latest round-0 evaluation = repair → 50 %; the withdrawn crack is not counted
assert.equal(C.repairPct, 50); assert.equal(C.defects, 1); assert.equal(C.months.length, 2)
// date range filters by weld date
assert.equal(welderReport({ welds, evals, defects, monthOf, from: '2026-02-01' }).find((r) => r.key === 'A'), undefined)
assert.equal(rep[0].key, 'B') // highest repair % first

// ── repair analysis
const ra = repairAnalysis({ evals, defects, monthOf, repairs: [{ weldId: 'w1', round: 0, performedBy: 'A', method: 'grind', at: '2026-01-07T08:00:00Z' }, { weldId: 'w3', round: 0, performedBy: 'C', method: '', at: '2026-02-06T08:00:00Z' }] })
assert.equal(ra.evaluated, 3); assert.equal(ra.firstRepair, 2); assert.equal(ra.repairs, 2)
assert.equal(ra.succeeded, 1); assert.equal(ra.pending, 1); assert.equal(ra.successPct, 100)
assert.equal(ra.causes[0].type, 'incomplete_penetration'); assert.equal(ra.causes.length, 2)
assert.equal(ra.medianDaysToRepair, 2)

// ── QC state
assert.equal(qcState({ closed: false, finalStatus: null, round: 0, films: [], lastEval: undefined }), 'no_film')
assert.equal(qcState({ closed: false, finalStatus: null, round: 0, films: [{ round: 0, quality: 'pending' }], lastEval: undefined }), 'quality')
assert.equal(qcState({ closed: false, finalStatus: null, round: 0, films: [{ round: 0, quality: 'accepted' }], lastEval: undefined }), 'interpret')
assert.equal(qcState({ closed: false, finalStatus: null, round: 0, films: [{ round: 0, quality: 'accepted' }], lastEval: { round: 0, overall: 'repair', signed: false } }), 'to_sign')
assert.equal(qcState({ closed: false, finalStatus: null, round: 0, films: [{ round: 0, quality: 'accepted' }], lastEval: { round: 0, overall: 'repair', signed: true } }), 'repair_due')
assert.equal(qcState({ closed: false, finalStatus: null, round: 1, films: [{ round: 0, quality: 'accepted' }], lastEval: { round: 0, overall: 'repair', signed: true } }), 'reshoot')
assert.equal(qcState({ closed: true, finalStatus: 'cut_out', round: 2, films: [], lastEval: undefined }), 'cut_out')

// ── detector: a flat noisy film with one dark round spot and one long thin line
const w = 160, h = 80, d = new Uint8Array(w * h)
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
for (let i = 0; i < d.length; i++) d[i] = 150 + Math.round(rnd() * 6)
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if ((x - 40) ** 2 + (y - 40) ** 2 <= 16) d[y * w + x] = 60
  if (y >= 38 && y <= 41 && x >= 90 && x <= 140) d[y * w + x] = 70
}
const cand = detectCandidates({ w, h, d })
assert.ok(cand.length >= 2, `found ${cand.length}`)
assert.ok(cand.some((c) => c.x <= 40 && c.x + c.w >= 40 && c.y <= 40 && c.y + c.h >= 40), 'round spot boxed')
assert.ok(cand.some((c) => c.type === 'slag_inclusion' && c.w > 30), 'line boxed as elongated')
assert.equal(otsu(new Uint8Array([0, 0, 0, 255, 255, 255])), 0)

console.log('weldqc: ok')
