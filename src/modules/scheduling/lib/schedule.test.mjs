import assert from 'node:assert/strict'
import { computeSchedule } from './schedule.ts'
import { WorkCalendar } from './calendar.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: dur === 0 ? 'milestone' : 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
const rel = (p, s, type = 'FS', lag = 0) => ({ id: `${p}${s}${type}`, versionId: 'v', predId: p, succId: s, type, lag })

// work calendar: Saturday..Wednesday (0..4); Thursday/Friday are off
const cal = new WorkCalendar({ workDays: [0, 1, 2, 3, 4], holidays: ['2026-01-11'], hoursPerDay: 8 }, '2026-01-03')
assert.equal(cal.dateOf(0), '2026-01-03'); assert.equal(cal.dateOf(4), '2026-01-07')          // Sat..Wed
assert.equal(cal.dateOf(5), '2026-01-10')                                                   // Thu, Fri skipped
assert.equal(cal.dateOf(6), '2026-01-12')                                                   // Sun 11th is a holiday
assert.equal(cal.idxOnOrAfter('2026-01-08'), 5)                                             // Thursday → next working day

// A(5) → B(3), C(2) → D(1)
const acts = [act('A', 5), act('B', 3), act('C', 2), act('D', 1)]
const rels = [rel('A', 'B'), rel('A', 'C'), rel('B', 'D'), rel('C', 'D')]
const r = computeSchedule({ activities: acts, relations: rels, calendar: { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }, mode: 'plan' })
assert.ok(r.ok); assert.equal(r.cycle, null)
assert.equal(r.byId.get('A').start, '2026-01-03'); assert.equal(r.byId.get('A').finish, '2026-01-07')
assert.equal(r.byId.get('B').start, '2026-01-10'); assert.equal(r.byId.get('B').finish, '2026-01-12')
assert.equal(r.byId.get('D').start, '2026-01-13'); assert.equal(r.projectFinish, '2026-01-13')
assert.deepEqual(r.criticalPath.sort(), ['A', 'B', 'D'])
assert.equal(r.byId.get('C').totalFloat, 1); assert.equal(r.byId.get('C').critical, false); assert.equal(r.byId.get('C').nearCritical, true)
assert.equal(r.byId.get('C').freeFloat, 1)
assert.equal(r.duration, 9)   // 03 Jan .. 13 Jan: 9 working days (Sat-Wed, Sat-Mon)

// SS with lag and FF
const r2 = computeSchedule({ activities: [act('X', 6), act('Y', 4)], relations: [rel('X', 'Y', 'SS', 2)], calendar: { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }, mode: 'plan' })
assert.equal(r2.byId.get('Y').start, '2026-01-05')   // two working days after X starts
// a cycle is reported, not computed
const r3 = computeSchedule({ activities: [act('P', 1), act('Q', 1)], relations: [rel('P', 'Q'), rel('Q', 'P')], mode: 'plan' })
assert.equal(r3.ok, false); assert.deepEqual(r3.cycle.sort(), ['P', 'Q'])

// forecast: A finished on time, B running (1 of 3 days left), data date 2026-01-11 (Sun)
const fa = [act('A', 5, { actualStart: '2026-01-03', actualFinish: '2026-01-07', pctComplete: 100 }), act('B', 3, { actualStart: '2026-01-10', pctComplete: 67, remDuration: 1 }), act('C', 2), act('D', 1)]
const f = computeSchedule({ activities: fa, relations: rels, calendar: { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }, mode: 'forecast', dataDate: '2026-01-11' })
assert.ok(f.ok); assert.equal(f.byId.get('A').status, 'complete'); assert.equal(f.byId.get('B').status, 'in_progress')
assert.equal(f.byId.get('B').finish, '2026-01-11')                 // one remaining day starting at the data date
assert.equal(f.byId.get('C').start, '2026-01-11')                  // not-started work cannot start before the data date
assert.equal(f.projectFinish, '2026-01-13')                        // C (2 days) from the 11th finishes the 12th; D on the 13th
// a start-no-earlier-than bound (e.g. late material) moves the activity and the finish
const late = computeSchedule({ activities: acts, relations: rels, calendar: { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }, mode: 'plan', startNoEarlier: new Map([['C', '2026-01-17']]) })
assert.ok(late.projectFinish > r.projectFinish)
// all work done
const done = computeSchedule({ activities: [act('Z', 2, { actualStart: '2026-01-03', actualFinish: '2026-01-04', pctComplete: 100 })], relations: [], mode: 'forecast', dataDate: '2026-02-01' })
assert.equal(done.ok, true); assert.equal(done.projectFinish, '2026-01-04')
console.log('scheduling/schedule: all assertions passed')
