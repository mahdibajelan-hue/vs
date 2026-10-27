import assert from 'node:assert/strict'
import { systemStatus, chainOf, canSign, projectReadiness, permitApprovers } from './pssrCore.ts'
import { DEFAULT_SIGN_CHAIN, GASIN_CHECKS, SUMMARY_ITEMS } from '../types.ts'

const chk = (id, status, mandatory = true) => ({ id, systemId: 's', category: 'x', seq: 1, title: 'بند ' + id, mandatory, status, evidence: '', fileUrl: null, checkedBy: null, checkedAt: null })
const pun = (id, category, status, dueDate = null) => ({ id, systemId: 's', meetingId: null, category, title: 'پانچ ' + id, discipline: '', owner: '', dueDate, status, raisedBy: null, raisedAt: '2026-01-01', closeNote: '', closedBy: null, closedAt: null, verifiedBy: null, verifiedAt: null })
const signers = DEFAULT_SIGN_CHAIN
const so = (seq, person, decision, at, extra = {}) => ({ id: seq + person + at, systemId: 's', seq, roleLabel: '', personLabel: person, decision, comment: '', signedBy: 'u', signedAt: at, manualSigner: '', manualSignedOn: null, fileUrl: null, ...extra })
const ready = { checks: [chk(1, 'ok'), chk(2, 'na')], meetings: [{ id: 'm' }], punches: [pun(1, 'A', 'verified'), pun(2, 'B', 'open')], signers }

// blockers: meeting, mandatory checks, open A punches (closed-not-verified still blocks); optional checks never block
let s = systemStatus({ checks: [chk(1, 'pending'), chk(2, 'pending', false)], meetings: [], punches: [], signers, signoffs: [] })
assert.equal(s.stage, 'mc'); assert.equal(s.blockers.length, 2); assert.equal(s.readiness, 0)
s = systemStatus({ checks: [chk(1, 'fail')], meetings: [{ id: 'm' }], punches: [pun(1, 'A', 'closed'), pun(2, 'B', 'open', '2020-01-01')], signers, signoffs: [] }, '2026-06-01')
assert.equal(s.stage, 'pssr'); assert.deepEqual(s.blockers.map((b) => b.kind), ['check_failed', 'punch_a']); assert.equal(s.overdue, 1); assert.equal(s.nextStep, null)
s = systemStatus({ ...ready, signoffs: [] })
assert.equal(s.stage, 'ready'); assert.equal(s.readiness, 100); assert.equal(s.nextStep.seq, 1)

// contractor: any of two persons is enough
let c = chainOf(signers, [so(1, 'سرپرست کارگاه', 'sign', '2026-01-02')])
assert.deepEqual(c.map((x) => x.state), ['signed', 'next', 'waiting', 'waiting'])
// employer: both project manager and HSE must sign
c = chainOf(signers, [so(1, 'سرپرست کارگاه', 'sign', '1'), so(2, 'سرپرست نظارت', 'sign', '2'), so(3, 'مدیر پروژهٔ کارفرما', 'sign', '3')])
assert.equal(c[2].state, 'next', 'one of two employer signatures is not enough')
c = chainOf(signers, [so(1, 'سرپرست کارگاه', 'sign', '1'), so(2, 'سرپرست نظارت', 'sign', '2'), so(3, 'مدیر پروژهٔ کارفرما', 'sign', '3'), so(3, 'مسئول HSE طرح', 'sign', '4')])
assert.deepEqual(c.map((x) => x.state), ['signed', 'signed', 'signed', 'next'])
assert.equal(c[3].manual, true, 'the operator step is the manual one')
// a rejection stops the chain; signing again after rework resumes it
c = chainOf(signers, [so(1, 'مدیر پروژهٔ پیمانکار', 'reject', '1')])
assert.deepEqual(c.map((x) => x.state), ['rejected', 'waiting', 'waiting', 'waiting'])
c = chainOf(signers, [so(1, 'مدیر پروژهٔ پیمانکار', 'reject', '1'), so(1, 'مدیر پروژهٔ پیمانکار', 'sign', '2')])
assert.equal(c[0].state, 'signed')
// all four steps → RFSU at the last step's time
const all = [so(1, 'سرپرست کارگاه', 'sign', '2026-01-01'), so(2, 'سرپرست نظارت', 'sign', '2026-01-02'), so(3, 'مدیر پروژهٔ کارفرما', 'sign', '2026-01-03'), so(3, 'مسئول HSE طرح', 'sign', '2026-01-04'), so(4, 'مدیر پروژهٔ کارفرما', 'sign', '2026-01-05', { fileUrl: 'x', manualSigner: 'نمایندهٔ بهره‌بردار' })]
s = systemStatus({ ...ready, signoffs: all })
assert.equal(s.stage, 'rfsu'); assert.equal(s.rfsuAt, '2026-01-05')
// signing rights
const step = s.chain[0], person = { ...step.persons[0], state: 'pending', email: 'pm@x' }
assert.equal(canSign(step, person, 'PM@x', false), true); assert.equal(canSign(step, person, 'o@x', false), false); assert.equal(canSign(step, { ...person, email: '' }, 'o@x', true), true)
assert.deepEqual(permitApprovers(signers).map((x) => x.personLabel), ['مدیر پروژهٔ کارفرما', 'مسئول HSE طرح'])
// gas-in: approvable only with RFSU and every day-of checks; stages follow the permit
const checks = Object.fromEntries(GASIN_CHECKS.map((g) => [g.key, { ok: true }]))
const permit = (status, ck = checks) => ({ id: 'p', systemId: 's', ptwNo: '', plannedAt: null, checks: ck, status, approvedBy: null, approvedAt: null, startedAt: null, completedAt: null, finalPressure: null, notes: '' })
assert.equal(systemStatus({ ...ready, signoffs: all, permit: permit('draft', {}) }).gasin.canApprove, false)
assert.equal(systemStatus({ ...ready, signoffs: all, permit: permit('draft') }).gasin.canApprove, true)
assert.equal(systemStatus({ ...ready, signoffs: [], permit: permit('draft') }).gasin.canApprove, false, 'no permit before RFSU')
assert.equal(systemStatus({ ...ready, signoffs: all, permit: permit('approved') }).stage, 'permit')
assert.equal(systemStatus({ ...ready, signoffs: all, permit: permit('in_progress') }).stage, 'gasin')
const live = systemStatus({ ...ready, signoffs: all, permit: permit('completed') })
assert.equal(live.stage, 'live')
const p = projectReadiness([live, systemStatus({ checks: [chk(1, 'pending')], meetings: [], punches: [pun(9, 'A', 'open')], signers, signoffs: [] })])
assert.equal(p.withRfsu, 1); assert.equal(p.rfsuPct, 50); assert.equal(p.livePct, 50); assert.equal(p.openA, 1)
// official form: checks carrying a priority also need the six «جمع‌بندی» confirmations before the chain opens
const off = { ...ready, checks: ready.checks.map((c) => ({ ...c, priority: 'A' })), signoffs: [] }
let o = systemStatus(off)
assert.ok(o.blockers.some((b) => b.kind === 'summary')); assert.notEqual(o.stage, 'ready')
o = systemStatus({ ...off, summary: Object.fromEntries(SUMMARY_ITEMS.map((x) => [x.key, true])) })
assert.ok(!o.blockers.some((b) => b.kind === 'summary')); assert.equal(o.stage, 'ready')
assert.ok(!systemStatus({ ...ready, signoffs: [] }).blockers.some((b) => b.kind === 'summary'), 'legacy lists need no summary')
console.log('pssr/core: all assertions passed')
