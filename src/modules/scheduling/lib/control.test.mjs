import assert from 'node:assert/strict'
import { applyLiveStatus } from './live.ts'
import { sCurve } from './evm.ts'
import { qualityChecks, qualityScore } from './quality.ts'
import { wbsRollup } from './rollup.ts'
import { exportXer } from './xerExport.ts'
import { parseXer } from './p6.ts'
import { computeSchedule } from './schedule.ts'
import { progressAt } from './variance.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: 'u' + code, versionId: 'v', code, sourceId: code, name: 'act ' + code, wbsCode: '', wbsPath: 'Main > Sec 1', type: dur === 0 ? 'milestone' : 'task', calendarId: 'c1', origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 100, owner: '', sort: 0, ...o })
const rel = (p, s, type = 'FS', lag = 0) => ({ id: p + s + type, versionId: 'v', predId: p, succId: s, type, lag })
const CAL = { workDays: [0, 1, 2, 3, 4, 5], holidays: [], hoursPerDay: 8 }
const calRow = { id: 'c1', code: 'C', name: 'Std', workDays: [0, 1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], isDefault: true, sourceId: '' }

// ── live status
const acts = [act('A', 10, { plannedStart: '2026-01-03', plannedFinish: '2026-01-14' }), act('B', 10, { plannedStart: '2026-01-15', plannedFinish: '2026-01-27' }), act('C', 5, { plannedStart: '2026-01-28', plannedFinish: '2026-02-03', actualStart: '2026-01-28', pctComplete: 30 })]
const links = [{ id: '1', projectId: 'p', activityUid: 'uA', targetType: 'exec_activity', targetId: 'x1', needKind: 'start', needDate: null, note: '' }, { id: '2', projectId: 'p', activityUid: 'uA', targetType: 'exec_activity', targetId: 'x2', needKind: 'start', needDate: null, note: '' }, { id: '3', projectId: 'p', activityUid: 'uB', targetType: 'exec_activity', targetId: 'x3', needKind: 'start', needDate: null, note: '' }]
const facts = new Map([['x1', { approvedPct: 100, firstDate: '2026-01-04', lastDate: '2026-01-16' }], ['x2', { approvedPct: 100, firstDate: '2026-01-06', lastDate: '2026-01-20' }], ['x3', { approvedPct: 40, firstDate: '2026-01-21', lastDate: '2026-01-25' }]])
const lv = applyLiveStatus(acts, links, facts, '2026-01-25')
const A = lv.activities.find((a) => a.code === 'A'), B = lv.activities.find((a) => a.code === 'B'), Cc = lv.activities.find((a) => a.code === 'C')
assert.equal(A.actualStart, '2026-01-04'); assert.equal(A.actualFinish, '2026-01-20'); assert.equal(A.pctComplete, 100); assert.equal(A.remDuration, 0)
assert.equal(B.actualStart, '2026-01-21'); assert.equal(B.actualFinish, null); assert.equal(B.pctComplete, 40); assert.equal(B.remDuration, 6)
assert.equal(Cc, acts[2]); assert.equal(lv.unlinkedStarted, 1); assert.deepEqual(lv.changed.sort(), ['A', 'B']); assert.equal(lv.dataDate, '2026-01-25')
// work that is not all approved does not finish the activity
assert.equal(applyLiveStatus(acts, links, new Map([['x1', { approvedPct: 100, firstDate: '2026-01-04', lastDate: '2026-01-16' }], ['x2', { approvedPct: 60, firstDate: '2026-01-06', lastDate: '2026-01-20' }]]), null).activities[0].actualFinish, null)
// nothing approved → untouched
assert.equal(applyLiveStatus(acts, links, new Map(), null).changed.length, 0)
// the live forecast moves with the approved work
const rels = [rel('A', 'B'), rel('B', 'C')]
const fcFile = computeSchedule({ activities: acts, relations: rels, calendar: CAL, mode: 'forecast', dataDate: '2026-01-10' })
const fcLive = computeSchedule({ activities: lv.activities, relations: rels, calendar: CAL, mode: 'forecast', dataDate: lv.dataDate })
assert.notEqual(fcFile.projectFinish, fcLive.projectFinish)

// ── S-curve and earned schedule
const base = [act('A', 10, { plannedStart: '2026-01-05', plannedFinish: '2026-01-14' }), act('B', 10, { plannedStart: '2026-01-15', plannedFinish: '2026-01-24' })]
const curNow = [act('A', 10, { plannedStart: '2026-01-05', plannedFinish: '2026-01-14', actualStart: '2026-01-05', pctComplete: 50 }), act('B', 10, { plannedStart: '2026-01-15', plannedFinish: '2026-01-24' })]
const fc = computeSchedule({ activities: curNow, relations: [rel('A', 'B')], calendar: CAL, mode: 'forecast', dataDate: '2026-01-14' })
const ev = sCurve({ baseline: base, current: curNow, forecast: fc, dataDate: '2026-01-14' })
assert.ok(ev.plannedAtDD > ev.actualAtDD); assert.ok(ev.sv < 0); assert.ok(ev.spiT < 1 && ev.spiT > 0); assert.equal(ev.bac, 200)
assert.ok(ev.points[0].planned === 0 && Math.abs(ev.points[ev.points.length - 1].planned - 100) < 1e-6)
assert.ok(ev.points.every((p, i, a) => i === 0 || p.planned >= a[i - 1].planned - 1e-9))
const last = ev.points[ev.points.length - 1]; assert.ok(Math.abs(last.forecast - 100) < 1e-6)
assert.ok(ev.earnedScheduleDate < '2026-01-14')

// ── quality
const q = qualityChecks([act('P', 5, { plannedStart: '2026-01-03', plannedFinish: '2026-01-08' }), act('Q', 5, { plannedStart: '2026-01-09', plannedFinish: '2026-01-14', actualStart: '2026-01-09' }), act('R', 60, { plannedStart: '2026-01-15', plannedFinish: '2026-03-20', constraintType: 'MSO', constraintDate: '2026-01-15' }), act('S', 4, { plannedStart: '2026-02-01', plannedFinish: '2026-02-05' })], [rel('P', 'Q', 'SS', 3), rel('Q', 'R', 'FF', -2)], computeSchedule({ activities: [act('P', 5)], relations: [], calendar: CAL, mode: 'plan' }), '2026-01-12')
const by = Object.fromEntries(q.map((c) => [c.id, c]))
assert.ok(by.no_pred.codes.includes('S')); assert.ok(by.leads.count === 1 && by.leads.status === 'bad'); assert.equal(by.lags.count, 1)
assert.deepEqual(by.hard.codes, ['R']); assert.deepEqual(by.long_dur.codes, ['R']); assert.equal(by.non_fs.count, 2)
assert.equal(by.oos.count, 0)    // SS predecessor is not an FS violation
assert.ok(qualityScore(q) < 100)
const oos = qualityChecks([act('P', 5), act('Q', 5, { actualStart: '2026-01-09' })], [rel('P', 'Q')], computeSchedule({ activities: [act('P', 5)], relations: [], calendar: CAL, mode: 'plan' }), '2026-01-12')
assert.deepEqual(oos.find((c) => c.id === 'oos').codes, ['Q'])

// ── WBS roll-up
const bl = [act('A', 10, { wbsPath: 'Main > Sec 1', plannedStart: '2026-01-05', plannedFinish: '2026-01-14' }), act('B', 10, { wbsPath: 'Main > Sec 2', plannedStart: '2026-01-15', plannedFinish: '2026-01-24' })]
const cu = [{ ...bl[0], actualStart: '2026-01-05', pctComplete: 50 }, bl[1]]
const fcR = computeSchedule({ activities: cu, relations: [rel('A', 'B')], calendar: CAL, mode: 'forecast', dataDate: '2026-01-14' })
const prog = progressAt(bl, '2026-01-14', CAL, new Map([['A', { approved: 50, reported: null, file: 50 }]]))
const roll = wbsRollup({ baseline: bl, current: cu, forecast: fcR, rows: prog.rows, dataDate: '2026-01-14', depth: 2 })
assert.equal(roll.length, 2); assert.ok(roll.every((r) => r.slip != null && r.slip >= 0)); assert.equal(roll.reduce((s, r) => s + r.tasks, 0), 2)
assert.equal(wbsRollup({ baseline: bl, current: cu, forecast: fcR, rows: prog.rows, dataDate: '2026-01-14', depth: 1 }).length, 1)

// ── XER export round trip through our own parser
const xa = [act('A', 10, { plannedStart: '2026-01-05', plannedFinish: '2026-01-14', actualStart: '2026-01-05', pctComplete: 40, remDuration: 6, constraintType: 'SNET', constraintDate: '2026-01-05' }), act('M', 0, { plannedStart: '2026-01-15', plannedFinish: '2026-01-15' }), act('B', 4, { wbsPath: 'Other > Z', plannedStart: '2026-01-16', plannedFinish: '2026-01-21', constraintType: 'FNLT', constraintDate: '2026-02-01', calendarId: 'c2' })]
const cals = [calRow, { ...calRow, id: 'c2', code: 'C7', name: 'Seven', workDays: [0, 1, 2, 3, 4, 5, 6], isDefault: false, holidays: ['2026-01-20'] }]
const text = exportXer({ projectName: 'PRJ', dataDate: '2026-01-10', activities: xa, relations: [rel('A', 'M', 'FS', 1), rel('M', 'B', 'SS', 0)], calendars: cals })
const back = parseXer(text)
assert.equal(back.activities.length, 3); assert.equal(back.relations.length, 2)
const bA = back.activities.find((a) => a.code === 'A'), bB = back.activities.find((a) => a.code === 'B'), bM = back.activities.find((a) => a.code === 'M')
assert.equal(bA.origDuration, 10); assert.equal(bA.remDuration, 6); assert.equal(bA.actualStart, '2026-01-05'); assert.equal(bA.pctComplete, 40); assert.equal(bA.constraintType, 'SNET'); assert.equal(bA.constraintDate, '2026-01-05')
assert.equal(bM.type, 'milestone'); assert.equal(bB.constraintType, 'FNLT'); assert.equal(bB.plannedFinish, '2026-01-21')
assert.deepEqual(back.relations.map((r) => [r.predCode, r.succCode, r.type, r.lag]).sort(), [['A', 'M', 'FS', 1], ['M', 'B', 'SS', 0]])
assert.equal(back.calendars.length, 2); assert.deepEqual(back.calendars.find((c) => c.sourceId === 'c2').workDays, [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual(back.calendars.find((c) => c.sourceId === 'c2').holidays, ['2026-01-20']); assert.equal(back.dataDate, '2026-01-10')
assert.ok(back.calendars.find((c) => c.sourceId === 'c1').isDefault)
console.log('control: all assertions passed')
