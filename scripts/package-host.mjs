#!/usr/bin/env node
// Builds a self-contained upload package for an ordinary web host (cPanel, DirectAdmin, Plesk, IIS, nginx):
//   release/farin-pmis-<build>.zip  — unzip into the site folder (domain root or any sub-folder) and it runs.
// Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (env or .env.local): they are baked into the files at build time.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const env = { ...process.env }
for (const f of ['.env.local', '.env.production.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY تنظیم نشده‌اند (env یا .env.local). بدون آن‌ها سایت به پایگاه داده وصل نمی‌شود.')
  process.exit(1)
}
delete env.GH_PAGES
env.HOST_BUILD = 'true'

await rm('dist', { recursive: true, force: true })
execSync('npx tsc -b && npx vite build', { stdio: 'inherit', env })

// Leave out what the running app never requests, so the upload stays small (checked by opening the digital twin from a
// package build and watching every request: none of these is asked for).
//  - Cesium extras: map-pin icons, the default world imagery (the twin brings its own satellite layer), lens flare, water
//    textures, glTF/3D-Tiles decoders (the twin draws points and labels only), and every widget file except widgets.css —
//    the one stylesheet the page links, which carries its images inline
//  - logo files nothing references
const PRUNE = [
  'cesium/Assets/Textures/maki', 'cesium/Assets/Textures/NaturalEarthII', 'cesium/Assets/Textures/LensFlare',
  'cesium/Assets/Textures/waterNormals.jpg', 'cesium/Assets/Textures/waterNormalsSmall.jpg',
  'cesium/ThirdParty',
  'logo-full.png', 'logo-icon.png', 'farin-logo.webp',
]
for (const rel of PRUNE) await rm(path.join('dist', rel), { recursive: true, force: true })
for (const name of await readdir('dist/cesium/Widgets')) if (name !== 'widgets.css') await rm(path.join('dist/cesium/Widgets', name), { recursive: true, force: true })

// server config: Apache/LiteSpeed (.htaccess), IIS (web.config); nginx sample stays in deploy/host for VPS setups
await cp('deploy/host/.htaccess', 'dist/.htaccess')
await cp('deploy/host/assets/.htaccess', 'dist/assets/.htaccess')
await cp('deploy/host/web.config', 'dist/web.config')

const build = (process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString()).trim().slice(0, 7)
const zip = new JSZip()
let files = 0, bytes = 0
async function add(dir, rel = '') {
  for (const name of await readdir(dir)) {
    const abs = path.join(dir, name), r = rel ? `${rel}/${name}` : name
    if ((await stat(abs)).isDirectory()) { await add(abs, r); continue }
    const data = await readFile(abs)
    zip.file(r, data, { compression: /\.(png|jpe?g|webp|gif|wasm|zip)$/i.test(name) ? 'STORE' : 'DEFLATE' })
    files++; bytes += data.length
  }
}
await add('dist')
await mkdir('release', { recursive: true })
const out = `release/farin-pmis-${build}.zip`
await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compressionOptions: { level: 9 } }))
const size = (await stat(out)).size
console.log(`\n[package-host] ${out} — ${files} فایل، ${(bytes / 1048576).toFixed(1)} MB باز، ${(size / 1048576).toFixed(1)} MB فشرده`)
