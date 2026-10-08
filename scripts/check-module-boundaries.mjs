#!/usr/bin/env node
// Guards module independence (Mission & Visit Debrief, Land Acquisition): inside src/modules/<module>, only
// platform/index.ts (the host seam) may import from outside the module. Any other file reaching into the
// host app, or into another module, fails this check.  Run: node scripts/check-module-boundaries.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const MODULES = ['missions', 'landacq']
const bad = []
let root = ''
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
for (const m of MODULES) {
  root = resolve('src/modules', m)
  walk(root)
}
if (bad.length) {
  console.error('Module boundary violations:\n' + bad.join('\n'))
  process.exit(1)
}
console.log(`${MODULES.join(' + ')} module boundary OK`)
