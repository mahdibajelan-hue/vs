import assert from 'node:assert/strict'
import { AUDIENCE_PRESETS, composeReport, periodRange, scopeFacts } from './composerCore.ts'
import { today, input, facts } from './analyticsFixture.mjs'

const P = { id: 'pg', name: 'طرح غرب' }
const A = facts('a', 'پروژه الف', { program: P })
const B = facts('b', 'پروژه ب', { program: P, phase: { code: 'FEED', title: 'مهندسی پایه' } }, { metrics: { ...input().metrics, lifecycle: { actual: 50, planned: 50 } } })
const C = facts('c', 'پروژه ج', {}, { metrics: { ...input().metrics, lifecycle: { actual: 50, planned: 50 } } })
const all = [A, B, C]

/* periods */
assert.deepEqual(periodRange('daily', today), { from: today, to: today })
assert.deepEqual(periodRange('weekly', today), { from: '2026-10-22', to: today })
assert.equal(periodRange('monthly', today).from, '2026-09-29')
assert.deepEqual(periodRange('custom', today, '2026-10-10', '2026-10-01'), { from: '2026-10-01', to: '2026-10-10' })

/* scope */
assert.equal(scopeFacts({ scope: { level: 'program', id: 'pg' } }, all).facts.length, 2)
assert.equal(scopeFacts({ scope: { level: 'project', id: 'c' } }, all).label, 'پروژه ج')

/* a project manager's monthly report: every preset section present, figures from the same engine */
const pm = composeReport({ audience: 'project', period: 'monthly', scope: { level: 'project', id: 'a' }, ...AUDIENCE_PRESETS.project }, all, today)
assert.equal(pm.title, 'گزارش ماهانه مدیر پروژه')
assert.equal(pm.projects, 1)
assert.deepEqual(pm.sections.map((s) => s.key), AUDIENCE_PRESETS.project.sections)
const dev = pm.sections.find((s) => s.key === 'deviations').blocks[0]
assert.equal(dev.kind, 'table')
assert.ok(!dev.head.includes('پروژه')) // single project: no project column
assert.ok(dev.rows.some((r) => r.includes('زمان و پیشرفت')))
const cons = pm.sections.find((s) => s.key === 'construction')
assert.ok(cons.blocks.some((b) => b.key === 'stop' && b.rows[0][0] === 'کمبود مصالح' && b.rows[0][1] === '۱۱۰'))
const acts = pm.sections.find((s) => s.key === 'actions').blocks[0]
assert.ok(acts.note.includes('پیشنهاد سامانه'))
assert.ok(pm.sections.find((s) => s.key === 'compare') === undefined)

/* daily period narrows dated records: no issue was created today */
const daily = composeReport({ audience: 'project', period: 'daily', scope: { level: 'project', id: 'a' }, sections: ['issues', 'construction'], detail: 'full' }, all, today)
const ik = daily.sections[0].blocks[0]
assert.equal(ik.items.find((i) => i.label === 'تازه در دوره').value, '۰')
assert.ok(!daily.sections[1].blocks.some((b) => b.key === 'stop'))

/* the CEO's summary: capped rows, compare across the program, honest caveats */
const ceo = composeReport({ audience: 'ceo', period: 'weekly', scope: { level: 'all', id: null }, ...AUDIENCE_PRESETS.ceo }, all, today)
assert.equal(ceo.projects, 3)
const cmp = ceo.sections.find((s) => s.key === 'compare')
assert.ok(cmp.blocks[0].note.includes('هم‌مرحله'))
assert.ok(ceo.sections.find((s) => s.key === 'actions').blocks[0].rows.length <= 5)
assert.ok(ceo.caveats[0].includes('آخرین وضعیت'))
const crit = ceo.sections.find((s) => s.key === 'critical').blocks[0]
assert.ok(crit.items[0].text.startsWith('پروژه الف'))

/* an empty section says why */
const none = composeReport({ audience: 'project', period: 'monthly', scope: { level: 'project', id: 'c' }, sections: ['compare'], detail: 'full' }, all, today)
assert.ok(none.sections[0].empty)
console.log('composerCore ok')
