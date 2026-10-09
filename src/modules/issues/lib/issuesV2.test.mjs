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

// ── register: filter / sort / csv
import * as rg from './imRegister.ts'
{
  const base = (o) => issue({ code: 'ISS-' + Math.random().toString(36).slice(2, 5), ...o })
  const L = [
    base({ id: 'x1', title: 'تأخیر در تأیید نقشه‌های سازه', severity: 'high', category: 'engineering', stage: 'in_progress', status: 'in_progress', deadlineDate: '2026-03-01', ownerId: 'uA' }),
    base({ id: 'x2', title: 'کمبود مصالح', severity: 'low', category: 'procurement', stage: 'closed', status: 'approved', deadlineDate: '2026-03-01' }),
    base({ id: 'x3', title: 'مغایرت نقشه و اجرا', severity: 'critical', category: 'engineering', stage: 'registered', status: 'open', deadlineDate: '2026-05-01', blockedSince: '2026-03-02T00:00:00Z', followUpId: 'uB' }),
  ]
  const f = rg.EMPTY_FILTER
  assert.deepEqual(rg.applyFilter(L, f, '2026-04-01').map((i) => i.id), ['x1', 'x3']) // «active» hides closed
  assert.equal(rg.applyFilter(L, { ...f, stage: 'all' }, '2026-04-01').length, 3)
  assert.deepEqual(rg.applyFilter(L, { ...f, overdueOnly: true }, '2026-04-01').map((i) => i.id), ['x1'])
  assert.deepEqual(rg.applyFilter(L, { ...f, blockedOnly: true }, '2026-04-01').map((i) => i.id), ['x3'])
  assert.deepEqual(rg.applyFilter(L, { ...f, userId: 'uB' }, '2026-04-01').map((i) => i.id), ['x3'])
  assert.deepEqual(rg.applyFilter(L, { ...f, q: 'نقشه ساز' }, '2026-04-01').map((i) => i.id), ['x1']) // all words, Persian-normalised
  assert.deepEqual(rg.sortIssues(L, 'severity', -1, '2026-04-01').map((i) => i.id), ['x3', 'x1', 'x2'])
  assert.deepEqual(rg.sortIssues(L, 'due', 1, '2026-04-01').map((i) => i.id), ['x1', 'x2', 'x3'])
  const g = rg.groupByStage(L)
  assert.equal(g.registered.length, 1); assert.equal(g.closed.length, 1); assert.equal(g.other.length, 0)
  const csv = rg.toCsv([L[0]], { project: () => 'P', user: (id) => id ?? '', tasks: [] })
  assert.ok(csv.startsWith('﻿شناسه')); assert.ok(csv.includes('تأخیر در تأیید نقشه‌های سازه'))
  assert.deepEqual(rg.parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n'), [['a', 'b,c', 'd "q"'], ['1', '2', '3']])
  const imp = rg.parseImport('عنوان,شدت,دسته,مهلت\nنشتی خط لوله,بالا,ایمنی و محیط‌زیست,5\n,کم,,\nبدون دسته,خیلی,,\nمهلت بد,کم,,999\nخوب,critical,engineering,\n')
  assert.equal(imp.rows.length, 2); assert.equal(imp.rows[0].severity, 'high'); assert.equal(imp.rows[0].category, 'hse'); assert.equal(imp.rows[0].deadline_days, 5); assert.equal(imp.rows[0].source, 'import')
  assert.equal(imp.errors.length, 3); assert.deepEqual(imp.errors.map((e) => e.line), [3, 4, 5])
  assert.ok(rg.parseImport('x,y\n1,2').errors[0].message.includes('عنوان'))
  console.log('register lib ok')
}

// ── decisions + portfolio
import * as dc from './imDecisions.ts'
import * as pf from './imPortfolio.ts'
{
  const D = (o) => ({ id: 'd1', code: 'DEC-00001', projectId: 'p1', issueId: 'i', title: 't', question: '', requestedBy: null, deciderId: 'u', neededBy: '2026-04-10', status: 'pending', chosenOption: null, rationale: '', decidedAt: null, createdAt: '', ...o })
  assert.equal(dc.decisionHealth(D(), '2026-04-01'), 'on_time')
  assert.equal(dc.decisionHealth(D(), '2026-04-09'), 'due_soon')
  assert.equal(dc.decisionHealth(D(), '2026-04-12'), 'overdue')
  assert.equal(dc.decisionHealth(D({ status: 'decided' }), '2026-05-01'), 'closed')
  assert.equal(dc.decisionHealth(D({ neededBy: null }), '2026-05-01'), 'on_time')
  assert.equal(dc.decisionLateDays(D(), '2026-04-15'), 5)
  assert.equal(dc.decisionLateDays(D({ status: 'decided', decidedAt: '2026-04-12T08:00:00Z' }), '2026-09-01'), 2) // stops counting at the decision
  assert.equal(dc.decisionLateDays(D({ status: 'decided', decidedAt: '2026-04-08T08:00:00Z' }), '2026-09-01'), 0)
  const tk = [{ id: 'a', status: 'blocked', blockedSince: '2026-04-01T00:00:00Z', blockedDecisionId: 'd1' }, { id: 'b', status: 'blocked', blockedSince: '2026-04-05T00:00:00Z', blockedDecisionId: 'd1' }, { id: 'c', status: 'blocked', blockedSince: '2026-04-01T00:00:00Z', blockedDecisionId: 'zz' }, { id: 'd', status: 'in_progress', blockedSince: null, blockedDecisionId: 'd1' }]
  assert.deepEqual(dc.delayImpact('d1', tk, '2026-04-11'), { blockedTasks: 2, taskDays: 10 + 6 })
  const O = (id, o) => ({ id, decisionId: 'd1', title: id, pros: '', cons: '', costImpact: null, timeImpactDays: null, recommended: false, ...o })
  assert.deepEqual(dc.rankOptions([O('x', { timeImpactDays: 5 }), O('y', { recommended: true, timeImpactDays: 30 }), O('z', { timeImpactDays: 2, costImpact: 9 }), O('w', { timeImpactDays: 2, costImpact: 3 })]).map((o) => o.id), ['y', 'w', 'z', 'x'])

  const ISS = (id, o) => issue({ id, ...o })
  const L = [
    ISS('a', { projectId: 'p1', category: 'procurement', severity: 'critical', deadlineDate: '2026-03-01', stage: 'in_progress', status: 'in_progress', rootCauseSummary: 'ضعف در پایش تأمین‌کننده' }),
    ISS('b', { projectId: 'p2', category: 'procurement', deadlineDate: '2026-09-01', rootCauseSummary: 'ضعف پایش تامین کننده' }),
    ISS('c', { projectId: 'p1', category: 'engineering', deadlineDate: '2026-09-01', rootCauseSummary: 'ضعف پایش تامین کننده کالا', stage: 'closed', status: 'approved' }),
    ISS('d', { projectId: 'p1', category: 'hse', deadlineDate: '2026-09-01', rootCauseSummary: 'خطای طراحی' }),
    ISS('corp', { projectId: 'pc', category: 'procurement', title: 'پایش تأمین‌کنندگان در سطح شرکت', deadlineDate: '2026-12-01' }),
  ]
  L[0].corporateIssueId = 'corp'; L[1].corporateIssueId = 'corp'
  const h = pf.heatmap(L, '2026-04-01')
  assert.equal(h.cells.find((c) => c.projectId === 'p1' && c.category === 'procurement').overdue, 1)
  assert.equal(h.cells.find((c) => c.projectId === 'p1' && c.category === 'procurement').critical, 1)
  assert.equal(h.cells.some((c) => c.category === 'engineering'), false) // closed issues are not on the heatmap
  const sc2 = pf.sharedCauses(L)
  assert.equal(sc2.length, 1); assert.deepEqual(sc2[0].projectIds.sort(), ['p1', 'p2']); assert.equal(sc2[0].issueIds.length, 3); assert.equal(sc2[0].closedCount, 1)
  const cr = pf.corporateRollup(L, '2026-04-01')
  assert.equal(cr.length, 1); assert.equal(cr[0].projects, 2); assert.equal(cr[0].active, 2); assert.equal(cr[0].overdue, 1); assert.equal(cr[0].worstSeverity, 4)
  assert.equal(pf.wouldCreateCycle(L, 'corp', 'a'), true) // corp is a's parent → attaching corp under a closes a loop
  assert.equal(pf.wouldCreateCycle(L, 'd', 'corp'), false)
  assert.equal(pf.wouldCreateCycle(L, 'a', 'a'), true)
  console.log('decisions + portfolio libs ok')
}

// ── AI-fallback rules + forecast
import * as ai from './imAi.ts'
import * as fc from './imForecast.ts'
{
  const g = ai.guessCategory('تأخیر در تأیید نقشه‌های سازه و مغایرت با وضعیت اجرا')
  assert.equal(g.category, 'engineering'); assert.ok(g.matched.includes('نقشه'))
  assert.equal(ai.guessCategory('توضیح بی‌ربط'), null)
  assert.equal(ai.guessSeverity('نشتی خط لوله و خطر جانی برای کارگران').severity, 'critical')
  assert.equal(ai.guessSeverity('تاخیر در تحویل پمپ').severity, 'high')
  assert.equal(ai.guessSeverity('پیشنهاد بهبود چیدمان').severity, 'low')
  assert.equal(ai.guessSeverity('گزارش وضعیت').severity, 'medium')
  const s = ai.suggestFromText('تأخیر در تحویل پمپ‌های اصلی')
  assert.equal(s.category, 'procurement'); assert.ok(s.reasons.length >= 2); assert.equal(s.source, 'rules')
  const ctx = { projects: [{ id: 'p1', name: 'خط لوله ۳۶ اینچ' }], users: [{ userId: 'u9', name: 'رضا روحی' }], meId: 'me' }
  const q1 = ai.parseNlQuery('مسائل بحرانی تأخیردار پروژه خط لوله ۳۶ اینچ', ctx)
  assert.equal(q1.filter.severity, 'critical'); assert.equal(q1.filter.overdueOnly, true); assert.equal(q1.filter.projectId, 'p1'); assert.ok(q1.explanation.length >= 3)
  assert.equal(ai.parseNlQuery('کارهای مسدود رضا روحی', ctx).filter.userId, 'u9')
  assert.equal(ai.parseNlQuery('مسائل من', ctx).filter.userId, 'me')
  assert.equal(ai.parseNlQuery('چیز عجیب', ctx).filter.q, 'چیز عجیب')
  const cands = ai.extractCandidates('جلسه هماهنگی\n- تاخیر در تایید نقشه‌های سازه بلوک B مانع شروع بتن‌ریزی است.\n- حاضرین: آقای الف\n۲) نیاز به پیگیری مجوز آب منطقه‌ای برای برداشت')
  assert.equal(cands.length, 2); assert.equal(cands[0].category, 'engineering'); assert.equal(cands[1].category, 'permits')
  const sm = ai.summarizeIssue(issue({ title: 'ت', extensionCount: 2, rootCauseSummary: 'ضعف پایش', rootCauseConfirmed: false }), { openTasks: 3, blockedTasks: 1, pendingExt: 1, today: '2026-04-01', daysOverdue: 4, stageLabel: 'در حال رفع' })
  assert.ok(sm.includes('4 روز از سررسید') && sm.includes('2 بار تمدید') && sm.includes('تأییدنشده'))

  const hist = Array.from({ length: 10 }, (_, k) => issue({ id: 'h' + k, category: 'procurement', stage: 'closed', status: 'approved', createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-' + String(11 + k).padStart(2, '0') }))
  const base = fc.resolutionBaselines(hist)
  assert.equal(base.byCategory.get('procurement'), 14.5); assert.equal(base.overall, 14.5)
  const act = [issue({ id: 'r1', category: 'procurement', createdAt: '2026-03-20T00:00:00Z', deadlineDate: '2026-04-03', updatedAt: '2026-03-31T00:00:00Z' }), issue({ id: 'r2', category: 'procurement', createdAt: '2026-03-30T00:00:00Z', deadlineDate: '2026-04-30', updatedAt: '2026-03-31T00:00:00Z' }), issue({ id: 'r3', category: 'procurement', createdAt: '2026-03-01T00:00:00Z', deadlineDate: '2026-03-20', updatedAt: '2026-03-02T00:00:00Z', extensionCount: 2 })]
  const f = fc.forecastDelays([...hist, ...act], '2026-04-01')
  assert.equal(f.confident, true)
  assert.equal(f.forecasts[0].issueId, 'r3'); assert.ok(f.forecasts[0].riskScore >= 60 + 15 + 10)
  assert.ok(f.forecasts.find((x) => x.issueId === 'r1').riskScore > f.forecasts.find((x) => x.issueId === 'r2').riskScore)
  assert.equal(fc.forecastDelays(act, '2026-04-01').confident, false) // thin history is flagged
  console.log('ai rules + forecast ok')
}

import * as kb from './imKnowledge.ts'
{
  const L = (o) => ({ id: 'l' + Math.random(), sourceIssueId: null, projectId: null, title: '', context: '', rootCause: '', solution: '', prevention: '', category: null, tags: [], status: 'published', createdBy: null, createdAt: '', ...o })
  const lessons = [L({ id: 'a', title: 'تأخیر در تحویل پمپ‌ها', rootCause: 'ضعف پایش تأمین‌کننده', category: 'procurement' }), L({ id: 'b', title: 'مغایرت نقشه سازه', category: 'engineering' }), L({ id: 'c', title: 'تأخیر در تحویل پمپ‌ها (پیش‌نویس)', status: 'draft' })]
  const r = kb.relevantLessons({ title: 'تاخیر تحویل پمپ های اصلی', category: 'procurement' }, lessons)
  assert.deepEqual(r.map((x) => x.lesson.id), ['a']) // drafts never surface; unrelated lessons filtered
  assert.deepEqual(kb.relevantLessons({ title: 'موضوع کاملا متفاوت' }, lessons), [])
  const d = kb.lessonDraftFromIssue(issue({ id: 'z', title: 'ت', description: 'شرح', rootCauseSummary: 'ریشه', resolutionSummary: 'راه‌حل', category: 'hse' }))
  assert.equal(d.status, 'draft'); assert.equal(d.rootCause, 'ریشه'); assert.equal(d.category, 'hse')
  assert.deepEqual(kb.lessonReady({ title: 'عنوان خوب', rootCause: '', solution: 'x' }), ['علت ریشه‌ای'])
  console.log('knowledge lib ok')
}
