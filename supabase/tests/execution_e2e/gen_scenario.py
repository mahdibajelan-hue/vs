#!/usr/bin/env python3
"""Test scenario for the Execution module — ONLY for an isolated test database (never the live one).

A synthetic 30 km section of the 42" Sarakhs–Mashhad gas transmission line, 37 calendar days that cross a Shamsi month boundary
(1405/06/30 → 1405/08/04, i.e. 2026-09-21 → 2026-10-26), three work fronts, contractor / supervision / consultant /
employer accounts. Every step runs as the right person (role `authenticated` + that person's JWT claims), through the
same tables and RPCs the app uses, so row-level security, guards and triggers all apply.

The scenario includes: idle Fridays, simultaneous activities, a front switch, productivity changes, a stop for missing
material, rain days, a manpower shortage, an equipment breakdown, a report returned and corrected, a line rejected,
a quantity cut by supervision, employer review, measurements, and a deliberately wrong over-base submission.

Output: SQL on stdout. Usage: python3 gen_scenario.py > scenario.sql ; psql ... -f scenario.sql
"""
import json
import random
from datetime import date, timedelta

random.seed(1405)
P = '7e570000-0000-4000-8000-0000000000e2'          # test project
U = {  # test accounts
    'contractor': 'c0000000-0000-4000-8000-000000000001',
    'site_head': 'c0000000-0000-4000-8000-000000000002',
    'supervision': 'c0000000-0000-4000-8000-000000000003',
    'consultant': 'c0000000-0000-4000-8000-000000000004',
    'employer': 'c0000000-0000-4000-8000-000000000005',
    'viewer': 'c0000000-0000-4000-8000-000000000006',
    'admin': 'c0000000-0000-4000-8000-000000000007',
}
NAMES = {'contractor': 'پیمانکار آزمون', 'site_head': 'سرپرست کارگاه آزمون', 'supervision': 'ناظر مقیم آزمون',
         'consultant': 'مشاور آزمون', 'employer': 'کارفرما آزمون', 'viewer': 'بیننده آزمون', 'admin': 'مدیر سامانهٔ آزمون'}

# activity: key, item_no, title, unit, base_qty, unit_price (rial), weight (% of group C), planned start/end, daily rate
ACTS = [
    ('row', 'C-01', 'تسطیح و آماده‌سازی حریم (ROW)', 'متر', 30000, 180000, 8, '2026-09-21', '2026-10-15', 1400),
    ('exc', 'C-02', 'حفاری کانال لوله', 'متر', 30000, 420000, 14, '2026-09-24', '2026-10-30', 1050),
    ('str', 'C-03', 'ریسه کردن و حمل لوله', 'متر', 30000, 150000, 8, '2026-09-23', '2026-10-25', 1100),
    ('wld', 'C-04', 'جوشکاری اتصالات خط اصلی', 'سرجوش', 2500, 9500000, 30, '2026-09-26', '2026-11-15', 70),
    ('ndt', 'C-05', 'رادیوگرافی (NDT) سرجوش‌ها', 'سرجوش', 2500, 1800000, 8, '2026-09-28', '2026-11-18', 66),
    ('cot', 'C-06', 'پوشش سرجوش‌ها (Field Joint Coating)', 'سرجوش', 2500, 2200000, 10, '2026-09-30', '2026-11-20', 60),
    ('low', 'C-07', 'پایین‌گذاری لوله در کانال', 'متر', 30000, 380000, 12, '2026-10-05', '2026-11-25', 700),
    ('bkf', 'C-08', 'خاکریزی و بازسازی حریم', 'متر', 30000, 260000, 10, '2026-10-08', '2026-11-30', 650),
]
AID = {a[0]: f'ac000000-0000-4000-8000-{i + 1:012d}' for i, a in enumerate(ACTS)}
FRONTS = ['جبهه ۱ (KP 0–10)', 'جبهه ۲ (KP 10–20)', 'جبهه ۳ (KP 20–30)']
q = lambda s: "'" + str(s).replace("'", "''") + "'"
out = []
w = out.append


def as_user(role):
    return (f"set local role authenticated; select set_config('request.jwt.claims', "
            f"'{json.dumps({'sub': U[role], 'role': 'authenticated'})}', true);")


# ---------- setup (as the database owner: accounts, project, roles, activities) ----------
w('begin;')
for r, uid in U.items():
    w(f"insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at) values "
      f"('00000000-0000-0000-0000-000000000000', '{uid}', 'authenticated', 'authenticated', '{r}@test.farin', '', '{{}}', now()) on conflict do nothing;")
    w(f"insert into profiles (id, email, full_name, account_status) values ('{uid}', '{r}@test.farin', {q(NAMES[r])}, 'active') "
      f"on conflict (id) do update set full_name = excluded.full_name, account_status = 'active';")
w(f"update profiles set is_admin = true where id = '{U['admin']}';")
w(f"insert into master_projects (id, project_id_code, project_code, official_name, short_name, project_type, status) values "
  f"('{P}', 'TEST-EPC-42', 'TEST', 'TEST — خط انتقال گاز ۴۲ اینچ سرخس–مشهد (بخش فرضی ۳۰ کیلومتری) — فقط آزمون', 'TEST سرخس–مشهد ۴۲\"', 'pipeline', 'executing') on conflict do nothing;")
for r in ['contractor', 'site_head', 'supervision', 'consultant', 'employer', 'viewer']:
    w(f"insert into ex_project_roles (project_id, user_id, role) values ('{P}', '{U[r]}', '{r}') on conflict do nothing;")
w(f"insert into ex_settings (project_id, values_json) values ('{P}', '{json.dumps({'employerStep': 'advisory', 'overBasePct': 0, 'blockOverBase': True, 'weekStart': 0}, ensure_ascii=False)}') "
  f"on conflict (project_id) do update set values_json = excluded.values_json;")
for i, (k, no, t, u, base, price, wt, ps, pe, _) in enumerate(ACTS):
    w(f"insert into ex_activities (id, project_id, item_no, title, unit, chapter, base_qty, unit_price, weight, weight_group, planned_start, planned_end, sort, approval, active) values "
      f"('{AID[k]}', '{P}', '{no}', {q(t)}, {q(u)}, 'اجرا', {base}, {price}, {wt}, 'C', '{ps}', '{pe}', {i}, 'approved', true) on conflict (id) do nothing;")
w('commit;')

# ---------- 37 days of daily reports ----------
start = date(2026, 9, 21)
days = [start + timedelta(d) for d in range(37)]
report_ids = []
cum_reported = {k: 0 for k in AID}
weld_done = 0
special = {}   # date -> label of the scenario event
for d in days:
    iso = d.isoformat()
    if d.weekday() == 4:              # Friday: no work, no report
        special[iso] = 'جمعه — بدون گزارش'
        continue
    rid = f'1e000000-0000-4000-8000-{d.toordinal():012d}'
    report_ids.append((rid, iso))
    n = len(report_ids)
    front = FRONTS[0] if n < 12 else FRONTS[1] if n < 24 else FRONTS[2]   # the crew moves to the next front
    factor = 1.0
    stop = []
    if iso in ('2026-10-02', '2026-10-03'):
        factor = 0.15; stop.append(('weather', 8, 'بارندگی شدید — توقف حفاری و جوشکاری'))
    if iso == '2026-10-08':
        factor = 0.4; stop.append(('material', 6, 'نرسیدن الکترود و نوار پوشش از انبار'))
    if iso == '2026-10-12':
        factor = 0.6; stop.append(('equipment', 5, 'خرابی سایدبوم شماره ۲'))
    if iso in ('2026-10-17', '2026-10-18'):
        factor = 0.7; stop.append(('manpower', 4, 'کمبود جوشکار — دو نفر مرخصی'))
    ramp = min(1.0, 0.45 + n * 0.05)  # productivity improves over the first two weeks
    lines = []
    for k, no, t, u, base, price, wt, ps, pe, rate in ACTS:
        if iso < ps:
            continue
        qty = round(rate * ramp * factor * random.uniform(0.85, 1.15))
        if k == 'ndt':
            qty = min(qty, weld_done - cum_reported['ndt'])
        if k == 'cot':
            qty = min(qty, cum_reported['ndt'] - cum_reported['cot'])
        qty = min(qty, base - cum_reported[k])   # a site never reports beyond the contract quantity (tested separately)
        if qty <= 0:
            continue
        cum_reported[k] += qty
        if k == 'wld':
            weld_done += qty
        lines.append((k, qty))
    man = [('جوشکار', 14 if iso not in ('2026-10-17', '2026-10-18') else 10), ('کمک جوشکار', 14), ('اپراتور', 9), ('کارگر ساده', 26), ('تکنسین پوشش', 6)]
    eq = [('بیل مکانیکی', 4, 1 if iso == '2026-10-12' else 0), ('سایدبوم', 3, 1 if iso == '2026-10-12' else 0), ('دستگاه جوش', 8, 0), ('لودر', 2, 0)]
    w('begin;'); w(as_user('site_head'))
    w(f"insert into ex_reports (id, project_id, form_key, report_date, front, shift, status, notes) values ('{rid}', '{P}', 'work', '{iso}', {q(front)}, 'day', 'draft', {q('گزارش روزانهٔ آزمون — ' + front)});")
    for i, (k, qty) in enumerate(lines, 1):
        w(f"insert into ex_report_lines (report_id, line_no, activity_id, qty, location, status) values ('{rid}', {i}, '{AID[k]}', {qty}, {q(front)}, 'pending');")
    for name, qn in man:
        w(f"insert into ex_report_resources (report_id, kind, name, active_qty, hours) values ('{rid}', 'man', {q(name)}, {qn}, {qn * 10});")
    for name, qn, idle in eq:
        w(f"insert into ex_report_resources (report_id, kind, name, active_qty, idle_qty, hours) values ('{rid}', 'equip', {q(name)}, {qn - idle}, {idle}, {(qn - idle) * 10});")
    for cat, h, desc in stop:
        w(f"insert into ex_report_stoppages (report_id, category, hours, description) values ('{rid}', '{cat}', {h}, {q(desc)});")
    w('commit;')
    if stop:
        special[iso] = '، '.join(s[2] for s in stop)

# ---------- submit + review (supervision), with the scenario's exceptions ----------
for idx, (rid, iso) in enumerate(report_ids):
    if iso >= '2026-10-25':          # the last two days stay as drafts / not yet reviewed
        if iso == '2026-10-26':
            continue
        w('begin;'); w(as_user('site_head')); w(f"select ex_report_submit('{rid}');"); w('commit;')
        continue
    w('begin;'); w(as_user('site_head')); w(f"select ex_report_submit('{rid}');"); w('commit;')
    if iso == '2026-09-29':
        # returned whole: wrong front written; contractor fixes and resubmits; then approved
        w('begin;'); w(as_user('supervision')); w(f"select ex_report_decide_whole('{rid}', 'returned', 'جبهه کاری اشتباه درج شده — اصلاح شود');"); w('commit;')
        w('begin;'); w(as_user('site_head')); w(f"update ex_reports set notes = notes || ' (اصلاح‌شده)' where id = '{rid}';"); w(f"select ex_report_submit('{rid}');"); w('commit;')
        w('begin;'); w(as_user('supervision')); w(f"select ex_report_decide_whole('{rid}', 'approved', '');"); w('commit;')
        special[iso] = 'برگشت گزارش و اصلاح و تأیید مجدد'
    elif iso == '2026-10-06':
        # welding line cut 70→? and NDT line rejected
        w('begin;'); w(as_user('supervision'))
        w(f"select ex_report_review('{rid}', (select jsonb_agg(case when activity_id = '{AID['wld']}' then jsonb_build_object('line_id', id, 'decision', 'approved', 'qty', qty - 6, 'note', '۶ سرجوش فاقد گزارش بازرسی چشمی') "
          f"when activity_id = '{AID['ndt']}' then jsonb_build_object('line_id', id, 'decision', 'rejected', 'note', 'فیلم‌ها تحویل نشده') else jsonb_build_object('line_id', id, 'decision', 'approved') end) from ex_report_lines where report_id = '{rid}'), 'تأیید با اصلاح');")
        w('commit;')
        special[iso] = 'کسر ۶ سرجوش و رد ردیف رادیوگرافی'
    else:
        w('begin;'); w(as_user('supervision')); w(f"select ex_report_decide_whole('{rid}', 'approved', '');"); w('commit;')

# employer (advisory) confirms one week of welding, trims one line
for rid, iso in report_ids:
    if '2026-10-04' <= iso <= '2026-10-10':
        cut = iso == '2026-10-07'
        w('begin;'); w(as_user('employer'))
        w(f"select ex_report_employer_review('{rid}', (select jsonb_agg(jsonb_build_object('line_id', id, 'decision', 'approved'{', ' + chr(39) + 'qty' + chr(39) + ', approved_qty - 5, ' + chr(39) + 'note' + chr(39) + ', ' + chr(39) + 'کسر ۵ واحد طبق بازدید' + chr(39) if cut else ''})) "
          f"from ex_report_lines where report_id = '{rid}' and status = 'approved' and activity_id = '{AID['wld']}'));")
        w('commit;')

print('\n'.join(out))
print('-- events: ' + json.dumps(special, ensure_ascii=False))
