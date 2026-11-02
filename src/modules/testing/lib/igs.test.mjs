import assert from 'node:assert/strict'
import { DEFAULT_IGS, mixFigures, sectionPressures, psiAtPct, airTest, leakTest, waterBeta, pvOffset, smysPsiOf, holdFigures, testLimits, gaugePlateOf, stabilizationDaysOf, bulkModulusBar, waterDelta, waterX, airTestHfw, airTestSaw, leakTestSmall, holdDrift, waterCheck, igsOf, airHfwMinOf, pumpRateOf } from './igs.ts'
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

// ── IGS-C-PL-100(3) ch. 12 ──
const HFW = { ...DEFAULT_IGS, seam: 'HFW' }
// cyclic: TP = min(95 % SMYS, 1.5 DP), high ≥ 1.1 DP; the DP governs a thick pipe, the SMYS a thin one
const l1 = testLimits(12, 52000, 0.25, 1015, HFW)
near(l1.lowPsi, 1522.5, 1e-6); near(l1.highMinPsi, 1116.5, 1e-6); assert.equal(l1.governs, 'dp'); near(l1.leakLowPsi, l1.lowPsi, 1e-9)
const l2 = testLimits(12, 52000, 0.156, 1015, HFW)
near(l2.lowPsi, psiAtPct(95, 52000, 12, 0.156), 1e-6); assert.equal(l2.governs, 'smys')
// the yield method is unchanged by a design pressure
near(testLimits(42, 65000, 0.688, 1000).lowPsi, 2342.476, 0.001)
const spH = sectionPressures(12, 52000, 0.25, { low: 0, high: 100, start: 0, end: 50, head: 50 }, HFW, 1015)
near(spH.allowedDh, (1522.5 - 1116.5) / 1.42, 1e-6); assert.equal(spH.dhOk, true)
// by diameter: plate, stabilization, pump, air limit
assert.deepEqual(gaugePlateOf(10), { mm: 4, material: 'آلومینیوم' }); assert.deepEqual(gaugePlateOf(16), { mm: 6, material: 'آلومینیوم' })
assert.deepEqual(gaugePlateOf(24), { mm: 6, material: 'فولاد' }); assert.deepEqual(gaugePlateOf(42), { mm: 8, material: 'فولاد' })
assert.equal(stabilizationDaysOf(12), 1); assert.equal(stabilizationDaysOf(24), 2); assert.equal(stabilizationDaysOf(30), 3); assert.equal(stabilizationDaysOf(42, { ...DEFAULT_IGS, stabilizationDays: 2 }), 2)
assert.equal(pumpRateOf(24), 120); assert.equal(pumpRateOf(36), 160); assert.equal(pumpRateOf(56), 200)
assert.equal(airHfwMinOf(14), 90); assert.equal(airHfwMinOf(16), 95)
// water: Figure 2 at its own points and between, Figure 3, X = 1/B per kg/cm²
assert.equal(bulkModulusBar(10, 1), 21000); assert.equal(bulkModulusBar(40, 100), 23200); near(bulkModulusBar(17.5, 1), 21550, 1e-6)
near(waterDelta(25), 258e-6, 2e-6); near(waterDelta(45), 421.5e-6, 1e-9); near(waterX(25, 1) * 1e6, 44.37, 0.01)
// HFW air test: ΔPth = M·14.22 / (V·(X + D/(E·te)))
const V12 = mixFigures(12, [{ wtIn: 0.25, lengthM: 10000 }]).volumeM3
const ah = airTestHfw({ p1: 1500, p2: 1471, mM3: 0.1, volumeM3: V12, odIn: 12, teIn: 0.25, tC: 15 }, HFW)
near(ah.dpthPsi, (0.1 * 14.22) / (V12 * (waterX(15, 1500 / 14.5038) + 12 / (2.11e6 * 0.25))), 1e-9)
assert.equal(ah.minPct, 90); assert.equal(ah.pass, ah.ratioPct >= 90)
assert.equal(airTestHfw({ p1: 1500, p2: 1490, mM3: 0.1, volumeM3: V12, odIn: 12, teIn: 0.25, tC: 15 }, HFW).pass, false) // too little drop: air
// DSAW air test: tangent of the straight part back to the static head, slope against the theory
const V42 = mixFigures(42, [{ wtIn: 0.688, lengthM: 10000 }]).volumeM3
const th42 = V42 * ((42 * 0.91) / (2.07e6 * 0.688) + 1 / bulkModulusBar(15, 35))
const straight = Array.from({ length: 10 }, (_, i) => ({ p: 2 + i, v: i * th42 * 1.02 + (i ? 0.5 : 0) }))
const as = airTestSaw(straight, { volumeM3: V42, odIn: 42, teIn: 0.688, tC: 15 })
near(as.slopeRatio, 1.02, 1e-6); near(as.airM3, 0.5, 1e-6); assert.equal(as.pass, true)
const airy = airTestSaw(straight.map((x, i) => ({ ...x, v: x.v + (i ? 0.004 * V42 : 0) })), { volumeM3: V42, odIn: 42, teIn: 0.688, tC: 15 })
assert.equal(airy.okAir, false); assert.equal(airy.okSlope, true)
assert.equal(airTestSaw(straight.map((x) => ({ ...x, v: x.v * 1.2 })), { volumeM3: V42, odIn: 42, teIn: 0.688, tC: 15 }).okSlope, false)
// leak ≤ 30″: K·F·(T₁ − T₂), H, three verdicts
const ls = leakTestSmall({ p1: 1500, p2: 1499, t1: 15, t2: 14.8, odIn: 12, teIn: 0.25, F: 1, dFF: 0.1 }, HFW)
near(ls.dpthPsi, ls.K * 0.2, 1e-9); near(ls.H, 0.1 * Math.abs(ls.dpthPsi) + 0.2 * ls.K, 1e-9); near(ls.dpPsi, 1 - ls.dpthPsi, 1e-9); assert.equal(ls.verdict, 'pass')
const K = ls.K
assert.equal(leakTestSmall({ p1: 1500, p2: 1500 - (0.2 * K + 0.25 * K), t1: 15, t2: 14.8, odIn: 12, teIn: 0.25, F: 1, dFF: 0.1 }, HFW).verdict, 'extend')
assert.equal(leakTestSmall({ p1: 1500, p2: 1500 - 3 * K, t1: 15, t2: 14.8, odIn: 12, teIn: 0.25, F: 1, dFF: 0.1 }, HFW).verdict, 'fail')
// leak > 30″: δ − 2(1+ν)α, ΔT = T₁ − T₂
const lb = leakTest({ p1: 2000, p2: 1999, t1: 20, t2: 19.9, odIn: 42, tIn: 0.688 })
near(lb.ratePsiPerC, ((waterDelta(19.95) - 2.6 * 1.17e-5) / ((42 * 0.91) / (2.07e6 * 0.688) + 1 / bulkModulusBar(19.95, 2000 / 14.5038))) * 14.5038, 1e-9)
assert.equal(lb.pass, true)
// yield hold: a drift over 1 bar must be corrected and its water recorded
const hd = holdDrift([{ at: '2026-01-01T00:00:00Z', psi: 2300, adjustM3: null }, { at: '2026-01-01T02:00:00Z', psi: 2284, adjustM3: null }, { at: '2026-01-01T04:00:00Z', psi: 2300, adjustM3: 0.8 }])
assert.equal(hd.unadjusted, 0); near(hd.injectedM3, 0.8); near(hd.hours, 4)
assert.equal(holdDrift([{ at: '2026-01-01T00:00:00Z', psi: 2300, adjustM3: null }, { at: '2026-01-01T02:00:00Z', psi: 2284, adjustM3: null }, { at: '2026-01-01T04:00:00Z', psi: 2284, adjustM3: null }]).unadjusted, 2)
// P–V: the step slope doubling stops the test even below the offset line
const kink = Array.from({ length: 10 }, (_, i) => ({ p: 100 * i, v: i < 8 ? i : 7 + (i - 7) * 2.5 }))
const pk = pvOffset(kink, 1e6); assert.equal(pk.crossed, false); assert.equal(pk.slopeOk, false); assert.equal(pk.pass, false)
// water analysis and the stored-parameter migration
assert.equal(waterCheck({ ph: 7.5, tds: 900, cl: 200, so4: 100, th: 300, ph2: 200 }).ok, true)
assert.equal(waterCheck({ ph: 9.5 }).ok, false); assert.equal(waterCheck({ ph: 8 }).ok, null)
assert.equal(igsOf({ eGpa: 207 }).eBar, 2.07e6); assert.equal(igsOf(null).seam, 'SAW')
console.log('testing/igs: all assertions passed')
