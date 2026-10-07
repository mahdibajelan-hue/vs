// Run: npx tsx supabase/functions/uc-admin-ops/handler.test.mjs
import assert from 'node:assert/strict'
import { handle } from './handler.ts'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
function deps(over = {}) {
  const calls = []
  return {
    calls,
    verifyToken: async (jwt) => (jwt === 'admin-jwt' ? ADMIN : jwt === 'user-jwt' ? OTHER : null),
    isActiveAdmin: async (id) => id === ADMIN,
    createUser: async (a) => (calls.push(['createUser', a]), { data: { user: { id: 'new-id' } }, error: null }),
    inviteUserByEmail: async (e, d) => (calls.push(['invite', e, d]), { data: { user: { id: 'inv-id' } }, error: null }),
    updateUserById: async (id, a) => (calls.push(['update', id, a]), { data: {}, error: null }),
    updateProfile: async (id, p) => (calls.push(['profile', id, p]), { error: null }),
    ...over,
  }
}
const req = (body, token = 'admin-jwt', method = 'POST') =>
  new Request('http://x/', { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: method === 'POST' ? JSON.stringify(body) : undefined })
const run = async (r, d = deps()) => { const res = await handle(r, d); return { status: res.status, body: res.status === 204 ? null : await res.json(), d } }

// auth
assert.equal((await run(req({}, null))).status, 401)
assert.equal((await run(req({}, 'bad'))).status, 401)
assert.equal((await run(req({ action: 'set_password' }, 'user-jwt'))).status, 403)
assert.equal((await run(req({}, 'admin-jwt', 'GET'))).status, 405)
assert.equal((await run(req({}, 'admin-jwt', 'OPTIONS'))).status, 204)
assert.equal((await run(req({ action: 'nope' }))).status, 400)

// create with password -> createUser + profile
let r = await run(req({ action: 'create_user', email: ' Ali@Example.com ', password: 'abcdefgh', full_name: 'علی', user_type: 'consultant', organization: 'X', is_admin: true }))
assert.equal(r.status, 200); assert.equal(r.body.id, 'new-id'); assert.equal(r.body.invited, false)
assert.deepEqual(r.d.calls[0], ['createUser', { email: 'ali@example.com', password: 'abcdefgh', email_confirm: true, user_metadata: { full_name: 'علی' } }])
assert.equal(r.d.calls[1][2].is_admin, true); assert.equal(r.d.calls[1][2].user_type, 'consultant')
// create without password -> invite, is_admin not forced
r = await run(req({ action: 'create_user', email: 'a@b.co', full_name: 'س' }))
assert.equal(r.body.invited, true); assert.equal(r.d.calls[0][0], 'invite'); assert.equal('is_admin' in r.d.calls[1][2], false); assert.equal(r.d.calls[1][2].user_type, 'other')
// validation
assert.equal((await run(req({ action: 'create_user', email: 'nope', full_name: 'x' }))).status, 400)
assert.equal((await run(req({ action: 'create_user', email: 'a@b.co', full_name: '' }))).status, 400)
assert.equal((await run(req({ action: 'create_user', email: 'a@b.co', full_name: 'x', user_type: 'god' }))).status, 400)
assert.equal((await run(req({ action: 'create_user', email: 'a@b.co', full_name: 'x', password: 'short' }))).status, 400)
// duplicate
r = await run(req({ action: 'create_user', email: 'a@b.co', full_name: 'x' }), deps({ inviteUserByEmail: async () => ({ data: { user: null }, error: { message: 'User already registered' } }) }))
assert.equal(r.status, 409)

// set_password
r = await run(req({ action: 'set_password', user_id: OTHER, password: 'longenough' }))
assert.equal(r.status, 200); assert.deepEqual(r.d.calls[0], ['update', OTHER, { password: 'longenough' }])
assert.equal((await run(req({ action: 'set_password', user_id: OTHER, password: 'short' }))).status, 400)
assert.equal((await run(req({ action: 'set_password', user_id: 'not-a-uuid', password: 'longenough' }))).status, 400)

// set_ban
r = await run(req({ action: 'set_ban', user_id: OTHER, banned: true }))
assert.deepEqual(r.d.calls[0], ['update', OTHER, { ban_duration: '876000h' }])
r = await run(req({ action: 'set_ban', user_id: OTHER, banned: false }))
assert.deepEqual(r.d.calls[0], ['update', OTHER, { ban_duration: 'none' }])
assert.equal((await run(req({ action: 'set_ban', user_id: ADMIN, banned: true }))).status, 400)
console.log('uc-admin-ops handler: all assertions passed')
