// Compressor-station registers (migration 050) on the ISOLATED test database: permissions, server rules and the
// app's own inch-dia / readiness calculation compared with SQL. Run: bash run.sh cs  (or node … cs_check.mjs)
import { execFileSync } from 'node:child_process'
import { csSummary, packReadiness } from '../../../src/modules/execution/lib/csCore.ts'

const P = '7e570000-0000-4000-8000-0000000000e2'
const U = { contractor: 'c0000000-0000-4000-8000-000000000001', supervision: 'c0000000-0000-4000-8000-000000000003', viewer: 'c0000000-0000-4000-8000-000000000006', outsider: 'c0000000-0000-4000-8000-0000000000ff' }
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'farin-test', 'psql', '-h', 'localhost', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const asWho = (who, sql) => `begin; set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: U[who], role: 'authenticated' })}', true) \\g /dev/null\n${sql};\ncommit;`
const as = (who, sql) => { try { return { ok: true, out: psql(asWho(who, sql)), error: '' } } catch (e) { return { ok: false, out: '', error: String(e.stderr || e.message).split('\n').find((l) => l.includes('ERROR')) ?? String(e).slice(0, 200) } } }
const json = (q) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${q}) t;`) || '[]')
const res = []
const check = (id, title, pass, note = '') => res.push({ id, title, pass: !!pass, note })

// clean slate for this script's own rows (test DB only)
psql(`delete from cs_history where project_id='${P}'; delete from cs_welds where project_id='${P}'; delete from cs_spools where project_id='${P}'; delete from cs_lines where project_id='${P}'; delete from cs_equipment where project_id='${P}'; delete from cs_test_packs where project_id='${P}';`)

// C01 — the contractor records lines, a pack, spools and welds
let r = as('contractor', `
insert into cs_test_packs (id, project_id, pack_no, system, test_press_bar) values ('a0000000-0000-4000-8000-0000000000a1', '${P}', 'TP-001', 'Discharge', 120);
insert into cs_lines (id, project_id, line_no, service, size_in, ndt_pct, test_pack_id) values
 ('a0000000-0000-4000-8000-0000000000b1', '${P}', '8"-PG-1001', 'گاز فرآیندی', 8, 100, 'a0000000-0000-4000-8000-0000000000a1'),
 ('a0000000-0000-4000-8000-0000000000b2', '${P}', '2"-IA-2001', 'هوای ابزار', 2, 10, 'a0000000-0000-4000-8000-0000000000a1');
insert into cs_spools (id, project_id, line_id, spool_no, size_in, stage) values ('a0000000-0000-4000-8000-0000000000c1', '${P}', 'a0000000-0000-4000-8000-0000000000b1', 'SP-1001-01', 8, 'welded');
insert into cs_welds (id, project_id, line_id, spool_id, weld_no, location, size_in, welder, fitup_date, weld_date) values
 ('a0000000-0000-4000-8000-0000000000d1', '${P}', 'a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000c1', 'W1', 'shop', 8, 'WD-07', '2026-10-01', '2026-10-02'),
 ('a0000000-0000-4000-8000-0000000000d2', '${P}', 'a0000000-0000-4000-8000-0000000000b1', null, 'W2', 'field', 8, 'WD-07', '2026-10-03', '2026-10-04'),
 ('a0000000-0000-4000-8000-0000000000d3', '${P}', 'a0000000-0000-4000-8000-0000000000b2', null, 'W3', 'field', 2, 'WD-09', '2026-10-03', null);
insert into cs_equipment (project_id, tag, title, kind, steps) values ('${P}', 'K-101', 'کمپرسور گاز', 'compressor', '{"foundation":"2026-09-01","set":"2026-09-10"}');`)
check('C01', 'پیمانکار لاین، تست‌پک، اسپول، جوش و تجهیز ثبت می‌کند', r.ok, r.error)
if (!r.ok) console.error('C01', r.error)

// C02 — no access for someone outside the project; read-only for the viewer
r = as('outsider', `select count(*) from cs_welds where project_id='${P}'`)
check('C02', 'فرد خارج از پروژه چیزی نمی‌بیند', r.ok && r.out.trim() === '0', r.out || r.error)
r = as('viewer', `insert into cs_lines (project_id, line_no, size_in) values ('${P}', 'X', 4)`)
const vr = as('viewer', `select count(*) from cs_lines where project_id='${P}'`)
check('C03', 'بیننده فقط می‌خواند و نمی‌نویسد', !r.ok && vr.out.trim() === '2', `${r.error} | ${vr.out}`)

// C04 — the contractor cannot accept his own weld
r = as('contractor', `update cs_welds set ndt_result='accept', ndt_date='2026-10-05' where id='a0000000-0000-4000-8000-0000000000d1'`)
check('C04', 'پیمانکار نمی‌تواند نتیجهٔ NDT را «قبول» بزند', !r.ok && r.error.includes('ndt_reviewer_only'), r.error)

// C05 — supervision records NDT: W1 accepted, W2 rejected
r = as('supervision', `update cs_welds set ndt_result='accept', ndt_method='RT', ndt_date='2026-10-05' where id='a0000000-0000-4000-8000-0000000000d1';
update cs_welds set ndt_result='reject', ndt_method='RT', ndt_date='2026-10-05' where id='a0000000-0000-4000-8000-0000000000d2';`)
check('C05', 'نظارت نتیجهٔ NDT را ثبت می‌کند', r.ok, r.error)

// C06 — the pack cannot be marked tested (W2 rejected, W3 not welded)
r = as('supervision', `update cs_test_packs set status='tested', test_date='2026-10-10' where id='a0000000-0000-4000-8000-0000000000a1'`)
check('C06', 'تست‌پک ناآماده «آزمون‌شده» نمی‌شود', !r.ok && r.error.includes('pack_not_ready'), r.error)

// C07 — the contractor repairs W2 (reject → pending with repair +1) and welds W3; a bare reset is refused
const bare = as('contractor', `update cs_welds set ndt_result='pending' where id='a0000000-0000-4000-8000-0000000000d2'`)
r = as('contractor', `update cs_welds set ndt_result='pending', repair_count=repair_count+1 where id='a0000000-0000-4000-8000-0000000000d2';
update cs_welds set weld_date='2026-10-06' where id='a0000000-0000-4000-8000-0000000000d3';`)
check('C07', 'تعمیر جوش ردشده فقط همراه با ثبت تعمیر', !bare.ok && r.ok, `${bare.error} | ${r.error}`)

// C08 — a weld date before fit-up is refused
r = as('contractor', `update cs_welds set weld_date='2026-09-01' where id='a0000000-0000-4000-8000-0000000000d1'`)
check('C08', 'تاریخ جوش پیش از فیت‌آپ پذیرفته نمی‌شود', !r.ok, r.error)

// C09 — the app's readiness equals the server's: still not ready (W2 waiting re-test), then ready after acceptance
const load = () => {
  const lines = json(`select * from cs_lines where project_id='${P}'`).map((l) => ({ id: l.id, projectId: l.project_id, lineNo: l.line_no, sizeIn: +l.size_in, ndtPct: +l.ndt_pct, testPackId: l.test_pack_id, archived: l.archived }))
  const welds = json(`select * from cs_welds where project_id='${P}'`).map((w) => ({ id: w.id, lineId: w.line_id, location: w.location, sizeIn: +w.size_in, welder: w.welder, fitupDate: w.fitup_date, weldDate: w.weld_date, ndtResult: w.ndt_result, repairCount: w.repair_count, archived: w.archived }))
  const packs = json(`select * from cs_test_packs where project_id='${P}'`).map((p) => ({ id: p.id, punchA: p.punch_a, status: p.status, archived: p.archived }))
  return { lines, welds, packs }
}
let d = load()
const before = packReadiness(d.packs[0], d.lines, d.welds)
r = as('supervision', `update cs_welds set ndt_result='accept', ndt_date='2026-10-07' where id='a0000000-0000-4000-8000-0000000000d2'`)
d = load()
const after = packReadiness(d.packs[0], d.lines, d.welds)
const tested = as('supervision', `update cs_test_packs set status='tested', test_date='2026-10-10' where id='a0000000-0000-4000-8000-0000000000a1'`)
check('C09', 'آمادگی تست‌پک در برنامه و سرور یکسان است', !before.ready && after.ready && tested.ok, `before=${JSON.stringify(before.reasons)} after=${after.ready} server=${tested.ok || tested.error}`)

// C10 — inch-dia: app vs SQL (W3 on a 10%-NDT line earns 100% when welded)
const s = csSummary({ lines: d.lines, spools: [], welds: d.welds, equipment: [], packs: [] })
const sql = json(`select sum(size_in) total, sum(size_in) filter (where location='shop') shop, sum(size_in) filter (where weld_date is not null) welded from cs_welds where project_id='${P}' and not archived`)[0]
check('C10', 'اینچ‌قطر کل، کارگاهی و جوش‌شده = SQL', s.all.total === +sql.total && s.shop.total === +sql.shop && s.all.welded === +sql.welded && Math.abs(s.piping - 1) < 1e-9, `app ${s.all.total}/${s.shop.total}/${s.all.welded} piping ${s.piping} · sql ${sql.total}/${sql.shop}/${sql.welded}`)
check('C11', 'نرخ رد NDT با احتساب تعمیر', s.ndt.examined === 3 && s.ndt.rejected === 1, JSON.stringify(s.ndt))

// C12 — every change is in the history; the contractor cannot move a row to another project
const h = json(`select entity, action, changes from cs_history where project_id='${P}' and row_id='a0000000-0000-4000-8000-0000000000d2' order by id`)
r = as('contractor', `update cs_lines set project_id='6b25ebd9-e2f7-4385-90e7-c954a0880232' where id='a0000000-0000-4000-8000-0000000000b1'`)
check('C12', 'تاریخچهٔ تغییرات و قفل پروژه', h.length >= 4 && h.some((x) => x.changes.repair_count) && !r.ok, `${h.length} rows · ${r.error}`)

// C13 — no delete for anyone (archive instead)
r = as('supervision', `delete from cs_welds where id='a0000000-0000-4000-8000-0000000000d3' returning id`)
const still = json(`select id from cs_welds where id='a0000000-0000-4000-8000-0000000000d3'`).length
check('C13', 'حذف ممکن نیست؛ فقط بایگانی', still === 1, r.error || r.out)

console.log(JSON.stringify({ passed: res.filter((x) => x.pass).length, total: res.length, results: res }, null, 1))
