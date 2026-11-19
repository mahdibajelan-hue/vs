// End-to-end check of the Execution module against an ISOLATED test database (docker container `farin-test`),
// filled by gen_scenario.py. It reads the real rows back, runs them through the app's own calculation code
// (src/modules/execution/lib), compares every figure with an independent SQL total, and then drives the
// correction, measurement, statement and permission flows through the same RPCs the app calls, as the right person.
//
// Run: node --disable-warning=ExperimentalWarning supabase/tests/execution_e2e/e2e_check.mjs > results.json
import { execFileSync } from 'node:child_process'
import { cumulative, physicalProgress } from '../../../src/modules/execution/lib/progress.ts'
import { activityRows, resourceSummary, stoppageSummary } from '../../../src/modules/execution/lib/periodReport.ts'
import { monthOf, periodsBetween } from '../../../src/modules/execution/lib/periods.ts'
import { buildStatement } from '../../../src/modules/execution/lib/statement.ts'

const P = '7e570000-0000-4000-8000-0000000000e2'
const U = { contractor: 'c0000000-0000-4000-8000-000000000001', site_head: 'c0000000-0000-4000-8000-000000000002', supervision: 'c0000000-0000-4000-8000-000000000003',
  consultant: 'c0000000-0000-4000-8000-000000000004', employer: 'c0000000-0000-4000-8000-000000000005', viewer: 'c0000000-0000-4000-8000-000000000006' }

const psql = (sql) => execFileSync('docker', ['exec', '-i', 'farin-test', 'psql', '-h', 'localhost', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const json = (q) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${q}) t;`) || '[]')
/** run SQL as a signed-in person; returns { ok, error } */
const as = (who, sql) => {
  try { psql(`begin; set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: U[who], role: 'authenticated' })}', true) \\g /dev/null\n${sql}\ncommit;`); return { ok: true, error: '' } }
  catch (e) { return { ok: false, error: String(e.stderr || e.message).split('\n').find((l) => l.includes('ERROR')) ?? String(e).slice(0, 200) } }
}
const n = (v) => (v == null ? 0 : Number(v)); const nn = (v) => (v == null ? null : Number(v))

function load() {
  const activities = json(`select * from ex_activities where project_id = '${P}' order by sort`).map((r) => ({ id: r.id, projectId: r.project_id, itemNo: r.item_no, title: r.title, unit: r.unit, chapter: r.chapter, kind: r.kind, baseQty: n(r.base_qty), unitPrice: n(r.unit_price), weight: n(r.weight), weightGroup: r.weight_group, plannedStart: r.planned_start, plannedEnd: r.planned_end, active: r.active, approval: r.approval, sort: r.sort, rowNo: r.row_no ?? '', chapterNo: r.chapter_no ?? '', parentActivityId: r.parent_activity_id ?? null, surchargePct: nn(r.surcharge_pct), bookId: r.book_id ?? null, priceItemId: r.price_item_id }))
  const reports = json(`select * from ex_reports where project_id = '${P}'`).map((r) => ({ id: r.id, projectId: r.project_id, formKey: r.form_key, reportNo: r.report_no, reportDate: r.report_date, front: r.front, station: r.station ?? '', status: r.status, contractorOrgId: r.contractor_org_id }))
  const lines = json(`select l.* from ex_report_lines l join ex_reports r on r.id = l.report_id where r.project_id = '${P}'`).map((r) => ({ id: r.id, reportId: r.report_id, lineNo: r.line_no, activityId: r.activity_id, qty: n(r.qty), kmFrom: nn(r.km_from), kmTo: nn(r.km_to), location: r.location, status: r.status, approvedQty: nn(r.approved_qty), employerStatus: r.employer_status, employerQty: nn(r.employer_qty), sourceReportId: r.source_report_id }))
  const resources = json(`select x.* from ex_report_resources x join ex_reports r on r.id = x.report_id where r.project_id = '${P}'`).map((r) => ({ reportId: r.report_id, kind: r.kind, name: r.name, activeQty: n(r.active_qty), idleQty: n(r.idle_qty), leaveQty: n(r.leave_qty), stoppedQty: n(r.stopped_qty), repairQty: n(r.repair_qty), hours: n(r.hours) }))
  const stoppages = json(`select x.* from ex_report_stoppages x join ex_reports r on r.id = x.report_id where r.project_id = '${P}'`).map((r) => ({ reportId: r.report_id, category: r.category, hours: n(r.hours) }))
  return { activities, reports, lines, resources, stoppages, baselines: [], blines: [] }
}
/** independent truth: approved total per activity up to a date, straight in SQL */
const sqlApproved = (until, from = '0001-01-01') => Object.fromEntries(json(`select l.activity_id a, sum(coalesce(l.approved_qty, l.qty)) q from ex_report_lines l join ex_reports r on r.id = l.report_id
  where r.project_id = '${P}' and r.form_key = 'work' and r.status in ('approved','partially_approved') and l.status = 'approved' and r.report_date between '${from}' and '${until}' group by 1`).map((x) => [x.a, n(x.q)]))

const results = []
const rec = (id, title, input, expected, actual, pass, note = '') => results.push({ id, title, input, expected, actual, pass, note })
const close = (a, b) => Math.abs(a - b) < 1e-6

let d = load()
const base = (a) => a.baseQty
const FROM = '2026-09-21', TO = '2026-10-26'

// S1 — the data really is in the database
const byStatus = Object.fromEntries(json(`select status, count(*) c from ex_reports where project_id = '${P}' group by 1`).map((x) => [x.status, Number(x.c)]))
rec('S01', 'گزارش‌های روزانه در پایگاه داده', '۳۷ روز، جمعه‌ها بدون گزارش', '≥ ۳۰ گزارش با ردیف، منابع و توقف', { reports: d.reports.length, byStatus, lines: d.lines.length, resources: d.resources.length, stoppages: d.stoppages.length }, d.reports.length >= 30 && d.lines.length > 100)

// S2 — weekly reports straight from the daily reports, no double counting, cumulative continuity
const weeks = periodsBetween('week', FROM, TO, 0)
let weekOk = true; const weekSum = new Map(); const weekTable = []
let prevCum = new Map()
for (const w of weeks) {
  const rows = activityRows(d, w, base)
  for (const r of rows) {
    weekSum.set(r.activity.id, (weekSum.get(r.activity.id) ?? 0) + r.approvedCounted)
    const expectCum = (prevCum.get(r.activity.id) ?? 0) + r.approvedCounted
    if (!close(r.cumApproved, expectCum) || !close(r.prevApproved, prevCum.get(r.activity.id) ?? 0)) weekOk = false
    prevCum.set(r.activity.id, r.cumApproved)
  }
  weekTable.push({ week: w.label, from: w.from, to: w.to, welding: rows.find((r) => r.activity.itemNo === 'C-04')?.approvedCounted ?? 0 })
}
const truthAll = sqlApproved(TO)
const weekVsTruth = d.activities.map((a) => ({ item: a.itemNo, weeks: weekSum.get(a.id) ?? 0, sql: truthAll[a.id] ?? 0 }))
rec('S02', 'گزارش هفتگی (تجمیع خودکار)', `${weeks.length} هفته`, 'جمع هفته‌ها = جمع تأییدشده؛ تجمعی هر هفته = قبلی + این هفته', { weekTable, weekVsTruth }, weekOk && weekVsTruth.every((x) => close(x.weeks, x.sql)))

// S3 — monthly across the Shamsi month boundary (Shahrivar / Mehr / Aban)
const months = periodsBetween('month', FROM, TO)
const monthRows = months.map((m) => ({ month: m.label, from: m.from, to: m.to, rows: activityRows(d, m, base) }))
const monthVsSql = monthRows.map((m) => { const s = sqlApproved(m.to, m.from); return { month: m.month, from: m.from, to: m.to, ok: m.rows.every((r) => close(r.approvedCounted, s[r.activity.id] ?? 0)), welding: m.rows.find((r) => r.activity.itemNo === 'C-04')?.approvedCounted ?? 0, weldingSql: s[d.activities.find((a) => a.itemNo === 'C-04').id] ?? 0 } })
const monthTotal = d.activities.every((a) => close(monthRows.reduce((s, m) => s + (m.rows.find((r) => r.activity.id === a.id)?.approvedCounted ?? 0), 0), truthAll[a.id] ?? 0))
rec('S03', 'گزارش ماهانه با مرز ماه شمسی', months.map((m) => m.label).join('، '), 'هر ماه = SQL مستقل؛ جمع ماه‌ها = کل؛ بدون جمع‌زدن مقادیر تجمعی', monthVsSql, monthVsSql.every((m) => m.ok) && monthTotal)

// S4 — resources and stoppages summaries
const mehr = monthOf('2026-10-01')
const res = resourceSummary(d, mehr), stop = stoppageSummary(d, mehr)
rec('S04', 'خلاصهٔ منابع و توقفات ماه', mehr.label, 'میانگین نفرات/تجهیزات و ساعات توقف به تفکیک علت', { resources: res.map((r) => ({ name: r.name, avgActive: +r.avgActive.toFixed(1), avgIdle: +r.avgIdle.toFixed(2), days: r.days })), stoppages: stop }, res.length > 0 && stop.length >= 3)

// S5 — the three levels kept apart: reported / approved (supervision) / employer-confirmed
const lv = json(`select a.item_no, sum(l.qty) filter (where l.status <> 'rejected') reported, sum(l.qty) filter (where l.status = 'pending') pending,
  sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) end) approved, sum(l.employer_qty) filter (where l.employer_status = 'approved') employer
  from ex_report_lines l join ex_reports r on r.id = l.report_id join ex_activities a on a.id = l.activity_id where r.project_id = '${P}' group by 1 order by 1`)
rec('S05', 'تفکیک سطوح: گزارش‌شده / تأیید ناظر / تأیید کارفرما', 'همهٔ ردیف‌ها', 'سه ستون مستقل؛ تأییدشده ≤ گزارش‌شده', lv, lv.every((x) => n(x.approved) <= n(x.reported) + 1e-9))

// S6 — rejected line, cut quantity, returned-and-fixed report, with history and versions
const cut = json(`select a.item_no, l.qty, l.approved_qty, l.status, l.review_note from ex_report_lines l join ex_reports r on r.id = l.report_id join ex_activities a on a.id = l.activity_id where r.project_id = '${P}' and r.report_date = '2026-10-06' and a.item_no in ('C-04','C-05')`)
const hist = json(`select h.action, h.note from ex_report_history h join ex_reports r on r.id = h.report_id where r.project_id = '${P}' and r.report_date = '2026-09-29' order by h.at, h.id`)
const vers = json(`select v.version, v.status from ex_report_versions v join ex_reports r on r.id = v.report_id where r.project_id = '${P}' and r.report_date = '2026-09-29' order by v.version`)
rec('S06', 'رد، کسر مقدار، برگشت و اصلاح با سابقه', 'گزارش‌های ۱۴۰۵/۰۷/۰۷ و ۱۴۰۵/۰۷/۱۴', 'ردیف ردشده=۰؛ ردیف کسرشده با یادداشت؛ تاریخچه و نسخه‌ها کامل', { cut, hist, vers },
  cut.some((x) => x.status === 'rejected' && n(x.approved_qty) === 0) && cut.some((x) => x.status === 'approved' && n(x.approved_qty) === n(x.qty) - 6 && x.review_note) && hist.some((h) => h.action.includes('returned')) && vers.length >= 4)

// S7 — guards: over the contract quantity, duplicate line, permissions
const repNew = '1e000000-0000-4000-8000-0000000000aa'
as('site_head', `insert into ex_reports (id, project_id, form_key, report_date, front, status) values ('${repNew}', '${P}', 'work', '2026-10-26', 'جبهه ۳ (KP 20–30)', 'draft');
  insert into ex_report_lines (report_id, line_no, activity_id, qty, location) values ('${repNew}', 1, 'ac000000-0000-4000-8000-000000000001', 999999, 'آزمون سقف');`)
const over = as('site_head', `select ex_report_submit('${repNew}');`)
const dupId = json(`select r.id, l.activity_id, l.location from ex_reports r join ex_report_lines l on l.report_id = r.id where r.project_id = '${P}' and r.report_date = '2026-10-20' limit 1`)[0]
const dup = as('site_head', `insert into ex_reports (id, project_id, form_key, report_date, front, status) select '1e000000-0000-4000-8000-0000000000ab', project_id, 'work', report_date, front, 'draft' from ex_reports where id = '${dupId.id}';
  insert into ex_report_lines (report_id, line_no, activity_id, qty, location) values ('1e000000-0000-4000-8000-0000000000ab', 1, '${dupId.activity_id}', 10, '${dupId.location}');`)
const viewerIns = as('viewer', `insert into ex_reports (project_id, form_key, report_date, status) values ('${P}', 'work', '2026-10-26', 'draft');`)
const sub = json(`select id from ex_reports where project_id = '${P}' and status = 'submitted' limit 1`)[0]
const contractorReview = as('site_head', `select ex_report_decide_whole('${sub.id}', 'approved', '');`)
const appr = json(`select l.id, r.id rid from ex_report_lines l join ex_reports r on r.id = l.report_id where r.project_id = '${P}' and r.status = 'approved' limit 1`)[0]
const editLocked = as('site_head', `update ex_report_lines set qty = qty + 100 where id = '${appr.id}';`)
const apBefore = json(`select approved_qty from ex_report_lines where id = '${appr.id}'`)[0].approved_qty
const supEditTry = as('supervision', `update ex_report_lines set approved_qty = 1 where id = '${appr.id}';`)
// row-level security hides the row from a direct update (0 rows, no error): what matters is that nothing changed
const supEdit = { ...supEditTry, ok: supEditTry.ok && json(`select approved_qty from ex_report_lines where id = '${appr.id}'`)[0].approved_qty !== apBefore, changed: json(`select approved_qty from ex_report_lines where id = '${appr.id}'`)[0].approved_qty !== apBefore }
const employerOff = as('employer', `select ex_report_employer_review('${appr.rid}', '[]'::jsonb);`)
rec('S07', 'کنترل‌ها و دسترسی', 'مقدار بیش از پیمان، ردیف تکراری، بیننده، تأیید توسط پیمانکار، ویرایش گزارش تأییدشده', 'همه رد شوند',
  { overBase: over, duplicate: dup, viewerInsert: viewerIns, contractorApprove: contractorReview, editApprovedLine: editLocked, supervisionDirectEdit: supEdit, employerReviewAdvisoryEmpty: employerOff },
  !over.ok && /exceeds_base/.test(over.error) && !dup.ok && /duplicate_line/.test(dup.error) && !viewerIns.ok && !contractorReview.ok && !editLocked.ok && !supEdit.ok)
psql(`set session_replication_role = replica; delete from ex_report_lines where report_id in ('${repNew}','1e000000-0000-4000-8000-0000000000ab'); delete from ex_reports where id in ('${repNew}','1e000000-0000-4000-8000-0000000000ab');`)

// S8 — correcting an approved report through the allowed path, and its effect on the weekly / monthly figures
const target = json(`select r.id, l.id lid, l.qty, a.id aid from ex_reports r join ex_report_lines l on l.report_id = r.id join ex_activities a on a.id = l.activity_id where r.project_id = '${P}' and r.report_date = '2026-10-14' and a.item_no = 'C-04'`)[0]
const before = activityRows(d, mehr, base).find((r) => r.activity.id === target.aid).approvedCounted
const reopen = as('supervision', `select ex_report_reopen('${target.id}', 'اصلاح تعداد سرجوش طبق لاگ جوش');`)
d = load(); const during = activityRows(d, mehr, base).find((r) => r.activity.id === target.aid)?.approvedCounted ?? 0
const fix = as('site_head', `update ex_report_lines set qty = qty - 4 where id = '${target.lid}'; select ex_report_submit('${target.id}');`)
const reapprove = as('supervision', `select ex_report_decide_whole('${target.id}', 'approved', '');`)
d = load(); const after = activityRows(d, mehr, base).find((r) => r.activity.id === target.aid).approvedCounted
const snaps = json(`select version, status, (select (x->>'qty')::numeric from jsonb_array_elements(snapshot->'lines') x where x->>'id' = '${target.lid}') qty from ex_report_versions where report_id = '${target.id}' order by version`)
rec('S08', 'اصلاح گزارش تأییدشده با گردش مجاز', `گزارش ۱۴۰۵/۰۷/۲۲، جوشکاری ${target.qty} → ${n(target.qty) - 4}`, 'بازگشایی توسط ناظر ← اصلاح ← تأیید؛ ماهانه −۴؛ نسخهٔ قبلی محفوظ',
  { reopen, fix, reapprove, monthBefore: before, monthWhileOpen: during, monthAfter: after, versions: snaps }, reopen.ok && fix.ok && reapprove.ok && close(after, before - 4) && close(during, before - n(target.qty)) && snaps.some((s) => n(s.qty) === n(target.qty)))

// S9 — measurement → billed → paid chain (level 3), with its guards
const wld = d.activities.find((a) => a.itemNo === 'C-04')
const apWld = sqlApproved('2026-10-22')[wld.id]
const m1 = as('consultant', `insert into ex_measurements (project_id, activity_id, period_key, measured_qty, billed_qty, paid_qty, note) values ('${P}', '${wld.id}', 'M1405-07', ${apWld - 20}, ${apWld - 40}, 0, 'صورت‌جلسهٔ اندازه‌گیری مهر');`)
const m2 = as('consultant', `insert into ex_measurements (project_id, activity_id, period_key, measured_qty, billed_qty, paid_qty) values ('${P}', '${wld.id}', 'M1405-08', 99999, 0, 0);`)
const m3 = as('consultant', `update ex_measurements set billed_qty = measured_qty + 1 where project_id = '${P}' and period_key = 'M1405-07';`)
const m4 = as('site_head', `insert into ex_measurements (project_id, activity_id, period_key, measured_qty) values ('${P}', '${wld.id}', 'M1405-09', 1);`)
rec('S09', 'سطح سوم: اندازه‌گیری ← قابل‌پرداخت ← پرداخت‌شده', `جوشکاری، تأییدشده تا پایان مهر = ${apWld}`, 'اندازه‌گیری ≤ تأییدشده، قابل‌پرداخت ≤ اندازه‌گیری؛ پیمانکار مجاز به ثبت اندازه‌گیری نیست',
  { valid: m1, measuredOverApproved: m2, billedOverMeasured: m3, contractorMeasures: m4 }, m1.ok && !m2.ok && !m3.ok && !m4.ok)

// S10 — monthly statement from approved quantities (as ContractStatementPage builds it) and its integrity
const cumMehr = cumulative(d.reports, d.lines, { until: mehr.to, mode: 'approved' })
const payload = d.activities.map((a) => ({ activity_id: a.id, sys: cumMehr.get(a.id) ?? 0, unit_price: a.unitPrice, base_qty: a.baseQty }))
const st = as('contractor', `select ex_statement_create('${P}', '${mehr.from}', '${mehr.to}', '${JSON.stringify(payload)}'::jsonb);`)
const rows = json(`select a.item_no, s.sys_cum, s.req_cum, s.con_cum, s.unit_price from ex_statement_rows s join ex_activities a on a.id = s.activity_id where s.project_id = '${P}' order by a.sort`)
const truthMehr = sqlApproved(mehr.to)
const sysOk = rows.every((r) => close(n(r.sys_cum), truthMehr[d.activities.find((a) => a.itemNo === r.item_no).id] ?? 0))
psql(`set session_replication_role = replica; delete from ex_statement_rows where project_id = '${P}'; delete from ex_statements where project_id = '${P}';`)
const forged = d.activities.map((a) => ({ activity_id: a.id, sys: (cumMehr.get(a.id) ?? 0) * 3, unit_price: a.unitPrice * 2, base_qty: a.baseQty }))
const st2 = as('contractor', `select ex_statement_create('${P}', '${mehr.from}', '${mehr.to}', '${JSON.stringify(forged)}'::jsonb);`)
const forgedRows = json(`select a.item_no, s.sys_cum, s.unit_price from ex_statement_rows s join ex_activities a on a.id = s.activity_id where s.project_id = '${P}' order by a.sort limit 3`)
const book = buildStatement(d, { from: mehr.from, to: mehr.to }, (a) => a.baseQty, () => 'اجرا')
rec('S10', 'صورت‌وضعیت آزمایشی ماه مهر از مقادیر تأییدشده', `${mehr.label}، ${rows.length} ردیف`, 'مقدار سیستمی هر ردیف = تأییدشدهٔ واقعی؛ مقدار جعلی رد شود',
  { created: st, rowsSample: rows.slice(0, 4), sysEqualsApproved: sysOk, forgedAccepted: st2.ok, forgedRows, workDoneStatementTotal: Math.round(book.grand.cumAmt) }, st.ok && sysOk && !st2.ok,
  st2.ok ? 'اشکال: سرور مقدار «سیستمی» و فی را از مرورگر می‌پذیرد و با تأییدشده‌ها مقایسه نمی‌کند' : '')
psql(`set session_replication_role = replica; delete from ex_statement_rows where project_id = '${P}'; delete from ex_statements where project_id = '${P}';`)

// S11 — binding employer step: does the statement follow the employer-confirmed quantity?
psql(`update ex_settings set values_json = values_json || '{"employerStep":"binding"}' where project_id = '${P}';`)
const empAware = cumulative(d.reports, d.lines, { until: mehr.to, mode: 'approved', employer: 'binding' })
const pageWay = cumulative(d.reports, d.lines, { until: mehr.to, mode: 'approved' })
const progBinding = physicalProgress({ ...d, asOf: mehr.to, mode: 'approved', employer: 'binding' }).overall
const progOff = physicalProgress({ ...d, asOf: mehr.to, mode: 'approved' }).overall
psql(`update ex_settings set values_json = values_json || '{"employerStep":"advisory"}' where project_id = '${P}';`)
rec('S11', 'گام الزامی کارفرما در صورت‌وضعیت', 'employerStep = binding', 'صورت‌وضعیت فقط مقدار تأییدشدهٔ کارفرما را بگیرد',
  { weldingStatementAsPageBuildsIt: pageWay.get(wld.id), weldingEmployerConfirmed: empAware.get(wld.id), progressBinding: +(progBinding * 100).toFixed(2), progressOff: +(progOff * 100).toFixed(2) },
  close(pageWay.get(wld.id) ?? 0, empAware.get(wld.id) ?? 0), 'صفحهٔ صورت‌وضعیت قرارداد، گزینهٔ employer را به cumulative() نمی‌دهد')

// S12 — traceability: every monthly figure back to its daily reports
const trace = json(`select r.report_no, r.report_date, r.front, l.qty reported, l.approved_qty approved, l.status from ex_report_lines l join ex_reports r on r.id = l.report_id
  where r.project_id = '${P}' and l.activity_id = '${wld.id}' and r.report_date between '${mehr.from}' and '${mehr.to}' order by r.report_date`)
const traced = trace.filter((t) => t.status === 'approved').reduce((s, t) => s + n(t.approved), 0)
const fig = activityRows(load(), mehr, base).find((r) => r.activity.id === wld.id).approvedCounted
rec('S12', 'ردیابی عدد ماهانه تا گزارش روزانه', `جوشکاری ${mehr.label} = ${fig}`, 'جمع ردیف‌های منبع = عدد گزارش', { figure: fig, tracedSum: traced, sources: trace.length, first: trace.slice(0, 3) }, close(fig, traced))

console.log(JSON.stringify({ when: new Date().toISOString(), project: P, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results }, null, 1))
