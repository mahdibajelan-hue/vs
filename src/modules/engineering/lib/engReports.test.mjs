import assert from 'node:assert/strict'
import { statusRegister, consultantOverdue, notProduced, commentsOverdue, engStats, docState } from './engReports.ts'

const C = (seq, submittedOn, result = 'pending', resultOn = null, rev = String.fromCharCode(64 + seq), purpose = 'IFA') => ({ id: `c${seq}`, seq, rev, purpose, submittedOn, result, resultOn })
const doc = (id, o = {}) => ({ id, projectId: 'p', docNo: id.toUpperCase(), title: `T ${id}`, discipline: 'Civil', rev: '0', contract: '', preparer: '', approver: '', weight: 1, critical: false, status: 'required', restrictionNote: '', dueDate: null, issuedDate: null, plannedPrepared: null, plannedApproved: null, actualPrepared: null, actualApproved: null, note: '', category: '', phase: '', targetIssue: 'IFA', price: 0, cycles: [], ...o })
const today = '2026-11-20'
// a simple credit: 0.6 sent, 0.7 resent, 0.8 AN, 1 approved
const credit = (d, t) => { let s = 0, c = 0; for (const x of (d.cycles ?? []).filter((x) => x.result !== 'withdrawn' && x.submittedOn <= t)) { const ans = x.resultOn && x.resultOn <= t; if (!(ans && x.result === 'rejected')) { s++; c = Math.max(c, s === 1 ? 0.6 : 0.7) } if (ans && x.result === 'approved_as_noted') c = Math.max(c, 0.8); if (ans && x.result === 'approved') c = 1 } return c }

const docs = [
  doc('a', { weight: 2, status: 'approved', cycles: [C(1, '2026-09-01', 'commented', '2026-09-10'), C(2, '2026-09-20', 'approved', '2026-10-01')] }),
  doc('b', { status: 'issued', cycles: [C(1, '2026-10-20')] }), // with the consultant 31 days
  doc('c', { status: 'in_preparation', cycles: [C(1, '2026-10-01', 'commented', '2026-10-25')] }), // returned 26 days ago
  doc('d', { status: 'required', plannedPrepared: '2026-11-01' }), // not produced, 19 days late
  doc('e', { status: 'restricted', discipline: 'Mechanical', cycles: [C(1, '2026-11-01', 'approved_as_noted', '2026-11-10')] }), // AN 10 days ago
  doc('f', { status: 'superseded', weight: 5 }),
]
// states
assert.equal(docState(docs[0], today), 'approved'); assert.equal(docState(docs[0], '2026-09-15'), 'commented'); assert.equal(docState(docs[0], '2026-09-25'), 'with_consultant')
assert.equal(docState(docs[2], today), 'commented'); assert.equal(docState(docs[3], today), 'not_started'); assert.equal(docState(docs[5], today), 'superseded')
// legacy document without cycles
assert.equal(docState(doc('g', { status: 'approved', actualApproved: '2026-01-01' }), today), 'approved')

// register: weights exclude the superseded document; amount is the weight share of the total
const reg = statusRegister(docs, { asOf: today, credit, total: 600, from: '2026-10-15' })
assert.equal(reg.sum.n, 5); assert.equal(reg.sum.weight, 6); assert.equal(reg.sum.amount, 600)
const a = reg.groups.find((g) => g.name.includes('Civil') || g.name.includes('عمران')).rows.find((r) => r.id === 'a')
assert.equal(a.rev, 'B'); assert.equal(a.now, 1); assert.equal(a.prev, 1); assert.equal(a.amount, 200); assert.equal(a.periodAmount, 0)
const e = reg.groups.flatMap((g) => g.rows).find((r) => r.id === 'e')
assert.equal(e.prev, 0); assert.equal(e.now, 0.8); assert.ok(Math.abs(e.periodAmount - 80) < 1e-9)
// earned: a 2×1 + b 0.6 + c 0.6 + d 0 + e 0.8 = 4.0 of 6
assert.ok(Math.abs(reg.sum.progress - 4 / 6) < 1e-9)
assert.ok(Math.abs(reg.sum.earnedAmount - 400) < 1e-9)
assert.equal(reg.groups.length, 2)
assert.equal(statusRegister(docs, { asOf: today, credit, total: 0, includeSuperseded: true }).sum.n, 6)

// overdue lists
assert.deepEqual(consultantOverdue(docs, today, 15).map((r) => [r.id, r.days, r.over]), [['b', 31, 16]])
assert.equal(consultantOverdue(docs, today, 40).length, 0)
assert.deepEqual(commentsOverdue(docs, today, 15).map((r) => [r.id, r.days]), [['c', 26]])
assert.deepEqual(commentsOverdue(docs, today, 5).map((r) => r.id), ['c', 'e'])
assert.deepEqual(notProduced(docs, today).map((r) => [r.id, r.late]), [['d', 19]])

// statistics
const s = engStats(docs, { asOf: today, credit, total: 0 })
assert.equal(s.total, 6); assert.equal(s.superseded, 1); assert.equal(s.submissions, 5)
assert.equal(s.byState.find((x) => x.state === 'approved').n, 1)
assert.equal(s.firstTimeRate, 0); assert.equal(s.avgSubmissionsToApproval, 2)
assert.equal(s.consultantDays, 10) // answers after 9, 11, 24 and 9 days → median 10
assert.equal(s.contractorDays, 10) // a: commented 09-10, resent 09-20
console.log('engineering reports: all assertions passed')
