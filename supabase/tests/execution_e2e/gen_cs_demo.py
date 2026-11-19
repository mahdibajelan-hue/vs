#!/usr/bin/env python3
"""Demo compressor-station registers (migration 050) for one project — test database only.
Usage: python3 gen_cs_demo.py <project_uuid> | psql …   Deterministic (seeded) so the figures are repeatable."""
import random, sys, uuid
from datetime import date, timedelta
P = sys.argv[1] if len(sys.argv) > 1 else '7e570000-0000-4000-8000-0000000000e2'
rnd = random.Random(42)
U = lambda: str(uuid.UUID(int=rnd.getrandbits(128), version=4))
q = lambda s: "'" + str(s).replace("'", "''") + "'"
d0 = date(2026, 6, 1)
day = lambda n: (d0 + timedelta(days=n)).isoformat()
out = [f"delete from cs_history where project_id='{P}'; delete from cs_welds where project_id='{P}'; delete from cs_spools where project_id='{P}'; delete from cs_lines where project_id='{P}'; delete from cs_equipment where project_id='{P}'; delete from cs_test_packs where project_id='{P}';"]
systems = [('TP-01', 'مکش کمپرسور (Suction)', 'hydro', 135), ('TP-02', 'دهش کمپرسور (Discharge)', 'hydro', 165), ('TP-03', 'کولرهای گاز', 'hydro', 165), ('TP-04', 'گاز سوخت', 'hydro', 90),
           ('TP-05', 'هوای ابزار', 'pneumatic', 11), ('TP-06', 'آب آتش‌نشانی', 'hydro', 21), ('TP-07', 'درین بسته', 'hydro', 15), ('TP-08', 'گاز بلودان / فلر', 'pneumatic', 8)]
packs = []
for no, sysn, med, pr in systems:
    pid = U(); packs.append(pid)
    out.append(f"insert into cs_test_packs (id, project_id, pack_no, system, medium, test_press_bar, punch_a, punch_b) values ({q(pid)}, {q(P)}, {q(no)}, {q(sysn)}, {q(med)}, {pr}, {rnd.choice([0,0,0,1,2])}, {rnd.randint(0,6)});")
areas = ['واحد کمپرسور ۱', 'واحد کمپرسور ۲', 'کولرها', 'سرخط ورودی', 'تأسیسات جانبی']
services = [('PG', 'گاز فرآیندی', ['36', '30', '24', '20', '16', '12', '8']), ('FG', 'گاز سوخت', ['6', '4', '3', '2']), ('IA', 'هوای ابزار', ['2', '1', '3/4']), ('FW', 'آب آتش‌نشانی', ['8', '6', '4']), ('CD', 'درین بسته', ['4', '3', '2'])]
pack_of = {'PG': [0, 1, 2], 'FG': [3], 'IA': [4], 'FW': [5], 'CD': [6]}
def size(s): return float(eval(s)) if '/' in s else float(s)
welders = [f'WD-{i:02d}' for i in range(1, 15)]
bad_welder = {'WD-11': 0.18, 'WD-04': 0.09}
lines, wcount = [], 0
for i in range(46):
    code, srv, sizes = rnd.choice(services)
    s = rnd.choice(sizes); lid = U(); no = f'{s}"-{code}-{1000 + i * 7}'
    ndt = 100 if code in ('PG', 'FG') else rnd.choice([10, 20, 100])
    pack = packs[rnd.choice(pack_of[code])]
    out.append(f"insert into cs_lines (id, project_id, line_no, service, size_in, spec_class, material, area, iso_no, design_press_bar, ndt_pct, test_pack_id) values ({q(lid)}, {q(P)}, {q(no)}, {q(srv)}, {size(s)}, {q(rnd.choice(['CS600', 'CS900', 'CS150']))}, {q('API 5L X60' if size(s) >= 8 else 'ASTM A106 B')}, {q(rnd.choice(areas))}, {q(f'ISO-{1000 + i * 7}-0{rnd.randint(1,3)}')}, {rnd.choice([75, 100, 120])}, {ndt}, {q(pack)});")
    lines.append((lid, no, size(s), ndt))
    progress = rnd.random()  # how far this line is
    sp_ids = []
    for k in range(rnd.randint(1, 5)):
        sid = U(); sp_ids.append(sid)
        st_i = min(7, int(progress * 9 + rnd.random() * 2))
        stages = ['planned', 'cut', 'fitup', 'welded', 'ndt', 'painted', 'dispatched', 'erected']
        dates = ', '.join(f'"{st}": "{day(10 + j * 9 + rnd.randint(0, 4))}"' for j, st in enumerate(stages[1:st_i + 1]))
        out.append(f"insert into cs_spools (id, project_id, line_id, spool_no, size_in, weight_kg, area, iso_no, stage, stage_dates) values ({q(sid)}, {q(P)}, {q(lid)}, {q(f'SP-{1000 + i * 7}-{k + 1:02d}')}, {size(s)}, {rnd.randint(80, 2400)}, {q(rnd.choice(areas))}, {q(f'ISO-{1000 + i * 7}-01')}, {q(stages[st_i])}, '{{{dates}}}');")
        for j in range(rnd.randint(2, 6)):  # shop welds on the spool
            wcount += 1
            out.append(weld := None) if False else None
            fit = progress > 0.15 or rnd.random() < 0.3
            welded = fit and (progress > 0.3 or rnd.random() < 0.4)
            wd = rnd.choice(welders)
            res = 'pending'; rep = 0
            if welded and rnd.random() < 0.85:
                if rnd.random() < bad_welder.get(wd, 0.03): res = 'reject'
                else: res = 'accept'
                if res == 'accept' and rnd.random() < bad_welder.get(wd, 0.03) * 1.5: rep = 1
            fd = day(rnd.randint(5, 120)); wdd = day(rnd.randint(121, 140)); nd = day(rnd.randint(141, 160))
            out.append(f"insert into cs_welds (project_id, line_id, spool_id, weld_no, location, joint_type, size_in, thk_mm, material, wps, welder, fitup_date, weld_date, ndt_method, ndt_result, ndt_date, repair_count) values ({q(P)}, {q(lid)}, {q(sid)}, {q(f'S{k + 1}-W{j + 1}')}, 'shop', 'BW', {size(s)}, {rnd.choice([9.5, 12.7, 15.9, 6.4])}, '', {q('WPS-CS-0' + str(rnd.randint(1, 4)))}, {q(wd if welded else '')}, {q(fd) if fit else 'null'}, {q(wdd) if welded else 'null'}, {q('RT' if size(s) >= 2 else 'PT') if res != 'pending' else q('')}, {q(res)}, {q(nd) if res != 'pending' else 'null'}, {rep});")
    for j in range(rnd.randint(1, 5)):  # field welds between spools
        fit = progress > 0.55 or rnd.random() < 0.15
        welded = fit and (progress > 0.7 or rnd.random() < 0.3)
        wd = rnd.choice(welders)
        res = ('reject' if rnd.random() < bad_welder.get(wd, 0.04) else 'accept') if welded and rnd.random() < 0.7 else 'pending'
        out.append(f"insert into cs_welds (project_id, line_id, weld_no, location, joint_type, size_in, wps, welder, fitup_date, weld_date, ndt_method, ndt_result, ndt_date) values ({q(P)}, {q(lid)}, {q(f'FW-{j + 1}')}, 'field', 'BW', {size(s)}, 'WPS-CS-05', {q(wd if welded else '')}, {q(day(rnd.randint(130, 150))) if fit else 'null'}, {q(day(rnd.randint(151, 165))) if welded else 'null'}, {q('RT') if res != 'pending' else q('')}, {q(res)}, {q(day(rnd.randint(166, 170))) if res != 'pending' else 'null'});")
eq = [('K-101', 'کمپرسور گریز از مرکز واحد ۱', 'compressor', 62), ('K-201', 'کمپرسور گریز از مرکز واحد ۲', 'compressor', 62), ('GT-101', 'توربین گازی واحد ۱', 'driver', 95), ('GT-201', 'توربین گازی واحد ۲', 'driver', 95),
      ('E-101A', 'کولر هوایی گاز', 'cooler', 38), ('E-101B', 'کولر هوایی گاز', 'cooler', 38), ('E-201A', 'کولر هوایی گاز', 'cooler', 38), ('E-201B', 'کولر هوایی گاز', 'cooler', 38),
      ('V-101', 'اسکرابر ورودی', 'scrubber', 24), ('V-201', 'اسکرابر ورودی', 'scrubber', 24), ('F-301', 'فیلتر جداکنندهٔ ورودی', 'filter', 18), ('F-302', 'فیلتر جداکنندهٔ ورودی', 'filter', 18),
      ('P-401A', 'پمپ آب آتش‌نشانی', 'pump', 4), ('P-401B', 'پمپ آب آتش‌نشانی دیزلی', 'pump', 5), ('G-501', 'ژنراتور اضطراری', 'generator', 22), ('PK-601', 'پکیج گاز سوخت', 'skid', 14),
      ('PK-602', 'پکیج هوای ابزار', 'skid', 9), ('T-701', 'مخزن آب آتش‌نشانی', 'tank', 30), ('V-801', 'درام بلودان', 'vessel', 12)]
steps = ['foundation', 'set', 'level', 'grout', 'align', 'piping']
for i, (tag, title, kind, w) in enumerate(eq):
    n = rnd.randint(0, 6) if i > 1 else 6
    st = ', '.join(f'"{s}": "{day(30 + j * 12)}"' for j, s in enumerate(steps[:n]))
    if tag == 'E-201B': st = '"foundation": "2026-07-01", "grout": "2026-08-01"'  # a gap to show
    out.append(f"insert into cs_equipment (project_id, tag, title, kind, area, weight_t, steps) values ({q(P)}, {q(tag)}, {q(title)}, {q(kind)}, {q(rnd.choice(areas))}, {w}, '{{{st}}}');")
# one pack fully ready and tested, for the dashboard
out.append(f"update cs_welds w set fitup_date=coalesce(fitup_date, '2026-08-01'), weld_date=coalesce(weld_date, greatest(coalesce(fitup_date, '2026-08-01'::date) + 2, '2026-08-10'::date)), welder=case when welder='' then 'WD-02' else welder end, ndt_result='accept', ndt_method='RT', ndt_date=greatest(coalesce(weld_date, '2026-08-10'::date), coalesce(fitup_date, '2026-08-01'::date) + 2) + 5 from cs_lines l where l.id=w.line_id and l.test_pack_id={q(packs[5])};")
out.append(f"update cs_test_packs set punch_a=0, status='tested', test_date='2026-09-01' where id={q(packs[5])};")
out.append(f"update cs_welds w set fitup_date=coalesce(fitup_date, '2026-08-01'), weld_date=coalesce(weld_date, greatest(coalesce(fitup_date, '2026-08-01'::date) + 2, '2026-08-10'::date)), welder=case when welder='' then 'WD-03' else welder end, ndt_result=case when ndt_result='reject' then 'accept' else ndt_result end from cs_lines l where l.id=w.line_id and l.test_pack_id={q(packs[4])};")
out.append(f"update cs_test_packs set punch_a=0 where id={q(packs[4])};")
print('\n'.join(x for x in out if x))
