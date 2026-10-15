#!/usr/bin/env node
/**
 * Print check of the approved sheets (read-only tool: writes only into --out, never into the app or the database).
 * For every bundled sheet it renders 1, capacity and capacity+1 records exactly like the sheet wrapper of TemplatePaper, prints to PDF with Chromium
 * and reports: pages printed vs expected, measured sheet size, applied scale, page area. Run twice → identical numbers (deterministic).
 *   node scripts/print-check.mjs [--out DIR] [--only formKey] [--json] [--blank]   (--blank also writes the data-free sheets to DIR/blank for scripts/conformity-check.py)
 * Needs: Playwright with Chromium (PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium } from 'playwright'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const out = resolve(arg('--out') ?? join(process.env.TMPDIR ?? '/tmp', 'print-check'))
const only = arg('--only')
mkdirSync(out, { recursive: true })

// 1) bundle the entry (vite SSR) into the output folder
await build({ root, configFile: false, logLevel: 'silent', build: { ssr: join(root, 'scripts/print-check.entry.tsx'), outDir: join(out, '.bundle'), emptyOutDir: true, rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.mjs' } } }, ssr: { noExternal: true } })
const { renderCases, renderBlank } = await import(pathToFileURL(join(out, '.bundle/entry.mjs')).href)
if (process.argv.includes('--blank')) { mkdirSync(join(out, 'blank'), { recursive: true }); for (const b of renderBlank()) writeFileSync(join(out, 'blank', `${b.formKey}.html`), b.html) }
const cases = renderCases(only)

// guard: the wrapper CSS used here must still be the one TemplatePaper uses
const tp = readFileSync(join(root, 'src/modules/execution/components/TemplatePaper.tsx'), 'utf8')
const wrapperOk = tp.includes('@media print { .gt-page { zoom: ${plan.scale}; break-after: page; } .gt-page:last-child { break-after: auto; } }')

// 2) print every case with Chromium
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch(exe ? { executablePath: exe } : {})
const rows = []
for (const c of cases) {
  const page = await browser.newPage()
  await page.setContent(c.html, { waitUntil: 'load' })
  const sheet = await page.evaluate(() => { const r = document.querySelector('.gt-sheet').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  writeFileSync(join(out, `${c.id}.pdf`), pdf)
  const printed = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  const A4 = c.orientation === 'landscape' ? { w: 11.69, h: 8.27 } : { w: 8.27, h: 11.69 }
  const areaW = (A4.w - c.margins.left - c.margins.right) * 96, areaH = (A4.h - c.margins.top - c.margins.bottom) * 96
  rows.push({ id: c.id, form: c.formKey, records: c.records, expectedPages: c.expectedPages, printedPages: printed, ok: printed === c.expectedPages, excelScale: c.excelScale, scale: +c.scale.toFixed(4), sheetPx: sheet, scaledPx: { w: Math.round(sheet.w * c.scale), h: Math.round(sheet.h * c.scale) }, pageAreaPx: { w: Math.round(areaW), h: Math.round(areaH) }, heightRatio: +((sheet.h * c.scale) / areaH).toFixed(3) })
  await page.close()
}
await browser.close()

const md = ['# Print check', '', `wrapper CSS identical to TemplatePaper: **${wrapperOk ? 'yes' : 'NO — update scripts/print-check.entry.tsx'}**`, '', '| case | records | expected | printed | ok | excel scale | applied | sheet px (w×h) | scaled h / page h |', '|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.records} | ${r.expectedPages} | ${r.printedPages} | ${r.ok ? '✓' : '✗'} | ${r.excelScale} | ${r.scale} | ${r.sheetPx.w}×${r.sheetPx.h} | ${r.heightRatio} |`), '', `failures: ${rows.filter((r) => !r.ok).length} of ${rows.length}`]
writeFileSync(join(out, 'report.md'), md.join('\n'))
writeFileSync(join(out, 'report.json'), JSON.stringify({ wrapperOk, rows }, null, 2))
console.log(md.join('\n'))
if (process.argv.includes('--json')) console.log(JSON.stringify(rows))
process.exitCode = rows.some((r) => !r.ok) || !wrapperOk ? 1 : 0
