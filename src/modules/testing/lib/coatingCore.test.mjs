import assert from 'node:assert/strict'
import { holidayKv, MAIN_COATINGS, JOINT_SYSTEMS, jointMinMm, jointChecks, electricalTest } from './coatingCore.ts'
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`)

// Table 1: 3LPE 3 mm → 5 + 15 = 20 kV; 5 mm → capped at 25; FBE 0.4 mm → 2 kV; bitumen 7 mm → 25 (cap)
near(holidayKv(MAIN_COATINGS['3lpe'].holiday, 3), 20); near(holidayKv(MAIN_COATINGS['3lpe'].holiday, 5), 25)
near(holidayKv(MAIN_COATINGS.fbe.holiday, 0.4), 2); near(holidayKv(MAIN_COATINGS.bitumen.holiday, 7), 25)
// Table 4: sleeves 2.9 mm → 19.5 kV; tapes capped at 15; liquid epoxy 6 kV/mm
near(holidayKv(JOINT_SYSTEMS.hss80.holiday, 2.9), 19.5); near(holidayKv(JOINT_SYSTEMS.tape3ply.holiday, 2), 15); near(holidayKv(JOINT_SYSTEMS.epoxy.holiday, 0.5), 3)
// Table 3: liquid systems by service
assert.equal(jointMinMm('epoxy', { odIn: 24 }), 0.5); assert.equal(jointMinMm('epoxy', { odIn: 42 }), 1); assert.equal(jointMinMm('pu', { odIn: 30 }), 1.5); assert.equal(jointMinMm('pu', { odIn: 12 }), 1)

// a heat-shrink sleeve on 42″ that meets everything
const good = { system: 'hss80', odIn: 42, pipeTempC: 25, dewC: 10, rh: 60, delayH: 3, cleanliness: 'Sa2.5', profileUm: 70, saltUg: 1, dust: 2, preheatC: 60, induction: true, overlapMm: 75, thickness: [3.1, 3.0, 2.95], holidayKv: 20, holiday: 'ok', peel: { steel: 5 } }
const g = jointChecks(good)
assert.equal(g.result, 'pass'); near(g.kvReq, 19.75)
// RH 80 % allows only 2 h; a cold pipe close to the dew point fails; a thin sleeve fails; FBE needs Sa3
assert.equal(jointChecks({ ...good, rh: 80 }).result, 'fail')
assert.equal(jointChecks({ ...good, pipeTempC: 12, dewC: 10 }).checks.find((c) => c.k === 'dew').ok, false)
assert.equal(jointChecks({ ...good, thickness: [2.7] }).checks.find((c) => c.k === 'thick').ok, false)
assert.equal(jointChecks({ system: 'fbe', odIn: 42, cleanliness: 'Sa2.5' }).checks.find((c) => c.k === 'clean').ok, false)
assert.equal(jointChecks({ system: 'fbe', odIn: 42, repair: true, cleanliness: 'St3', profileUm: 30 }).checks.find((c) => c.k === 'profile').ok, true)
assert.equal(jointChecks({ system: 'hss80', odIn: 42 }).result, 'pending')

// electrical test: 10 km of 42″ 3LPE, 30 mA → I/S ≈ 0.9 µA/m² (≤ 3)
const e = electricalTest({ coating: '3lpe', pipes: [{ dIn: 42, lengthM: 10000 }], currentA: 0.03, polarH: 72, drainOn: -1.15, drainOff: -1.05, farOff: -0.9, potentials: [{ km: '1', natural: '-0.6', on: '-1.1', off: '-0.95', ac: '0.1' }, { km: '5', natural: '-0.6', on: '-1', off: '-0.88', ac: '' }] })
near(e.areaM2, Math.PI * 42 * 0.0254 * 10000); near(e.isUa, 0.03e6 / e.areaM2); assert.equal(e.result, 'pass')
assert.equal(electricalTest({ coating: '3lpe', pipes: [{ dIn: 42, lengthM: 10000 }], currentA: 0.2 }).checks.find((c) => c.k === 'is').ok, false) // ~6 µA/m²
assert.equal(electricalTest({ coating: 'bitumen', pipes: [{ dIn: 42, lengthM: 10000 }], currentA: 0.2 }).checks.find((c) => c.k === 'is').ok, true) // 40 allowed
assert.equal(electricalTest({ coating: '3lpe', pipes: [], drainOff: -1.15 }).checks.find((c) => c.k === 'drainOff').ok, false)
assert.equal(electricalTest({ coating: '3lpe', pipes: [], potentials: [{ km: '1', natural: '', on: '', off: '-0.8', ac: '' }] }).unprotected.length, 1)
assert.equal(electricalTest({ coating: '3lpe', criterion: 'resistive', pipes: [], potentials: [{ km: '1', natural: '', on: '', off: '-0.8', ac: '' }] }).unprotected.length, 0)
console.log('testing/coating: all assertions passed')
