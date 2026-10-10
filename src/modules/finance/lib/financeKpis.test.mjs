import assert from 'node:assert/strict'
import { projectKpis, toneOf } from './financeKpis.ts'
import { DEFAULT_THRESHOLDS } from './financeControl.ts'
import { isoMonthIdx } from './financeCurves.ts'

const fx0 = { fcAmount: 0, fcCurrency: '', exchangeRate: 0, fcRialEquivalent: 0 }
const con = (o = {}) => ({ id: 'C1', masterProjectId: 'P', contractNumber: 'C-1', title: 'ا', contractValue: 1000, currency: 'ریال', fx: fx0, status: 'active', advancePaymentPercent: 0, plannedCompletionDate: '2027-03-01', ...o })
const cert = (o = {}) => ({ id: 'k' + Math.random(), contractId: 'C1', certificateNumber: '1', certificateType: 'work', status: 'paid', grossAmount: 100, certifiedAmount: 100, payableAmount: 90, paidAmount: 90, paidFx: fx0, paidDate: '2026-04-10', submittedDate: '2026-04-01', certifiedDate: '2026-04-05', approvedDate: null, advanceRecoveryAmount: 0, retentionAmount: 0, ...o })
const base = (o = {}) => ({ contracts: [con()], amendments: [{ id: 'a', contractId: 'C1', amount: 100, daysDelta: 0, voidedAt: null }], certificates: [cert(), cert({ certifiedAmount: 300, paidAmount: 250 })], payments: [], guarantees: [], claims: [], clearances: [],
  bac: 2000, annual: null, linesTotal: 1500, land: { approved: 500, approved_source: 'finance', paid: 100, voided: 0, committed_unpaid: 150, exposure: 250, remaining: 250 },
  changes: [{ id: 'r1', contractId: 'C1', status: 'awaiting_approval', proposedAmount: 200 }, { id: 'r2', contractId: 'C1', status: 'approved', proposedAmount: 900 }],
  plans: [], manualForecasts: [], physical: 30, thresholds: DEFAULT_THRESHOLDS, today: '2026-06-10', ...o })

const k = projectKpis(base())
assert.equal(k.valueOriginal, 1000); assert.equal(k.valueCurrent, 1100); assert.equal(k.growthPct, 10)
assert.equal(k.committedContracts, 1100); assert.equal(k.landExposure, 250); assert.equal(k.committed, 1350); assert.equal(k.committedPct, 67.5)
assert.equal(k.vac, 650); assert.equal(k.remaining, 650); assert.equal(k.unallocated, 500)
assert.equal(k.paid, 340 + 100); assert.equal(k.certified, 400 + 100)
assert.equal(k.pendingChanges, 1); assert.equal(k.pendingChangesAmount, 200)
// physical vs financial: certified on contracts 400/1100 = 36.4%; physical 30 -> paying ahead by 6.4 points
assert.equal(k.financialPct, 36.4); assert.equal(k.gapPct, 6.4)
// CPI = earned value (bac x 30% = 600) / certified on contracts (400)
assert.equal(k.cpi, 1.5)
assert.equal(projectKpis(base({ physical: null })).cpi, null); assert.equal(projectKpis(base({ physical: null })).gapPct, null)
assert.equal(projectKpis(base({ bac: 0 })).committedPct, null); assert.equal(projectKpis(base({ bac: 0 })).vac, 0)
// the forecast curve gives a next-3-months need for the unpaid remainder
const nowIdx = isoMonthIdx('2026-06-10')
assert.ok(projectKpis(base()).cashNext3 > 0)
assert.ok(nowIdx > 0)
// tones
assert.equal(toneOf.committedPct(95, DEFAULT_THRESHOLDS), 'warn'); assert.equal(toneOf.committedPct(101, DEFAULT_THRESHOLDS), 'bad'); assert.equal(toneOf.committedPct(40, DEFAULT_THRESHOLDS), 'good')
assert.equal(toneOf.cpi(0.85), 'bad'); assert.equal(toneOf.cpi(0.95), 'warn'); assert.equal(toneOf.cpi(1.1), 'good'); assert.equal(toneOf.gap(-20), 'bad')
assert.equal(toneOf.vac(-1, 100), 'bad'); assert.equal(toneOf.growth(25, DEFAULT_THRESHOLDS), 'bad')
// completed contract without an issued clearance and with unrecovered advance
const done = projectKpis(base({ contracts: [con({ status: 'completed', advancePaymentPercent: 10 })] }))
assert.equal(done.clearancesMissing, 1); assert.ok(done.advanceOpen > 0)
console.log('finance kpis ok')
