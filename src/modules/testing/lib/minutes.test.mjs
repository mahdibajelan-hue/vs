import assert from 'node:assert/strict'
import { computeForm, PERMIT_ITEMS } from './minutes.ts'
import { DEFAULT_IGS, mixFigures, sectionPressures } from './igs.ts'

const mix = mixFigures(42, [{ wtIn: 0.688, lengthM: 9634.09 }, { wtIn: 0.812, lengthM: 71.85 }, { wtIn: 0.938, lengthM: 279.13 }])
const pr = sectionPressures(42, 65000, 0.688, { low: 10.37, high: 44.31, start: 16.45, end: 21.48, head: 21.48 })
const R = (h, psi, phase, o = {}) => ({ id: h, targetId: 's', phase, at: new Date(Date.UTC(2026, 0, 1, h)).toISOString(), pressureBar: psi / 14.5038, tempC: 20, note: '', by: '', location: 'head', km: null, elev: null, volumeM3: null, ...o })
const ctx = (readings = []) => ({ igs: DEFAULT_IGS, mix, pr, odIn: 42, readings })

assert.equal(computeForm('permit', {}, ctx()).result, 'pending')
assert.equal(computeForm('permit', Object.fromEntries(PERMIT_ITEMS.map((_, i) => [`c${i}`, true])), ctx()).result, 'pass')
assert.equal(computeForm('gauge', { condition: 'ok' }, ctx()).result, 'pass')
assert.equal(computeForm('gauge', { condition: 'damaged' }, ctx()).result, 'fail')
// air: entering the theoretical volume by hand (the contractor's sheet) gives the sheet's own ratio
const air = computeForm('air', { dpPsi: 390, dvActual: 20.28, dvTheorManual: 20.258 }, ctx())
assert.equal(air.result, 'pass'); assert.ok(air.rows.some(([k, v]) => k.startsWith('نسبت') && v.startsWith('۱٫۰۰۱')))
assert.equal(computeForm('air', { dpPsi: 390, dvActual: 30, dvTheorManual: 20.258 }, ctx()).result, 'fail')
// strength: 4 h at the head pressure, sound → pass; 2 h → pending
const st = [R(0, 2327, 'strength'), R(2, 2327, 'strength'), R(4, 2326.8, 'strength')]
assert.equal(computeForm('strength', { noRupture: 'yes' }, ctx(st)).result, 'pass')
assert.equal(computeForm('strength', { noRupture: 'yes' }, ctx(st.slice(0, 2))).result, 'pending')
assert.equal(computeForm('strength', { noRupture: 'no' }, ctx(st)).result, 'fail')
// leak: the sheet's figures with a 3-day stabilization and 24 h of leak readings
const stab = [R(0, 2031, 'stabilization'), R(24, 2031, 'stabilization'), R(48, 2031, 'stabilization'), R(72, 2031, 'stabilization')]
const lk = [R(72, 2031.2, 'leak', { tempC: 23.91 }), R(96, 2032.9, 'leak', { tempC: 23.894 })]
assert.equal(computeForm('leak', {}, ctx([...stab, ...lk])).result, 'pass')
assert.equal(computeForm('leak', { p1: 2031.2, p2: 2028, t1: 23.9, t2: 23.9 }, ctx([...stab, ...lk])).result, 'fail')
assert.equal(computeForm('leak', {}, ctx(lk)).result, 'pending') // no stabilization period yet
// drying
assert.equal(computeForm('drying', { waterAhead: 'no', dust: 'no', dewC: -5, ambientC: 18 }, ctx()).result, 'pass')
assert.equal(computeForm('drying', { waterAhead: 'yes', dust: 'no' }, ctx()).result, 'fail')
console.log('testing/minutes: all assertions passed')
