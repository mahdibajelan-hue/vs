// The own server (deploy/server/auto-update.sh) runs only the SQL files listed in deploy/server/sql-updates.txt: a new
// SQL file that is not listed would never reach it. Every SQL file of supabase/ must be listed there or in the baseline.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const list = (f) => readFileSync(join(root, 'deploy/server', f), 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
const updates = list('sql-updates.txt'), baseline = new Set(list('sql-baseline.txt'))

const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? (!['seed', 'rollback', 'tests'].includes(f) && walk(p)) : f.endsWith('.sql') && files.push(relative(root, p)) } }
walk(join(root, 'supabase'))

const missing = files.filter((f) => !baseline.has(f) && !updates.includes(f))
assert.deepEqual(missing, [], `add these SQL files to the end of deploy/server/sql-updates.txt: ${missing.join(', ')}`)
assert.equal(new Set(updates).size, updates.length, 'a file is listed twice in sql-updates.txt')
for (const f of updates) {
  assert.ok(existsSync(join(root, f)), `sql-updates.txt lists a missing file: ${f}`)
  assert.ok(!baseline.has(f), `${f} is in both lists`)
  // the server runs each file inside its own transaction
  assert.ok(!/^\s*(begin|commit)\s*;/im.test(readFileSync(join(root, f), 'utf8')), `${f} has its own begin/commit`)
}
