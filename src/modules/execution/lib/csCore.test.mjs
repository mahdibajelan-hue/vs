import assert from 'node:assert/strict'
import { weldEarned, weldState, equipmentEarned, equipmentGaps, packReadiness, csSummary, parseSize, mapImport } from './csCore.ts'

assert.equal(parseSize('8"'), 8); assert.equal(parseSize('۱۲'), 12); assert.equal(parseSize('3/4'), 0.75); assert.equal(parseSize('1-1/2'), 1.5); assert.equal(parseSize('x'), null)
const W = (o) => ({ id: o.id ?? 'w', lineId: 'L1', location: 'shop', sizeIn: 8, fitupDate: null, weldDate: null, ndtResult: 'pending', repairCount: 0, welder: 'A', archived: false, ...o })
assert.equal(weldEarned(W({ fitupDate: 'd' })), 0.3)
assert.equal(weldEarned(W({ fitupDate: 'd', weldDate: 'd' })), 0.9)
assert.equal(weldEarned(W({ fitupDate: 'd', weldDate: 'd' }), false), 1)
assert.equal(weldEarned(W({ fitupDate: 'd', weldDate: 'd', ndtResult: 'accept' })), 1)
assert.equal(weldEarned(W({ fitupDate: 'd', weldDate: 'd', ndtResult: 'reject' })), 0.3)
assert.equal(weldState(W({ weldDate: 'd' })), 'welded')

assert.equal(equipmentEarned({ steps: { foundation: 'd', set: 'd' } }), 0.4)
assert.equal(equipmentEarned({ steps: { set: 'd', level: 'd', grout: 'd', align: 'd', piping: 'd' } }), 1)
assert.ok(equipmentGaps({ steps: { grout: 'd' } }).length >= 1)

const lines = [{ id: 'L1', sizeIn: 8, ndtPct: 100, testPackId: 'P', archived: false, lineNo: '8-1' }, { id: 'L2', sizeIn: 2, ndtPct: 10, testPackId: 'P', archived: false, lineNo: '2-1' }]
const welds = [W({ id: 'a', fitupDate: 'd', weldDate: 'd', ndtResult: 'accept' }), W({ id: 'b', location: 'field', fitupDate: 'd', weldDate: 'd', repairCount: 1 }), W({ id: 'c', lineId: 'L2', sizeIn: 2, fitupDate: 'd', weldDate: 'd' })]
const r = packReadiness({ id: 'P', punchA: 0 }, lines, welds)
assert.equal(r.ready, false); assert.equal(r.blocking, 1) // b waits for its re-test; c is on a 10% line
assert.equal(packReadiness({ id: 'P', punchA: 0 }, lines, welds.map((w) => (w.id === 'b' ? { ...w, ndtResult: 'accept' } : w))).ready, true)
assert.equal(packReadiness({ id: 'P', punchA: 2 }, lines, welds.map((w) => ({ ...w, ndtResult: 'accept' }))).ready, false)

const s = csSummary({ lines, spools: [{ stage: 'erected', archived: false }, { stage: 'cut', archived: false }], welds, equipment: [], packs: [] })
assert.equal(s.all.total, 18); assert.equal(s.shop.total, 10); assert.equal(s.field.total, 8)
assert.ok(Math.abs(s.all.earned - (8 + 8 * 0.9 + 2)) < 1e-9)
assert.equal(s.ndt.examined, 2); assert.equal(s.ndt.rejected, 1); assert.equal(s.ndt.waiting, 1)
assert.ok(Math.abs(s.spools.earned - 0.55) < 1e-9)

// import: checks every row first; nothing is imported while the file has an error
const ctx = { lines, spools: [], welds: [], equipment: [] }
const ok = mapImport('welds', [{ 'شماره لاین': '8-1', 'شماره جوش': 'W9', 'کارگاهی یا میدانی': 'میدانی', 'سایز (اینچ)': '8"' }], ctx)
assert.deepEqual(ok.errors, []); assert.equal(ok.rows[0].location, 'field'); assert.equal(ok.rows[0].sizeIn, 8)
const bad = mapImport('welds', [{ 'شماره لاین': '8-1', 'شماره جوش': 'W9' }, { 'شماره لاین': '8-1', 'شماره جوش': 'W9' }, { 'شماره لاین': 'X', 'شماره جوش': 'W1' }], ctx)
assert.equal(bad.rows.length, 0); assert.equal(bad.errors.length, 2)
const ln = mapImport('lines', [{ 'Line No': '6-PG-3', Size: '6', 'NDT': '10' }, { 'شماره لاین': '8-1', 'سایز': 8 }], ctx)
assert.equal(ln.errors.length, 1) // 8-1 already registered
assert.equal(mapImport('equipment', [{ 'تگ': 'K-101', 'نوع': 'کمپرسور' }], ctx).rows[0].kind, 'compressor')
console.log('csCore: ok')
