// Deterministic generator of the demo schedule for the 48-inch Kuhdasht–Sarakhs pipeline project.
// Run:  node --disable-warning=ExperimentalWarning supabase/scheduling/demo/gen-demo.mjs [spec|actuals|mc|stats]
// It uses the application's own scheduling kernel (computeSchedule / runMonteCarlo), so the stored dates are exactly what the app computes; the SQL (seed-demo.sql) only receives this compact output.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
register(pathToFileURL(resolve('scripts/ts-resolve-hook.mjs')).href, pathToFileURL(resolve('scripts/run-tests.mjs')))
const { computeSchedule } = await import(pathToFileURL(resolve('src/modules/scheduling/lib/schedule.ts')).href)
const { WorkCalendar } = await import(pathToFileURL(resolve('src/modules/scheduling/lib/calendar.ts')).href)
const { runMonteCarlo } = await import(pathToFileURL(resolve('src/modules/scheduling/lib/monteCarlo.ts')).href)

const MODE = process.argv[2] ?? 'stats'
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
export const CAL = { workDays: [0, 1, 2, 3, 4, 5], holidays: ['2027-02-11', '2027-03-21', '2027-03-22', '2027-03-23', '2027-03-24', '2027-04-01', '2027-04-02'], hoursPerDay: 8 }
const START = '2026-08-19', DD1 = '2026-09-17', DD2 = '2026-10-17'
const cal = new WorkCalendar(CAL, START)

// ── structure
const A = []
const add = (code, name, g, dur, preds = [], o = {}) => A.push({ code, name, g, dur, preds, type: o.ms ? 'milestone' : 'task', rate: o.rate ?? 0.8e9, ...o })
const GROUPS = { 1: 'مدیریت و قرارداد', 2: 'مهندسی', 3: 'تأمین کالا', 4: 'ساخت خط لوله', 5: 'ایستگاه‌ها و شیرخانه‌ها', 6: 'حفاظت کاتدی', 7: 'پیش‌راه‌اندازی و تحویل' }
const SEC = [1.0, 1.1, 0.9, 1.2, 1.0, 0.9, 1.15, 1.0], NS = 8
const d = (b, i) => Math.max(2, Math.round(b * SEC[i - 1]))
add('M1000', 'ابلاغ شروع کار (NTP)', '1', 0, [], { ms: true })
add('M1010', 'تجهیز کارگاه و استقرار تیم اجرایی', '1', 15, [['M1000', 'FS', 0]])
add('M1020', 'اخذ مجوزهای عبور و حقوق ارتفاقی', '1', 40, [['M1000', 'FS', 0]])
add('M1030', 'تأیید برنامه اجرایی و دستورالعمل‌های جوشکاری (WPS/PQR)', '1', 25, [['M1000', 'FS', 0]])
add('E2010', 'طراحی تفصیلی مسیر؛ نقشه‌های پلان‌وپروفیل', '2', 38, [['M1000', 'FS', 0]], { rate: 0.5e9 })
add('E2020', 'طراحی مکانیکی ایستگاه‌ها و شیرخانه‌ها', '2', 45, [['E2010', 'SS', 10]], { rate: 0.5e9 })
add('E2030', 'طراحی برق، ابزار دقیق و حفاظت کاتدی', '2', 42, [['E2010', 'SS', 12]], { rate: 0.5e9 })
add('E2040', 'بررسی و تأیید نقشه‌ها توسط مشاور', '2', 15, [['E2010', 'FS', 0]], { rate: 0.3e9 })
add('E2050', 'پایان مهندسی تفصیلی', '2', 0, [['E2020', 'FS', 0], ['E2030', 'FS', 0], ['E2040', 'FS', 0]], { ms: true })
add('P3010', 'سفارش و ساخت لولهٔ ۴۸ اینچ', '3', 70, [['M1000', 'FS', 0]], { rate: 3e9 })
add('P3020', 'اعمال پوشش خارجی لوله (3LPE)', '3', 50, [['P3010', 'SS', 20]], { rate: 1.5e9 })
add('P3030', 'حمل و تحویل لوله به انبارهای مسیر', '3', 85, [['P3020', 'SS', 5]], { rate: 0.6e9 })
add('P3040', 'تأمین شیرآلات مسدودکننده و اتصالات', '3', 60, [['E2040', 'FS', 0]], { rate: 1.2e9 })
add('P3050', 'تأمین مصالح جوشکاری و پوشش درزجوش', '3', 40, [['M1030', 'FS', 0]], { rate: 0.6e9 })
for (let i = 1; i <= NS; i++) add(`P31${String(i).padStart(2, '0')}`, `تحویل لوله برای بخش ${fa(i)}`, '3', 5, [['P3030', 'SS', 8 * (i - 1)]], { rate: 0.4e9 })
for (let i = 1; i <= NS; i++) {
  const c = (n) => `C${i}${String(n).padStart(2, '0')}`, s = fa(i)
  add(c(1), `پاکسازی و تسطیح مسیر — بخش ${s}`, `4.${i}`, d(18, i), i === 1 ? [['M1010', 'FS', 0], ['M1020', 'SS', 10]] : [[`C${i - 1}01`, 'SS', 8]])
  add(c(2), `ریسهٔ لوله — بخش ${s}`, `4.${i}`, d(14, i), [[c(1), 'SS', 8], [`P31${String(i).padStart(2, '0')}`, 'FS', 0]])
  add(c(3), `خم‌کاری و آماده‌سازی سر لوله — بخش ${s}`, `4.${i}`, d(16, i), [[c(2), 'SS', 4]])
  add(c(4), `جوشکاری خط لوله — بخش ${s}`, `4.${i}`, d(28, i), [[c(3), 'SS', 5], ['P3050', 'FS', 0], ...(i === 1 ? [['M1030', 'FS', 0]] : [])], { rate: 1.4e9 })
  add(c(5), `کنترل غیرمخرب جوش (RT/UT) — بخش ${s}`, `4.${i}`, d(28, i), [[c(4), 'SS', 3], [c(4), 'FF', 3]], { rate: 0.7e9 })
  add(c(6), `پوشش درزجوش — بخش ${s}`, `4.${i}`, d(26, i), [[c(5), 'SS', 3], [c(5), 'FF', 2]])
  add(c(7), `کانال‌کنی — بخش ${s}`, `4.${i}`, d(24, i), [[c(1), 'SS', 9]], { rate: 1.0e9 })
  add(c(8), `خوابانیدن لوله در کانال — بخش ${s}`, `4.${i}`, d(22, i), [[c(6), 'SS', 4], [c(7), 'FF', 3]])
  add(c(9), `پرکردن کانال و بازسازی مسیر — بخش ${s}`, `4.${i}`, d(20, i), [[c(8), 'SS', 3], [c(8), 'FF', 3]], { rate: 0.6e9 })
  add(c(10), `عبور از موانع (جاده، رودخانه، قنات) — بخش ${s}`, `4.${i}`, d(30, i), [[c(1), 'SS', 5]], { rate: 1.6e9 })
  add(c(11), `آزمون هیدرواستاتیک — بخش ${s}`, `4.${i}`, 8, [[c(9), 'FS', 0], [c(10), 'FS', 0]], { rate: 0.8e9 })
  add(c(12), `خشک‌کردن، تمیزکاری و تحویل موقت — بخش ${s}`, `4.${i}`, 6, [[c(11), 'FS', 0]], { rate: 0.4e9 })
}
const NK = 4
for (let k = 1; k <= NK; k++) {
  const s = (n) => `S${k}${String(n).padStart(2, '0')}`, f = fa(k)
  add(s(1), `عملیات ساختمانی و فونداسیون شیرخانهٔ ${f}`, `5.${k}`, 35, [['E2040', 'FS', 0], [`C${2 * k - 1}03`, 'SS', 0]], { rate: 0.9e9 })
  add(s(2), `نصب شیرآلات و پایپینگ شیرخانهٔ ${f}`, `5.${k}`, 30, [[s(1), 'SS', 20], ['P3040', 'FS', 0]], { rate: 1.1e9 })
  add(s(3), `برق، ابزار دقیق و ارت‌بندی شیرخانهٔ ${f}`, `5.${k}`, 25, [[s(2), 'SS', 10], ['E2030', 'FS', 0]], { rate: 0.8e9 })
  add(s(4), `تست و آمادگی راه‌اندازی شیرخانهٔ ${f}`, `5.${k}`, 12, [[s(3), 'FS', 0], [s(2), 'FS', 0]], { rate: 0.5e9 })
}
add('CP6010', 'نصب بسترهای آندی و پست‌های TR', '6', 40, [['E2030', 'FS', 0], ['C409', 'SS', 0]], { rate: 0.9e9 })
add('CP6020', 'نصب ایستگاه‌های اندازه‌گیری (TP)', '6', 30, [['CP6010', 'SS', 10]], { rate: 0.6e9 })
add('CP6030', 'تست، تنظیم و بهره‌برداری آزمایشی سیستم CP', '6', 20, [['CP6010', 'FS', 0], ['C812', 'FS', 0]], { rate: 0.6e9 })
add('PC7010', 'تمیزکاری و ژئومتری خط با پیگ', '7', 15, Array.from({ length: NS }, (_, i) => [`C${i + 1}12`, 'FS', 0]), { rate: 0.8e9 })
add('PC7020', 'آزمون یکپارچهٔ خط و پیش‌راه‌اندازی', '7', 12, [['PC7010', 'FS', 0], ...Array.from({ length: NK }, (_, k) => [`S${k + 1}04`, 'FS', 0])], { rate: 0.8e9 })
add('PC7030', 'بازرسی نهایی و تأیید بهره‌بردار', '7', 10, [['PC7020', 'FS', 0]], { rate: 0.4e9 })
add('PC7040', 'گازگذاری و راه‌اندازی', '7', 20, [['PC7030', 'FS', 0], ['CP6030', 'FS', 0]], { rate: 1.2e9 })
add('PC7050', 'تحویل موقت پروژه', '7', 0, [['PC7040', 'FS', 0]], { ms: true })
add('PC7060', 'رفع نواقص (Punch List)', '7', 15, [['PC7050', 'FS', 0]], { rate: 0.4e9 })
add('PC7070', 'مدارک As-Built و تحویل قطعی', '7', 15, [['PC7060', 'FS', 0]], { rate: 0.3e9 })
add('PC7090', 'پایان پروژه', '7', 0, [['PC7070', 'FS', 0]], { ms: true })

// ── Rev0: plan-mode dates from the app's own kernel
const mk = (a, i, extra = {}) => ({ id: a.code, uid: a.code, versionId: 'v', code: a.code, sourceId: a.code, name: a.name, wbsCode: a.g, wbsPath: '', type: a.type, calendarId: null, origDuration: a.dur, remDuration: null, plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: i, ...extra })
const rels = (list) => list.flatMap((a) => a.preds.map(([p, t, l]) => ({ id: `${p}>${a.code}${t}`, versionId: 'v', predId: p, succId: a.code, type: t, lag: l })))
const acts0 = A.map((a, i) => mk(a, i, i === 0 ? { plannedStart: START } : {}))
const plan = computeSchedule({ activities: acts0, relations: rels(A), calendar: CAL, mode: 'plan' })
if (!plan.ok) { console.error('plan failed', plan.cycle, plan.warnings); process.exit(1) }
const R0 = plan.byId

// ── "what really happened": a disrupted execution of the same logic (deterministic)
const f = {}
for (const a of A) f[a.code] = 1
f.M1020 = 1.3; f.P3040 = 1.5; f.C104 = 1.1; f.C204 = 1.12; f.C304 = 1.15; f.C404 = 1.3; f.C504 = 1.1
for (let i = 1; i <= NS; i++) { f[`C${i}10`] = 1.2; f[`C${i}02`] = i % 2 ? 1.1 : 1.0; f[`C${i}07`] = 1.08 }
const ddIdx = (iso) => cal.idxOnOrBefore(iso)
const late = { P3106: 75, P3107: 91, P3108: 105, C310: 75, C510: 80, C710: 92, S101: 58 } // working-day index of the expected start (supply / permit / drawings not ready)
const ord = [], seen = new Set()
const visit = (a) => { if (seen.has(a.code)) return; seen.add(a.code); for (const [p] of a.preds) visit(A.find((x) => x.code === p)); ord.push(a) }
A.forEach(visit)
const real = new Map()
for (const a of ord) {
  const dur = a.type === 'milestone' ? 0 : Math.max(1, Math.round(a.dur * (f[a.code] ?? 1)))
  let es = late[a.code] ?? 0
  for (const [p, t, l] of a.preds) {
    const r = real.get(p)
    if (t === 'FS') es = Math.max(es, r.fin + 1 + l)
    else if (t === 'SS') es = Math.max(es, r.es + l)
    else if (t === 'FF') es = Math.max(es, r.fin + l - dur + 1)
  }
  real.set(a.code, { es, dur, fin: dur > 0 ? es + dur - 1 : es })
}
const actualsAt = (iso) => {
  const dd = ddIdx(iso), out = new Map()
  for (const a of A) {
    const r = real.get(a.code)
    if (r.es > dd) continue
    if (a.type === 'milestone') { out.set(a.code, { as: cal.dateOf(r.es), af: cal.dateOf(r.es), pct: 100, rem: 0 }); continue }
    if (r.fin <= dd) out.set(a.code, { as: cal.dateOf(r.es), af: cal.dateOf(r.fin), pct: 100, rem: 0 })
    else { const el = dd - r.es + 1; out.set(a.code, { as: cal.dateOf(r.es), af: null, pct: Math.max(1, Math.min(99, Math.round((el / r.dur) * 100))), rem: Math.max(1, r.dur - el) }) }
  }
  return out
}
const ACT1 = actualsAt(DD1), ACT2 = actualsAt(DD2)

// ── Rev2 model (for the saved Monte Carlo run): a change order adds a coating rework, the section-5 crossing grows
const A2 = A.map((a) => (a.code === 'C510' ? { ...a, dur: 45 } : a))
A2.push({ code: 'X4060', name: 'اصلاح پوشش معیوب لوله‌ها — بخش ۴ (دستور تغییر)', g: '4.4', dur: 6, type: 'task', rate: 0.7e9, preds: [['C405', 'SS', 2]] })
const c409 = A2.find((a) => a.code === 'C409'); c409.preds = [...c409.preds, ['X4060', 'FF', 0]]
const acts2 = A2.map((a, i) => { const ac = ACT2.get(a.code); return mk(a, i, { plannedStart: R0.get(a.code)?.start ?? null, plannedFinish: R0.get(a.code)?.finish ?? null, ...(late[a.code] != null ? { constraintType: 'SNET', constraintDate: cal.dateOf(late[a.code]) } : {}), ...(ac ? { actualStart: ac.as, actualFinish: ac.af, pctComplete: ac.pct, remDuration: ac.af ? 0 : ac.rem } : {}) }) })
const fc = computeSchedule({ activities: acts2, relations: rels(A2), calendar: CAL, mode: 'forecast', dataDate: DD2 })

const status = (m) => { let n = 0, done = 0, run = 0; for (const a of A) { n++; if (m.get(a.code)?.af) done++; else if (m.get(a.code)) run++ } return { n, done, run } }
if (MODE === 'stats') {
  console.log('acts', A.length, 'rel', A.reduce((s, a) => s + a.preds.length, 0))
  console.log('Rev0 plan', plan.projectStart, '→', plan.projectFinish, 'wd', plan.duration, 'critical', plan.criticalPath.length)
  console.log('Rev1 DD', DD1, status(ACT1)); console.log('Rev2 DD', DD2, status(ACT2))
  console.log('Rev2 forecast finish', fc.projectFinish, 'critical', fc.criticalPath.length, fc.warnings.slice(0, 3))
  const sd = (iso) => cal.idxOnOrAfter(iso)
  console.log('slip (cal days)', Math.round((new Date(fc.projectFinish) - new Date(plan.projectFinish)) / 864e5))
  console.log('planned % at DD2 (by count of activities whose baseline finish ≤ DD2):', A.filter((a) => (R0.get(a.code).finish ?? '') <= DD2).length, 'of', A.length)
}
if (MODE === 'spec') {
  // summary rows (dates = envelope of children)
  const lines = []
  for (const g of Object.keys(GROUPS)) { const kids = A.filter((a) => a.g.split('.')[0] === g); lines.push(['W' + g, GROUPS[g], g, GROUPS[g], 'summary', 0, 0, '', kids.map((a) => R0.get(a.code).start).sort()[0], kids.map((a) => R0.get(a.code).finish).sort().pop()].join('|')) }
  for (const a of A) {
    const grp = a.g.split('.')[0], path = a.g.includes('.') ? `${GROUPS[grp]} > ${a.g === '4.' ? '' : 'بخش ' + fa(a.g.split('.')[1])}` : GROUPS[grp]
    const r = R0.get(a.code)
    lines.push([a.code, a.name, a.g, grp === '4' || grp === '5' ? `${GROUPS[grp]} > ${grp === '4' ? 'بخش' : 'شیرخانه'} ${fa(a.g.split('.')[1])}` : GROUPS[grp], a.type, a.dur, Math.round(a.dur * a.rate), a.preds.map((p) => p.join(':')).join(';'), r.start, r.finish].join('|'))
  }
  console.log(lines.join('\n'))
}
if (MODE === 'actuals') {
  console.log(['XNEW', 'X4060', fc.byId.get('X4060').start, fc.byId.get('X4060').finish].join('|'))
  for (const c of Object.keys(late)) console.log(['SNET', c, cal.dateOf(late[c])].join('|'))
  for (const [rev, m] of [[1, ACT1], [2, ACT2]]) for (const a of A) { const x = m.get(a.code); if (x) console.log([rev, a.code, x.as, x.af ?? '', x.pct, x.rem].join('|')) }
}
if (MODE === 'mc') {
  const done = (c) => ACT2.get(c)?.af
  const pick = (codes, lo, hi) => codes.filter((c) => !done(c)).map((c) => { const a = A2.find((x) => x.code === c); const d0 = ACT2.get(c) ? ACT2.get(c).rem : a.dur; return { code: c, min: Math.max(1, Math.round(d0 * lo)), likely: d0, max: Math.round(d0 * hi) } })
  const drs = [...pick(['C404', 'C504', 'C604', 'C704', 'C804'], 0.9, 1.5), ...pick(['C310', 'C510', 'C710'], 0.9, 1.8), ...pick(['P3106', 'P3107', 'P3108', 'P3040'], 0.8, 2), ...pick([1, 2, 3, 4].map((k) => `S${k}02`), 0.9, 1.6), ...pick([5, 6, 7, 8].map((i) => `C${i}11`), 0.9, 1.4)]
  const ev = [
    ['تأخیر شیرهای ۴۸ اینچ مسدودکننده', 0.45, 10, 20, 35, 2e9, 5e9, 9e9, ['S102', 'S202', 'S302', 'S402'], '7cec7f98-b3b9-4587-bbe1-d7cee69a187a'],
    ['کمبود لولهٔ ۴۸ اینچ برای جبههٔ شمال', 0.5, 7, 14, 28, 1e9, 3e9, 6e9, ['C602', 'C702', 'C802'], null],
    ['عدم صدور مجوز آب منطقه‌ای برای گذرهای HDD', 0.35, 15, 30, 60, 3e9, 8e9, 16e9, ['C310', 'C510', 'C710'], 'bbf380c3-03e3-4722-93ad-23d2f5cb557f'],
    ['توقف جوش در مناطق کلاس ۳ (تأیید ضخامت جداره)', 0.3, 5, 10, 20, 2e9, 4e9, 8e9, ['C404', 'C504', 'C604'], '2308e9bd-ce39-48c7-81bc-77899acff62b'],
    ['نوسان نرخ یورو در قرارداد تأمین لوله', 0.6, 0, 0, 0, 8e9, 18e9, 30e9, ['P3106'], 'e2572e77-0622-417f-be4b-c52e7fbb35db'],
  ]
  const events = ev.map((e, i) => ({ id: 'e' + i, title: e[0], probability: e[1], days: { min: e[2], likely: e[3], max: e[4] }, cost: { min: e[5], likely: e[6], max: e[7] }, activityUids: e[8], active: true }))
  const acts = acts2.map((a) => ({ ...a, budgetCost: Math.round(A2.find((x) => x.code === a.code).dur * A2.find((x) => x.code === a.code).rate) }))
  const res = runMonteCarlo({ schedule: { activities: acts, relations: rels(A2), calendar: CAL, mode: 'forecast', dataDate: DD2 }, durationRisks: drs.map((r) => ({ uid: r.code, min: r.min, likely: r.likely, max: r.max })), events, iterations: 3000, seed: 20261017 })
  console.log('DR', drs.map((r) => [r.code, r.min, r.likely, r.max].join(':')).join(','))
  console.log('EV', JSON.stringify(ev))
  console.log('RES', JSON.stringify({ ...res, sensitivity: res.sensitivity.slice(0, 12) }))
  console.error('P50/P80/P90', res.finish, 'det', res.deterministicFinish, res.reserveDays, res.cost)
}
if (MODE === 'crit') { console.log('plan crit', plan.criticalPath.join(' ')); console.log('fc crit', fc.criticalPath.join(' ')); console.log([...fc.byId.values()].filter((x) => x.totalFloat != null && x.totalFloat < 15).map((x) => x.code + ':' + x.totalFloat).join(' ')) }
if (MODE === 'base') for (const c of ['P3030', 'P3106', 'P3107', 'P3108', 'C802', 'C310', 'C510', 'C710', 'S101', 'S102', 'C801']) console.log(c, R0.get(c).start, R0.get(c).finish, cal.idxOnOrAfter(R0.get(c).start), 'dd2idx', ddIdx(DD2))

if (MODE === 'sql') {
  const { execFileSync } = await import('node:child_process')
  const { readFileSync, writeFileSync } = await import('node:fs')
  const run = (m) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', process.argv[1], m], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })
  const spec = run('spec').trim(), act = run('actuals').trim(), mc = run('mc')
  const dr = mc.split('\n').find((l) => l.startsWith('DR ')).slice(3), ev = mc.split('\n').find((l) => l.startsWith('EV ')).slice(3), res = mc.split('\n').find((l) => l.startsWith('RES ')).slice(4)
  const tpl = readFileSync(new URL('./seed-demo.template.sql', import.meta.url), 'utf8')
  const hol = CAL.holidays.map((h) => `'${h}'`).join(',')
  writeFileSync(new URL('./seed-demo.sql', import.meta.url), tpl.replaceAll('@SPEC@', () => spec).replaceAll('@ACT@', () => act).replaceAll('@DR@', () => dr).replaceAll('@EV@', () => ev).replaceAll('@RES@', () => res).replaceAll('@HOL@', hol).replaceAll('@START@', START).replaceAll('@DD1@', DD1).replaceAll('@DD2@', DD2).replaceAll('@FIN0@', plan.projectFinish).replaceAll('@FIN2@', fc.projectFinish))
  console.log('written')
}
