import assert from 'node:assert/strict'
import { engagementGap, isOverdueFollowUp, nextCode, quadrantOf, suggestStrategy, summarise, viewOf } from './stakeholderCore.ts'

const today = '2026-11-01'
const sh = (o = {}) => ({
  id: 'a', projectId: 'p', code: 'SH-001', name: 'فرمانداری', organization: '', roleTitle: '', category: 'local_authority', side: 'external', phone: '', email: '',
  power: 5, interest: 4, attitude: 'critic', current: 'resistant', desired: 'supportive', owner: 'مدیر پروژه', ownerEmail: '', channel: '', frequencyDays: 30,
  expectations: '', strategy: '', note: '', active: true, createdAt: '2026-01-01', ...o,
})
const log = (o = {}) => ({ id: 'l', stakeholderId: 'a', happenedOn: '2026-09-15', kind: 'meeting', subject: 'جلسه', summary: '', attendees: '', sentiment: 'negative', nextAction: 'ارسال پاسخ', nextDue: '2026-10-01', nextOwner: '', nextOwnerEmail: '', nextDone: false, createdBy: null, ...o })
const concern = (o = {}) => ({ id: 'c', stakeholderId: 'a', raisedOn: '2026-09-15', title: 'خسارت اراضی', description: '', category: 'land', priority: 'high', status: 'open', owner: '', ownerEmail: '', dueDate: '2026-10-15', resolution: '', resolvedOn: null, ...o })

/* quadrant: 4–5 is high on both axes */
assert.equal(quadrantOf({ power: 5, interest: 4 }), 'manage')
assert.equal(quadrantOf({ power: 4, interest: 3 }), 'satisfy')
assert.equal(quadrantOf({ power: 2, interest: 5 }), 'inform')
assert.equal(quadrantOf({ power: 3, interest: 3 }), 'monitor')

/* engagement gap in steps */
assert.equal(engagementGap({ current: 'resistant', desired: 'supportive' }), 2)
assert.equal(engagementGap({ current: 'leading', desired: 'supportive' }), -1)

/* follow-ups: overdue only when an action exists, is not done and its date has passed */
assert.equal(isOverdueFollowUp(log(), today), true)
assert.equal(isOverdueFollowUp(log({ nextDone: true }), today), false)
assert.equal(isOverdueFollowUp(log({ nextAction: '' }), today), false)
assert.equal(isOverdueFollowUp(log({ nextDue: '2026-11-05' }), today), false)

/* a powerful critic, overdue follow-up, negative last contact, contact interval passed */
const v = viewOf(sh(), [log()], [concern()], today)
assert.equal(v.quadrant, 'manage')
assert.equal(v.gap, 2)
assert.equal(v.sinceContact, 47)
assert.equal(v.contactDue, true)
assert.equal(v.overdueFollowUps, 1)
assert.equal(v.openConcerns, 1)
assert.equal(v.criticalConcerns, 1)
assert.equal(v.lastSentiment, 'negative')
assert.ok(v.alerts[0].includes('پرقدرت'))
assert.ok(v.attention >= 80)

/* never contacted, no planned frequency: not due */
const quiet = viewOf(sh({ id: 'b', power: 2, interest: 2, attitude: 'supporter', current: 'supportive', frequencyDays: null }), [], [], today)
assert.equal(quiet.contactDue, false)
assert.equal(quiet.alerts.length, 0)
assert.ok(quiet.attention < v.attention)
const never = viewOf(sh({ id: 'n' }), [], [], today)
assert.equal(never.contactDue, true)
/* archived stakeholders need no attention */
assert.equal(viewOf(sh({ active: false }), [log()], [concern()], today).attention, 0)

/* summary */
const views = [v, quiet, viewOf(sh({ id: 'z', active: false }), [], [], today)]
const sm = summarise(views, [log(), log({ id: 'l2', stakeholderId: 'b', happenedOn: '2026-10-20', sentiment: 'positive', nextAction: '' })], [concern(), concern({ id: 'c2', status: 'resolved' })], today)
assert.equal(sm.active, 2)
assert.equal(sm.byQuadrant.manage, 1)
assert.equal(sm.byQuadrant.monitor, 1)
assert.equal(sm.alignment, 50)
assert.equal(sm.belowDesired, 1)
assert.equal(sm.openConcerns, 1)
assert.equal(sm.overdueConcerns, 1)
assert.equal(sm.overdueFollowUps, 1)
assert.equal(sm.recent.positive, 1)
assert.equal(sm.recent.negative, 0) // 47 days ago, outside 30
assert.equal(sm.months.length, 6)
assert.equal(sm.months[5].month, '2026-11')
assert.equal(sm.months[4].positive, 1)
assert.equal(sm.months[3].negative, 1)

/* strategy and codes */
assert.ok(suggestStrategy(sh()).includes('علت مخالفت'))
assert.ok(suggestStrategy({ power: 1, interest: 1, current: 'neutral', desired: 'neutral', attitude: 'neutral' }).startsWith('پایش'))
assert.equal(nextCode([]), 'SH-001')
assert.equal(nextCode(['SH-001', 'SH-009', 'X']), 'SH-010')
