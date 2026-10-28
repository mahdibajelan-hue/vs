import assert from 'node:assert/strict'
import { compareProjects, deviations, earlyWarnings, projectLinear, rootCauses, suggestions, summarise } from './analyticsCore.ts'

import { today, curve, input, facts } from './analyticsFixture.mjs'

const A = facts('a', 'پروژه الف')

/* deviations: one row per domain, severity from thresholds, missing data is 'none' not zero */
const dv = deviations(A)
const by = (k) => dv.find((d) => d.key === k)
assert.equal(by('gap').severity, 'material') // −12 pp
assert.equal(by('gap').variance, -12)
assert.equal(by('spi').severity, 'material')
assert.equal(by('cpi').severity, 'material')
assert.equal(by('vac').severity, 'material') // −17.6 % ≥ 5
assert.equal(by('disc-engineering').severity, 'watch') // −5
assert.equal(by('disc-procurement').severity, 'material') // −30
assert.equal(by('changes').severity, 'watch') // 6 % of contract
assert.equal(by('risk').severity, 'material')
assert.equal(by('issues').variance, 2) // two important overdue
assert.equal(by('decisions').severity, 'material') // in_review past its date counts
assert.ok(dv.every((d) => d.definition && d.source))
const noEvm = facts('n', 'بدون EVM', { disciplines: [], changes: null, issues: null }, { metrics: { ...input().metrics, evm: null }, risks: null, periodDelays: null })
const dn = deviations(noEvm)
assert.equal(dn.find((d) => d.key === 'cpi').severity, 'none')
assert.equal(dn.find((d) => d.key === 'cpi').actual, '—')
assert.equal(dn.find((d) => d.key === 'risk').severity, 'none')

/* root causes: labelled by basis; the blocked gate is direct; shares add up from the project's weights */
const rc = rootCauses(A)
assert.equal(rc[0].basis, 'direct')
// a low-confidence report (thin or stale sources) lowers every cause by one step
assert.ok(rc.some((c) => c.key.startsWith('gate:') && c.confidence === (A.report.confidence === 'low' ? 'medium' : 'high')))
const sp = rc.find((c) => c.key === 'share:construction'), sp2 = rc.find((c) => c.key === 'share:procurement')
assert.ok(sp && sp2) // construction 0.5×−15 = −7.5, procurement 0.35×−30 = −10.5 (÷1)
assert.ok(sp2.text.includes('۱۰٫۵'))
const st = rc.find((c) => c.key === 'stop:کمبود مصالح')
assert.equal(st.basis, 'associated') // construction is behind
assert.equal(st.confidence, A.report.confidence === 'low' ? 'low' : 'medium') // 3 days, 92 % of hours
assert.ok(rc.some((c) => c.key === 'issues:procurement' && c.basis === 'associated'))
assert.ok(rc.some((c) => c.key === 'changes:days' && c.basis === 'direct'))
assert.ok(rc.some((c) => c.key === 'risk:r1' && c.basis === 'hypothesis' && c.confidence === 'low'))
assert.ok(rc.every((c) => c.check))

/* early warnings: rule vs statistical, each with reason, evidence and confidence */
const ew = earlyWarnings(A)
assert.ok(ew.some((w) => w.key === 'r-feed-procurement' && w.kind === 'rule'))
assert.ok(ew.some((w) => w.key === 'r-decision' && w.severity === 'high'))
assert.ok(ew.some((w) => w.key === 'r-issue-crit'))
assert.ok(ew.some((w) => w.key === 'r-stop-کمبود مصالح'))
const sg = ew.find((w) => w.key === 's-gap-finish')
assert.ok(sg && sg.kind === 'statistical' && sg.confidence === 'medium') // 6 monthly points
assert.ok(sg.evidence.some((e) => e.includes('برازش خطی')))
assert.ok(ew.every((w) => w.reason && w.evidence.length && w.suggestion))
// thin trend → no statistical projection
const thin = facts('t', 'کم‌داده', {}, { metrics: { ...input().metrics, curve: curve.slice(-2) } })
assert.ok(!earlyWarnings(thin).some((w) => w.key === 's-gap-finish'))
// linear projection
const pl = projectLinear([{ date: '2026-01-01', value: 0 }, { date: '2026-03-02', value: 4 }], '2026-05-01')
assert.ok(Math.abs(pl.value - 8) < 0.3)

/* suggestions: name the problem, cause, owner, due, consequence and kpi; an existing open action is shown */
const sug = suggestions(A)
assert.equal(sug[0].priority, 'critical')
assert.ok(sug.every((s) => s.action && s.kpi && s.consequence && s.due > today))
const proc = sug.find((s) => s.key === 'a-share:procurement')
assert.equal(proc.existing, 'پیگیری تأمین لوله') // matched by area words, not proposed blind
assert.equal(proc.owner, 'مدیر پروژه')
assert.ok(sug.some((s) => s.key === 'a-recovery' && s.origin === 'statistical'))

/* cross-project: ranks only inside a phase group; contractor link is a hypothesis */
const B = facts('b', 'پروژه ب', { contractor: 'C1' }, { metrics: { ...input().metrics, lifecycle: { actual: 30, planned: 40 } } })
const C = facts('c', 'پروژه ج', { contractor: 'C2', disciplines: [], phase: { code: 'FEED', title: 'مهندسی پایه' } }, { metrics: { ...input().metrics, lifecycle: { actual: 50, planned: 49 } } })
const D = facts('d', 'پروژه د', { contractor: 'C2', disciplines: [], phase: { code: 'FEED', title: 'مهندسی پایه' } }, { metrics: { ...input().metrics, lifecycle: { actual: 50, planned: 50 } } })
const cp = compareProjects([A, B, C, D])
assert.equal(cp.rows.find((r) => r.projectId === 'a').rankInGroup, 1)
assert.equal(cp.rows.find((r) => r.projectId === 'b').rankInGroup, 2)
assert.equal(cp.rows.find((r) => r.projectId === 'c').group, 'مرحلهٔ مهندسی پایه')
assert.ok(cp.patterns.some((p) => p.kind === 'cause' && p.text.includes('کمبود مصالح') && p.projects.length >= 2))
assert.ok(cp.patterns.some((p) => p.kind === 'category' && p.text.includes('تأمین کالا')))
const ctr = cp.patterns.find((p) => p.kind === 'contractor')
assert.ok(ctr && ctr.basis === 'hypothesis' && ctr.note.includes('همبستگی'))

/* summary */
const sm = summarise([A, B, C, D])
assert.equal(sm.projects, 4)
assert.equal(sm.critical[0].projectId, 'a')
assert.ok(sm.decisions[0].overdue)
console.log('analyticsCore ok')

/* no duplicates: one proposal per action text, the evidence report's gate cause not repeated */
{
  const two = facts('z', 'دو رشته', { issues: [
    { id: 'i1', title: 'تأخیر حمل لوله', status: 'open', priority: 'critical', category: 'تأمین کالا', due: '2026-10-01', createdAt: '2026-10-01', closedAt: null, owner: null },
    { id: 'i2', title: 'توقف نصب در کارگاه', status: 'open', priority: 'critical', category: 'اجرا', due: '2026-10-01', createdAt: '2026-10-01', closedAt: null, owner: null },
  ] })
  const ss = suggestions(two)
  assert.equal(ss.filter((s) => s.action.startsWith('جلسهٔ رفع مسائل')).length, 1)
  const cs = rootCauses(two)
  assert.equal(cs.filter((c) => c.text.includes('مجوز زیست‌محیطی')).length, 1)
}
console.log('analyticsCore dedupe ok')

/* CPI 0 (no earned value, cost recorded — an advance payment) is not a measured overrun */
{
  const z = facts('z0', 'پیش‌پرداخت', {}, { metrics: { ...input().metrics, evm: { bac: 1000, spi: 0.5, cpi: 0, eac: null, vac: null } } })
  const c = deviations(z).find((d) => d.key === 'cpi')
  assert.equal(c.severity, 'none'); assert.ok(c.note.includes('پیش‌پرداخت'))
  assert.ok(!suggestions(z).some((s) => s.key === 'a-cost'))
  assert.equal(compareProjects([z]).rows[0].cpi, null)
}
console.log('analyticsCore cpi ok')
