import assert from 'node:assert/strict'
import { achievements, budget, earnedScheduleDelay, locate, mapHeight, portfolioTrend, project, projectPlace, statusOf, warnings, weightedProgress, byGroup } from './dashboardCore.ts'

/* geography */
assert.equal(locate('پروژهٔ فرضی: خط انتقال گاز ۴۸ اینچ کوهدشت–سرخس').name, 'کوهدشت') // first named place
assert.equal(locate('فاز ۱۲ پارس جنوبی').province, 'بوشهر')
assert.equal(locate('استان خراسان رضوی').name, 'خراسان رضوی') // not «خراسان» of another
assert.equal(locate('توسعه شبکه توزیع منطقه غرب'), null) // a direction is not a place
assert.equal(projectPlace({ location: 'اهواز', name: 'خط کوهدشت' }).from, 'location')
const [x1, y1] = project(43.8, 39.9, 400), [x2, y2] = project(63.5, 24.9, 400)
assert.equal(Math.round(x1), 0); assert.equal(Math.round(y1), 0); assert.equal(Math.round(x2), 400); assert.ok(Math.abs(y2 - mapHeight(400)) < 1e-9)
const [tx] = project(51.39, 35.69, 400), [mx] = project(59.6, 36.3, 400)
assert.ok(mx > tx) // Mashhad east of Tehran

/* views */
const v = (id, o = {}) => ({ input: { id, name: `P${id}`, programId: o.prog ?? null, snapshot: o.snap === undefined ? { actual: 40, planned: 50, spi: 0.95, cpi: 1, bacEvm: 100, eac: 100, ac: 30, healthScore: 70, health: 'yellow', drivenBy: null, blockers: [], phase: null, trend: [] } : o.snap, delivery: o.del ?? null }, health: o.h ?? 'yellow', bac: 'bac' in o ? o.bac : 100, vac: o.vac ?? 0, eac: 100, priority: o.pr ?? null, lastDecision: o.ld ?? null })

const b = budget([v('a'), v('b', { bac: 300 }), v('c', { snap: null, bac: null })])
assert.equal(b.total, 400); assert.equal(b.absorbed, 60); assert.equal(b.remaining, 340); assert.equal(b.absorbedPct, 15); assert.equal(b.projectsWithBudget, 2)

const wp = weightedProgress([v('a'), v('b', { bac: 300, snap: { actual: 80, planned: 90, trend: [] } })])
assert.equal(wp.actual, (100 * 40 + 300 * 80) / 400)

/* earned schedule: plan reached 40 % on 15 Aug, measured on 30 Sep → 46 days */
const tr = [{ date: '2026-07-31', planned: 30, earned: 25 }, { date: '2026-08-31', planned: 50, earned: 32 }, { date: '2026-09-30', planned: 60, earned: 40 }]
const es = earnedScheduleDelay(tr)
assert.ok(Math.abs(es.days - 46) <= 1 && !es.lowerBound, JSON.stringify(es))
assert.deepEqual(earnedScheduleDelay([{ date: '2026-09-30', planned: 30, earned: 35 }]), { days: 0, lowerBound: false })
assert.equal(earnedScheduleDelay([{ date: '2026-08-31', planned: 50, earned: null }, { date: '2026-09-30', planned: 60, earned: 10 }]).lowerBound, true)
assert.equal(earnedScheduleDelay([]), null)

/* trend: weighted by EPC budget */
const pt = portfolioTrend([v('a', { snap: { bacEvm: 100, trend: [{ date: '2026-09-30', planned: 50, earned: 40 }] } }), v('b', { snap: { bacEvm: 300, trend: [{ date: '2026-09-30', planned: 70, earned: null }] } })])
assert.equal(pt[0].planned, 65); assert.equal(pt[0].earned, 40); assert.equal(pt[0].n, 2)

/* status, warnings, achievements */
assert.equal(statusOf(v('a', { h: 'black' })), 'critical'); assert.equal(statusOf(v('a', { h: 'unknown' })), 'unknown')
const w = warnings([v('a', { h: 'black', snap: { blockers: ['G5'], spi: 0.7, cpi: 0.85 }, vac: -15, bac: 100, del: { criticalMilestonesDelayed: 2 }, ld: { reviewBy: '2026-01-01' } })], '2026-10-29')
assert.deepEqual(w.map((x) => x.kind).sort(), ['افزایش هزینه', 'بازبینی تصمیم', 'تأخیر مایلستون', 'عقب‌ماندگی زمانی', 'پیش‌بینی بیش‌هزینه', 'گیت مسدود'].sort())
assert.equal(w[0].severity, 'high')
assert.ok(!warnings([v('z', { snap: { cpi: 0, spi: null } })], '2026-10-29').some((x) => x.kind === 'افزایش هزینه')) // CPI 0 is not measured
const ac = achievements([v('a', { snap: { spi: 1.1, cpi: 1.05, actual: 50, planned: 48 } }), v('b', { h: 'green', pr: 80 })])
assert.equal(ac.filter((x) => x.kind === 'achievement').length, 1); assert.equal(ac.filter((x) => x.kind === 'opportunity').length, 1)

const g = byGroup([v('a', { prog: 'x' }), v('b', { prog: 'x', h: 'red' }), v('c')], (x) => x.input.programId, (k) => `طرح ${k}`)
assert.equal(g.length, 1); assert.equal(g[0].count, 2); assert.equal(g[0].critical, 1)
console.log('dashboardCore ok')
