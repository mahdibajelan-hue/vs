import assert from 'node:assert/strict'
import { periodOf, periodOfDate, recentPeriods, buildE, buildP, buildC, withPrevious, totals, seqFor, DEFAULT_ENG_SPLIT } from './stmtCore.ts'

// Jalali months
const mehr = periodOf('1405-07')
assert.equal(mehr.from, '2026-09-23'); assert.equal(mehr.to, '2026-10-22')
assert.equal(periodOfDate('2026-10-27').key, '1405-08')
assert.deepEqual(recentPeriods('2026-04-01', 3).map((p) => p.key), ['1405-01', '1404-12', '1404-11'])

// E: 60 % on IFR, 40 % on approval; superseded and other contracts' documents are left out; unpriced ones warned
const doc = (id, price, prep, appr, extra = {}) => ({ id, docNo: 'D-' + id, title: 'مدرک ' + id, discipline: 'فرایند', status: 'issued', price, actualPrepared: prep, actualApproved: appr, contract: 'C1', ...extra })
const e = buildE([doc('1', 1000, '2026-09-01', null), doc('2', 2000, '2026-09-01', '2026-10-01'), doc('3', 500, '2026-11-01', null), doc('4', 0, null, null), doc('5', 900, '2026-01-01', null, { status: 'superseded' }), doc('6', 700, '2026-01-01', null, { contract: 'C2' })], DEFAULT_ENG_SPLIT, mehr.to, 'C1')
assert.deepEqual(e.lines.map((l) => [l.sourceId, l.sysCumAmount]), [['1', 600], ['2', 2000], ['3', 0]])
assert.equal(e.warnings.length, 1)
// approval without a recorded IFR date still counts the IFR share
assert.equal(buildE([doc('7', 100, null, '2026-09-30')], DEFAULT_ENG_SPLIT, mehr.to, 'C1').lines[0].sysCumAmount, 100)

// P: sequence per item > per group > contract default; quantity capped at the contract quantity
const seqs = [{ id: 'd', title: 'پیش‌فرض', groupId: null, materialId: null, steps: [{ stage: 'po_issue', pct: 10 }, { stage: 'site_receipt', pct: 80 }, { stage: 'entry_inspection', pct: 10 }] },
  { id: 'g', title: 'لوله', groupId: 'G1', materialId: null, steps: [{ stage: 'manufacturing', pct: 30 }, { stage: 'site_receipt', pct: 70 }] }]
const items = [{ id: 'm1', code: 'V-1', title: 'شیر', unit: 'عدد', groupId: null, groupTitle: 'شیرآلات', qty: 10, unitPrice: 100 },
  { id: 'm2', code: 'P-1', title: 'لوله', unit: 'متر', groupId: 'G1', groupTitle: 'لوله', qty: 100, unitPrice: 50 }]
assert.equal(seqFor(items[1], seqs).id, 'g'); assert.equal(seqFor(items[0], seqs).id, 'd')
const p = buildP(items, new Map([['m1', { po_issue: 10, site_receipt: 4, entry_inspection: 2 }], ['m2', { manufacturing: 120, site_receipt: 40 }]]), seqs)
// m1: 10%·10·100 + 80%·4·100 + 10%·2·100 = 100 + 320 + 20 = 440 ; m2: 30%·100·50 (capped) + 70%·40·50 = 1500 + 1400 = 2900
assert.deepEqual(p.lines.map((l) => Math.round(l.sysCumAmount)), [440, 2900])
assert.equal(p.warnings.length, 0)
assert.equal(buildP(items, new Map(), [seqs[1]]).warnings.length, 1, 'item without a sequence is reported')

// C: approved quantity × unit price; over-contract rows flagged
const c = buildC([{ activityId: 'a1', itemNo: '01', title: 'جوشکاری', unit: 'سرجوش', chapter: 'فصل ۱', unitPrice: 10, base: 100, cum: 120, pending: 5 }, { activityId: 'a2', itemNo: '02', title: 'خاکبرداری', unit: 'm3', chapter: 'فصل ۲', unitPrice: 2, base: 50, cum: 0, pending: 0 }], 2)
assert.equal(c.lines.length, 1); assert.equal(c.lines[0].sysCumAmount, 1200); assert.equal(c.warnings.length, 2)

// previous statement: the period is cumulative − previous; never below the previous; orphan lines kept
const prevLines = [{ ...e.lines[0], cumAmount: 600 }, { ...e.lines[1], cumAmount: 2400 }, { sourceKind: 'doc', sourceId: 'gone', cumAmount: 300, code: 'X', title: 'حذف‌شده', unit: '٪', groupLabel: 'فرایند', unitPrice: 1, baseQty: 100, baseAmount: 300 }]
const w = withPrevious(e.lines, prevLines)
assert.deepEqual(w.map((l) => [l.sourceId, l.prevAmount, l.cumAmount]), [['1', 600, 600], ['2', 2400, 2400], ['3', 0, 0], ['gone', 300, 300]])
assert.equal(w[1].detail.belowPrev, true)

// totals + deductions (advance recovery stops at what is left of the advance)
const t = totals([{ sysCumAmount: 1000, cumAmount: 1000, prevAmount: 0 }, { sysCumAmount: 3000, cumAmount: 3000, prevAmount: 1000 }], { advRecoveryPct: 10, retPct: 5, taxPct: 2.5, insPct: 5 }, 3500, 150)
assert.equal(t.thisAmount, 3000); assert.equal(t.overCap, 500); assert.equal(t.capLeft, -500)
assert.deepEqual(t.deductions, { advance: 150, retention: 150, tax: 75, insurance: 150, total: 525 })
assert.equal(t.payable, 2475)
console.log('statements/core: all assertions passed')
