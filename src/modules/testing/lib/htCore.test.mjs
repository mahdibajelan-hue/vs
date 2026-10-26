import assert from 'node:assert/strict'
import { rangesOfJoints, overlapKm, smysOf, barPerM, hoopMpa, pressureAtPct, sectionize, sectionFigures, profileOf, hasRealProfile, evaluateHold, advanceBlocker, coveredKm, densify } from './htCore.ts'

const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`)
// materials, water head, Barlow
assert.equal(smysOf('API 5L X70'), 483); assert.equal(smysOf('X65 PSL2'), 448); assert.equal(smysOf('API 5L Gr. B'), 241); assert.equal(smysOf('steel'), null)
near(barPerM(1000), 0.0981, 0.0001)
near(hoopMpa(100, 1219.2, 19.1), 319.2, 0.1)
near(pressureAtPct(100, 483, 1219.2, 19.1), 151.33, 0.05)

const x = { odMm: 1219.2, wtMm: 19.1, smysMpa: 483, designPressureBar: 100, testFactor: 1.25, maxHoopPct: 95, maxSectionKm: 20, minSectionKm: 1, density: 1000 }
// Δh_max = (0.95·151.33 − 125) / 0.0981 ≈ 191.2 m
const flat = [{ km: 0, elev: 100 }, { km: 50, elev: 100 }]
let r = sectionize(flat, x)
assert.equal(r.error, null); near(r.maxDeltaH, 191.2, 0.3)
assert.deepEqual(r.sections.map((s) => [s.kmFrom, Math.round(s.kmTo * 10) / 10, s.cut]), [[0, 20, 'length'], [20, 40, 'length'], [40, 50, 'end']])

// a 400 m climb over 10 km is split where the column would exceed the limit, and no section breaks it
const hill = [{ km: 0, elev: 1000 }, { km: 10, elev: 1400 }, { km: 12, elev: 1400 }]
r = sectionize(hill, x)
for (const s of r.sections) { assert.ok(s.elevMax - s.elevMin <= r.maxDeltaH + 1e-6); assert.ok(s.hoopLowPct <= 95 + 1e-6); near(s.pHigh, 125, 1e-9) }
assert.equal(r.sections[0].cut, 'elevation'); near(r.sections[0].kmTo, 4.7, 0.11)
assert.equal(r.sections.at(-1).kmTo, 12)
// sections tile the line without gaps
for (let i = 1; i < r.sections.length; i++) assert.equal(r.sections[i].kmFrom, r.sections[i - 1].kmTo)

// a valve inside the section pulls the forced cut back to it
r = sectionize(flat, x, [17.5])
assert.equal(r.sections[0].kmTo, 17.5); assert.equal(r.sections[0].cut, 'preferred')

// section figures: test head at the lower end, its pressure includes the column above it, volume of the bore
const f = sectionFigures(densify(hill), 0, 4, x)
assert.equal(f.headKm, 0); near(f.pHead, 125 + 0.0981 * 160, 0.1); near(f.volumeM3, Math.PI / 4 * (1.181) ** 2 * 4000, 1)

// impossible: the test pressure alone is beyond the stress limit
assert.match(sectionize(flat, { ...x, designPressureBar: 130 }).error, /بیشتر است/)

// profile from coordinates: km from the start, only points with an elevation; a flat (clamped) line is no profile
const pr = profileOf([{ lon: 50, lat: 30, elevation: 10 }, { lon: 50.01, lat: 30, elevation: 20 }, { lon: 50.02, lat: 30, elevation: null }], 100)
assert.equal(pr.length, 2); near(pr[1].km, 100.963, 0.002)
assert.equal(hasRealProfile([{ km: 0, elev: 0 }, { km: 1, elev: 0 }]), false); assert.equal(hasRealProfile(pr), true)

// hold evaluation and the gates of strength / leak
const rd = (h, p, phase = 'strength') => ({ at: new Date(Date.UTC(2026, 0, 1, h)).toISOString(), phase, pressureBar: p, tempC: 15 })
const cfg = { strengthHoldH: 4, leakHoldH: 24, allowedDropBar: 0.5, minStrengthBar: 125 }
assert.match(advanceBlocker('strength', [rd(0, 130), rd(2, 130)], cfg), /۴|4 ساعت/)
assert.equal(advanceBlocker('strength', [rd(0, 130), rd(4, 129.8)], cfg), null)
assert.match(advanceBlocker('strength', [rd(0, 130), rd(4, 128)], cfg), /افت فشار/)
assert.match(advanceBlocker('strength', [rd(0, 124), rd(4, 124)], cfg), /زیر حداقل/)
assert.equal(evaluateHold([rd(0, 110, 'leak'), rd(24, 109.9, 'leak')], 'leak', 24, 0.5).ok, true)
assert.equal(advanceBlocker('filling', [], cfg), null)

// coating coverage merges overlaps
near(coveredKm([[0, 5], [4, 8], [10, 12], [11.5, 11.8]]), 10, 1e-9)
// joints → km ranges (with a route start), and how much of a section they cover
const rg = rangesOfJoints([1, 2, 3, 10], 12, 100)
assert.equal(rg.length, 2); near(rg[0][0], 100, 1e-9); near(rg[0][1], 100.036, 1e-9); near(rg[1][0], 100.108, 1e-9)
near(overlapKm(100.02, 100.2, rg), 0.016 + 0.012, 1e-9)
console.log('testing/htCore: all assertions passed')
