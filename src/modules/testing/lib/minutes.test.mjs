import assert from 'node:assert/strict'
import { computeForm, PERMIT_ITEMS } from './minutes.ts'
import { DEFAULT_IGS, mixFigures, sectionPressures, bulkModulusBar } from './igs.ts'

const mix = mixFigures(42, [{ wtIn: 0.688, lengthM: 9634.09 }, { wtIn: 0.812, lengthM: 71.85 }, { wtIn: 0.938, lengthM: 279.13 }])
const pr = sectionPressures(42, 65000, 0.688, { low: 10.37, high: 44.31, start: 16.45, end: 21.48, head: 21.48 })
const R = (h, psi, phase, o = {}) => ({ id: h, targetId: 's', phase, at: new Date(Date.UTC(2026, 0, 1, h)).toISOString(), pressureBar: psi / 14.5038, tempC: 20, note: '', by: '', location: 'head', km: null, elev: null, volumeM3: null, ...o })
const ctx = (readings = []) => ({ igs: DEFAULT_IGS, mix, pr, odIn: 42, readings })

assert.equal(computeForm('permit', {}, ctx()).result, 'pending')
const all = Object.fromEntries(PERMIT_ITEMS.map((_, i) => [`c${i}`, true]))
assert.equal(computeForm('permit', all, ctx()).result, 'pending') // the water analysis is missing
const water = { w_ph: 7.6, w_tds: 800, w_cl: 120, w_so4: 90, w_th: 260, w_ph2: 180 }
assert.equal(computeForm('permit', { ...all, ...water }, ctx()).result, 'pass')
assert.equal(computeForm('permit', { ...all, ...water, w_cl: 700 }, ctx()).result, 'fail')
assert.equal(computeForm('permit', { ...all, ...water, fillTempC: 1 }, ctx()).result, 'fail')
assert.equal(computeForm('permit', { ...all, ...water, fillTempC: 1, antifreeze: true }, ctx()).result, 'pass')
assert.ok(computeForm('gauge', { condition: 'ok' }, ctx()).rows.some(([, v]) => v.includes('۸') && v.includes('فولاد')))
assert.equal(computeForm('gauge', { condition: 'ok' }, ctx()).result, 'pass')
assert.equal(computeForm('gauge', { condition: 'damaged' }, ctx()).result, 'fail')
// air (DSAW): the P–V table every bar
const th = mix.volumeM3 * ((42 * 0.91) / (2.07e6 * mix.tEqIn) + 1 / bulkModulusBar(15, 35))
const pv = Array.from({ length: 8 }, (_, i) => ({ p: String(2 + i), v: String(i * th * 1.05) }))
assert.equal(computeForm('air', { pv, waterC: 15 }, ctx()).result, 'pass')
assert.equal(computeForm('air', { pv: pv.map((r) => ({ ...r, v: String(Number(r.v) * 1.3) })), waterC: 15 }, ctx()).result, 'fail')
assert.equal(computeForm('air', {}, ctx()).result, 'pending')
// air (HFW)
const hfw = { ...ctx(), igs: { ...DEFAULT_IGS, seam: 'HFW' } }
assert.equal(computeForm('air', { p1: 2000, p2: 1999.9, m: 1 }, hfw).result, 'fail')
// strength: 4 h at the head pressure, sound → pass; 2 h → pending
const st = [R(0, 2327, 'strength'), R(2, 2327, 'strength'), R(4, 2326.8, 'strength')]
assert.equal(computeForm('strength', { noRupture: 'yes' }, ctx(st)).result, 'pass')
assert.equal(computeForm('strength', { noRupture: 'yes' }, ctx(st.slice(0, 2))).result, 'pending')
assert.equal(computeForm('strength', { noRupture: 'no' }, ctx(st)).result, 'fail')
// the 4-hour table: a 1-bar drift left uncorrected holds the verdict back
const hold = [{ at: '2026-01-01T00:00:00Z', psi: '2327' }, { at: '2026-01-01T02:00:00Z', psi: '2310' }, { at: '2026-01-01T04:00:00Z', psi: '2327', vol: '' }]
assert.equal(computeForm('strength', { noRupture: 'yes', hold }, ctx()).result, 'pending')
assert.equal(computeForm('strength', { noRupture: 'yes', hold: hold.map((r, i) => (i === 2 ? { ...r, vol: '0.6' } : r)) }, ctx()).result, 'pass')
// cyclic: three cycles
assert.equal(computeForm('strength', { noRupture: 'yes', cycles: 2, cycleHoldOk: true }, { ...hfw, readings: st }).result, 'pending')
assert.equal(computeForm('strength', { noRupture: 'yes', cycles: 3, cycleHoldOk: true }, { ...hfw, readings: st }).result, 'pass')
// leak: the sheet's figures with a 3-day stabilization and 24 h of leak readings
const stab = [R(0, 2031, 'stabilization'), R(24, 2031, 'stabilization'), R(48, 2031, 'stabilization'), R(72, 2031, 'stabilization')]
const lk = [R(72, 2031.2, 'leak', { tempC: 23.91 }), R(96, 2032.9, 'leak', { tempC: 23.894 })]
assert.equal(computeForm('leak', {}, ctx([...stab, ...lk])).result, 'pass')
const bad = computeForm('leak', { p1: 2031.2, p2: 2028, t1: 23.9, t2: 23.9 }, ctx([...stab, ...lk]))
assert.equal(bad.result, 'pending'); assert.equal(bad.extend, true) // extended 24 h first
assert.equal(computeForm('leak', { p1: 2031.2, p2: 2028, t1: 23.9, t2: 23.9, ext: 1 }, ctx([...stab, ...lk])).result, 'fail')
// the leak log (form 5-3): Tm is the mean of the ground temperatures
const log = [{ at: '2026-01-04T00:00:00Z', psi: '2031.2', amb: '10', t1: '23.9', t2: '23.92' }, { at: '2026-01-05T00:00:00Z', psi: '2032.9', amb: '12', t1: '23.89', t2: '23.898' }]
assert.equal(computeForm('leak', { log }, ctx(stab)).result, 'pass')
// ≤ 30″: F and ΔF/F are read from the procedure's curve
const c12 = { igs: DEFAULT_IGS, mix: mixFigures(12, [{ wtIn: 0.25, lengthM: 10000 }]), pr, odIn: 12, readings: [R(0, 1, 'stabilization'), R(24, 1, 'stabilization')] }
const l12 = [{ at: '2026-01-02T00:00:00Z', psi: '1500', amb: '', t1: '15' }, { at: '2026-01-03T00:00:00Z', psi: '1499', amb: '', t1: '14.8' }]
assert.equal(computeForm('leak', { log: l12 }, c12).result, 'pending')
assert.equal(computeForm('leak', { log: l12, F: 1, dFF: 0.1 }, c12).result, 'pass')
assert.equal(computeForm('leak', {}, ctx(lk)).result, 'pending') // no stabilization period yet
// drying
assert.equal(computeForm('drying', { waterAhead: 'no', dust: 'no', dewC: 4, ambDewC: 2 }, ctx()).result, 'pass')
assert.equal(computeForm('drying', { waterAhead: 'no', dust: 'no', dewC: 8, ambDewC: 2 }, ctx()).result, 'fail')
assert.equal(computeForm('drying', { waterAhead: 'no', dust: 'no' }, ctx()).result, 'pending')
assert.equal(computeForm('drying', { waterAhead: 'yes', dust: 'no' }, ctx()).result, 'fail')
console.log('testing/minutes: all assertions passed')
