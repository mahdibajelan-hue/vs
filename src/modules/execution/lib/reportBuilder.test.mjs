import assert from 'node:assert/strict'
import { buildReport, narrow, renderReportHtml, typeOf } from './reportBuilder.ts'
import { monthOf } from './periods.ts'

const act = (id, itemNo, base) => ({ id, itemNo, title: `فعالیت ${itemNo}`, unit: 'm', baseQty: base, unitPrice: 1000, weight: 50, weightGroup: 'C', active: true, approval: 'approved', sort: 0, plannedStart: '2026-09-23', plannedEnd: '2026-10-22' })
const activities = [act('a1', 'C-01', 1000), act('a2', 'C-02', 500)]
const rep = (id, date, front, status = 'approved') => ({ id, projectId: 'p', formKey: 'work', reportDate: date, front, station: '', status, contractorOrgId: null })
const reports = [rep('r1', '2026-09-20', 'F1'), rep('r2', '2026-10-01', 'F1'), rep('r3', '2026-10-02', 'F2'), rep('r4', '2026-10-25', 'F1'), rep('r5', '2026-10-05', 'F2', 'submitted')]
const line = (id, reportId, activityId, qty, status = 'approved', approvedQty = qty) => ({ id, reportId, activityId, qty, status, approvedQty, detail: {}, lineNo: 1, location: '', kmFrom: null, kmTo: null })
const lines = [line('l1', 'r1', 'a1', 100), line('l2', 'r2', 'a1', 50), line('l3', 'r3', 'a1', 30, 'approved', 25), line('l4', 'r3', 'a2', 40), line('l5', 'r4', 'a1', 70), line('l6', 'r5', 'a2', 9, 'pending', null)]
const ctx = { activities, reports, lines, resources: [{ reportId: 'r2', kind: 'man', name: 'جوشکار', activeQty: 10, idleQty: 1, leaveQty: 0, stoppedQty: 0, repairQty: 0, hours: 100 }], stoppages: [{ reportId: 'r3', category: 'weather', hours: 4 }],
  baselines: [], blines: [], baseOf: (a) => a.baseQty, employer: 'off' }

const mehr = monthOf('2026-10-01') // 2026-09-23 … 2026-10-22
const r = buildReport(ctx, mehr, typeOf('monthly'), typeOf('monthly').sections)
const vol = r.tables.find((t) => t.key === 'volumes')
const a1 = vol.rows.find((row) => row[0].v === 'C-01')
// period = 50 + 25 (cut), prev = 100, cumulative = 175; the Aban report (70) is outside the period
assert.equal(a1[4].v, 100); assert.equal(a1[5].v, 75); assert.equal(a1[8].v, 175)
const a2 = vol.rows.find((row) => row[0].v === 'C-02')
assert.equal(a2[5].v, 40); assert.equal(a2[6].v, 9) // pending kept apart
assert.ok(r.kpis.some((k) => k.label.includes('پیشرفت واقعی')))

// filters act on the source rows: front F2 only
const f2 = buildReport(ctx, mehr, typeOf('front'), ['volumes'], { front: 'F2' })
assert.equal(f2.tables[0].rows.find((row) => row[0].v === 'C-01')[5].v, 25)
assert.equal(narrow(ctx, { activityIds: ['a2'] }).lines.every((l) => l.activityId === 'a2'), true)

// payable section from the server basis
const pay = buildReport(ctx, mehr, typeOf('payable'), ['payable'], {}, [{ activityId: 'a1', qty: 175, unitPrice: 1000 }])
assert.equal(pay.tables[0].rows[0][5].v, 175000)

// document control on the page
const meta = { projectName: 'پروژهٔ آزمون', projectCode: 'T', headerLines: ['شرکت آزمون'], docNo: 'T-EX-MON-0001', revision: 1, status: 'superseded', issueDate: '۱۴۰۵/۰۸/۰۱', prepared: 'الف', checked: 'ب', approved: '', distribution: 'کارفرما', attachments: '', footer: '', history: [{ revision: 0, date: '۱۴۰۵/۰۷/۳۰', reason: '', status: 'superseded' }, { revision: 1, date: '۱۴۰۵/۰۸/۰۱', reason: 'اصلاح', status: 'superseded' }] }
const html = renderReportHtml(r, meta)
for (const s of ['T-EX-MON-0001', 'بازنگری', 'تهیه‌کننده', 'بررسی‌کننده', 'تأییدکننده', 'کنترل مدرک', 'توزیع', 'منسوخ', 'کنترل پروژهٔ پیمانکار', 'نمایندهٔ کارفرما', '<thead><tr><td>']) assert.ok(html.includes(s), s)
assert.ok(!renderReportHtml(r, { ...meta, docNo: '<script>' }).includes('<script>'))

// the daily report is the contractor's DR: progress, operations, manpower / machinery bands, next day — no hydrotest sheet
const daily = typeOf('daily')
assert.deepEqual(daily.sections, ['dr_progress', 'dr_ops', 'dr_man', 'dr_equip', 'dr_next'])
const dctx = { ...ctx, reports: [...reports, { ...rep('r6', '2026-10-01', 'F2'), data: { weather: 'rainy', ops: ['حفاری'], nextDay: { rows: [{ op: 'ریسه', kmFrom: 1.284, qty: 10 }] } } }] }
const dr = buildReport(dctx, { kind: 'day', key: 'd', from: '2026-10-01', to: '2026-10-01', label: 'x' }, daily, daily.sections)
assert.equal(dr.tables.find((t) => t.key === 'dr_progress').rows.find((row) => row[1].v === 'فعالیت C-01')[7].v, 50)
assert.ok(dr.tables.find((t) => t.key === 'dr_man').bands.bands.flat().some((x) => x.name === 'جوشکار' && x.vals[1] === 10))
assert.equal(dr.tables.find((t) => t.key === 'dr_next').rows[0][1].v, '1+284')
assert.ok(dr.header.some((h) => h.value === 'بارانی'))
const drHtml = renderReportHtml(dr, { ...meta, docNo: '', status: 'preview', parties: { employer: { name: 'کارفرما', logo: 'data:image/png;base64,AA' } } })
assert.ok(drHtml.includes('class="band"') && drHtml.includes('section class="pg"') && drHtml.includes('data:image/png;base64,AA'))
assert.ok(!/هیدرواستاتیک/.test(dr.tables.map((t) => t.title).join()))
console.log('reportBuilder: ok')
