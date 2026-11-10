import assert from 'node:assert/strict'
import { createRestFetch, PAGE } from './restFetchCore.ts'

const BASE = 'https://x.supabase.co/rest/v1/'
const table = Array.from({ length: 2345 }, (_, i) => ({ id: 2345 - i, v: i % 7 }))
const calls = []
const fakeFetch = async (input, init) => {
  const u = new URL(String(input)); const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ method, url: u.toString() })
  if (method !== 'GET') return new Response('{}', { status: 201 })
  if (u.pathname.endsWith('/broken')) return new Response('nope', { status: 400 })
  let rows = [...table]
  const idEq = u.searchParams.get('id'); if (idEq?.startsWith('eq.')) rows = rows.filter((x) => x.id === Number(idEq.slice(3)))
  const order = u.searchParams.get('order')
  if (order) { const keys = order.split(',').map((o) => o.split('.')); rows.sort((a, b) => { for (const [k, d] of keys) { if (a[k] !== b[k]) return (a[k] < b[k] ? -1 : 1) * (d === 'desc' ? -1 : 1) } return 0 }) }
  const off = Number(u.searchParams.get('offset') ?? 0), lim = Math.min(Number(u.searchParams.get('limit') ?? PAGE), PAGE)
  return new Response(JSON.stringify(rows.slice(off, off + lim)), { status: 200, headers: { 'content-type': 'application/json', 'content-range': `${off}-${off + lim - 1}/*` } })
}
let t = 0
const f = createRestFetch(fakeFetch, { ttlMs: 1000, now: () => t })

// 1. a plain read of a big table returns every row, in a stable order, with a correct content-range
let r = await f(BASE + 't?select=*', { headers: { Authorization: 'a' } })
let rows = await r.json()
assert.equal(rows.length, 2345)
assert.equal(new Set(rows.map((x) => x.id)).size, 2345)
assert.equal(r.headers.get('content-range'), '0-2344/2345')
// the query's own order is kept, with id as a tie-break
calls.length = 0
r = await f(BASE + 't?select=*&order=v.desc', { headers: { Authorization: 'a' } })
rows = await r.json()
assert.equal(rows.length, 2345)
assert.ok(rows.every((x, i) => i === 0 || rows[i - 1].v > x.v || (rows[i - 1].v === x.v && rows[i - 1].id < x.id)))
assert.ok(calls.slice(1).every((c) => new URL(c.url).searchParams.get('order') === 'v.desc,id.asc'))

// 2. an explicit range or single-object read is left alone
calls.length = 0
r = await f(BASE + 't?select=*&offset=0&limit=1000', { headers: { Authorization: 'a' } })
assert.equal((await r.json()).length, 1000); assert.equal(calls.length, 1)

// 3. identical reads in flight share one request; a repeat within the TTL comes from memory
calls.length = 0
const [a, b] = await Promise.all([f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'a' } }), f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'a' } })])
assert.deepEqual(await a.json(), await b.json()); assert.equal(calls.length, 1)
await f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'a' } }); assert.equal(calls.length, 1)
// another user (token) is a different question
await f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'b' } }); assert.equal(calls.length, 2)
// after the TTL it is read again
t += 2000; await f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'a' } }); assert.equal(calls.length, 3)

// 4. any write empties the memory
await f(BASE + 'small', { method: 'PATCH', headers: { Authorization: 'a' }, body: '{}' })
calls.length = 0
await f(BASE + 'small?select=*&id=eq.5', { headers: { Authorization: 'a' } }); assert.equal(calls.length, 1)

// 5. a failing paged read keeps the first page instead of breaking; errors are not remembered
calls.length = 0
r = await f(BASE + 'broken?select=*', { headers: { Authorization: 'a' } })
assert.equal(r.status, 400)
await f(BASE + 'broken?select=*', { headers: { Authorization: 'a' } }); assert.equal(calls.length, 2)

// 6. RPC, auth and storage pass straight through, never remembered
calls.length = 0
await f('https://x.supabase.co/rest/v1/rpc/inbox_my_items', { method: 'POST', body: '{}' })
await f('https://x.supabase.co/auth/v1/user', { headers: { Authorization: 'a' } })
await f('https://x.supabase.co/auth/v1/user', { headers: { Authorization: 'a' } })
assert.equal(calls.length, 3)
// 7. a table without `id` pages on its own primary key
const g = createRestFetch(fakeFetch, { keys: { joints: ['master_project_id', 'joint_no'] } })
calls.length = 0
await g(BASE + 'joints?select=*', { headers: { Authorization: 'a' } })
assert.equal(new URL(calls[1].url).searchParams.get('order'), 'master_project_id.asc,joint_no.asc')
console.log('restFetch: all assertions passed')
