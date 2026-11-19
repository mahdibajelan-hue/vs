import assert from 'node:assert/strict'
import { ndtPlan, welderReview, packTestNeed, withDefaults, ITP_CHECKS, itpOf, judgeItp, readings, B31_8_EXTENT } from './csQc.ts'

const R = withDefaults()
assert.equal(B31_8_EXTENT.station, 100); assert.equal(B31_8_EXTENT['3'], 40)
const W = (o) => ({ id: o.id, lineId: 'L', weldNo: o.id, location: 'field', sizeIn: 8, thkMm: 12.7, welder: 'A', fitupDate: '2026-10-01', weldDate: '2026-10-02', ndtResult: 'pending', repairCount: 0, archived: false, ndtSelected: false, ndtReason: '', ...o })

// 100 % line: every welded joint, the unwelded ones not yet
const full = ndtPlan([{ id: 'L', ndtPct: 100, archived: false }], [W({ id: '1' }), W({ id: '2', ndtResult: 'accept' }), W({ id: '3', weldDate: null })], R)[0]
assert.equal(full.required, 2); assert.equal(full.shortfall, 1); assert.deepEqual(full.suggest, ['1'])

// 10 % line with 20 welds of two welders: 2 random picks spread over both welders
const twenty = Array.from({ length: 20 }, (_, i) => W({ id: `w${i}`, welder: i % 2 ? 'A' : 'B', weldDate: `2026-10-${String(10 + i).padStart(2, '0')}` }))
const p10 = ndtPlan([{ id: 'L', ndtPct: 10, archived: false }], twenty, R)[0]
assert.equal(p10.required, 2); assert.equal(p10.shortfall, 2); assert.equal(p10.suggest.length, 2)
assert.notEqual(twenty.find((w) => w.id === p10.suggest[0]).welder, twenty.find((w) => w.id === p10.suggest[1]).welder)

// a reject of welder A on the 10 % line → 2 progressive welds of A; a reject among those → A goes to 100 %
const withRej = twenty.map((w) => (w.id === 'w1' ? { ...w, ndtSelected: true, ndtReason: 'random', ndtResult: 'reject' } : w.id === 'w0' ? { ...w, ndtSelected: true, ndtReason: 'random', ndtResult: 'accept' } : w))
const pr = ndtPlan([{ id: 'L', ndtPct: 10, archived: false }], withRej, R)[0]
assert.equal(pr.progressiveOwed, 2); assert.equal(pr.progressiveDone, 0)
assert.ok(pr.suggest.slice(0, 2).every((id) => withRej.find((w) => w.id === id).welder === 'A'))
const esc = withRej.map((w) => (w.id === 'w3' ? { ...w, ndtSelected: true, ndtReason: 'progressive', ndtResult: 'reject' } : w.id === 'w5' ? { ...w, ndtSelected: true, ndtReason: 'progressive', ndtResult: 'accept' } : w))
const pe = ndtPlan([{ id: 'L', ndtPct: 10, archived: false }], esc, R)[0]
assert.deepEqual(pe.escalated, ['A']); assert.ok(pe.suggest.length >= 7) // the rest of A's welds

// welders: register, qualification range (the register keeps inches), continuity, reject limit
const reg = [{ id: 'r1', key: 'A', raw: 'A', fullName: 'جوشکار الف', status: 'active' }]
const quals = [{ id: 'q', welderId: 'r1', process: '', thkMin: 0.2, thkMax: 0.75, diaMin: 2, diaMax: 48, issueDate: '2026-01-01', expiryDate: '2027-01-01', status: 'valid' }]
const rows = welderReview([W({ id: 'x', thkMm: 12.7 }), W({ id: 'y', thkMm: 25.4 }), W({ id: 'z', welder: 'Q' })], reg, quals, R, '2026-11-01')
const a = rows.find((r) => r.key === 'A'); assert.equal(a.unqualified.length, 1); assert.ok(a.unqualified[0].reasons.includes('خارج از محدودهٔ ضخامت'))
assert.equal(rows.find((r) => r.key === 'Q').registered, false)
assert.equal(welderReview([W({ id: 'o', weldDate: '2026-01-01' })], reg, quals, R, '2026-11-01')[0].continuityGap, true)

// hydrotest: factor × highest design pressure of the pack's lines
assert.equal(packTestNeed({ id: 'P' }, [{ id: 'a', testPackId: 'P', designPressBar: 100, archived: false }, { id: 'b', testPackId: 'P', designPressBar: 75, archived: false }], R), 150)

// ITP judgements
assert.deepEqual(readings('85, 92 ،110'), [85, 92, 110])
const dft = itpOf('pnt_dft')
assert.equal(judgeItp(dft, { readings: '80 90 100' }, R).ok, true)
assert.equal(judgeItp(dft, { readings: '55 90 100' }, R).ok, false) // 55 < 0.8 × 75
assert.equal(judgeItp(dft, { readings: '80' }, R).ok, null)
assert.equal(judgeItp(itpOf('civ_strength'), { age: 28, results: '31 32 30' }, R).ok, true)
assert.equal(judgeItp(itpOf('civ_strength'), { age: 28, results: '33 33 26' }, R).ok, false) // one below fc′ − 3.5
assert.equal(judgeItp(itpOf('ele_ir'), { results: '200 150 90' }, withDefaults({ itp: { ele_ir: { min: 50 } } })).ok, true) // project override
assert.equal(judgeItp(itpOf('civ_pour'), { slump: 100, temp: 30, cubes: 3, rebarOk: true }, R).ok, true)
assert.ok(ITP_CHECKS.every((c) => c.fields.length && c.title && c.ref))
console.log('csQc: ok')
