import assert from 'node:assert/strict'
import * as wf from './imWorkflow.ts'
import * as sla from './imSla.ts'
import * as kpi from './imKpi.ts'
import * as tx from './imText.ts'
import * as sc from './imScoring.ts'
import * as m from './imModel.ts'

const issue = (o = {}) => ({ id: 'i' + Math.random().toString(36).slice(2, 7), projectId: 'p1', title: 't', description: '', pursuerId: 'u1', approverId: 'u2', priority: 'medium', deadlineDays: 7, deadlineDate: '2026-03-10', actionDate: null, status: 'open', closedAt: null, createdBy: null, createdAt: '2026-03-01T08:00:00Z', updatedAt: '2026-03-01T08:00:00Z', source: 'manual', relatedActionId: null, ...o })
const task = (o = {}) => ({ id: 't' + Math.random().toString(36).slice(2, 7), issueId: 'i', title: 'x', executorId: 'u1', approverId: 'u2', startDate: null, dueDate: '2026-03-08', originalDueDate: null, extensionCount: 0, status: 'not_started', progress: 0, blockedKind: null, blockedSince: null, completionClaimedAt: null, verifiedAt: null, verifiedBy: null, lastProgressAt: null, ...o })

// ── model
assert.equal(m.IM_STAGE_COARSE.resolution_review, 'pending_approval')
assert.equal(m.stageOf(issue({ status: 'approved' })), 'closed')
assert.equal(m.stageOf(issue({ stage: 'analysis' })), 'analysis')
assert.equal(m.effectiveDue(issue({ resolveDueDate: '2026-03-20' })), '2026-03-20')
assert.equal(m.dayDiff('2026-03-01', '2026-03-31'), 30)

// ── workflow
const T = (from, to, roles = ['admin'], requiresReason = false) => ({ from, to, allowedRoles: roles, requiresReason })
const trs = [T('registered', 'in_progress', ['admin', 'follow_up']), T('in_progress', 'closed', ['approver'], true), T('closed', 'reopened', ['admin'], true), T('reopened', 'in_progress'), T('registered', 'cancelled')]
assert.equal(wf.canTransition(trs, 'registered', 'closed', ['admin']).ok, false)
assert.equal(wf.canTransition(trs, 'in_progress', 'closed', ['follow_up']).ok, false)
assert.deepEqual(wf.canTransition(trs, 'in_progress', 'closed', ['approver']), { ok: true, requiresReason: true })
assert.equal(wf.allowedNext(trs, 'registered', ['follow_up']).length, 1)
const stg = [{ key: 'registered', start: true }, { key: 'in_progress' }, { key: 'closed', terminal: true }, { key: 'reopened' }, { key: 'cancelled', terminal: true }]
assert.deepEqual(wf.validateWorkflow(stg, trs), [])
assert.ok(wf.validateWorkflow([...stg, { key: 'island' }], trs).some((e) => e.includes('island')))
assert.ok(wf.validateWorkflow(stg, [T('registered', 'in_progress'), T('in_progress', 'registered')]).length > 0) // no path to terminal
assert.ok(wf.validateWorkflow(stg, [...trs, T('registered', 'ghost')]).some((e) => e.includes('ghost')))
assert.ok(wf.validateWorkflow(wf.DEFAULT_STAGES, []).length > 0)

// closing blockers: «done action» ≠ «resolved issue»
const full = issue({ resolutionSummary: 'ok', acceptanceCriteria: 'ac', category: 'procurement', severity: 'medium', rootCauseConfirmed: false })
assert.deepEqual(wf.closeBlockers(full, [], 0, { key: 'procurement', requireEvidence: false, requireRootCause: false }), [])
assert.equal(wf.closeBlockers(full, [], 0, { key: 'engineering', requireEvidence: true, requireRootCause: false }).length, 1)
assert.equal(wf.closeBlockers({ ...full, severity: 'critical' }, [], 1).length, 1) // critical needs confirmed RC
assert.equal(wf.closeBlockers(full, [task({ status: 'pending_verification' }), task({ status: 'done' })], 0).length, 1)
assert.equal(wf.closeBlockers(issue(), [], 0).length >= 3, true)

// extension + verification separation + dependency cycles
assert.equal(wf.validateExtensionRequest('2026-03-10', '2026-03-10', 'why').ok, false)
assert.equal(wf.validateExtensionRequest('2026-03-10', '2026-03-12', ' ').ok, false)
assert.equal(wf.validateExtensionRequest(null, '2026-03-12', 'abc').ok, false)
assert.equal(wf.validateExtensionRequest('2026-03-10', '2026-03-12', 'abc').ok, true)
assert.equal(wf.canVerifyTask(task({ status: 'pending_verification' }), 'u1', false), false) // executor can't self-verify
assert.equal(wf.canVerifyTask(task({ status: 'pending_verification' }), 'u2', false), true)
assert.equal(wf.canVerifyTask(task({ status: 'pending_verification' }), 'u9', false), false)
assert.equal(wf.canVerifyTask(task({ status: 'in_progress' }), 'u2', true), false)
assert.equal(wf.hasDependencyCycle({ a: ['b'], b: ['c'], c: [] }), false)
assert.equal(wf.hasDependencyCycle({ a: ['b'], b: ['c'], c: ['a'] }), true)
assert.equal(wf.hasDependencyCycle({ a: ['a'] }), true)

// ── SLA
const pol = sla.DEFAULT_SLA
const crit = issue({ severity: 'critical', createdAt: '2026-03-01T00:00:00Z' })
const t0 = Date.parse('2026-03-01T00:00:00Z')
assert.equal(sla.responseSla(crit, pol, null, t0 + 1 * 3600e3).state, 'ok')
assert.equal(sla.responseSla(crit, pol, null, t0 + 3.5 * 3600e3).state, 'at_risk')
assert.equal(sla.responseSla(crit, pol, null, t0 + 5 * 3600e3).state, 'breached')
assert.equal(sla.responseSla(crit, pol, '2026-03-01T02:00:00Z', t0 + 99 * 3600e3).state, 'met')
assert.equal(sla.responseSla(crit, pol, '2026-03-01T09:00:00Z', t0).state, 'breached')
assert.equal(sla.resolutionSla(issue({ deadlineDate: '2026-03-10' }), '2026-03-12').state, 'breached')
assert.equal(sla.resolutionSla(issue({ deadlineDate: '2026-03-10' }), '2026-03-02').state, 'ok')
assert.equal(sla.resolutionSla(issue({ deadlineDate: '2026-03-10', resolveDueDate: '2026-03-20' }), '2026-03-12').state !== 'breached', true) // approved extension moves SLA
assert.equal(sla.resolutionSla(issue({ status: 'approved', closedAt: '2026-03-09', deadlineDate: '2026-03-10' }), '2026-04-01').state, 'met')

// ── KPIs
const today = '2026-04-01'
const iss = [
  issue({ id: 'a', status: 'approved', closedAt: '2026-03-08', deadlineDate: '2026-03-10', rootCauseConfirmed: true }),
  issue({ id: 'b', status: 'approved', closedAt: '2026-03-20', deadlineDate: '2026-03-10', resolveDueDate: '2026-03-25', originalDueDate: '2026-03-10', extensionCount: 1, reopenCount: 1 }),
  issue({ id: 'c', status: 'open', deadlineDate: '2026-03-15' }),
  issue({ id: 'd', status: 'in_progress', deadlineDate: '2026-04-20' }),
  issue({ id: 'e', stage: 'cancelled', status: 'rejected', deadlineDate: '2026-03-01' }),
]
const k = kpi.computeKpis(iss, [task({ status: 'blocked' }), task({ status: 'pending_verification' }), task({ status: 'done', verifiedAt: '2026-03-07T10:00:00Z', dueDate: '2026-03-08' }), task({ status: 'done', verifiedAt: '2026-03-12T10:00:00Z', dueDate: '2026-03-08' })], today)
assert.equal(k.total, 5); assert.equal(k.closed, 2); assert.equal(k.active, 2)
assert.equal(k.onTimeClosure, 100) // b closed 03-20 ≤ extended 03-25
assert.equal(k.onTimeClosureOriginal, 50) // …but late vs original 03-10 — extension effect is visible
assert.equal(k.overdueCount, 1); assert.equal(k.overdueRate, 50) // c overdue, d not
assert.equal(k.extensionRate, 20); assert.equal(k.reopenRate, 50)
assert.equal(k.rootCauseCoverage, 50)
assert.equal(k.blockedCount, 1); assert.equal(k.pendingVerification, 1)
assert.equal(k.taskOnTime, 50)
assert.equal(k.avgResolutionDays, (7 + 19) / 2)
assert.equal(kpi.computeKpis([], [], today).onTimeClosure, null) // no division by zero
assert.ok(kpi.KPI_DEFS.every((d) => d.formulaFa.length > 10 && d.titleFa))
const ag = kpi.agingBuckets(iss, today)
assert.equal(ag.reduce((s, b) => s + b.count, 0), 2)
const ei = kpi.extensionImpact(iss, [{ id: 'x1', issueId: 'b', taskId: null, fromDue: '2026-03-10', toDue: '2026-03-25', reason: 'r', status: 'approved', requestedBy: null, requestedAt: '' }, { id: 'x2', issueId: 'b', taskId: null, fromDue: '2026-03-25', toDue: '2026-04-05', reason: 'r', status: 'approved', requestedBy: null, requestedAt: '' }, { id: 'x3', issueId: 'c', taskId: null, fromDue: '2026-03-10', toDue: '2026-03-12', reason: 'r', status: 'pending', requestedBy: null, requestedAt: '' }])
assert.equal(ei.approved, 2); assert.equal(ei.pending, 1); assert.deepEqual(ei.repeatOffenders, ['b']); assert.equal(ei.avgShiftDays, 13)
const wl = kpi.workload(iss, [task({ executorId: 'u7', dueDate: '2026-03-01' }), task({ executorId: 'u7', status: 'blocked', dueDate: null })], today)
assert.equal(wl.find((w) => w.userId === 'u7').overdue, 1)

// ── text / similarity / duplicates
assert.equal(tx.normalizeFa('كتاب يک ۱۲۳'), 'کتاب یک 123')
assert.equal(tx.normalizeFa('می‌شود'), 'می شود')
assert.ok(tx.similarity('تأخیر در تحویل پمپ‌های اصلی', 'تاخیر تحویل پمپ های اصلی') > 0.6)
assert.ok(tx.similarity('تأخیر در تحویل پمپ', 'مغایرت نقشه‌های معماری ساختمان') < 0.2)
const pool = [issue({ id: 'p1', title: 'تأخیر در تحویل پمپ‌های اصلی از تأمین‌کننده', projectId: 'p1' }), issue({ id: 'p2', title: 'نقص در نقشه‌های ساختمان اداری' })]
const dups = tx.findSimilarIssues({ title: 'تاخیر تحویل پمپ های اصلی', projectId: 'p1' }, pool)
assert.equal(dups.length, 1); assert.equal(dups[0].issue.id, 'p1'); assert.ok(dups[0].reasons.length >= 1)
assert.equal(tx.findSimilarIssues({ title: 'x' }, pool, { excludeId: 'p1' }).length, 0)
const cl = tx.clusterByCause([issue({ id: 'a', rootCauseSummary: 'ضعف در پایش تأمین‌کننده' }), issue({ id: 'b', rootCauseSummary: 'ضعف پایش تامین کننده' }), issue({ id: 'c', rootCauseSummary: 'خطای طراحی' })])
assert.equal(cl.length, 1); assert.deepEqual(cl[0].issueIds.sort(), ['a', 'b'])

// ── scoring
assert.equal(sc.suggestSeverity({ time: 1, cost: 0, quality: 0, safety: 0, contract: 0, objectives: 0 }).severity, 'low')
assert.equal(sc.suggestSeverity({ time: 3, cost: 0, quality: 0, safety: 0, contract: 0, objectives: 0 }).severity, 'high')
assert.equal(sc.suggestSeverity({ time: 0, cost: 0, quality: 0, safety: 3, contract: 0, objectives: 0 }).severity, 'critical')
assert.equal(sc.suggestSeverity({ time: 2, cost: 2, quality: 2, safety: 0, contract: 0, objectives: 0 }).severity, 'high') // medium bumped by breadth
assert.ok(sc.suggestSeverity({ time: 2, cost: 0, quality: 0, safety: 0, contract: 0, objectives: 0 }).reasons.length > 0)
assert.equal(sc.derivePriority('low', 'critical'), 'medium')
assert.equal(sc.derivePriority('critical', 'critical'), 'critical')
assert.equal(sc.urgencyFromDays(1), 'critical'); assert.equal(sc.urgencyFromDays(null), 'medium')
assert.equal(sc.escalationLevel({ daysOverdue: 0, severity: 'high', blockedDays: 0 }), 0)
assert.ok(sc.escalationLevel({ daysOverdue: 10, severity: 'low', blockedDays: 0 }) >= 2)
assert.ok(sc.escalationLevel({ daysOverdue: 3, severity: 'critical', blockedDays: 0 }) > sc.escalationLevel({ daysOverdue: 3, severity: 'low', blockedDays: 0 }))
console.log('issues v2 libs: all assertions passed')
