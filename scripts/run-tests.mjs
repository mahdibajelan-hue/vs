// Usage: node scripts/run-tests.mjs [glob-ish substring]  — runs every src/**/*.test.mjs (each file is a plain assert script).
import { register } from 'node:module'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

register('./ts-resolve-hook.mjs', pathToFileURL(import.meta.filename))
const filter = process.argv[2] ?? ''
const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? (f !== 'node_modules' && walk(p)) : f.endsWith('.test.mjs') && p.includes(filter) && files.push(p) } }
walk(resolve('src'))
let failed = 0
for (const f of files) {
  try { await import(pathToFileURL(f).href) } catch (e) { failed++; console.error('FAIL', f, '\n', e.message) }
}
console.log(`${files.length - failed}/${files.length} test files passed`)
process.exit(failed ? 1 : 0)
