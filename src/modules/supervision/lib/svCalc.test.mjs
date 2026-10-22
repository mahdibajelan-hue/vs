import assert from 'node:assert/strict'
import * as c from './svCalc.ts'

const S = c.DEFAULT_SETTINGS
// 30 synthetic ISO days (2026-01-01 … 2026-01-30)
const days = Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
const person = (o = {}) => ({ id: 'p1', projectId: 'mp', fullName: 'الف', side: 'supervision', roleTitle: '', nationalId: '', mobile: '', cardNo: '', overtimeCap: null, mealBreakfast: true, mealLunch: true, mealDinner: false, shiftStart: null, shiftEnd: null, startDate: null, endDate: null, active: true, note: '', ...o })
const att = (day, status, o = {}) => ({ personId: 'p1', day, status, ...c.dayDefaults(person(), status, S), source: 'manual', note: '', ...o })

// ── times
assert.equal(c.toMinutes('07:30'), 450)
assert.equal(c.toMinutes('7:05:00'), 425)
assert.equal(c.toMinutes(''), null)
assert.equal(c.hoursBetween('07:00', '17:30'), 10.5)
assert.equal(c.hoursBetween('20:00', '06:00'), 10, 'night shift wraps past midnight')
assert.deepEqual(c.splitHours(10.5, 8), { hours: 10.5, overtime: 2.5 })
assert.deepEqual(c.splitHours(6, 8), { hours: 6, overtime: 0 })

// ── defaults: no shift = the 8-hour duty day; a night shift 19:00–07:00 = 8 h + 4 h overtime
assert.deepEqual(c.dayDefaults(person(), 'present', S), { checkIn: null, checkOut: null, hours: 8, overtime: 0, breakfast: true, lunch: true, dinner: true })
assert.deepEqual(c.dayDefaults(person({ shiftStart: '19:00', shiftEnd: '07:00' }), 'present', S), { checkIn: '19:00', checkOut: '07:00', hours: 12, overtime: 4, breakfast: true, lunch: true, dinner: true })
assert.equal(c.dayDefaults(person(), 'mission', S).lunch, false)
assert.equal(c.dayDefaults(person(), 'rest', S).hours, 0)
assert.equal(c.dayDefaults(person(), 'sick', S).hours, 0)
assert.deepEqual(c.dayHours('07:00', '17:00', S), { hours: 10, overtime: 2 })
assert.deepEqual(c.dayHours(null, null, S), { hours: 8, overtime: 0 })

// ── a full month: 21 present + 1 mission + 7 rest + 1 absent, overtime 3h on 20 days
const rows = days.map((d, i) => i < 21 ? att(d, 'present', { overtime: 3, hours: 11 }) : i === 21 ? att(d, 'mission') : i < 29 ? att(d, 'rest') : att(d, 'absent'))
const m = c.personMonth(person(), rows, days, S, days[29])
assert.equal(m.required, 23)
assert.equal(m.worked, 22)
assert.equal(m.shortfall, 1)
assert.equal(m.rest, 7)
assert.equal(m.restAllowed, 7)
assert.equal(m.restOver, 0)
assert.equal(m.absent, 1)
assert.equal(m.overtime, 63)
assert.equal(m.overtimeCap, 80)
assert.equal(m.overtimeLeft, 17)
assert.equal(m.belowFloor, false)
assert.equal(m.hours, 21 * 11 + 8)
assert.equal(m.breakfast, 21)
assert.equal(m.lunch, 21)
assert.equal(m.dinner, 21, 'a present day is all three meals')
assert.equal(m.unmarked, 0)

// personal ceiling of 60h: 3h over
const m60 = c.personMonth(person({ overtimeCap: 60 }), rows, days, S, days[29])
assert.equal(m60.overtimeLeft, 0)
assert.equal(m60.overtimeOver, 3)

// medical leave is excused: 20 present + 3 sick + 7 rest → no shortfall; meals only on the 20 present days
const sickRows = days.map((d, i) => att(d, i < 20 ? 'present' : i < 23 ? 'sick' : 'rest'))
const ms = c.personMonth(person(), sickRows, days, S, days[29])
assert.deepEqual([ms.worked, ms.sick, ms.shortfall, ms.breakfast, ms.dinner], [20, 3, 0, 20, 20])

// ── running month: only days up to the 10th are expected; nothing recorded yet
const early = c.personMonth(person(), [], days, S, days[9])
assert.equal(early.unmarked, 10)
assert.equal(early.belowFloor, true)

// ── joined on the 16th: 15 days on the project → 12 duty days (23 × 15 / 30 = 11.5 → 12)
const late = c.personMonth(person({ startDate: days[15] }), rows, days, S, days[29])
assert.equal(late.onProject, 15)
assert.equal(late.required, 12)
assert.equal(late.restAllowed, 3)

// ── vehicles
const veh = { id: 'v1', projectId: 'mp', title: 'پژو', plate: '', kind: 'sedan', lessor: '', driver: '', personId: null, cardNo: '', startDate: null, endDate: null, active: true, note: '' }
const vrows = days.slice(0, 26).map((d, i) => ({ vehicleId: 'v1', day: d, status: i < 24 ? 'present' : 'repair', hours: 9, km: 120, source: 'manual', note: '' }))
const vm = c.vehicleMonth(veh, vrows, days, days[29])
assert.deepEqual([vm.present, vm.repair, vm.hours, vm.km, vm.unmarked], [24, 2, 216, 2880, 4])

// ── totals and cycling
const t = c.monthTotals([m, m60], [vm])
assert.equal(t.people, 2)
assert.equal(t.vehicleDays, 24)
assert.equal(c.nextStatus(null), 'present')
assert.equal(c.nextStatus('absent'), null)
assert.equal(c.nextVehicleStatus('repair'), 'absent')

// ── guests
const g = c.guestTotals([{ id: '1', day: days[0], guestName: 'بازدید کارفرما', organization: '', host: '', breakfast: 0, lunch: 4, dinner: 4, note: '' }, { id: '2', day: days[1], guestName: 'بازدید کارفرما ', organization: '', host: '', breakfast: 4, lunch: 4, dinner: 0, note: '' }])
assert.deepEqual(g, { entries: 2, guests: 1, breakfast: 4, lunch: 8, dinner: 4 })

console.log('supervision/svCalc: all assertions passed')
