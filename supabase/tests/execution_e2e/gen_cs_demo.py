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
out = [f"delete from cs_inspections where project_id='{P}'; delete from cs_qc_settings where project_id='{P}'; delete from cs_history where project_id='{P}'; delete from cs_welds where project_id='{P}'; delete from cs_spools where project_id='{P}'; delete from cs_lines where project_id='{P}'; delete from cs_equipment where project_id='{P}'; delete from cs_test_packs where project_id='{P}';"]
systems = [('TP-01', 'مکش کمپرسور (Suction)', 'hydro', 180), ('TP-02', 'دهش کمپرسور (Discharge)', 'hydro', 180), ('TP-03', 'کولرهای گاز', 'hydro', 165), ('TP-04', 'گاز سوخت', 'hydro', 115),
           ('TP-05', 'هوای ابزار', 'pneumatic', 15), ('TP-06', 'آب آتش‌نشانی', 'hydro', 24), ('TP-07', 'درین بسته', 'hydro', 15), ('TP-08', 'گاز بلودان / فلر', 'pneumatic', 12)]
design = {'PG': [100, 120], 'FG': [75], 'IA': [10], 'FW': [16], 'CD': [10]}
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
    out.append(f"insert into cs_lines (id, project_id, line_no, service, size_in, spec_class, material, area, iso_no, design_press_bar, ndt_pct, test_pack_id) values ({q(lid)}, {q(P)}, {q(no)}, {q(srv)}, {size(s)}, {q(rnd.choice(['CS600', 'CS900', 'CS150']))}, {q('API 5L X60' if size(s) >= 8 else 'ASTM A106 B')}, {q(rnd.choice(areas))}, {q(f'ISO-{1000 + i * 7}-0{rnd.randint(1,3)}')}, {rnd.choice(design[code])}, {ndt}, {q(pack)});")
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
# NDT selection on the partial-extent lines: the examined welds count as picked (random); one progressive pick
out.append(f"update cs_welds w set ndt_selected = true, ndt_reason = 'random' from cs_lines l where l.id = w.line_id and l.ndt_pct < 100 and (w.ndt_result <> 'pending' or w.repair_count > 0);")
# QC rules and ITP inspections of the other disciplines
out.append(f"insert into cs_qc_settings (project_id, rules) values ({q(P)}, '{{\"locationClass\":\"station\",\"testFactor\":1.5,\"welderRejectLimit\":0.05}}') on conflict (project_id) do update set rules = excluded.rules;")
insp = [
  ('civil', 'civ_pour', 'area', 'فونداسیون K-101', '{"slump":100,"temp":29,"cubes":6,"rebarOk":true}', 'accept'),
  ('civil', 'civ_pour', 'area', 'فونداسیون صاعقه‌گیر', '{"slump":140,"temp":34,"cubes":3,"rebarOk":true}', 'reject'),
  ('civil', 'civ_strength', 'area', 'فونداسیون K-101', '{"age":28,"results":"32.5 31.8 33.1"}', 'accept'),
  ('civil', 'civ_strength', 'area', 'اسلیپر هدر اصلی', '{"age":7,"results":"18.2 19.5 17.9"}', 'pending'),
  ('civil', 'civ_compaction', 'area', 'محوطه — بستر جاده', '{"results":"96 97 94.5 98"}', 'pending'),
  ('painting', 'pnt_surface', 'other', 'اسپول‌های واحد ۱', '{"grade":"Sa 2.5","profile":"55 62 70","rh":72,"dewOk":true}', 'accept'),
  ('painting', 'pnt_dft', 'other', 'اسپول‌های واحد ۱ — پرایمر', '{"coat":"پرایمر","readings":"82 95 78 88 91"}', 'accept'),
  ('painting', 'pnt_dft', 'other', 'اسپول‌های کولر — لایه میانی', '{"coat":"میانی","readings":"58 70 66"}', 'pending'),
  ('painting', 'pnt_adhesion', 'other', 'اسپول‌های واحد ۱', '{"results":"6.2 7.1 5.8"}', 'accept'),
  ('electrical', 'ele_ir', 'other', 'کابل MV-101', '{"cable":"MV-101","voltage":5000,"results":"2500 1800 2100"}', 'accept'),
  ('electrical', 'ele_earth', 'area', 'شبکهٔ زمین واحد کمپرسور', '{"result":0.8}', 'accept'),
  ('instrument', 'ins_cal', 'other', 'PT-1101', '{"tag":"PT-1101","errors":"0.1 -0.2 0.3 0.1"}', 'pending'),
  ('mechanical', 'mec_level', 'equipment', 'K-101', '{"results":"0.02 0.03 0.04"}', 'accept'),
  ('mechanical', 'mec_align', 'equipment', 'K-101', '{"offset":0.04,"angular":0.07}', 'reject'),
]
for i, (d, k, st, lbl, vals, res) in enumerate(insp):
    out.append(f"insert into cs_inspections (project_id, discipline, itp_key, subject_type, subject_label, insp_date, hold_point, values, result, report_no, inspector) values ({q(P)}, {q(d)}, {q(k)}, {q(st)}, {q(lbl)}, {q(day(150 + i))}, 'W', {q(vals)}, {q(res)}, {q(f'QC-{d[:3].upper()}-{i + 1:03d}')}, 'بازرس QC');")
print('\n'.join(x for x in out if x))
