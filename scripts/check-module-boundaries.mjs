#!/usr/bin/env node
// Guards the Mission & Visit Debrief module's independence: inside src/modules/missions, only
// platform/index.ts (the host seam) may import from outside the module. Any other file reaching into the
// host app, or into another module, fails this check.  Run: node scripts/check-module-boundaries.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const root = resolve('src/modules/missions')
const bad = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name)) check(p)
  }
}
function check(file) {
  const rel = relative(root, file)
  if (rel === join('platform', 'index.ts')) return
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(join(file, '..'), m[1])
    if (!target.startsWith(root)) bad.push(`${rel}: imports outside the module → ${m[1]}`)
  }
}
walk(root)
if (bad.length) {
  console.error('Module boundary violations:\n' + bad.join('\n'))
  process.exit(1)
}
console.log('missions module boundary OK')
