import assert from 'node:assert/strict'
import { createBatcher, sortBy } from './batchedQueryCore.ts'

const db = Array.from({ length: 2500 }, (_, i) => ({ id: i, project_name: `p${i % 5}`, active: i % 2 === 0 }))
const calls = []
const fetcher = async (spec, keys, from, to) => {
  calls.push({ table: spec.table, keys: [...keys].sort(), from, to, eq: spec.eq })
  const rows = db.filter((r) => keys.includes(String(r[spec.column])) && Object.entries(spec.eq).every(([k, v]) => r[k] === v))
  return { data: rows.slice(from, to + 1), error: null }
}
const batched = createBatcher(fetcher, 5)

// five callers in the same window → one query per page, each gets only its own rows
const res = await Promise.all(['p0', 'p1', 'p2', 'p3', 'p4'].map((p) => batched({ table: 't', column: 'project_name' }, p)))
assert.deepEqual(res.map((r) => r.length), [500, 500, 500, 500, 500])
assert.ok(res[2].every((r) => r.project_name === 'p2'))
assert.equal(calls.length, 3) // 2500 rows → pages of 1000
assert.deepEqual(calls[0].keys, ['p0', 'p1', 'p2', 'p3', 'p4'])

// different filters are different batches; array keys are merged
calls.length = 0
const [a, b] = await Promise.all([batched({ table: 't', column: 'project_name', eq: { active: true } }, ['p0', 'p1']), batched({ table: 't', column: 'project_name' }, 'p0')])
assert.ok(a.every((r) => r.active && (r.project_name === 'p0' || r.project_name === 'p1')))
assert.equal(b.length, 500)
assert.equal(calls.length, 2)

// errors reach every waiter; empty keys skip the query
const bad = createBatcher(async () => ({ data: null, error: { message: 'boom' } }), 1)
await assert.rejects(Promise.all([bad({ table: 'x', column: 'c' }, 'a'), bad({ table: 'x', column: 'c' }, 'b')]), /boom/)
assert.deepEqual(await batched({ table: 't', column: 'project_name' }, []), [])

assert.deepEqual(sortBy([{ d: '2' }, { d: '1' }], 'd').map((x) => x.d), ['1', '2'])
assert.deepEqual(sortBy([{ d: '2' }, { d: '1' }], 'd', true).map((x) => x.d), ['2', '1'])
console.log('batchedQuery ok')
