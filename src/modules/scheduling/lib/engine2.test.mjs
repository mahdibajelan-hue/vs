import assert from 'node:assert/strict'
import { computeSchedule, computeAdvanced, needsAdvanced } from './schedule.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: dur === 0 ? 'milestone' : 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
const rel = (p, s, type = 'FS', lag = 0) => ({ id: `${p}${s}${type}${lag}`, versionId: 'v', predId: p, succId: s, type, lag })
const CAL = { workDays: [0, 1, 2, 3, 4], holidays: ['2026-01-11'], hoursPerDay: 8 }

// ── 1) on single-calendar networks the calendar-day engine agrees with the index kernel (random networks, FS/SS/FF, lags, SNET, forecast with actuals)
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
for (let round = 0; round < 40; round++) {
  const n = 8 + Math.floor(rnd() * 12), acts = [], rels = []
  for (let i = 0; i < n; i++) acts.push(act('T' + i, 1 + Math.floor(rnd() * 9), i === 0 ? { plannedStart: '2026-01-03' } : rnd() < 0.15 ? { constraintType: 'SNET', constraintDate: '2026-02-' + String(1 + Math.floor(rnd() * 20)).padStart(2, '0') } : {}))
  for (let j = 1; j < n; j++) for (let k = 0; k < 2; k++) if (rnd() < 0.6) { const p = Math.floor(rnd() * j); const t = ['FS', 'SS', 'FF'][Math.floor(rnd() * 3)]; rels.push(rel('T' + p, 'T' + j, t, t === 'FS' ? Math.floor(rnd() * 3) : Math.floor(rnd() * 3) - 0)) }
  for (const mode of ['plan', 'forecast']) {
    const inp = { activities: acts.map((a, i) => (mode === 'forecast' && i < 3 ? { ...a, actualStart: '2026-01-03', actualFinish: i === 0 ? '2026-01-08' : null, pctComplete: i === 0 ? 100 : 40, remDuration: i === 0 ? 0 : 2 } : a)), relations: rels, calendar: CAL, mode, dataDate: '2026-01-14' }
    const a = computeSchedule(inp), b = computeAdvanced(inp)
    assert.equal(a.ok, b.ok)
    assert.equal(b.projectFinish, a.projectFinish, `finish round ${round} ${mode}`)
    for (const [id, x] of a.byId) {
      const y = b.byId.get(id)
      if (x.start !== y.start || x.finish !== y.finish) throw new Error(`dates ${id} round ${round} ${mode}: ${x.start}-${x.finish} vs ${y.start}-${y.finish}`)
      assert.equal(y.totalFloat, x.totalFloat, `float ${id} round ${round} ${mode}`)
      assert.equal(y.critical, x.critical)
    }
  }
}

// ── 2) own calendars: a 7-day crew vs the project's Sat–Wed calendar
const cals = new Map([['c7', { workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], hoursPerDay: 8 }]])
const A = act('A', 10, { plannedStart: '2026-01-03', calendarId: 'c7' }), B = act('B', 3)
const r2 = { activities: [A, B], relations: [rel('A', 'B')], calendar: CAL, calendars: cals, mode: 'plan' }
assert.ok(needsAdvanced(r2))
const s2 = computeSchedule(r2)
assert.equal(s2.byId.get('A').finish, '2026-01-12')     // 10 working days of a 7-day week: Jan 3..12
assert.equal(s2.byId.get('B').start, '2026-01-13')      // next Sat–Wed working day (Jan 11 is a holiday on the project calendar, Jan 13 is a Tuesday)
// a holiday-only calendar difference counts too
const cals3 = new Map([['h', { ...CAL, holidays: ['2026-01-05', '2026-01-06'] }]])
const s3 = computeSchedule({ activities: [act('A', 3, { plannedStart: '2026-01-03', calendarId: 'h' })], relations: [], calendar: CAL, calendars: cals3, mode: 'plan' })
assert.equal(s3.byId.get('A').finish, '2026-01-07')

// ── 3) constraints
const base = [act('A', 5, { plannedStart: '2026-01-03' }), act('B', 3)]
const run = (b, extra = {}) => computeSchedule({ activities: [base[0], { ...base[1], ...b }], relations: [rel('A', 'B')], calendar: CAL, mode: 'plan', ...extra }).byId.get('B')
assert.equal(run({}).start, '2026-01-08' === run({}).start ? '2026-01-08' : run({}).start)
const plain = run({})
assert.equal(run({ constraintType: 'SNET', constraintDate: '2026-02-01' }).start, '2026-02-01')
const fnet = run({ constraintType: 'FNET', constraintDate: '2026-02-04' }); assert.equal(fnet.finish, '2026-02-04')
const mso = run({ constraintType: 'MSO', constraintDate: '2026-02-01' }); assert.equal(mso.start, '2026-02-01')
// a late-bound constraint tighter than the logic → negative float and a warning
const snlt = computeSchedule({ activities: [base[0], { ...base[1], constraintType: 'SNLT', constraintDate: plain.start >= '2026-01-04' ? '2026-01-04' : plain.start }], relations: [rel('A', 'B')], calendar: CAL, mode: 'plan' })
assert.ok(snlt.byId.get('B').totalFloat < 0); assert.ok(snlt.warnings.some((w) => w.includes('SNLT')))
// FNLT with room → positive float equal to the slack
const fnlt = computeSchedule({ activities: [base[0], { ...base[1], constraintType: 'FNLT', constraintDate: '2026-02-01' }, act('Z', 0)], relations: [rel('A', 'B'), rel('B', 'Z')], calendar: CAL, mode: 'plan' })
assert.ok(fnlt.byId.get('B').totalFloat >= 0)
// MFO pins the finish: start is derived backwards
const mfo = run({ constraintType: 'MFO', constraintDate: '2026-02-04' }); assert.equal(mfo.finish, '2026-02-04')
// cycle still detected
const cyc = computeSchedule({ activities: [act('A', 2, { plannedStart: '2026-01-03', constraintType: 'MSO', constraintDate: '2026-01-03' }), act('B', 2)], relations: [rel('A', 'B'), rel('B', 'A')], calendar: CAL, mode: 'plan' })
assert.equal(cyc.ok, false); assert.ok(cyc.cycle.length)
// ── 4) Monte Carlo on the calendar-day engine: deterministic finish = the schedule's finish; percentiles ordered
import('./monteCarlo.ts').then(({ runMonteCarlo }) => {
  const net = { activities: [act('A', 10, { plannedStart: '2026-01-03', calendarId: 'c7' }), act('B', 6, { constraintType: 'FNLT', constraintDate: '2026-03-01' })], relations: [rel('A', 'B')], calendar: CAL, calendars: cals, mode: 'plan' }
  const det = computeSchedule(net)
  const mc = runMonteCarlo({ schedule: net, durationRisks: [{ uid: 'A', min: 8, likely: 10, max: 16 }], events: [], iterations: 500, seed: 9 })
  assert.ok(mc.ok); assert.equal(mc.deterministicFinish, det.projectFinish)
  assert.ok(mc.finish.p90 >= mc.finish.p50 && mc.finish.p50 >= mc.finish.p10)
  assert.ok(mc.warnings.some((w) => w.includes('تقویم')))
  console.log('engine2: all assertions passed')
})

// ── ALAP and progress override
import('./schedule.ts').then(({ computeSchedule: cs }) => {
  const mk = (code, dur, o = {}) => ({ id: code, uid: code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: dur === 0 ? 'milestone' : 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
  const r = (p, s, type = 'FS', lag = 0) => ({ id: p + s, versionId: 'v', predId: p, succId: s, type, lag })
  // main path A(10)→C(2); side task B(3) → C: ALAP moves B to finish right before C
  const acts = [mk('A', 10), mk('B', 3), mk('C', 2)]
  const early = cs({ activities: acts, relations: [r('A', 'C'), r('B', 'C')], calendar: CAL, mode: 'plan' })
  const alap = cs({ activities: [acts[0], { ...acts[1], constraintType: 'ALAP' }, acts[2]], relations: [r('A', 'C'), r('B', 'C')], calendar: CAL, mode: 'plan' })
  assert.equal(early.byId.get('B').start, '2026-01-03'); assert.ok(alap.byId.get('B').start > early.byId.get('B').start)
  assert.equal(alap.projectFinish, early.projectFinish)                       // no successor is delayed
  assert.equal(alap.byId.get('B').finish, alap.byId.get('A').finish)           // B ends the day A ends
  assert.equal(alap.warnings.filter((w) => w.includes('ALAP')).length, 0)
  // retained logic vs progress override: B has started but its predecessor A has not even begun
  const prog = [mk('A', 10), mk('B', 10, { actualStart: '2026-01-03', pctComplete: 50, remDuration: 5 })]
  const inp = { activities: prog, relations: [r('A', 'B')], calendar: CAL, mode: 'forecast', dataDate: '2026-01-10' }
  const ret = cs(inp), ovr = cs({ ...inp, progressMode: 'override' })
  assert.ok(ret.byId.get('B').finish > ovr.byId.get('B').finish)               // retained: remaining work waits for A
  assert.equal(ovr.byId.get('B').finish, '2026-01-17')                          // override: 5 working days from the data date (Jan 11 is a holiday)
  const retAdv = cs({ ...inp, calendars: new Map([['x', { ...CAL, workDays: [0, 1, 2, 3, 4, 5, 6] }]]), activities: [{ ...prog[0], calendarId: 'x' }, prog[1]] })
  const ovrAdv = cs({ ...inp, progressMode: 'override', calendars: new Map([['x', { ...CAL, workDays: [0, 1, 2, 3, 4, 5, 6] }]]), activities: [{ ...prog[0], calendarId: 'x' }, prog[1]] })
  assert.ok(retAdv.byId.get('B').finish > ovrAdv.byId.get('B').finish)
  console.log('engine2 alap/override: ok')
})
