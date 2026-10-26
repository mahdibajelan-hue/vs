import assert from 'node:assert/strict'
import { systemStatus, chainOf, canSign, projectReadiness } from './pssrCore.ts'

const chk = (id, status, mandatory = true) => ({ id, systemId: 's', category: 'x', seq: 1, title: 'بند ' + id, mandatory, status, evidence: '', fileUrl: null, checkedBy: null, checkedAt: null })
const pun = (id, category, status, dueDate = null) => ({ id, systemId: 's', meetingId: null, category, title: 'پانچ ' + id, discipline: '', owner: '', dueDate, status, raisedBy: null, raisedAt: '2026-01-01', closeNote: '', closedBy: null, closedAt: null, verifiedBy: null, verifiedAt: null })
const signers = [{ seq: 1, roleLabel: 'پیمانکار', signerEmail: 'c@x' }, { seq: 2, roleLabel: 'ناظر', signerEmail: 's@x' }]
const so = (seq, decision, at) => ({ id: seq + at, systemId: 's', seq, roleLabel: '', decision, comment: '', signedBy: 'u', signedAt: at })

// nothing done yet → MC, blocked by the meeting and every mandatory check
let s = systemStatus({ checks: [chk(1, 'pending'), chk(2, 'pending', false)], meetings: [], punches: [], signers, signoffs: [] })
assert.equal(s.stage, 'mc'); assert.equal(s.blockers.length, 2); assert.equal(s.readiness, 0)
// meeting + one check failed + an open A punch → PSSR, three blockers; optional checks never block
s = systemStatus({ checks: [chk(1, 'fail'), chk(2, 'pending', false)], meetings: [{ id: 'm' }], punches: [pun(1, 'A', 'closed'), pun(2, 'B', 'open', '2020-01-01')], signers, signoffs: [] }, '2026-06-01')
assert.equal(s.stage, 'pssr')
assert.deepEqual(s.blockers.map((b) => b.kind), ['check_failed', 'punch_a'], 'a closed-but-not-verified A punch still blocks')
assert.equal(s.overdue, 1); assert.equal(s.punches.A.open, 1); assert.equal(s.punches.B.open, 1)
assert.equal(s.nextStep, null, 'no signing while blocked')
// all resolved → ready; n/a counts as resolved; B punches do not block RFSU
s = systemStatus({ checks: [chk(1, 'ok'), chk(3, 'na')], meetings: [{ id: 'm' }], punches: [pun(1, 'A', 'verified'), pun(2, 'B', 'open')], signers, signoffs: [] })
assert.equal(s.stage, 'ready'); assert.equal(s.readiness, 100); assert.equal(s.nextStep.seq, 1)
// chain in order; a rejection stops it, a later sign by the same step resumes
s = systemStatus({ checks: [chk(1, 'ok')], meetings: [{ id: 'm' }], punches: [], signers, signoffs: [so(1, 'sign', '2026-01-02')] })
assert.equal(s.stage, 'signing'); assert.equal(s.nextStep.seq, 2)
let c = chainOf(signers, [so(1, 'reject', '2026-01-02')])
assert.deepEqual(c.map((x) => x.state), ['rejected', 'waiting'])
c = chainOf(signers, [so(1, 'reject', '2026-01-02'), so(1, 'sign', '2026-01-03')])
assert.deepEqual(c.map((x) => x.state), ['signed', 'next'])
s = systemStatus({ checks: [chk(1, 'ok')], meetings: [{ id: 'm' }], punches: [], signers, signoffs: [so(1, 'sign', '2026-01-02'), so(2, 'sign', '2026-01-04')] })
assert.equal(s.stage, 'rfsu'); assert.equal(s.rfsuAt, '2026-01-04')
// who can sign
assert.equal(canSign({ seq: 1, email: 'C@x', state: 'next' }, 'c@x', false), true)
assert.equal(canSign({ seq: 1, email: 'c@x', state: 'next' }, 'other@x', false), false)
assert.equal(canSign({ seq: 1, email: '', state: 'next' }, 'any@x', true), true)
// project picture
const p = projectReadiness([s, systemStatus({ checks: [chk(1, 'pending')], meetings: [], punches: [pun(9, 'A', 'open')], signers, signoffs: [] })])
assert.equal(p.systems, 2); assert.equal(p.byStage.rfsu, 1); assert.equal(p.rfsuPct, 50); assert.equal(p.openA, 1)
console.log('pssr/core: all assertions passed')
