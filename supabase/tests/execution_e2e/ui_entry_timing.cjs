// Usage: start the app (npx vite --port 4301 with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), then
//   PW_USER=... PW_PASS=... node supabase/tests/execution_e2e/ui_entry_timing.cjs 1440   (or 390 for a phone)
// Every write (POST / PATCH / DELETE and writing RPCs) is intercepted and answered locally: nothing reaches the database.
// Daily-report entry, measured in the real app on live data, with EVERY write intercepted (nothing reaches the database).
const { chromium } = require('playwright')
const SP = process.env.SHOTS || '.'
const FAKE = '00000000-0000-4000-8000-00000000fa4e'
;(async () => {
  const W = +(process.argv[2] || 1440), mobile = W < 600
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } })
  const ctx = await browser.newContext({ viewport: { width: W, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true })
  const page = await ctx.newPage(); const errs = [], writes = []
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
  let fakeRow = null
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method()
    const isRpc = url.includes('/rest/v1/rpc/')
    const writeRpc = /rpc\/(ex_|pst_|im_|sv_)(report_|line_|statement|doc_|raise|gap_sync|set_|save|submit)/.test(url)
    if (m === 'GET' || m === 'HEAD' || (isRpc && !writeRpc)) {
      if (m === 'GET' && url.includes('/ex_reports') && url.includes(FAKE) && fakeRow) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fakeRow]) })
      return route.continue()
    }
    writes.push(`${m} ${url.split('/rest/v1/')[1].slice(0, 70)}`)
    if (m === 'POST' && url.includes('/ex_reports') && !isRpc) {
      const body = JSON.parse(req.postData() || '{}'); const b = Array.isArray(body) ? body[0] : body
      fakeRow = { id: FAKE, project_id: b.project_id, form_key: b.form_key, report_no: 'TEST-0000', report_date: b.report_date, contractor_org_id: b.contractor_org_id, front: b.front, station: '', shift: 'day', status: 'draft', data: {}, notes: '', missing: [], created_at: new Date().toISOString(), review_note: '' }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: FAKE }) })
    }
    return route.fulfill({ status: m === 'POST' ? 201 : 204, contentType: 'application/json', body: m === 'POST' ? '[]' : '' })
  })
  await page.goto('http://localhost:4301/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/ایمیل/).first().fill(process.env.PW_USER); await page.getByLabel(/رمز/).first().fill(process.env.PW_PASS)
  await page.getByRole('button', { name: /^ورود/ }).first().click()
  await page.getByText('ابزارهای سازمانی').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1500)
  await page.getByText('رادار پروژه', { exact: false }).first().click(); await page.waitForTimeout(2500)
  const ok = page.getByRole('button', { name: 'متوجه شدم' }); if (await ok.count()) await ok.first().click()
  await page.getByText('پروژهٔ فرضی: خط انتقال گاز', { exact: false }).first().click(); await page.waitForTimeout(2500)
  const ok2 = page.getByRole('button', { name: 'متوجه شدم' }); if (await ok2.count()) await ok2.first().click()
  if (mobile) await page.getByText(/مدیریت اجرا/).locator('visible=true').first().click({ force: true }); else await page.locator('.pmenu-items').getByText(/مدیریت اجرا/).first().evaluate((el) => el.closest('button,a,[role=button]')?.click() ?? el.click()); await page.waitForTimeout(5000)
  await page.waitForTimeout(8000); await page.locator('button:visible', { hasText: 'گزارش روزانه' }).filter({ hasNotText: 'WRK' }).first().click(); await page.waitForTimeout(3500)
  // ---- the entry, step by step; every user action is counted (K = keystrokes, P = pointing/clicks)
  const pend = new Set(); page.on('request', (r) => pend.add(r.url())); page.on('requestfinished', (r) => pend.delete(r.url())); page.on('requestfailed', (r) => { pend.delete(r.url()); errs.push('FAILED ' + r.url().slice(0, 120) + ' ' + r.failure()?.errorText) })
  try { await page.locator('button:visible', { hasText: 'گزارش کارکرد جدید' }).first().waitFor({ timeout: 90000 }) }
  catch (e) { await page.screenshot({ path: `${SP}/stuck.png` }); console.log('BODY', (await page.locator('main, #root').first().innerText()).replace(/\s+/g, ' ').slice(0, 600)); console.log('STUCK writes', writes, 'errors', errs.slice(0, 8), 'pending', [...pend].map((u) => u.slice(0, 140)).slice(0, 10)); await browser.close(); process.exit(1) }
  let P = 0, K = 0; const t0 = Date.now()
  const click = async (loc) => { await loc.click(); P++ }
  await click(page.locator('button:visible', { hasText: 'گزارش کارکرد جدید' }).first()); await page.waitForTimeout(3000)
  const bl = await page.locator('main button, .ex-wrap button, button').evaluateAll((xs) => xs.map((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() + (x.title ? ` [${x.title.slice(0, 40)}]` : '')).filter((t) => t && !/WRK|RTREPORT|BOND|WELD/.test(t)).slice(20, 80))
  console.log('EDITOR BUTTONS', bl.join(' | '))
  // a typical day on a pipeline front: weather, four operations with quantity and km range; resources come from the last report
  await click(page.locator('button:visible', { hasText: 'آفتابی' }).first())
  const ops = [['ریسه و حمل لوله', '850', '12.4', '13.25'], ['حفاری کانال', '720', '11.8', '12.52'], ['جوشکاری', '64', '10.1', '10.87'], ['رادیوگرافی', '60', '9.6', '10.32']]
  await click(page.locator('button:visible', { hasText: 'افزودن عملیات' }).first()); await page.waitForTimeout(800)
  for (const [op, q, k1, k2] of ops) {
    const sel = page.locator('select[aria-label="اقدام"]:visible').first()
    const val = await sel.evaluate((x, op) => [...x.options].find((o) => o.text.startsWith(op))?.value ?? '', op)
    await sel.selectOption(val); P++
    await click(page.getByRole('button', { name: 'افزودن', exact: true }).locator('visible=true').first()); await page.waitForTimeout(300)
    for (const [label, v] of [['مقدار امروز', q], ['از کیلومتر', k1], ['تا کیلومتر', k2]]) {
      const inp = page.locator(`table.ex-lines input[aria-label="${label}"]`).last()
      if (await inp.count()) { await inp.click(); P++; await inp.fill(''); await inp.type(v, { delay: 40 }); K += v.length }
    }
  }
  console.log('qty inputs (any)', await page.locator('input[aria-label="کارکرد امروز"]').count(), 'all aria in table', (await page.locator('table.ex-lines input').evaluateAll((xs) => xs.map((x) => x.getAttribute('aria-label') || x.placeholder))).slice(0, 20).join(','))
  const nLines = await page.locator('input[aria-label="مقدار امروز"]').count()
  console.log('operation rows', nLines, 'table rows', await page.locator('table.ex-lines tbody tr').count())
  const tbl = page.locator('table.ex-lines').first(); if (await tbl.count()) await tbl.screenshot({ path: `${SP}/dr-lines-${W}.png` })
  console.log('row texts', (await page.locator('table.ex-lines tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 90)).join(' || '))
  const resInputs = await page.locator('input:visible').count()
  console.log('visible inputs on the form', resInputs)
  await page.screenshot({ path: `${SP}/dr-editor-${W}.png`, fullPage: true })
  const save = page.locator('button:visible', { hasText: 'ذخیره پیش‌نویس' }).first()
  if (await save.count() && await save.isEnabled()) { await click(save); await page.waitForTimeout(2500) }
  console.log('ACTIONS clicks', P, 'keystrokes', K, 'script seconds', ((Date.now() - t0) / 1000).toFixed(1), 'scrollW', await page.evaluate(() => document.documentElement.scrollWidth))
  const tabs = []
  await page.screenshot({ path: `${SP}/dr-start-${W}.png` })
  console.log('writes so far', writes, 'errors', errs.slice(0, 3)); await browser.close()
})()
