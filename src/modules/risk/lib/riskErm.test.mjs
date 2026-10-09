import assert from 'node:assert/strict'
import * as pol from './riskPolicy.ts'
import * as st from './riskState.ts'
import * as fx from './riskEffect.ts'
import * as kri from './riskKri.ts'
import * as kpi from './riskKpi.ts'
import * as pf from './riskPortfolio.ts'

const TODAY = '2026-05-01'
let n = 0
const risk = (o = {}) => ({
  id: 'r' + ++n, projectId: 'P1', code: 'R-00' + n, title: 'تأخیر تأمین لوله', description: '', category: 'procurement', riskType: 'threat', ownerId: 'u1', identifiedDate: '2026-03-01', status: 'open',
  responseStrategy: 'mitigate', strategyDetails: {}, projectPhase: 'construction', timeToImpactDays: null, initialProbability: 4, initialImpact: 4, initialScore: 16,
  escalationStatus: 'none', requiredDecision: '', cause: '', riskEvent: '', consequence: '', contractor: '', discipline: '', workPackage: '', station: '', corporateRiskId: null,
  reviewIntervalDays: null, nextReviewDate: null, reviewRequestedAt: null, realizedAt: null, closedAt: null, ...o,
})
const ass = (riskId, date, cur, res, o = {}) => ({ id: 'a' + ++n, riskId, reviewDate: date, currentProbability: 3, currentImpact: 3, currentScore: cur, residualProbability: 2, residualImpact: 2, residualScore: res, trend: 'stable', reviewerComment: '', method: 'qualitative', basis: '', probabilityPct: null, exposureCost: null, createdAt: date + 'T08:00:00Z', ...o })
const act = (riskId, o = {}) => ({ id: 'x' + ++n, riskId, description: 'اقدام', ownerId: 'u1', dueDate: '2026-04-10', status: 'not_started', completionPercentage: 0, effectStatus: 'pending', createdAt: '2026-03-05T08:00:00Z', updatedAt: '2026-03-05T08:00:00Z', completedAt: null, ...o })
const P = pol.DEFAULT_POLICY

// ---- policy
assert.equal(pol.levelOf(5), 'low'); assert.equal(pol.levelOf(6), 'medium'); assert.equal(pol.levelOf(11), 'high'); assert.equal(pol.levelOf(16), 'critical')
assert.equal(pol.zoneOf(5), 'acceptable'); assert.equal(pol.zoneOf(10), 'tolerable'); assert.equal(pol.zoneOf(12), 'above_tolerance'); assert.equal(pol.zoneOf(16), 'escalate')
assert.equal(pol.impactFromDims({ time: 2, hse: 5, cost: 3 }), 5)   // worst dimension, not an average
assert.equal(pol.dominantDim({ time: 2, hse: 5 }), 'hse')
assert.ok(pol.validatePolicy({ ...P, appetiteMax: 12 }), 'appetite above tolerance is rejected')
assert.equal(pol.validatePolicy(P), null)
assert.ok(pol.validatePolicy({ ...P, levelBounds: [10, 5, 16] }))
assert.equal(pol.effectivePolicy([{ ...P, id: 'g' }, { ...P, id: 'p', projectId: 'P1', toleranceMax: 8 }], 'P1').toleranceMax, 8)
assert.equal(pol.effectivePolicy([{ ...P, id: 'g' }], 'P9').id, 'g')

// ---- state: scores only from assessments
{
  const r = risk()
  const s0 = st.computeRiskState(r, [], [], [], [], P, TODAY)
  assert.equal(s0.current, 16); assert.equal(s0.residual, 16); assert.equal(s0.level, 'critical'); assert.equal(s0.assessmentCount, 0)
  assert.equal(s0.reviewDue, '2026-03-15')   // identified + 14d (critical)
  assert.ok(s0.reviewOverdue); assert.ok(s0.attention.some((a) => a.includes('بازنگری')))
  assert.ok(!s0.hasPlan && s0.attention.includes('بدون برنامهٔ پاسخ'))
  const done = act(r.id, { status: 'completed', completionPercentage: 100, completedAt: '2026-04-20T08:00:00Z' })
  const s1 = st.computeRiskState(r, [], [done], [], [], P, TODAY)
  assert.equal(s1.current, 16, 'completing a task must not reduce the score'); assert.equal(s1.residual, 16)
  assert.ok(s1.hasPlan); assert.equal(s1.completedUnverified, 1)
  const a1 = ass(r.id, '2026-04-25', 9, 6)
  const s2 = st.computeRiskState(r, [a1], [done], [], [], P, TODAY)
  assert.equal(s2.current, 9); assert.equal(s2.residual, 6); assert.equal(s2.inherent, 16); assert.equal(s2.reductionPct, 63); assert.equal(s2.trend, 'improving')
  assert.equal(s2.residualZone, 'tolerable'); assert.ok(!s2.outsideTolerance); assert.equal(s2.reviewDue, '2026-06-09')  // medium → 45 days
  const open = act(r.id, { dueDate: '2026-04-01', status: 'blocked' })
  const s3 = st.computeRiskState(r, [a1], [open], [], [], P, TODAY)
  assert.equal(s3.overdueActions, 1); assert.equal(s3.blockedActions, 1)
  const s4 = st.computeRiskState(risk({ ownerId: null }), [], [], [], [], P, TODAY)
  assert.ok(!s4.hasOwner && s4.attention.includes('بدون مالک'))
  const acc = st.computeRiskState(risk({ responseStrategy: 'accept', initialScore: 12 }), [], [], [], [], P, TODAY)
  assert.ok(acc.hasPlan, 'accepted risk has a (formal) plan')
  assert.equal(st.scoreAt(r, [a1], '2026-04-01').current, 16); assert.equal(st.scoreAt(r, [a1], '2026-04-30').current, 9); assert.equal(st.scoreAt(r, [a1], '2026-01-01'), null)
}

// ---- effectiveness: completed ≠ effective
{
  const r = risk()
  const done = act(r.id, { status: 'completed', completedAt: '2026-04-01T08:00:00Z', updatedAt: '2026-04-01T08:00:00Z' })
  let e = fx.analyzeActionEffects(r, [], [done], TODAY)[0]
  assert.equal(e.verdict, 'awaiting_assessment'); assert.ok(e.overdueForReassessment)
  e = fx.analyzeActionEffects(r, [ass(r.id, '2026-04-10', 16, 16)], [done], TODAY)[0]
  assert.equal(e.verdict, 'no_reduction'); assert.ok(fx.isDisappointing(e))
  e = fx.analyzeActionEffects(r, [ass(r.id, '2026-04-10', 9, 6)], [done], TODAY)[0]
  assert.equal(e.verdict, 'score_reduced'); assert.equal(e.delta, -7)
  e = fx.analyzeActionEffects(r, [ass(r.id, '2026-04-10', 9, 6)], [{ ...done, effectStatus: 'ineffective' }], TODAY)[0]
  assert.equal(e.verdict, 'ineffective'); assert.ok(e.verified)
  const sum = fx.summarizeEffects([{ verdict: 'effective' }, { verdict: 'partial' }, { verdict: 'ineffective' }, { verdict: 'awaiting_assessment' }, { verdict: 'not_completed' }])
  assert.equal(sum.completed, 4); assert.equal(sum.verified, 3); assert.equal(sum.effectivenessPct, 50); assert.equal(sum.verifiedShare, 75)
  assert.equal(fx.suggestedReassessmentDate([done]), '2026-04-08')
}

// ---- KRI
{
  const k = { direction: 'higher_worse', warnThreshold: 10, criticalThreshold: 20 }
  assert.equal(kri.kriStateOf(5, k), 'normal'); assert.equal(kri.kriStateOf(10, k), 'warn'); assert.equal(kri.kriStateOf(25, k), 'critical'); assert.equal(kri.kriStateOf(null, k), 'no_data')
  const low = { direction: 'lower_worse', warnThreshold: 30, criticalThreshold: 10 }
  assert.equal(kri.kriStateOf(40, low), 'normal'); assert.equal(kri.kriStateOf(30, low), 'warn'); assert.equal(kri.kriStateOf(9, low), 'critical')
  assert.ok(kri.validateKri({ ...k, warnThreshold: 30, name: 'x', frequencyDays: 7 })); assert.ok(kri.validateKri({ ...low, warnThreshold: 5, name: 'x', frequencyDays: 7 }))
  assert.equal(kri.validateKri({ ...k, name: 'x', frequencyDays: 7 }), null)
  const day = (i, v) => ({ id: i, kriId: 'k', value: v, readAt: `2026-04-${String(10 + i).padStart(2, '0')}T08:00:00Z`, source: 'manual', note: '' })
  const rd = [day(0, 2), day(1, 3), day(2, 4), day(3, 5)]
  const kk = { ...k, id: 'k', name: 'n', currentValue: 5, state: 'normal', frequencyDays: 3, active: true, lastReadingAt: '2026-04-13T08:00:00Z' }
  assert.ok(Math.abs(kri.kriSlope(rd) - 1) < 1e-9)
  assert.equal(kri.daysToThreshold(kk, rd, 'warn'), 5)
  const ins = kri.kriInsight(kk, rd, '2026-04-14')
  assert.ok(ins.exposureRising, 'normal but crossing within 3 cycles'); assert.ok(ins.message.includes('روند افزایشی'))
  assert.equal(kri.daysToThreshold(kk, [day(0, 5), day(1, 4), day(2, 3)], 'warn'), null, 'moving away')
  assert.ok(kri.kriInsight({ ...kk, state: 'normal' }, [], '2026-05-20').readingOverdue)
}

// ---- KPI + fair comparison
const mk = (projectId, i, o = {}) => risk({ projectId, title: 'ریسک ' + i, ...o })
{
  const risks = [mk('A', 1), mk('A', 2, { ownerId: null }), mk('A', 3, { status: 'closed', closedAt: '2026-04-01T00:00:00Z' }), mk('B', 4, { status: 'realized', realizedAt: '2026-04-02T00:00:00Z' })]
  const ass1 = [ass(risks[0].id, '2026-04-20', 9, 4)]
  const actions = [act(risks[0].id, { status: 'completed', dueDate: '2026-04-10', completedAt: '2026-04-05T00:00:00Z', updatedAt: '2026-04-05T00:00:00Z' }), act(risks[0].id, { status: 'completed', dueDate: '2026-04-10', completedAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z', effectStatus: 'effective' })]
  const states = st.computeStates(risks, ass1, actions, [], [], () => P, TODAY)
  const ctx = { risks, states, assessments: ass1, actions, controls: [], kris: [], kriEvents: [], today: TODAY }
  const k = Object.fromEntries(kpi.computeKpis(ctx).map((x) => [x.id, x]))
  assert.equal(Object.keys(k).length, 13)
  assert.equal(k.actions_on_time.value, 50); assert.equal(k.actions_on_time.den, 2)
  assert.equal(k.realization_rate.value, 25)
  assert.equal(k.controls_effective.value, null, 'no data is null, not 0'); assert.equal(k.controls_effective.tone, 'na')
  assert.equal(k.repeat_rate.value, null)
  assert.equal(k.residual_reduction.value, 75)           // (16-4)/16
  assert.equal(k.no_owner_plan.num >= 1, true)
  assert.ok(Object.values(k).every((x) => x.formula && x.source))
  assert.equal(kpi.computeKpis({ ...ctx, repeatedRiskIds: new Set([risks[0].id]) }).find((x) => x.id === 'repeat_rate').value, 33.3)
  const cmp = kpi.compareProjects(ctx, ['A', 'B'])
  assert.equal(cmp[0].sizeBand, 'small'); assert.equal(cmp[0].confidence, 'low'); assert.equal(cmp[0].active, 2)
  assert.equal(cmp[1].active, 1)
  const big = Array.from({ length: 12 }, (_, i) => mk('C', 100 + i))
  const sc2 = st.computeStates(big, [], [], [], [], () => P, TODAY)
  const c2 = kpi.compareProjects({ ...ctx, risks: big, states: sc2 }, ['C'])[0]
  assert.equal(c2.sizeBand, 'medium'); assert.equal(c2.confidence, 'ok'); assert.ok(c2.group.startsWith('medium|'))
  const eff = kpi.effectivenessBy(ctx, (r) => r.projectId)
  assert.equal(eff[0].key, 'A')
}

// ---- portfolio
{
  const a = mk('A', 1, { title: 'تأخیر تأمین لوله خط ۵۶ اینچ', riskEvent: 'تأخیر در تحویل لوله', cause: 'ظرفیت کارخانه', contractor: 'پیمانکار ساخت‌پارس', category: 'procurement' })
  const b = mk('B', 2, { title: 'تأخیر تأمین لوله ایستگاه', riskEvent: 'تأخیر در تحویل لوله', cause: 'ظرفیت کارخانه', contractor: 'پیمانکار ساخت‌پارس', category: 'procurement' })
  const c = mk('C', 3, { title: 'نشت گاز هنگام آزمون', riskEvent: 'نشت در تست', category: 'quality', contractor: 'پیمانکار ساخت‌پارس' })
  const d = mk('A', 4, { title: 'تأخیر تأمین لوله خط', contractor: 'پیمانکار ساخت‌پارس' })
  const risks = [a, b, c, d]
  const cl = pf.clusterSimilar(risks)
  assert.equal(cl.length, 1); assert.deepEqual(cl[0].projectIds.sort(), ['A', 'B']); assert.ok(cl[0].members.length >= 2)
  assert.ok(pf.repeatedRiskIds(cl).has(a.id) && pf.repeatedRiskIds(cl).has(b.id) && !pf.repeatedRiskIds(cl).has(c.id))
  const states = st.computeStates(risks, [], [], [], [], () => P, TODAY)
  const fac = pf.sharedFactors(risks, states)
  const cf = fac.find((f) => f.kind === 'contractor')
  assert.ok(cf && cf.projects === 3 && cf.risks === 4 && cf.criticalCount === 4)
  const advice = pf.orgAdvice(cl, fac, [])
  assert.ok(advice.length >= 2 && advice.every((x) => x.title && x.why && x.todo))
  const deps = pf.dependentCounts([{ riskId: 'x', targetType: 'risk', targetId: 'y', relation: 'depends_on' }, { riskId: 'y', targetType: 'risk', targetId: 'z', relation: 'depends_on' }, { riskId: 'x', targetType: 'risk', targetId: 'y', relation: 'related' }])
  assert.equal(deps.get('z'), 2); assert.equal(deps.get('y'), 1); assert.equal(deps.get('x'), undefined)
  // cycles do not loop forever
  assert.ok(pf.dependentCounts([{ riskId: 'p', targetType: 'risk', targetId: 'q', relation: 'depends_on' }, { riskId: 'q', targetType: 'risk', targetId: 'p', relation: 'depends_on' }]).size === 2)
  const lowR = mk('A', 5, { initialScore: 4, initialProbability: 2, initialImpact: 2 })
  const hiR = mk('A', 6, { initialScore: 20, initialProbability: 4, initialImpact: 5 })
  const sts = st.computeStates([lowR, hiR], [], [], [], [], () => P, TODAY)
  const ordered = [{ risk: lowR, state: sts.get(lowR.id) }, { risk: hiR, state: sts.get(hiR.id) }].sort((x, y) => pf.comparePriority(x, y))
  assert.equal(ordered[0].risk.id, hiR.id)
  const iv = pf.interventions([lowR, hiR], sts)
  assert.equal(iv.length, 1); assert.equal(iv[0].level, 'management')
  const q = pf.quantExposure([a, b], [ass(a.id, '2026-04-20', 9, 6, { method: 'quantitative', basis: 'برآورد مهندسی', probabilityPct: 40, exposureCost: 1000 }), ass(b.id, '2026-04-20', 9, 6)])
  assert.equal(q.expectedLoss, 400); assert.equal(q.covered, 1); assert.equal(q.total, 2)
  const corp = pf.corporateRollup([{ id: 'cr1', code: 'CR-001', title: 'ظرفیت تأمین', status: 'open', correctivePlan: '' }], [{ ...a, corporateRiskId: 'cr1' }, { ...b, corporateRiskId: 'cr1' }], states)
  assert.equal(corp[0].projects, 2); assert.equal(corp[0].worst, 'critical')
}
console.log('erm libs ok')
