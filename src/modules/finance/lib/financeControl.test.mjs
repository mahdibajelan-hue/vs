import assert from 'node:assert/strict'
import { effectiveThresholds, DEFAULT_THRESHOLDS, contractFile, landBridge, forecast, findExceptions, sumByCurrency, daysBetween, addDaysIso } from './financeControl.ts'

const fx = { fcAmount: 0, fcCurrency: '', exchangeRate: 0, fcRialEquivalent: 0 }
const con = (o = {}) => ({ id: 'C1', masterProjectId: 'P1', contractNumber: 'C-1', title: 'ا', contractRole: 'main_epc', contractValue: 1000, currency: 'ریال', fx, status: 'active', plannedCompletionDate: '2026-01-31', ...o })
const am = (o = {}) => ({ id: 'a' + Math.random(), contractId: 'C1', amount: 100, daysDelta: 0, voidedAt: null, ...o })

// versioned settings: the version in force on the date; older ones stay; missing keys use defaults
const vs = [{ version: 1, validFrom: '2000-01-01', note: '', values: { guaranteeExpiryDays: 60 } }, { version: 2, validFrom: '2026-06-01', note: '', values: { guaranteeExpiryDays: 30, stageSlaDays: { submitted: 3 } } }]
assert.equal(effectiveThresholds(vs, '2026-05-31').thresholds.guaranteeExpiryDays, 60)
assert.equal(effectiveThresholds(vs, '2026-06-01').thresholds.guaranteeExpiryDays, 30)
assert.equal(effectiveThresholds(vs, '2026-06-01').thresholds.stageSlaDays.under_review, 14)
assert.equal(effectiveThresholds([], '2026-06-01').version, null)

// contract file: voided amendments do not count; days extend the end date
const f = contractFile(con(), [am({ amount: 100, daysDelta: 10 }), am({ amount: 400, voidedAt: '2026-02-01' })])
assert.equal(f.current, 1100); assert.equal(f.increasePct, 10); assert.equal(f.daysExtension, 10); assert.equal(f.currentEnd, '2026-02-10'); assert.equal(f.amendmentCount, 1)
assert.equal(addDaysIso('2026-01-31', 1), '2026-02-01'); assert.equal(daysBetween('2026-03-10', '2026-03-01'), 9)

// land bridge
const land = { approved: 1000, approved_source: 'finance', paid: 300, voided: 50, committed_unpaid: 500, exposure: 800, remaining: 200 }
assert.equal(landBridge(land, DEFAULT_THRESHOLDS).level, 'ok')
assert.equal(landBridge({ ...land, exposure: 900 }, DEFAULT_THRESHOLDS).level, 'warn')
assert.equal(landBridge({ ...land, exposure: 1000 }, DEFAULT_THRESHOLDS).level, 'critical')
assert.equal(landBridge({ ...land, approved: 0 }, DEFAULT_THRESHOLDS).level, 'unset')

// forecast: land is counted once, scenario kept apart, only pending statuses enter it
const base = { contracts: [con(), con({ id: 'C2', status: 'draft', contractValue: 9999 })], amendments: [am()], certificates: [], claims: [], land, budget: 2500, thresholds: DEFAULT_THRESHOLDS, paidContracts: 400,
  pending: [{ contractId: 'C1', status: 'awaiting_approval', proposedAmount: 700 }, { contractId: 'C1', status: 'rejected', proposedAmount: 5000 }, { contractId: 'C1', status: 'approved', proposedAmount: 5000 }, { contractId: 'OTHER', status: 'submitted', proposedAmount: 111 }] }
const fc = forecast(base)
assert.equal(fc.contractCommitted, 1100); assert.equal(fc.landExposure, 800); assert.equal(fc.baseEac, 1900); assert.equal(fc.scenarioDelta, 700); assert.equal(fc.scenarioEac, 2600)
assert.equal(fc.paid, 700); assert.equal(fc.overrun, 'possible'); assert.equal(fc.scenarioOverrun, 100); assert.equal(fc.baseOverrun, -600)
assert.equal(forecast({ ...base, budget: 1500 }).overrun, 'likely')
assert.equal(forecast({ ...base, budget: 5000 }).overrun, 'none')
assert.equal(forecast({ ...base, budget: 2200, pending: [] }).overrun, 'watch')
assert.equal(forecast({ ...base, land: null, pending: [] }).baseEac, 1100)

// exceptions: stuck certificate, overdue payment, guarantees, jump, stale claim, budgets — one stable key each
const today = '2026-06-10'
const cert = (o) => ({ id: 'k' + Math.random(), contractId: 'C1', certificateNumber: '5', status: 'submitted', submittedDate: '2026-05-20', certifiedDate: null, approvedDate: null, ...o })
const ex = findExceptions({ contracts: [con()], amendments: [am({ amount: 250 })],
  certificates: [cert({ id: 'k1' }), cert({ id: 'k2', status: 'certified', submittedDate: '2026-03-01', certifiedDate: '2026-05-01' }), cert({ id: 'k3', submittedDate: '2026-06-08' })],
  guarantees: [{ id: 'g1', contractId: 'C1', number: 'G1', status: 'active', expiryDate: '2026-06-30' }, { id: 'g2', contractId: 'C1', number: 'G2', status: 'active', expiryDate: '2026-06-01' }, { id: 'g3', contractId: 'C1', number: 'G3', status: 'released', expiryDate: '2026-06-01' }],
  claims: [{ id: 'cl1', contractId: 'C1', claimNumber: 'CL1', status: 'submitted', submittedDate: '2026-05-01' }, { id: 'cl2', contractId: 'C1', claimNumber: 'CL2', status: 'approved', submittedDate: '2026-01-01' }],
  thresholds: DEFAULT_THRESHOLDS, today, budgetByProject: new Map([['P1', { budget: 1000, commitment: 1200 }]]), land: new Map([['P1', landBridge(land, DEFAULT_THRESHOLDS)]]) })
const kinds = ex.map((e) => e.kind).sort()
assert.deepEqual(kinds, ['amendment_jump', 'budget_over', 'certificate_stuck', 'claim_stale', 'guarantee_expired', 'guarantee_expiring', 'payment_overdue'].sort())
assert.equal(new Set(ex.map((e) => e.key)).size, ex.length)
assert.equal(ex[0].severity, 'critical')
assert.ok(!ex.some((e) => e.sourceId === 'k3'), 'a certificate inside its SLA is not flagged')
assert.ok(!ex.some((e) => e.sourceId === 'g3'), 'released guarantee is not flagged')

// currencies never mix
const m = sumByCurrency([{ a: 5, c: 'ریال' }, { a: 7, c: 'USD' }, { a: 3, c: 'ریال' }], (r) => r.a, (r) => r.c)
assert.equal(m.get('ریال'), 8); assert.equal(m.get('USD'), 7)
console.log('finance control ok')
