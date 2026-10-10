import assert from 'node:assert/strict'
import { buildCurves, fundsOf, monthIdx, isoMonthIdx } from './financeCurves.ts'
import { advanceStatus, buildInsights } from './financeInsights.ts'

const fx0 = { fcAmount: 0, fcCurrency: '', exchangeRate: 0, fcRialEquivalent: 0 }
const con = (o = {}) => ({ id: 'C1', masterProjectId: 'P1', contractNumber: 'C-1', title: 'ا', contractValue: 1200, currency: 'ریال', fx: fx0, status: 'active', advancePaymentPercent: 10, plannedCompletionDate: null, ...o })
const cert = (o = {}) => ({ id: 'k' + Math.random(), contractId: 'C1', certificateNumber: '1', certificateType: 'work', status: 'paid', grossAmount: 100, certifiedAmount: 100, payableAmount: 100, paidAmount: 100, paidFx: fx0, paidDate: null, advanceRecoveryAmount: 0, ...o })
// today = 1405/03/xx ; use a fixed Gregorian date and derive indices
const today = '2026-06-10'
const now = isoMonthIdx(today); const nowIdx = now
assert.equal(typeof now, 'number')
const j = (k) => ({ jy: Math.floor((now + k) / 12), jm: ((now + k) % 12) + 1 })
const plan = (kind, k, amount, o = {}) => ({ projectId: 'P1', contractId: 'C1', kind, fund: 'rial', currency: 'ریال', jalaliYear: j(k).jy, jalaliMonth: j(k).jm, amount, ...o })

// monthly + cumulative curves, actual only up to today, forecast spreads the unpaid remainder
const certs = [cert({ paidDate: '2026-04-20', paidAmount: 200 }), cert({ paidDate: '2026-06-01', paidAmount: 100 })]
const cu = buildCurves({ contracts: [con({ plannedCompletionDate: '2026-12-22' })], amendments: [], certificates: certs, payments: [], manualForecasts: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today,
  plans: [plan('baseline', -2, 300), plan('baseline', 0, 300), plan('baseline', 3, 600), plan('contractor', -2, 400), plan('contractor', 3, 800)] })
assert.equal(cu.totals.baseline, 1200); assert.equal(cu.totals.contractor, 1200); assert.equal(cu.totals.paid, 300)
assert.equal(cu.contractorGap, 0)
const at = cu.months.find((m) => m.idx === now)
assert.equal(at.cumActual, 300); assert.equal(at.cumBaseline, 600); assert.equal(cu.deviationPct, -50)
assert.equal(cu.months.filter((m) => m.isFuture).every((m) => m.cumActual === null), true)
assert.ok(Math.abs(cu.totals.forecastRemaining - 900) < 1e-6, 'unpaid remainder of the 1200 contract')
const last = cu.months.at(-1)
assert.ok(Math.abs(last.cumForecast - 1200) < 1e-6, 'forecast curve ends at the contract value')

// manual forecast overrides the automatic spread
const man = buildCurves({ contracts: [con()], amendments: [], certificates: certs, payments: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today, plans: [],
  manualForecasts: [{ contractId: 'C1', jalaliYear: j(1).jy, jalaliMonth: j(1).jm, forecastAmount: 50 }] })
assert.equal(man.totals.forecastRemaining, 50)

// foreign currency is its own fund and never added to rial
const fxc = con({ id: 'C2', fx: { fcAmount: 1000, fcCurrency: 'USD', exchangeRate: 10, fcRialEquivalent: 10000 } })
const fxCert = cert({ contractId: 'C2', paidAmount: 0, paidFx: { fcAmount: 400, fcCurrency: 'USD', exchangeRate: 10, fcRialEquivalent: 4000 }, paidDate: '2026-05-05' })
const funds = fundsOf([fxc], [], [fxCert])
assert.deepEqual(funds.map((f) => f.currency), ['ریال', 'USD'])
const usd = buildCurves({ contracts: [fxc], amendments: [], certificates: [fxCert], payments: [], manualForecasts: [], plans: [], fund: { fund: 'fx', currency: 'USD' }, todayIso: today })
assert.equal(usd.totals.paid, 400); assert.ok(Math.abs(usd.totals.forecastRemaining - 600) < 1e-6)
const rial = buildCurves({ contracts: [fxc], amendments: [], certificates: [fxCert], payments: [], manualForecasts: [], plans: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today })
assert.equal(rial.totals.paid, 0)

// payment records date the cash, not the certificate
const pay = { certificateId: certs[0].id, paymentDate: '2026-05-15', amount: 200, fx: fx0 }
const withPay = buildCurves({ contracts: [con()], amendments: [], certificates: [certs[0]], payments: [pay], manualForecasts: [], plans: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today })
assert.equal(withPay.months.find((m) => m.idx === isoMonthIdx('2026-05-15')).actual, 200)

// advance amortisation
const adv = advanceStatus(con({ contractValue: 1000 }), [], [cert({ certifiedAmount: 500, advanceRecoveryAmount: 20 }), cert({ status: 'rejected', certifiedAmount: 999, advanceRecoveryAmount: 99 })])
assert.equal(adv.advance, 100); assert.equal(adv.recovered, 20); assert.equal(adv.recoveredPct, 20); assert.equal(adv.certifiedPct, 50); assert.equal(adv.behind, true)

// insights for human review
const ins = buildInsights({ today, amendments: [], clearances: [{ contractId: 'C9', kind: 'social_security', status: 'issued', expiryDate: '2026-01-01' }],
  contracts: [con({ contractValue: 300 }), con({ id: 'C9', status: 'completed', contractValue: 1000 })],
  certificates: [cert({ id: 'a', certificateNumber: '7', certifiedAmount: 200 }), cert({ id: 'b', certificateNumber: '7', certifiedAmount: 200 }), cert({ id: 'c', paidAmount: 500, certifiedAmount: 100, payableAmount: 100, certificateNumber: '8' })] })
const keys = ins.map((i) => i.key)
assert.ok(keys.includes('over-certified:C1')); assert.ok(keys.includes('dup-cert:C1:7')); assert.ok(keys.some((k) => k.startsWith('overpaid:')))
assert.ok(keys.includes('clearance-expired:C9:social_security')); assert.ok(!keys.includes('clearance-missing:C9'), 'an issued (even if expired) clearance is not “missing”')
assert.equal(new Set(keys).size, keys.length); assert.equal(ins[0].severity, 'critical')
// project-level plans, forecast shape from the baseline, coverage, draft baseline
const { draftProjectBaseline } = await import('./financeCurves.ts')
const pj = (k, amount) => ({ projectId: 'P1', contractId: null, kind: 'baseline', fund: 'rial', currency: 'ریال', jalaliYear: j(k).jy, jalaliMonth: j(k).jm, amount })
const lvl = buildCurves({ contracts: [con({ plannedCompletionDate: '2027-03-01' })], amendments: [], certificates: certs, payments: [], manualForecasts: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today,
  plans: [pj(2, 400), plan('baseline', 1, 100), plan('baseline', 3, 300)] })
assert.equal(lvl.projectLevelTotal, 400)
const m2 = lvl.months.find((m) => m.idx === nowIdx + 2), m1 = lvl.months.find((m) => m.idx === nowIdx + 1), m3 = lvl.months.find((m) => m.idx === nowIdx + 3)
assert.ok(m2.src.includes('project') && m2.forecast === 400, 'project-level month is forecast as planned')
assert.ok(m1.src.includes('shape') && m3.src.includes('shape'))
assert.ok(Math.abs(m1.forecast / m3.forecast - 100 / 300) < 1e-9, 'the unpaid remainder follows the baseline shape')
assert.ok(Math.abs(m1.forecast + m3.forecast - 900) < 1e-6)
assert.ok(lvl.coverage > 0 && lvl.coverage <= 1)
const only = buildCurves({ contracts: [con()], amendments: [], certificates: [], payments: [], manualForecasts: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today, includeProject: false, plans: [pj(2, 400)] })
assert.equal(only.projectLevelTotal, 0)
const dr = draftProjectBaseline({ bac: 3e9 + 1e8, paid: 1e9, plannedAhead: 1e8, nowIdx: 100, endIdx: 104 })
assert.equal(dr.length, 4); assert.equal(dr[0].idx, 101); assert.equal(dr[0].amount, 500e6)
assert.deepEqual(draftProjectBaseline({ bac: 100, paid: 200, plannedAhead: 0, nowIdx: 1, endIdx: 5 }), [])
console.log('finance curves ok')
