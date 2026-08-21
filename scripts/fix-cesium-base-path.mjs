#!/usr/bin/env node
// vite-plugin-cesium copies Cesium's static Assets/ThirdParty/Workers/Widgets to
// `<outDir>/<base>/<cesiumBaseUrl>` — baking the Vite `base` path into the physical copy
// destination, not just into the URL used to reference it. That's correct when `dist` is served
// at the site root (base '/'), but on GitHub Pages `dist` itself IS the published root for the
// `/vs/` prefix (via peaceiris/actions-gh-pages, publish_dir: ./dist) — so the browser's request
// for `/vs/cesium/...` needs the files at `dist/cesium/...`, not `dist/vs/cesium/...`. Without
// this, every Cesium Worker/Asset/ThirdParty file 404s in production and Cesium's render loop
// throws, showing its own "An error occurred while rendering." panel. Move the files after build.
import { existsSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.GH_PAGES === 'true' ? '/vs/' : '/'

if (base !== '/') {
  const baseSegment = base.replace(/^\/|\/$/g, '')
  const wrongDir = path.join('dist', baseSegment, 'cesium')
  const rightDir = path.join('dist', 'cesium')

  if (existsSync(wrongDir)) {
    await cp(wrongDir, rightDir, { recursive: true })
    await rm(path.join('dist', baseSegment), { recursive: true, force: true })
    console.log(`[fix-cesium-base-path] moved ${wrongDir} -> ${rightDir}`)
  }
}
