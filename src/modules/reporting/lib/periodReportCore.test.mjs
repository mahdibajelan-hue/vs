import assert from 'node:assert/strict'
import { buildExecutiveSummary, buildSiteReport, periodOf, shiftPeriod } from './periodReportCore.ts'
import { today, facts } from './analyticsFixture.mjs'

/* periods: a day; Saturday to the date; the Jalali month to the date */
assert.deepEqual(periodOf('daily', '2026-10-27').from, '2026-10-27')
assert.equal(periodOf('daily', '2026-10-27').prevFrom, '2026-10-26')
const w = periodOf('weekly', '2026-10-27') // a Tuesday → week from Saturday 24 Oct
assert.equal(w.from, '2026-10-24')
assert.equal(w.prevFrom, '2026-10-17')
assert.equal(w.prevTo, '2026-10-23')
const m = periodOf('monthly', '2026-10-27') // 5 Aban 1405 → month from 1 Aban = 23 Oct
assert.equal(m.from, '2026-10-23')
assert.equal(m.prevFrom, '2026-09-23') // 1 Mehr
assert.equal(m.prevTo, '2026-10-22') // 30 Mehr

assert.equal(shiftPeriod('monthly', '2026-10-27', -1), '2026-10-22') // last day of Mehr
assert.equal(shiftPeriod('monthly', '2026-10-22', 1), '2026-11-21') // last day of Aban
assert.equal(shiftPeriod('weekly', '2026-10-27', -1), '2026-10-20')

const F = facts('a', 'پروژه الف')
const site = {
  projectId: 'a', project: 'پروژه الف',
  reports: [
    { id: 'r1', formKey: 'welding', formTitle: 'گزارش روزانه جوشکاری', date: '2026-10-27', status: 'approved', front: 'A' },
    { id: 'r2', formKey: 'work', formTitle: 'گزارش کار روزانه', date: '2026-10-27', status: 'draft', front: 'A' },
    { id: 'r3', formKey: 'welding', formTitle: 'گزارش روزانه جوشکاری', date: '2026-10-26', status: 'approved', front: 'A' },
  ],
  production: [
    { date: '2026-10-27', formKey: 'welding', formTitle: 'گزارش روزانه جوشکاری', metric: 'تعداد سرجوش', group: '', unit: 'سرجوش', value: 12, approved: true },
    { date: '2026-10-26', formKey: 'welding', formTitle: 'گزارش روزانه جوشکاری', metric: 'تعداد سرجوش', group: '', unit: 'سرجوش', value: 8, approved: true },
  ],
  work: [
    { date: '2026-10-27', activityId: 'a1', activity: 'جوشکاری خط', chapter: 'خط', unit: 'm', baseQty: 1000, qty: 100, approvedQty: 90, unitPrice: 10, weight: 20 },
    { date: '2026-10-20', activityId: 'a1', activity: 'جوشکاری خط', chapter: 'خط', unit: 'm', baseQty: 1000, qty: 50, approvedQty: 50, unitPrice: 10, weight: 20 },
  ],
  resources: [
    { date: '2026-10-27', kind: 'man', name: 'جوشکار', section: 'جوش', total: 10, active: 8, idle: 2, stopped: 0, repair: 0 },
    { date: '2026-10-27', kind: 'man', name: 'کارگر', section: 'عمومی', total: 20, active: 20, idle: 0, stopped: 0, repair: 0 },
    { date: '2026-10-26', kind: 'man', name: 'کارگر', section: 'عمومی', total: 15, active: 15, idle: 0, stopped: 0, repair: 0 },
  ],
  stoppages: [{ date: '2026-10-27', category: 'شرایط جوی', hours: 3, responsibility: 'force_majeure', critical: false, description: 'باد' }],
  qc: [{ createdAt: '2026-10-25T08:00:00Z', closedAt: null, severity: 'high', status: 'open', kind: 'جوش', note: 'ترک' }],
  docs: [
    { docNo: 'D1', title: 'نقشه', discipline: 'لوله', status: 'approved', plannedPrepared: null, actualPrepared: '2026-10-20', plannedApproved: '2026-10-25', actualApproved: '2026-10-27', critical: false },
    { docNo: 'D2', title: 'محاسبات', discipline: 'لوله', status: 'draft', plannedPrepared: null, actualPrepared: null, plannedApproved: '2026-10-10', actualApproved: null, critical: true },
  ],
  materials: [{ date: '2026-10-27', kind: 'issue', kindLabel: 'حواله مصرف', qty: 5, material: 'لوله', unit: 'شاخه', status: 'posted' }],
  receipts: [], shipments: [{ number: 'S1', date: '2026-10-01', eta: '2026-10-20', ata: null, status: 'in_transit', origin: 'بندر' }], orders: [], discrepancies: [],
  certificates: [{ number: 'C1', contract: 'EPC', date: '2026-10-25', gross: 100, certified: 90, paid: 0, status: 'certified' }],
  payments: [{ date: '2026-10-26', amount: 40, contract: 'EPC' }],
  facts: F,
}

/* daily */
const d = buildSiteReport('daily', '2026-10-27', site, today)
const t = (r, k) => r.tiles.find((x) => x.key === k)
assert.equal(d.title, 'گزارش روزانهٔ کارگاه')
assert.ok(!t(d, 'finance'), 'the daily report has no finance tile')
assert.equal(t(d, 'man').headline.value, '۳۰') // 10 + 20 on the day
assert.equal(t(d, 'stoppages').headline.value, '۳')
assert.equal(t(d, 'work').headline.value, '۱٬۰۰۰') // 100 × 10
assert.equal(t(d, 'engineering').stats.find((s) => s.label === 'معوق تا پایان دوره').value, '۱')
assert.equal(t(d, 'engineering').tone, 'bad') // the overdue document is critical
assert.equal(t(d, 'materials').stats.find((s) => s.label === 'محمولهٔ دیرکرد').value, '۱')
assert.equal(t(d, 'quality').headline.value, '۱')
assert.equal(t(d, 'compliance').headline.sub.startsWith('۱'), true) // one draft
assert.ok(d.highlights.some((h) => h.tone === 'bad'))
// the production row carries the previous day and the cumulative figure
const prodRow = t(d, 'production').detail[0].rows[0]
assert.deepEqual(prodRow.slice(3, 6), ['۱۲', '۸', '۲۰'])

/* weekly — the week from Saturday 24 Oct: finance is in, the day series covers 4 days */
const wk = buildSiteReport('weekly', '2026-10-27', site, today)
assert.ok(t(wk, 'finance'))
assert.equal(t(wk, 'finance').headline.value, '۴۰')
assert.equal(t(wk, 'man').chart.items.length, 4)
assert.equal(t(wk, 'man').headline.value, '۲۲٫۵') // (30 + 15) / 2 days with reports
assert.equal(t(wk, 'work').headline.value, '۱٬۰۰۰') // 20 Oct falls in the previous week
assert.ok(t(wk, 'decisions'))

/* a project with no site data: empty tiles say so instead of zeros */
const bare = buildSiteReport('daily', '2026-10-27', { ...site, reports: [], production: [], work: [], resources: [], stoppages: [], qc: [], docs: null, materials: null, receipts: null, shipments: null, orders: null, discrepancies: null, certificates: null, payments: null }, today)
for (const k of ['production', 'work', 'man', 'equip', 'engineering', 'materials', 'compliance']) assert.ok(t(bare, k).empty, `${k} is empty`)
assert.equal(t(bare, 'stoppages').headline.value, '۰')

/* management summary */
const ex = buildExecutiveSummary('monthly', '2026-10-27', [F, facts('b', 'پروژه ب')], 'همهٔ پروژه‌ها', today)
assert.equal(ex.kind, 'executive')
assert.equal(t(ex, 'health').headline.value, '۲') // both fixtures are «black»
assert.ok(ex.tiles.some((x) => x.projectId === 'b'))
assert.equal(t(ex, 'decisions').headline.value, '۲')
assert.ok(ex.highlights.length >= 2)

console.log('reporting/periodReportCore: all assertions passed')
