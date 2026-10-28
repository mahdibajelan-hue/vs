import assert from 'node:assert/strict'
import { buildEvidenceReport } from './evidenceReport.ts'
import { answer, detectIntent, normalise, resolveScope } from './assistantCore.ts'

const today = '2026-10-28'
const mk = (id, name, lc, o = {}) => {
  const input = {
    today, project: name,
    metrics: { asOf: '2026-10-27', lifecycle: lc, evm: { bac: 1000, spi: 0.9, cpi: o.cpi ?? 0.95, eac: 1050, vac: -50 }, curve: [], planFinish: '2027-06-01', health: { status: 'red', drivenBy: null, blockers: [], dims: [] }, delays: [] },
    risks: [{ id: `r-${id}`, title: `ریسک ${name}`, status: 'open', score: 20, level: 'critical', owner: null, identifiedDate: '2026-03-01', assessments: [] }],
    riskActions: [], issues: [],
    actions: [{ id: `x-${id}`, title: 'اجرای مصوبه', status: 'in_progress', priority: 'high', dueDate: '2026-11-10', owner: null, relatedRiskId: null, relatedIssueId: null, createdAt: '', updatedAt: '', sourceDecisionId: `dA-${id}` }],
    decisions: [
      { id: `d-${id}`, title: `تأیید پیمانکار ${name}`, status: 'pending', requiredBy: '2026-10-15', owner: 'مدیرعامل', createdAt: '2026-09-20' },
      { id: `dA-${id}`, title: `خرید اضطراری ${name}`, status: 'approved', requiredBy: null, owner: null, createdAt: '2026-09-01' },
    ],
    portfolio: null, sourceDates: [], previous: null,
    periodDelays: { from: '2026-09-28', to: today, items: [{ date: '2026-10-05', label: 'کمبود مصالح', hours: 60, responsibility: 'contractor', critical: true }, { date: '2026-10-06', label: 'کمبود مصالح', hours: 30, responsibility: 'contractor', critical: true }, { date: '2026-10-07', label: 'کمبود مصالح', hours: 30, responsibility: 'contractor', critical: true }] },
  }
  return {
    id, name, program: o.program ?? null, portfolio: null, location: o.location ?? '', projectType: 'EPC', contractType: '', contractor: null, contractValue: 1000, manager: 'م',
    phase: { code: 'EPC', title: 'اجرا' },
    disciplines: [{ key: 'procurement', actual: 40, planned: 60, weight: 0.35 }, { key: 'construction', actual: 20, planned: 30, weight: 0.5 }],
    issues: [{ id: `i-${id}`, title: 'تأخیر حمل کالا', status: 'open', priority: 'critical', category: 'تأمین کالا', due: '2026-10-01', createdAt: '2026-10-01', closedAt: null, owner: null }],
    changes: [], input, report: buildEvidenceReport(input),
  }
}
const W = { id: 'pw', name: 'توسعه شبکه غرب' }
const list = [
  mk('a', 'توسعه شبکه توزیع منطقه غرب - فاز ۱', { actual: 30, planned: 50 }, { program: W }),
  mk('b', 'توسعه شبکه توزیع منطقه غرب - فاز ۲', { actual: 40, planned: 45 }, { program: W }),
  mk('c', 'واحد بازیافت گوگرد', { actual: 60, planned: 61 }, { cpi: 0.7 }),
  mk('d', 'ایستگاه تقویت فشار شماره ۳', { actual: 10, planned: 25 }, { location: 'کرمانشاه — غرب' }),
]

assert.equal(normalise('پروژه‌هاي ۳'), 'پروژه های 3')
/* the six reference questions map to their intents */
assert.equal(detectIntent('سه پروژه با بیشترین انحراف زمانی کدام‌اند؟'), 'top_schedule')
assert.equal(detectIntent('مهم‌ترین علل عقب‌ماندگی پروژه‌های غرب کشور چیست؟'), 'causes')
assert.equal(detectIntent('کدام مسائل باز بیشترین تأثیر را بر پیشرفت پروژه‌ها دارند؟'), 'issues_impact')
assert.equal(detectIntent('وضعیت پروژه‌های بحرانی را برای جلسه مدیرعامل خلاصه کن.'), 'brief')
assert.equal(detectIntent('چه تصمیماتی هنوز اجرا نشده‌اند و چه پیامدی دارند؟'), 'decisions')
assert.equal(detectIntent('چه اقداماتی برای کاهش انحراف پروژه پیشنهاد می‌شود؟'), 'suggest')

/* top 3 by schedule: worst gap first, numbers from the facts */
const a1 = answer('سه پروژه با بیشترین انحراف زمانی کدام‌اند؟', list)
assert.equal(a1.lines.length, 3)
assert.ok(a1.lines[0].text.includes('فاز ۱') && a1.lines[0].text.includes('۲۰'))
assert.ok(a1.lines[1].text.includes('ایستگاه'))
assert.ok(a1.lines.every((l) => l.evidence.length))
assert.equal(a1.table.rows.length, 3)
assert.equal(a1.scope.matchedBy, 'all')

/* region scope: name, location and program are searched; the caveat says so */
const a2 = answer('مهم‌ترین علل عقب‌ماندگی پروژه‌های غرب کشور چیست؟', list)
assert.equal(a2.scope.matchedBy, 'region')
assert.deepEqual(a2.scope.projectIds.sort(), ['a', 'b', 'd'])
assert.ok(a2.lines[0].text.includes('کمبود مصالح') || a2.lines[0].text.includes('عقب‌ماندگی'))
assert.ok(a2.caveats.some((c) => c.includes('منطقه')))
assert.ok(a2.caveats.some((c) => c.includes('اثبات')))

/* follow-up reuses the previous scope */
const a3 = answer('برای همین پروژه‌ها چه اقداماتی پیشنهاد می‌شود؟', list, a2.context)
assert.equal(a3.scope.matchedBy, 'context')
assert.equal(a3.intent, 'suggest')
assert.ok(a3.lines.length > 0 && a3.lines.every((l) => !l.text.includes('گوگرد')))
assert.ok(a3.caveats.some((c) => c.includes('پیشنهاد سامانه')))

/* program and project names */
assert.equal(resolveScope('وضعیت طرح توسعه شبکه غرب', list, null).matchedBy, 'program')
const one = resolveScope('وضعیت واحد بازیافت گوگرد چطور است', list, null)
assert.deepEqual(one.projectIds, ['c'])

/* decisions: pending past date and approved-but-unexecuted */
const a4 = answer('چه تصمیماتی هنوز اجرا نشده‌اند و چه پیامدی دارند؟', list)
assert.ok(a4.lines.some((l) => l.text.includes('موعد') && l.text.includes('گذشته')))
assert.ok(a4.lines.some((l) => l.text.startsWith('مصوب ولی اجرانشده')))

/* issues impact: critical + overdue + in a lagging discipline's area */
const a5 = answer('کدام مسائل باز بیشترین تأثیر را بر پیشرفت پروژه‌ها دارند؟', list)
assert.ok(a5.lines[0].text.includes('تأمین کالا') && a5.lines[0].text.includes('معوق'))

/* brief */
const a6 = answer('وضعیت پروژه‌های بحرانی را برای جلسه مدیرعامل خلاصه کن.', list)
assert.ok(a6.lines[0].text.includes('۴ پروژه بررسی شد'))
assert.ok(a6.lines.some((l) => l.id === 'b-d'))

/* cost ranks by CPI */
assert.ok(answer('کدام پروژه بیشترین انحراف هزینه را دارد', list).lines[0].text.includes('گوگرد'))

/* unknown scope and unknown intent are said plainly */
assert.ok(answer('وضعیت پروژه شرق', list).lines[0].text.includes('پیدا نشد'))
assert.equal(answer('سلام', list).intent, 'unknown')
console.log('assistantCore ok')
