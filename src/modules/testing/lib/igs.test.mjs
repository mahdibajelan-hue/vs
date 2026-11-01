import assert from 'node:assert/strict'
import { DEFAULT_IGS, mixFigures, sectionPressures, psiAtPct, airTest, leakTest, waterBeta, pvOffset, smysPsiOf, holdFigures } from './igs.ts'
const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`)

// the project's calculation sheet: 42″ X65, section 1, walls 0.688 / 0.812 / 0.938″
assert.equal(smysPsiOf('API 5L X65'), 65000)
const mix = mixFigures(42, [{ wtIn: 0.688, lengthM: 9634.09 }, { wtIn: 0.812, lengthM: 71.85 }, { wtIn: 0.938, lengthM: 279.13 }])
near(mix.lengthM, 9985.07, 0.01)
near(mix.parts[0].volumeM3, 8056.258, 0.01); near(mix.parts[1].volumeM3, 59.351, 0.01); near(mix.parts[2].volumeM3, 227.705, 0.01)
near(mix.volumeM3, 8343.314, 0.02)
assert.equal(mix.thinIn, 0.688); assert.equal(mix.thickIn, 0.938)
near(mix.gaugePlateMm, 968.19, 0.02) // «قطر: 968/19 میلیمتر»
assert.ok(mix.tEqIn > 0.688 && mix.tEqIn < 0.7)

const sp = sectionPressures(42, 65000, 0.688, { low: 10.37, high: 44.31, start: 16.45, end: 21.48, head: 21.48 })
near(sp.pTop, 2342.476, 0.001); near(sp.pMin, 2023.048, 0.001)
near(sp.allowedDh, 224.950, 0.001)
near(sp.strength.high, 2294.281, 0.001); near(sp.strength.start, 2333.843, 0.001); near(sp.strength.end, 2326.700, 0.001); near(sp.strength.head, 2326.700, 0.001)
near(sp.leak.low, 2023.048, 0.001); near(sp.leak.high, 1974.853, 0.001); near(sp.leak.start, 2014.414, 0.001); near(sp.leak.end, 2007.271, 0.001)
assert.equal(sp.dhOk, true)

// the procedure of the 36″ project: thinnest 0.406″ → 1612.72 / 1392.80 psi, Δh 154.83 m (with 1.4204 psi/m)
near(psiAtPct(110, 65000, 36, 0.406), 1612.72, 0.01); near(psiAtPct(95, 65000, 36, 0.406), 1392.80, 0.01)
near((psiAtPct(110, 65000, 36, 0.406) - psiAtPct(95, 65000, 36, 0.406)) / 1.4204, 154.83, 0.02)
near(psiAtPct(80, 65000, 36, 0.406), 1172.88, 0.01) // leak minimum
near(mixFigures(36, [{ wtIn: 0.406, lengthM: 100 }, { wtIn: 0.625, lengthM: 100 }]).gaugePlateMm, 838.51, 0.02)

// air test: the accepted ratio and the limit
const a = airTest({ volumeM3: 8343.3, dpPsi: 390, dvActualM3: 20.28, odIn: 42, tIn: 0.69 })
assert.ok(a.theorM3 > 10 && a.theorM3 < 25, `theor ${a.theorM3}`)
assert.equal(airTest({ volumeM3: 1000, dpPsi: 100, dvActualM3: null, odIn: 42, tIn: 0.7 }).pass, null)
const th = airTest({ volumeM3: 1000, dpPsi: 100, dvActualM3: 0, odIn: 42, tIn: 0.7 }).theorM3
assert.equal(airTest({ volumeM3: 1000, dpPsi: 100, dvActualM3: th * 1.09, odIn: 42, tIn: 0.7 }).pass, true)
assert.equal(airTest({ volumeM3: 1000, dpPsi: 100, dvActualM3: th * 1.2, odIn: 42, tIn: 0.7 }).pass, false)

// leak test: water expansion ~2.1e-4 at 20 °C; the sheet's example (P1 2031.2, P2 2032.9, ΔT −0.016) is accepted
near(waterBeta(20), 2.07e-4, 0.1e-4)
const lk = leakTest({ p1: 2031.2, p2: 2032.9, t1: 23.91, t2: 23.894, odIn: 42, tIn: 0.69 })
near(lk.actualLossPsi, -1.7, 1e-9); assert.ok(lk.theorLossPsi > 0); assert.equal(lk.pass, true)
// an unexplained 2 psi loss at a steady temperature fails, so does a loss above 1.5 psi even when cooling explains it
assert.equal(leakTest({ p1: 2000, p2: 1998, t1: 20, t2: 20, odIn: 42, tIn: 0.69 }).pass, false)
const cool = leakTest({ p1: 2000, p2: 1998, t1: 20, t2: 19, odIn: 42, tIn: 0.69 })
assert.equal(cool.cond1, true); assert.equal(cool.cond2, false); assert.equal(cool.pass, false)
// pipe of 30″ or less: only the temperature condition
assert.equal(leakTest({ p1: 2000, p2: 1998, t1: 20, t2: 19, odIn: 24, tIn: 0.5 }).cond2, null)

// P–V: a straight line passes, a yielding tail fails
const lin = Array.from({ length: 10 }, (_, i) => ({ p: 200 * i, v: 0.01 * i }))
assert.equal(pvOffset(lin, 1000).pass, true)
const bent = lin.map((x, i) => (i >= 8 ? { ...x, v: x.v + 3 } : x))
const pb = pvOffset(bent, 1000); assert.equal(pb.pass, false); near(pb.maxOffsetPct, 0.3, 0.001)

// holds
const h = holdFigures([{ at: '2026-01-01T00:00:00Z', psi: 10, tempC: null }, { at: '2026-01-01T04:30:00Z', psi: 9, tempC: null }])
near(h.hours, 4.5); assert.equal(h.minPsi, 9)
assert.equal(DEFAULT_IGS.strengthPct, 110)
console.log('testing/igs: all assertions passed')
