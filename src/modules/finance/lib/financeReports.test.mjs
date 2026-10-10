import assert from 'node:assert/strict'
import { certStages, delayReport, stageSummary, agingReport, monthlyFlow, growthReport, advanceReport, expiryCalendar, claimsReport, consumptionReport } from './financeReports.ts'
import { DEFAULT_THRESHOLDS } from './financeControl.ts'

const fx0 = { fcAmount: 0, fcCurrency: '', exchangeRate: 0, fcRialEquivalent: 0 }
const cert = (o = {}) => ({ id: 'k' + Math.random(), contractId: 'C1', certificateDate: '2026-01-01', submittedDate: '2026-01-03', certifiedDate: '2026-01-30', approvedDate: '2026-02-05', paidDate: '2026-03-20', status: 'paid', payableAmount: 100, certifiedAmount: 100, paidAmount: 100, paidFx: fx0, retentionAmount: 5, advanceRecoveryAmount: 10, ...o })
const T = DEFAULT_THRESHOLDS // prepare 7, review 14, approve 7, pay 21

// a fully paid certificate: each stage measured against its allowance
const r = certStages(cert(), '2026-06-01', T)
const by = Object.fromEntries(r.stages.map((s) => [s.stage, s]))
assert.equal(by.prepare.days, 2); assert.equal(by.prepare.delay, 0)
assert.equal(by.review.days, 27); assert.equal(by.review.delay, 13)
assert.equal(by.approve.days, 6); assert.equal(by.approve.delay, 0)
assert.equal(by.pay.days, 43); assert.equal(by.pay.delay, 22)
assert.equal(r.totalDelay, 35); assert.equal(r.settled, true); assert.equal(r.cycleDays, 78)

// an open certificate keeps counting up to today in its running stage only
const o = certStages(cert({ status: 'certified', paidDate: null, paidAmount: 0, approvedDate: null, certifiedDate: '2026-05-01' }), '2026-06-01', T)
const ob = Object.fromEntries(o.stages.map((s) => [s.stage, s]))
assert.equal(ob.approve.open, true); assert.equal(ob.approve.days, 31); assert.equal(ob.approve.delay, 24)
assert.equal(ob.pay.days, null); assert.equal(o.settled, false)

// a draft only ever runs the first stage; a rejected one runs nothing
const d = certStages(cert({ status: 'draft', submittedDate: null, certifiedDate: null, approvedDate: null, paidDate: null, paidAmount: 0 }), '2026-01-20', T)
assert.equal(d.stages[0].open, true); assert.equal(d.stages[0].days, 19); assert.equal(d.stages[1].days, null)
assert.equal(certStages(cert({ status: 'rejected', certifiedDate: null, approvedDate: null, paidDate: null, paidAmount: 0 }), '2026-06-01', T).totalDelay, 0)

// cumulative delay runs in date order
const rep = delayReport([cert({ certificateDate: '2026-03-01', submittedDate: '2026-03-02', certifiedDate: '2026-03-05', approvedDate: '2026-03-06', paidDate: '2026-03-10' }), cert()], '2026-06-01', T)
assert.equal(rep[0].cumDelay, 35); assert.equal(rep[1].cumDelay, 35 + rep[1].totalDelay)
const sum = stageSummary(rep)
assert.equal(sum.find((s) => s.stage === 'review').late, 1); assert.equal(sum.find((s) => s.stage === 'review').n, 2)

// aging buckets: unpaid amount by days since submission
const ag = agingReport([cert({ status: 'certified', paidAmount: 40, submittedDate: '2026-05-20' }), cert({ status: 'certified', paidAmount: 0, submittedDate: '2026-01-01' }), cert()], '2026-06-01')
assert.equal(ag[0].amount, 60); assert.equal(ag[3].amount, 100); assert.equal(ag.reduce((s, b) => s + b.count, 0), 2)

// monthly flow: gap = certified minus paid, cumulative, filled month by month
const mf = monthlyFlow([cert({ id: 'a', certifiedDate: '2026-03-25', paidDate: null, paidAmount: 0 })], [])
assert.equal(mf.length, 1); assert.equal(mf[0].gap, 100)
const mf2 = monthlyFlow([cert({ id: 'a', certifiedDate: '2026-03-25', paidDate: '2026-06-10', paidAmount: 100 })], [{ certificateId: 'a', paymentDate: '2026-06-10', amount: 60, fx: fx0 }, { certificateId: 'a', paymentDate: '2026-07-10', amount: 40, fx: fx0 }])
assert.ok(mf2.length >= 4); assert.equal(mf2.at(-1).cumPaid, 100); assert.equal(mf2.at(-1).gap, 0)

// contracts: growth, advance, consumption
const con = (o = {}) => ({ id: 'C1', masterProjectId: 'P1', contractNumber: 'C-1', title: 'ا', contractValue: 1000, fx: fx0, status: 'active', advancePaymentPercent: 10, budgetLineId: 'L1', plannedCompletionDate: null, ...o })
const am = [{ id: 'm1', contractId: 'C1', amount: 200, daysDelta: 30, voidedAt: null }]
const g = growthReport([con()], am)
assert.equal(g[0].delta, 200); assert.equal(g[0].pct, 20); assert.equal(g[0].daysExtension, 30)
const adv = advanceReport([con()], am, [cert(), cert()])
assert.equal(adv[0].advance, 120); assert.equal(adv[0].recovered, 20); assert.equal(adv[0].remaining, 100); assert.equal(adv[0].retentionHeld, 10)
const lines = [{ id: 'L1', code: 'A', title: 'خط', costCategory: 'civil', approvedAmount: 1500 }, { id: 'L2', code: 'B', title: 'تجهیز', costCategory: 'equip', approvedAmount: 500 }]
const cons = consumptionReport({ lines, contracts: [con(), con({ id: 'C2', budgetLineId: null })], amendments: am, certs: [cert(), cert({ contractId: 'C2' })], categories: new Map([['civil', 'عمرانی']]), by: 'line' })
assert.equal(cons.find((x) => x.key === 'L1').committed, 1200); assert.equal(cons.find((x) => x.key === 'L1').usedPct, 80)
assert.equal(cons.find((x) => x.key === '—').committed, 1000); assert.equal(cons.find((x) => x.key === 'L2').remaining, 500)
const byCat = consumptionReport({ lines, contracts: [con()], amendments: [], certs: [], categories: new Map([['civil', 'عمرانی']]), by: 'category' })
assert.equal(byCat.find((x) => x.label === 'عمرانی').budget, 1500)

// guarantees calendar and claims
const cal = expiryCalendar([{ status: 'active', expiryDate: '2026-05-01', amount: 10 }, { status: 'active', expiryDate: '2026-07-10', amount: 20 }, { status: 'active', expiryDate: '2026-07-20', amount: 5 }, { status: 'released', expiryDate: '2026-07-20', amount: 99 }], '2026-06-01')
assert.equal(cal.overdue.count, 1); assert.equal(cal.months.length, 1); assert.equal(cal.months[0].amount, 25)
const cl = claimsReport([{ claimType: 'cost', status: 'partially_approved', amountClaimed: 100, amountApproved: 40, submittedDate: '2026-01-01' }, { claimType: 'cost', status: 'rejected', amountClaimed: 100, amountApproved: null, submittedDate: '2026-01-01' }, { claimType: 'time_extension', status: 'submitted', amountClaimed: 50, amountApproved: null, submittedDate: '2026-05-02' }], '2026-06-01')
assert.equal(cl.acceptancePct, 20); assert.equal(cl.open.length, 1); assert.equal(cl.open[0].ageDays, 30); assert.equal(cl.byType[0].claimed, 200)
console.log('financeReports ok')
