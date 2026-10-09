import assert from 'node:assert/strict'
import * as n from '../../../../supabase/functions/im-notify/logic.ts'

assert.deepEqual([1, 2, 3, 4].map(n.backoffMinutes), [5, 10, 20, 40])
const env = { IM_EMAIL_WEBHOOK_URL: 'https://gw.example/send', IM_EMAIL_WEBHOOK_TOKEN: 't', IM_SMS_WEBHOOK_URL: 'http://insecure', IM_PUSH_WEBHOOK_URL: '  ' }
assert.deepEqual(n.providerFor(env, 'email'), { url: 'https://gw.example/send', token: 't' })
assert.equal(n.providerFor(env, 'sms'), null) // http:// is refused
assert.equal(n.providerFor(env, 'push'), null)
assert.equal(n.providerFor(env, 'messenger'), null)
// honest states
assert.deepEqual(n.outcomeOf({ configured: false, hasContact: true, ok: false, attempts: 0, channel: 'sms' }), { status: 'skipped', error: 'provider_not_configured:sms' })
assert.deepEqual(n.outcomeOf({ configured: true, hasContact: false, ok: false, attempts: 0, channel: 'sms' }), { status: 'skipped', error: 'no_contact:sms' })
assert.deepEqual(n.outcomeOf({ configured: true, hasContact: true, ok: true, attempts: 2, channel: 'email' }), { status: 'sent' })
assert.deepEqual(n.outcomeOf({ configured: true, hasContact: true, ok: false, error: 'http_500', attempts: 0, channel: 'email' }), { status: 'retry', error: 'http_500', delayMin: 5 })
assert.deepEqual(n.outcomeOf({ configured: true, hasContact: true, ok: false, error: 'http_500', attempts: 2, channel: 'email' }), { status: 'retry', error: 'http_500', delayMin: 20 })
assert.equal(n.outcomeOf({ configured: true, hasContact: true, ok: false, error: 'x', attempts: 4, channel: 'email' }).status, 'failed') // gives up after 5 tries
const d = n.digest(Array.from({ length: 15 }, (_, i) => ({ title: 'T' + i, body: i % 2 ? 'b' : '' })), 3)
assert.ok(d.title.startsWith('15')); assert.ok(d.body.includes('… و 12 مورد دیگر')); assert.equal(d.body.split('\n').length, 4)
console.log('notify logic ok')
