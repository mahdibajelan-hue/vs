// Usage: build the app and serve it on http://localhost:4301, then
//   MULT=55 PW_USER=<email> PW_PASS=<password> SP=<folder for screenshots> node scripts/perf/load-110-projects.cjs
// MULT=1 runs the same walk against the real data for comparison. Writes never reach the database.
// Load test: the browser sees 110 projects. Every REST answer that is not limited to one project is cloned 55x
// (each clone has every UUID rewritten consistently); a read for a cloned project is sent for its original and the
// answer rewritten. Every write to a table is answered locally and never reaches the database.
const { chromium } = require('playwright')
const N = Number(process.env.MULT ?? 55)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const back = new Map() // clone uuid → [original, k]
const clone = (u, k) => { const c = u.slice(0, -3) + (0xa00 + k).toString(16); back.set(c, [u, k]); return c }
const cloneText = (txt, k) => txt.replace(UUID, (u) => clone(u, k))
;(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let phase = 'boot'; const big = []; let blocked = 0, cloned = 0, bytes = 0, reqs = 0
  if (N > 1) await page.route(/supabase\.co\/rest\/v1\//, async (route) => {
    const req = route.request(); const m = req.method()
    const path = new URL(req.url()).pathname
    if (m !== 'GET' && m !== 'HEAD' && !path.includes('/rpc/')) { blocked++; return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }) }
    if (m !== 'GET') return route.continue()
    let url = decodeURIComponent(req.url()); let k = 0
    url = url.replace(UUID, (u) => { const b = back.get(u); if (b) { k = b[1]; return b[0] } return u })
    const scoped = /[?&][a-z_.]+=(eq|in)\.\(?[^&]*[0-9a-f]{8}-/.test(url) || /eq\.[^&]*(پروژه|project)/i.test(url) // one project's rows
    const res = await route.fetch({ url: encodeURI(url).replace(/\+/g, '%2B') })
    let body = await res.text()
    if (res.ok() && body.startsWith('[')) {
      if (k > 0) body = cloneText(body, k)
      else if (!scoped) { const rows = JSON.parse(body); if (rows.length) { const out = [...rows]; for (let i = 1; i < N; i++) out.push(...JSON.parse(cloneText(body, i).replace(/"(official_name|name|title)":"([^"]*)"/g, (s, f, v) => `"${f}":"${v} #${i}"`))); body = JSON.stringify(out); cloned++; big.push([body.length, phase, path.split('/rest/v1/')[1], url.split('?')[1]?.slice(0, 90)]) } }
    }
    bytes += body.length; reqs++
    const headers = { ...res.headers() }; delete headers['content-range']; delete headers['content-length']; delete headers['content-encoding']
    return route.fulfill({ status: res.status(), headers, body })
  })
  await page.addInitScript(() => { try { localStorage.setItem('farin.toolbarGuide.v1', '1') } catch {} })
  await page.goto('http://localhost:4301/', { waitUntil: 'networkidle' })
  await page.getByLabel(/ایمیل/).first().fill(process.env.PW_USER); await page.getByLabel(/رمز/).first().fill(process.env.PW_PASS)
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
  const heap = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); return (metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1048576).toFixed(0) + ' MB heap' }
  let t = Date.now()
  await page.getByRole('button', { name: /^ورود/ }).first().click()
  await page.getByText('ابزارهای سازمانی').first().waitFor({ timeout: 120000 })
  console.log(`[x${N}] hub after sign-in: ${Date.now() - t} ms, ${await heap()}`)
  await page.waitForTimeout(1500)
  t = Date.now()
  phase = 'picker'; await page.getByText('رادار پروژه', { exact: false }).first().click()
  await page.locator('text=کوهدشت–سرخس').first().waitFor({ timeout: 120000 })
  console.log(`[x${N}] project picker list shown: ${Date.now() - t} ms`)
  // wait until every picker row shows a value (no loading placeholders)
  const rows = page.locator('text=/کوهدشت–سرخس|سرخس/')
  for (let i = 0; i < 240; i++) { const busy = await page.locator('[aria-busy="true"], .animate-pulse').count(); if (!busy) break; await page.waitForTimeout(500) }
  console.log(`[x${N}] picker settled: ${Date.now() - t} ms, ${await rows.count()} project rows matching, ${await heap()}`)
  await page.screenshot({ path: process.env.SP + `/load_picker_${N}.png` })
  t = Date.now()
  phase = 'radar'; await page.locator(N > 1 ? 'text=/کوهدشت–سرخس.*#37/' : 'text=کوهدشت–سرخس').first().click()
  await page.locator('.pmenu-row').first().waitFor({ timeout: 120000 }).catch(() => {})
  await page.getByText(/سلامت/).first().waitFor({ timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(500)
  console.log(`[x${N}] project radar shown: ${Date.now() - t} ms`)
  await page.waitForTimeout(6000); await page.screenshot({ path: process.env.SP + `/load_radar_${N}.png` })
  t = Date.now()
  phase = 'execution'; await page.locator('.pmenu-row', { hasText: 'مدیریت اجرا' }).first().click()
  await page.getByText('خلاصهٔ وضعیت برای مدیریت').first().waitFor({ timeout: 120000 }).catch(() => console.log('execution dashboard not found'))
  console.log(`[x${N}] execution dashboard inside project: ${Date.now() - t} ms, ${await heap()}`)
  await page.locator('.pmenu-row', { hasText: 'کنترل و تأمین کالا' }).first().click(); phase = 'material'; t = Date.now(); await page.waitForTimeout(500); await page.waitForLoadState('networkidle').catch(() => {}); console.log(`[x${N}] material module settled: ${Date.now() - t} ms, ${await heap()}`)
  await page.locator('.pmenu-row', { hasText: 'قراردادها و مالی' }).first().click(); phase = 'finance'; t = Date.now(); await page.waitForTimeout(500); await page.waitForLoadState('networkidle').catch(() => {}); console.log(`[x${N}] finance module settled: ${Date.now() - t} ms, ${await heap()}`)
  console.log(`[x${N}] REST reads ${reqs}, answers cloned ${cloned}, ${(bytes / 1048576).toFixed(1)} MB served, writes blocked ${blocked}`)
  big.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach((b) => console.log('GROWS', (b[0] / 1048576).toFixed(2).padStart(6), 'MB', b[1].padEnd(10), b[2].padEnd(30), b[3]))
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await browser.close()
})()
