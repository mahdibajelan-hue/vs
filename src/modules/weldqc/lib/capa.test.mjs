import assert from 'node:assert/strict'
import { detectTriggers, measure, readiness, lateness, loopKpis, pareto, mergeCapa, CAPA_DEFAULT } from './capa.ts'

const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)
const base = () => ({ firsts: [], rejected: [], cutouts: [], repeats: [], films: [], coat: [], ncrs: [], hydroFailed: [], nameOf: (k) => `W-${k}`, codeName: (c) => c, periodOf: (iso) => iso.slice(0, 7) })
const first = (i, repaired, welders = ['a']) => ({ weldId: `w${i}`, label: `S1/${i}`, at: day(i), repaired, welders })
const today = day(40), cfg = CAPA_DEFAULT
const rules = (x, c = cfg) => detectTriggers(x, c, today).map((t) => t.rule).sort()

// nothing recorded → nothing to meet about
assert.deepEqual(rules(base()), [])

// repair rate: below the least sample it stays quiet, then fires above the limit and not at the limit
{ const x = base(); x.firsts = Array.from({ length: 19 }, (_, i) => first(i, true, [`k${i}`])); assert.ok(!rules(x).includes('repair_rate')) }
{ const x = base(); x.firsts = Array.from({ length: 40 }, (_, i) => first(i, i % 10 === 0, [`k${i}`])); assert.ok(!rules(x).includes('repair_rate'), '10% is the limit, not above it') }
{ const x = base(); x.firsts = Array.from({ length: 40 }, (_, i) => first(i, i % 5 === 0, [`k${i}`]))
  const t = detectTriggers(x, cfg, today).find((r) => r.rule === 'repair_rate')
  assert.ok(t && t.mandatory); assert.equal(t.severity, 'critical'); assert.equal(Math.round(t.metric.value), 20); assert.equal(t.fingerprint, `repair_rate:${today.slice(0, 7)}`)
  assert.equal(t.scope.weldIds.length, 8) }
// only the latest window counts: an old bad run does not raise today's alarm
{ const x = base(); x.firsts = [...Array.from({ length: 30 }, (_, i) => first(i, true, [`o${i}`])), ...Array.from({ length: 50 }, (_, i) => first(31 + i * 0.1 | 0 + i, false, [`n${i}`]))]
  x.firsts.forEach((f, i) => { f.at = day(i * 0.4) }); assert.ok(!rules(x).includes('repair_rate')) }

// a welder: three repairs in his last ten, the last of them recent
{ const x = base(); x.firsts = Array.from({ length: 10 }, (_, i) => first(30 + i, i >= 7, ['z']))
  const t = detectTriggers(x, cfg, today).find((r) => r.rule === 'welder'); assert.ok(t); assert.equal(t.scope.welder, 'z'); assert.equal(t.scope.weldIds.length, 3) }
{ const x = base(); x.firsts = Array.from({ length: 10 }, (_, i) => first(i * 0.5, i < 3, ['z'])); x.firsts.forEach((f, i) => { f.at = day(-60 + i) }); assert.ok(!rules(x).includes('welder'), 'old repairs are not a new alarm') }
{ const x = base(); x.firsts = Array.from({ length: 10 }, (_, i) => first(30 + i, i >= 8, ['z'])); assert.ok(!rules(x).includes('welder')) }

// one imperfection code dominating; cracks always; old rejections ignored
{ const x = base(); x.rejected = [...Array.from({ length: 6 }, (_, i) => ({ weldId: `w${i}`, code: 'IF', at: day(35), crack: false })), ...Array.from({ length: 4 }, (_, i) => ({ weldId: `v${i}`, code: 'P', at: day(36), crack: false }))]
  const ts = detectTriggers(x, cfg, today); assert.deepEqual(ts.map((t) => t.rule), ['defect_code']); assert.equal(ts[0].scope.code, 'IF') }
{ const x = base(); x.rejected = [{ weldId: 'w1', code: 'C', at: day(39), crack: true }]; const t = detectTriggers(x, cfg, today); assert.equal(t.length, 1); assert.equal(t[0].rule, 'crack'); assert.equal(t[0].severity, 'critical') }
{ const x = base(); x.rejected = [{ weldId: 'w1', code: 'C', at: day(-10), crack: true }]; assert.deepEqual(rules(x), []) }

// cut-outs, second repairs, failed hydrotest
{ const x = base(); x.cutouts = [{ weldId: 'w1', label: 'S/1', at: day(38) }]; x.repeats = [{ weldId: 'w2', label: 'S/2', at: day(39) }]; x.hydroFailed = ['HT-03', 'HT-03']
  const ts = detectTriggers(x, cfg, today); assert.deepEqual(ts.map((t) => t.rule).sort(), ['cutout', 'hydro', 'repeat_repair']); assert.equal(ts.find((t) => t.rule === 'hydro').fingerprint, 'hydro:HT-03') }

// NCRs: an open one flagged for RCA or of high severity; three of a kind in the period
{ const x = base(); const n = (id, o = {}) => ({ id, code: `NCR-${id}`, kind: 'defect', severity: 'low', rcaRequired: false, status: 'open', createdAt: day(35), description: '', ...o })
  x.ncrs = [n('1', { rcaRequired: true }), n('2', { severity: 'high', status: 'closed' }), n('3', { severity: 'high', status: 'void' })]
  let ts = detectTriggers(x, cfg, today); assert.deepEqual(ts.map((t) => t.fingerprint), ['ncr:1'])
  x.ncrs = [n('1'), n('2'), n('3', { kind: 'observation' })]; assert.deepEqual(rules(x), [])
  x.ncrs = [n('1'), n('2'), n('4')]; ts = detectTriggers(x, cfg, today); assert.equal(ts[0].rule, 'ncr_repeat'); assert.equal(ts[0].scope.ncrKind, 'defect') }

// film retakes are advised, not forced; coating is forced
{ const x = base(); x.films = Array.from({ length: 30 }, (_, i) => ({ at: day(i), bad: i % 4 === 0 })); x.coat = Array.from({ length: 12 }, (_, i) => ({ at: day(i), bad: i < 3 }))
  const ts = detectTriggers(x, cfg, today); assert.equal(ts.find((t) => t.rule === 'retake').mandatory, false); assert.equal(ts.find((t) => t.rule === 'coating').mandatory, true) }

// the watched figure, measured only on what came after the agreement
{ const x = base(); x.firsts = [first(1, true), first(2, true), first(20, false), first(21, true), first(22, false), first(23, false)]
  const m = measure('repair_rate', {}, x, day(10)); assert.equal(m.n, 4); assert.equal(m.value, 25)
  assert.equal(measure('welder', { welder: 'nobody' }, x, day(10)).n, 0); assert.equal(measure('manual', {}, x, day(0)), null) }

// the gates
{ const c = { status: 'rca', mandatory: true, round: 1, containment: 'جوشکار تا بررسی از خط خارج شد', ownerName: 'مدیر کیفیت', meetingAt: '2026-10-05T10:00:00Z', minutes: 'x'.repeat(40), rootCause: 'رطوبت الکترودها' }
  const att = [{ round: 1, present: true, party: 'qc', signedAt: 'x' }, { round: 1, present: true, party: 'contractor', signedAt: 'x' }, { round: 1, present: true, party: 'supervision', signedAt: null }]
  const act = [{ round: 1, kind: 'corrective', status: 'open', removed: false }, { round: 1, kind: 'preventive', status: 'open', removed: false }]
  const bad = (a = att, b = act, cc = c) => readiness(cc, a, b, '2026-10-06T00:00:00Z').filter((k) => !k.ok).map((k) => k.key)
  assert.deepEqual(bad(), ['signed'])
  assert.deepEqual(bad(att.map((p) => ({ ...p, signedAt: 'x' }))), [])
  assert.deepEqual(bad(att.slice(0, 2)), ['quorum', 'parties'])
  assert.deepEqual(bad(att, act.slice(0, 1)), ['preventive', 'signed'])
  assert.ok(bad(att, [{ ...act[0], removed: true }, act[1]]).includes('corrective'))
  assert.ok(bad(att, act, { ...c, meetingAt: '2026-10-09T10:00:00Z' }).includes('meeting'), 'a meeting in the future is not yet held')
  assert.ok(bad(att.map((p) => ({ ...p, round: 2 })), act, c).includes('quorum'), 'the people of another round do not count')
  assert.ok(!bad(att.slice(0, 2).map((p) => ({ ...p, signedAt: 'x' })), act, { ...c, mandatory: false }).length, 'a voluntary case needs two people and no fixed sides') }

// lateness and escalation
assert.deepEqual(lateness({ status: 'rca', meetingDue: day(30), verifyDue: null, actionsDue: [] }, day(30)), { late: false, days: 0, what: 'برگزاری جلسه و توافق', level: 0 })
assert.equal(lateness({ status: 'open', meetingDue: day(30), verifyDue: null, actionsDue: [] }, day(32)).level, 1)
assert.equal(lateness({ status: 'rca', meetingDue: day(30), verifyDue: null, actionsDue: [] }, day(45)).level, 3)
assert.equal(lateness({ status: 'agreed', meetingDue: day(1), verifyDue: null, actionsDue: [day(50), day(38)] }, day(40)).days, 2)
assert.equal(lateness({ status: 'closed', meetingDue: day(1), verifyDue: day(2), actionsDue: [day(3)] }, day(40)).late, false)

// the loop's own indicators
{ const k = loopKpis([
    { status: 'closed', mandatory: true, openedAt: `${day(0)}T00:00:00Z`, agreedAt: `${day(3)}T00:00:00Z`, closedAt: `${day(20)}T00:00:00Z`, meetingDue: day(5), verifyResult: 'effective', round: 1 },
    { status: 'closed', mandatory: true, openedAt: `${day(0)}T00:00:00Z`, agreedAt: `${day(9)}T00:00:00Z`, closedAt: `${day(40)}T00:00:00Z`, meetingDue: day(5), verifyResult: 'effective', round: 2 },
    { status: 'rca', mandatory: true, openedAt: `${day(30)}T00:00:00Z`, agreedAt: null, closedAt: null, meetingDue: day(35), verifyResult: null, round: 1 },
    { status: 'void', mandatory: true, openedAt: `${day(30)}T00:00:00Z`, agreedAt: null, closedAt: null, meetingDue: day(31), verifyResult: null, round: 1 },
  ], day(40))
  assert.equal(k.total, 3); assert.equal(k.open, 1); assert.equal(k.overdueMeeting, 1); assert.equal(k.onTimePct, 50); assert.equal(k.effectivePct, 50); assert.equal(k.medianDays, 40) }

{ const p = pareto(['a', 'b', 'a', 'c', 'a', 'b']); assert.deepEqual(p.map((r) => r.key), ['a', 'b', 'c']); assert.equal(p[0].share, 50); assert.equal(Math.round(p[1].cum), 83); assert.equal(p[2].cum, 100) }
{ const c = mergeCapa({ repairLimit: '7', auto: false, window: -3, junk: 1 }); assert.equal(c.repairLimit, 7); assert.equal(c.auto, false); assert.equal(c.window, CAPA_DEFAULT.window) }

console.log('capa: ok')
