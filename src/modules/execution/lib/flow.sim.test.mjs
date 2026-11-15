// Randomised end-to-end checks of the execution figures: the same daily reports, run through every place that reports
// on them (progress, period reports, work-done statement, action → price-row conversion), must tell the same story.
import assert from 'node:assert/strict'
import { cumulative, physicalProgress, effectiveBase } from './progress.ts'
import { buildStatement } from './statement.ts'
import { activityRows } from './periodReport.ts'
import { monthOf, weekOf, addDays, periodsBetween } from './periods.ts'
import { resolveLines } from './workActions.ts'

let seed = 1
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const r2 = (x) => Math.round(x * 100) / 100
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)), `${msg}: ${a} ≠ ${b}`)

function world(s) {
  seed = s
  const start = '2026-03-21'
  const groups = ['line', 'stations']
  const activities = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, projectId: 'p', priceItemId: null, itemNo: `${100 + i}`, title: `row ${i}`, unit: 'm', chapter: `ch${i % 3}`, kind: 'standard', baseQty: r2(200 + rnd() * 2000), unitPrice: Math.round(1e5 + rnd() * 9e6), weight: 0, weightGroup: groups[i % 2], metric: '', area: '', front: '', station: '', kmFrom: null, kmTo: null, plannedStart: start, plannedEnd: addDays(start, 120 + Math.floor(rnd() * 200)), active: rnd() > 0.08, approval: rnd() > 0.05 ? 'approved' : 'pending', approvalNote: '', sort: i, note: '', rowNo: '', spec: '', remark: '', chapterNo: `${i % 3}`, bookId: i < 8 ? 'b1' : 'b2', parentActivityId: null, surchargePct: null }))
  for (const g of groups) { const xs = activities.filter((a) => a.weightGroup === g); xs.forEach((a) => { a.weight = r2(100 / xs.length) }); xs[0].weight = r2(100 - xs.slice(1).reduce((s, a) => s + a.weight, 0)) }
  // a revised baseline from day 60: some quantities and prices change
  const baselines = [{ id: 'bl1', projectId: 'p', version: 1, status: 'approved', reason: '', effectiveDate: addDays(start, 60), createdAt: '', approvedAt: '' }]
  const blines = activities.filter(() => rnd() > 0.5).map((a, i) => ({ id: `bl${i}`, baselineId: 'bl1', activityId: a.id, itemNo: a.itemNo, title: a.title, unit: a.unit, baseQty: r2(a.baseQty * (0.8 + rnd() * 0.5)), weight: a.weight, unitPrice: Math.round(a.unitPrice * (0.9 + rnd() * 0.3)), weightGroup: a.weightGroup, active: a.active }))
  const statuses = ['draft', 'submitted', 'partially_approved', 'approved', 'approved', 'approved', 'returned', 'rejected', 'incomplete']
  const reports = [], lines = []
  for (let d = 0; d < 150; d++) {
    const date = addDays(start, d)
    for (const front of ['north', 'south']) {
      if (rnd() < 0.25) continue
      const id = `r${reports.length}`, status = pick(statuses)
      reports.push({ id, projectId: 'p', formKey: 'work', reportNo: `WRK-${reports.length}`, reportDate: date, contractorOrgId: null, front, station: '', shift: 'day', status, data: {}, notes: '', missing: [], completionOf: null, dueDate: null, createdBy: null, createdAt: '', submittedBy: null, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: '' })
      const n = 1 + Math.floor(rnd() * 4)
      for (let k = 0; k < n; k++) {
        const byAction = rnd() < 0.2
        const qty = r2(rnd() * 25)
        const ls = status === 'approved' ? pick(['approved', 'approved', 'approved', 'rejected']) : status === 'partially_approved' ? pick(['approved', 'pending', 'rejected']) : status === 'returned' ? 'returned' : status === 'rejected' ? 'rejected' : 'pending'
        const approvedQty = ls === 'approved' ? (rnd() < 0.3 ? r2(qty * (0.5 + rnd() * 0.5)) : null) : null
        const emp = ls === 'approved' ? pick([null, 'approved', 'approved', 'rejected']) : null
        lines.push({ id: `l${lines.length}`, reportId: id, lineNo: k, activityId: byAction ? null : pick(activities).id, qty, kmFrom: null, kmTo: null, location: '', note: '', detail: byAction ? { actionKey: pick(['welding', 'trench']), wall: pick(['0.625', '0.750']), widthM: r2(0.5 + rnd()) } : {}, status: ls, approvedQty, reviewNote: '', sourceReportId: null, employerStatus: emp, employerQty: emp === 'approved' ? r2((approvedQty ?? qty) * (0.7 + rnd() * 0.3)) : null })
      }
    }
  }
  const rules = [{ id: 'x1', actionKey: 'welding', activityId: 'a1', factor: 1, whenField: '', whenValue: '', note: '' }, { id: 'x2', actionKey: 'welding', activityId: 'a2', factor: 2, whenField: 'wall', whenValue: '0.750', note: '' }, { id: 'x3', actionKey: 'trench', activityId: 'a3', factor: 1, whenField: '', whenValue: '', note: '', multFields: 'widthM' }]
  return { start, activities, baselines, blines, reports, lines, rules, end: addDays(start, 149) }
}

for (const s of [3, 17, 101, 2024, 77777]) {
  const w = world(s)
  const res = resolveLines(w.lines, w.rules, [])
  // 1) every line entered by action becomes a priced line with the rule's quantity; approved quantity scales the same way
  for (const [i, l] of res.lines.entries()) {
    const o = w.lines[i]
    if (o.activityId) { assert.equal(l, o); continue }
    const k = l.qty / (o.qty || 1)
    if (o.qty) { if (o.approvedQty != null) near(l.approvedQty, o.approvedQty * k, `approved scale ${s}`); }
    assert.ok(l.activityId, `mapped ${s}`)
  }
  const lines = res.lines
  for (const employer of ['off', 'binding']) {
    // 2) the statement to a date = the cumulative approved quantity to that date, row by row, priced at the price in force
    for (const p of periodsBetween('month', w.start, w.end, 0)) {
      const baseOf = (a, d) => effectiveBase(a, w.baselines, w.blines, d).baseQty
      const st = buildStatement({ activities: w.activities, reports: w.reports, lines, baselines: w.baselines, blines: w.blines }, p, baseOf, () => '', 0, { employer })
      const cum = cumulative(w.reports, lines, { until: p.to, mode: 'approved', employer })
      const before = cumulative(w.reports, lines, { before: p.from, mode: 'approved', employer })
      for (const ch of st.books.flatMap((b) => b.chapters)) for (const r of ch.rows) {
        near(r.cum, cum.get(r.activity.id) ?? 0, `statement cum ${s}/${employer}/${p.key}/${r.activity.id}`)
        near(r.prev + r.period, r.cum, `prev + period = cum ${s}`)
        near(r.cumAmt, r.cum * r.unitPrice, `cum amount ${s}`)
        near(r.unitPrice, effectiveBase(r.activity, w.baselines, w.blines, p.to).unitPrice, `price in force ${s}/${r.activity.id}`)
        near(r.prev, before.get(r.activity.id) ?? 0, `prev ${s}`)
      }
      // rows the statement leaves out are those with nothing done — never an approved quantity
      const shown = new Set(st.books.flatMap((b) => b.chapters.flatMap((c) => c.rows.map((r) => r.activity.id))))
      for (const a of w.activities) if (a.approval === 'approved' && effectiveBase(a, w.baselines, w.blines, p.to).active && (cum.get(a.id) ?? 0) > 0) assert.ok(shown.has(a.id), `statement misses ${a.id} (${s}/${employer}/${p.key})`)
      // 3) the period report agrees with the statement on the approved cumulative
      const rows = activityRows({ activities: w.activities, reports: w.reports, lines, resources: [], stoppages: [] }, p, (a) => baseOf(a, p.to), employer)
      for (const r of rows) near(r.cumApproved, cum.get(r.activity.id) ?? 0, `period report cum ${s}/${employer}/${p.key}`)
      // 4) progress at the period's end counts the same quantities
      const pg = physicalProgress({ activities: w.activities, baselines: w.baselines, blines: w.blines, reports: w.reports, lines, asOf: p.to, mode: 'approved', employer })
      for (const r of pg.rows) near(r.cum, cum.get(r.activity.id) ?? 0, `progress cum ${s}`)
      assert.ok(pg.overall >= 0 && pg.overall <= 1, 'progress within 0..1')
    }
    // 5) weekly periods add up to the cumulative (no day lost or counted twice between weeks)
    const weeks = periodsBetween('week', w.start, w.end, 0)
    const total = new Map()
    for (const p of weeks) for (const r of activityRows({ activities: w.activities, reports: w.reports, lines, resources: [], stoppages: [] }, p, () => 1, employer)) total.set(r.activity.id, (total.get(r.activity.id) ?? 0) + r.approvedCounted)
    const all = cumulative(w.reports, lines, { until: w.end, mode: 'approved', employer })
    for (const [k, v] of all) near(total.get(k) ?? 0, v, `weeks add up ${s}/${employer}/${k}`)
  }
}
console.log('execution flow simulation: ok (5 random projects × 2 employer modes)')
