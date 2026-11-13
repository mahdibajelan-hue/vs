import assert from 'node:assert/strict'
import { sidesFromRows, weldersAt, crewGrid, allWelders, emptySides } from './crew.ts'
import { jointHealth, smoothed, welderScore, gradeOf } from './health.ts'
import { welderTrends, clockHotspot, patternInsights, sameJoint, repairHold } from './insights.ts'
import { levels, median3, metrics, sharpen, shrink } from './filmio.ts'
import { beadBand, annotate, detectCandidates } from './detect.ts'

const split = (v) => String(v ?? '').split(/[\/,،]/).map((x) => x.trim()).filter(Boolean)

// ── crew: report halves, recorded quadrants, fallbacks
const sides = sidesFromRows([
  { formKey: 'welding', detail: { stampRoot: '145', stampRootC: '178', stampHot: '152', stampHotC: '161', stampFill: '7 / 8', stampCap: '9' } },
], split)
assert.deepEqual(sides.root, { R: ['145'], C: ['178'] }); assert.deepEqual(sides.fill.R, ['7', '8'])
assert.deepEqual(weldersAt('root', 1, [], sides), { keys: ['145'], source: 'half' })
assert.deepEqual(weldersAt('root', 3, [], sides), { keys: ['178'], source: 'half' })
assert.deepEqual(weldersAt('cap', 4, [], sides), { keys: ['9'], source: 'pass' }) // canal side empty → whole pass
assert.deepEqual(weldersAt('root', null, [], sides).keys, ['145', '178'])
const tie = sidesFromRows([{ formKey: 'tie_in', detail: { wid1: 'A', wid2: 'B', wid3: 'C', wid4: 'D' } }], split)
assert.deepEqual(tie.hot, { R: ['A'], C: ['B'] }); assert.deepEqual(tie.cap, { R: ['C'], C: ['D'] })
const crew = [
  { id: '1', pass: 'root', quadrant: 1, welderKey: 'W1', removed: false }, { id: '2', pass: 'root', quadrant: 2, welderKey: 'W2', removed: false },
  { id: '3', pass: 'root', quadrant: 3, welderKey: 'W3', removed: false }, { id: '4', pass: 'root', quadrant: 4, welderKey: 'W4', removed: false },
  { id: '5', pass: 'hot', quadrant: 0, welderKey: 'H1', removed: false }, { id: '6', pass: 'root', quadrant: 1, welderKey: 'OLD', removed: true },
]
assert.deepEqual(weldersAt('root', 2, crew, sides), { keys: ['W2'], source: 'crew' }) // the recorded crew wins over the report half
assert.deepEqual(weldersAt('hot', 3, crew, sides), { keys: ['H1'], source: 'crew' }) // quadrant 0 = whole pass
assert.equal(crewGrid(crew, sides).root[4].keys[0], 'W4'); assert.equal(crewGrid(crew, sides).fill[1].source, 'half')
assert.ok(!allWelders(crew, emptySides()).includes('OLD'))

// ── health index
const base = { radiographed: true, closed: true, finalStatus: 'accept', repairs: 0, crackEver: false, residual: [], vtRejects: 0, welders: [{ key: 'A', rate: 0.03, qual: 'valid' }], projectRate: 0.05, coating: { failed: false, repairs: 0, holidays: false, adhesionFail: false, applicatorRate: 0.02, projectCoatRate: 0.05, randomPassed: true } }
let h = jointHealth(base)
assert.equal(h.score, 100); assert.equal(h.grade, 'excellent'); assert.equal(h.provisional, false) // first-time pass, good crew, good coating
h = jointHealth({ ...base, repairs: 1 }); assert.equal(h.weld.score, 80); assert.equal(h.score, 86)
h = jointHealth({ ...base, repairs: 2, crackEver: true }); assert.equal(h.weld.score, 55)
h = jointHealth({ ...base, welders: [{ key: 'A', rate: 0.15, qual: 'valid' }] }); assert.equal(h.weld.score, 95) // (0.15 − 0.05) × 50 = 5
h = jointHealth({ ...base, welders: [{ key: 'A', rate: 0.6, qual: 'expired' }] }); assert.equal(h.weld.score, 80) // capped 10 + qual 10
h = jointHealth({ ...base, residual: [{ code: 'IP', lengthMm: 12.5, limitMm: 25 }] }); assert.equal(h.weld.score, 97.5 | 0 ? 98 : 98) // 0.5 × 5 = 2.5 → 97.5 → round 98
h = jointHealth({ ...base, coating: { ...base.coating, failed: true, repairs: 1 } }); assert.equal(h.coating.score, 55); assert.equal(h.score, Math.round(0.7 * 100 + 0.3 * 55))
h = jointHealth({ ...base, coating: null }); assert.equal(h.coating.score, null); assert.equal(h.score, 100); assert.ok(h.notes.some((n) => n.includes('پوشش')))
h = jointHealth({ ...base, closed: true, finalStatus: 'cut_out' }); assert.equal(h.score, 0)
h = jointHealth({ ...base, radiographed: false, closed: false }); assert.equal(h.provisional, true)
assert.ok(jointHealth({ ...base, repairs: 1 }).weld.items.every((i) => i.why.length > 10)) // every deduction explains itself
assert.equal(gradeOf(89), 'good'); assert.equal(gradeOf(59), 'poor')
assert.ok(Math.abs(smoothed(1, 1, 0.05) - (1 + 0.5) / 11) < 1e-12) // one bad weld of one is not 100 %
assert.equal(welderScore({ evaluated: 0, firstOk: 0, cutOuts: 0, severe: 0, projectFpy: 0.9 }), null)
assert.ok(welderScore({ evaluated: 100, firstOk: 98, cutOuts: 0, severe: 1, projectFpy: 0.9 }) >= 97)
assert.ok(welderScore({ evaluated: 2, firstOk: 2, cutOuts: 0, severe: 0, projectFpy: 0.8 }) < 90) // two clean welds do not make a 100

// ── insights
const res = []
for (let i = 0; i < 20; i++) res.push({ key: 'X', at: `2026-01-${String(i + 1).padStart(2, '0')}`, repaired: i >= 14 && i % 2 === 0, weldId: `w${i}` }) // repairs only lately
for (let i = 0; i < 20; i++) res.push({ key: 'Y', at: `2026-01-${String(i + 1).padStart(2, '0')}`, repaired: false, weldId: `y${i}` })
const tr = welderTrends(res, 0.05, (k) => k)
assert.equal(tr.length, 1); assert.equal(tr[0].welder, 'X'); assert.equal(tr[0].tone, 'warn')
const D = (o) => ({ weldId: 'w', code: 'IP', type: 'x', clock: null, pass: 'root', quadrant: null, welders: [], round: 0, verdict: 'repair', removed: false, ...o })
assert.equal(clockHotspot([5, 5.5, 6, 6.2, 7, 1, 6.8].map((c) => D({ clock: c }))).length, 1)
assert.match(clockHotspot([5, 5.5, 6, 6.2, 7, 1, 6.8].map((c) => D({ clock: c })))[0].title, /بالای سر/)
assert.equal(clockHotspot([0, 2, 4, 6, 8, 10].map((c) => D({ clock: c }))).length, 0) // spread evenly → nothing to say
const pat = patternInsights([...Array(7)].map(() => D({})), (c) => c)
assert.ok(pat.some((p) => p.id === 'pass') && pat.some((p) => p.id === 'code'))
// same joint: B shares 4 welds with A on the root; B's quadrant is rejected each time, A's never
const segs = [], defs = []
for (let i = 0; i < 4; i++) { segs.push({ weldId: `j${i}`, welder: 'A', pass: 'root', quadrant: 1 }, { weldId: `j${i}`, welder: 'B', pass: 'root', quadrant: 3 }); defs.push(D({ weldId: `j${i}`, pass: 'root', quadrant: 3 })) }
const sj = sameJoint(segs, defs, (k) => k)
assert.equal(sj.length, 1); assert.equal(sj[0].welder, 'B')
assert.equal(repairHold([{ performedBy: 'R', ok: false }, { performedBy: 'R', ok: false }, { performedBy: 'R', ok: true }], (k) => k).length, 1)

// ── film: 16-bit levels, median, sharpen, metrics
const w16 = { w: 4, h: 1, d: new Uint16Array([1000, 2000, 3000, 4000]), bits: 16 }
assert.deepEqual([...levels(w16, 0, 1).d], [0, 85, 170, 255])
const noisy = { w: 3, h: 3, d: new Uint8Array([10, 10, 10, 10, 255, 10, 10, 10, 10]) }
assert.equal(median3(noisy).d[4], 10) // a hot pixel is removed
assert.equal(sharpen(noisy, 0), noisy)
const flat = { w: 64, h: 64, d: new Uint8Array(64 * 64).fill(128) }
assert.equal(metrics(flat).verdict, 'poor')
const sharp = { w: 64, h: 64, d: new Uint8Array(64 * 64) }; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) sharp.d[y * 64 + x] = (x >> 3) % 2 ? 230 : 20
assert.equal(metrics(sharp).verdict, 'good')
assert.equal(shrink(sharp, 32).g.w, 32)

// ── bead band and annotation: a bright horizontal bead with a dark line on its centreline and a dark dot off-centre
const W = 200, H = 120, g = { w: W, h: H, d: new Uint8Array(W * H) }
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.d[y * W + x] = (y >= 45 && y < 75 ? 190 : 70) + Math.round(rnd() * 5)
for (let x = 40; x < 110; x++) for (let y = 59; y <= 61; y++) g.d[y * W + x] = 110 // root line on the centre
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 150) ** 2 + (y - 50) ** 2 <= 6) g.d[y * W + x] = 100 // pore near the edge
const band = beadBand(g)
assert.equal(band.axis, 'h'); assert.ok(band.from >= 40 && band.from <= 47 && band.to >= 72 && band.to <= 78, JSON.stringify(band))
const ann = annotate(detectCandidates(g, { minArea: 6, axis: band.axis }), band)
const ip = ann.find((a) => a.code === 'IP'); assert.ok(ip, JSON.stringify(ann.map((a) => [a.code, a.x, a.y, a.w, a.h])))
assert.ok(ip.why.includes('مرکز'))
assert.equal(beadBand(flat), null)
console.log('weldqc v2: ok')

// ── TIFF: an uncompressed 16-bit greyscale little-endian file, as film scanners write them
const { decodeTiff, isTiff } = await import('./filmio.ts')
function tiff16(w, h, f, bigEndian = false) {
  const le = !bigEndian, n = 8, entries = 9, ifdSize = 2 + entries * 12 + 4, dataOff = n + ifdSize, buf = new ArrayBuffer(dataOff + w * h * 2), dv = new DataView(buf)
  dv.setUint8(0, le ? 0x49 : 0x4d); dv.setUint8(1, le ? 0x49 : 0x4d); dv.setUint16(2, 42, le); dv.setUint32(4, n, le)
  dv.setUint16(n, entries, le)
  const tags = [[256, 3, w], [257, 3, h], [258, 3, 16], [259, 3, 1], [262, 3, 1], [273, 4, dataOff], [277, 3, 1], [278, 3, h], [279, 4, w * h * 2]]
  tags.forEach(([t, ty, v], i) => { const o = n + 2 + i * 12; dv.setUint16(o, t, le); dv.setUint16(o + 2, ty, le); dv.setUint32(o + 4, 1, le); if (ty === 3) dv.setUint16(o + 8, v, le); else dv.setUint32(o + 8, v, le) })
  dv.setUint32(n + 2 + entries * 12, 0, le)
  for (let i = 0; i < w * h; i++) dv.setUint16(dataOff + i * 2, f(i), le)
  return buf
}
for (const be of [false, true]) {
  const t = await decodeTiff(tiff16(4, 2, (i) => 1000 * (i + 1), be))
  assert.equal(t.bits, 16); assert.equal(t.w, 4); assert.equal(t.h, 2); assert.deepEqual([...t.d], [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])
}
assert.ok(isTiff('F-01582.TIF', '')); assert.ok(isTiff('x', 'image/tiff')); assert.ok(!isTiff('a.png', 'image/png'))
console.log('tiff: ok')
