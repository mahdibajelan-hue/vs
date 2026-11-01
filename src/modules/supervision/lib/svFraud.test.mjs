import assert from 'node:assert/strict'
import { detectFraud, flagsByPerson } from './svFraud.ts'

const P = (o) => ({ id: Math.random().toString(36).slice(2), personId: 'a', kind: 'in', at: '2026-10-20T04:00:00Z', day: '2026-10-20', accepted: true, reason: '', distanceM: 40, accuracyM: 12, quality: 'gps', siteId: 's', lat: 33.123456, lng: 48.654321, device: 'UA-1', installId: '', ip: '', deviceId: null, verified: false, ...o })
const D = (o) => ({ id: 'd', personId: 'a', label: '', userAgent: '', installId: 'inst-a', ip: '', status: 'active', createdAt: '2026-10-01T08:00:00Z', decidedAt: '2026-10-01T09:00:00Z', decideNote: '', lastUsedAt: null, ...o })
const names = { a: 'علی', b: 'رضا', c: 'مینا' }
const nameOf = (id) => names[id] ?? id
const kinds = (fs) => fs.map((f) => f.kind)

/* nothing suspicious: two people, own browsers, different spots, far apart in time */
assert.deepEqual(detectFraud([P({ installId: 'x' }), P({ personId: 'b', installId: 'y', at: '2026-10-20T05:00:00Z', lat: 33.2 })], []), [])

/* one browser for two people → high */
let f = detectFraud([P({ installId: 'same' }), P({ personId: 'b', installId: 'same', at: '2026-10-21T04:00:00Z', day: '2026-10-21', lat: 33.3 })], [], nameOf)
assert.deepEqual(kinds(f), ['shared_install'])
assert.equal(f[0].severity, 'high')
assert.deepEqual(f[0].personIds.sort(), ['a', 'b'])
assert.ok(f[0].detail.includes('علی') && f[0].detail.includes('رضا'))

/* identical coordinates within minutes → high; only once per pair per day */
f = detectFraud([P({ installId: 'x' }), P({ personId: 'b', installId: 'y', at: '2026-10-20T04:01:30Z' }), P({ personId: 'b', installId: 'y', at: '2026-10-20T04:02:00Z', kind: 'out' })], [])
assert.deepEqual(kinds(f), ['identical_fix'])
/* identical coordinates but hours apart: not flagged */
assert.deepEqual(detectFraud([P({ installId: 'x' }), P({ personId: 'b', installId: 'y', at: '2026-10-20T09:00:00Z' })], []), [])

/* same address and browser within 3 minutes → medium; 4 minutes apart → nothing */
f = detectFraud([P({ ip: '5.1.1.1', installId: 'x' }), P({ personId: 'b', ip: '5.1.1.1', installId: 'y', at: '2026-10-20T04:02:00Z', lat: 33.2 })], [])
assert.deepEqual(kinds(f), ['same_browser_burst'])
assert.equal(f[0].severity, 'medium')
assert.deepEqual(detectFraud([P({ ip: '5.1.1.1', installId: 'x' }), P({ personId: 'b', ip: '5.1.1.1', installId: 'y', at: '2026-10-20T04:04:00Z', lat: 33.2 })], []), [])
/* same address but different browsers (a camp Wi-Fi): not flagged */
assert.deepEqual(detectFraud([P({ ip: '5.1.1.1', installId: 'x' }), P({ personId: 'b', ip: '5.1.1.1', device: 'UA-2', installId: 'y', at: '2026-10-20T04:01:00Z', lat: 33.2 })], []), [])

/* approved phone: an unsigned accepted check-in after approval → medium; before approval → not counted */
f = detectFraud([P({ installId: 'inst-a', at: '2026-10-20T04:00:00Z' }), P({ installId: 'inst-a', at: '2026-09-20T04:00:00Z', day: '2026-09-20' })], [D()])
assert.deepEqual(kinds(f), ['unsigned'])
assert.equal(f[0].count, 1)
/* signed, but from another browser → other_install */
f = detectFraud([P({ installId: 'inst-zzz', verified: true, deviceId: 'd' })], [D()])
assert.deepEqual(kinds(f), ['other_install'])
/* signed from the phone itself → clean */
assert.deepEqual(detectFraud([P({ installId: 'inst-a', verified: true, deviceId: 'd' })], [D()]), [])

/* refused for lack of a phone, and three attempts outside in a day → low */
f = detectFraud([
  P({ accepted: false, reason: 'no_device' }), P({ accepted: false, reason: 'device_pending', at: '2026-10-20T05:00:00Z' }),
  ...[1, 2, 3].map((i) => P({ personId: 'c', accepted: false, reason: 'outside', at: `2026-10-20T0${i + 5}:00:00Z`, lat: 33 + i })),
], [])
assert.deepEqual(kinds(f).sort(), ['many_outside', 'refused_device'])
assert.ok(f.every((x) => x.severity === 'low'))
assert.equal(f.find((x) => x.kind === 'refused_device').count, 2)

/* phone replaced inside the range → low */
f = detectFraud([P({ installId: 'n', verified: true, deviceId: 'd2' })], [D({ status: 'revoked', createdAt: '2026-09-01T00:00:00Z' }), D({ id: 'd2', installId: 'n', createdAt: '2026-10-20T03:00:00Z', decidedAt: '2026-10-20T03:30:00Z' })])
assert.deepEqual(kinds(f), ['phone_change'])

/* ordering by severity, and the per-person index */
f = detectFraud([
  P({ accepted: false, reason: 'no_device', personId: 'c', lat: 34 }),
  P({ installId: 'same' }), P({ personId: 'b', installId: 'same', at: '2026-10-21T04:00:00Z', day: '2026-10-21', lat: 33.3 }),
], [])
assert.equal(f[0].severity, 'high')
assert.equal(flagsByPerson(f).get('a').length, 1)
assert.equal(flagsByPerson(f).get('c')[0].kind, 'refused_device')
