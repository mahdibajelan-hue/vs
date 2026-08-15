import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import * as cesiumPluginModule from 'vite-plugin-cesium'

// vite-plugin-cesium's CJS/ESM interop confuses TS's nodenext module resolution (it resolves the
// default export as the whole namespace object) — the plugin itself works fine at runtime, so this
// just recovers the callable default without fighting the package's dual-module type declarations.
const cesium = (cesiumPluginModule as unknown as { default: (options?: Record<string, unknown>) => Plugin }).default

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repo under /vs/ (a project site, not a username.github.io root site).
  base: process.env.GH_PAGES ? '/vs/' : '/',
  // vite-plugin-cesium copies Cesium's static Assets/Widgets/Workers into the build and points
  // CESIUM_BASE_URL at them — needed once, used only by the Pipeline Digital Twin module. Default
  // mode marks 'cesium' as external and injects a global <script> tag straight into index.html,
  // which would load Cesium's several-MB bundle for every visitor on every page load regardless of
  // whether they ever open that module. rebuildCesium:true instead lets Rollup bundle 'cesium'
  // like any normal import, so it lands inside the module's own React.lazy() chunk and only loads
  // when that module is actually opened.
  plugins: [react(), tailwindcss(), cesium({ rebuildCesium: true })],
})
