"""Station registers (cs_*): PSSR systems, test packs, lines, spools with shop welds, field welds still to come,
equipment installation steps and ITP inspections — consistent with the construction status at the data date:
spool prefabrication about a third done, no field welding yet (planned from March 2027), no equipment set yet
(the turbo-compressors have not arrived), foundations of units A/B cast, unit C and half the coolers still to pour."""
from common import *

R = random.Random(77)
def day(n): return add(D(2026, 6, 1), n)

SYSTEMS = [('SYS-01', 'سرخط ورودی، فیلترسپراتورها و لانچر/ریسیور', 'station'), ('SYS-02', 'واحد توربوکمپرسور A', 'station'), ('SYS-03', 'واحد توربوکمپرسور B', 'station'),
           ('SYS-04', 'واحد توربوکمپرسور C (آماده‌به‌کار)', 'station'), ('SYS-05', 'کولرهای هوایی و هدر دهش', 'station'), ('SYS-06', 'گاز سوخت و هوای ابزار', 'utility'),
           ('SYS-07', 'پست برق و برق اضطراری', 'utility'), ('SYS-08', 'آب آتش‌نشانی و سیستم F&G', 'utility'), ('SYS-09', 'خروجی ایستگاه و میترینگ', 'station')]
PACKS = [('TP-01', 'سرخط ورودی ۳۶ اینچ و فیلترها', 'hydro', 135, 'SYS-01'), ('TP-02', 'مکش و دهش واحد A', 'hydro', 135, 'SYS-02'), ('TP-03', 'مکش و دهش واحد B', 'hydro', 135, 'SYS-03'),
         ('TP-04', 'مکش و دهش واحد C', 'hydro', 135, 'SYS-04'), ('TP-05', 'کولرها و هدر دهش', 'hydro', 135, 'SYS-05'), ('TP-06', 'گاز سوخت', 'hydro', 90, 'SYS-06'),
         ('TP-07', 'هوای ابزار', 'pneumatic', 13, 'SYS-06'), ('TP-08', 'آب آتش‌نشانی', 'hydro', 21, 'SYS-08'), ('TP-09', 'بلودان و ونت', 'pneumatic', 12, 'SYS-02'), ('TP-10', 'خروجی ایستگاه و میترینگ', 'hydro', 135, 'SYS-09')]
SERV = [('PG', 'گاز فرآیندی', ['36', '30', '24', '16', '12', '8'], ['TP-01', 'TP-02', 'TP-03', 'TP-04', 'TP-05', 'TP-10']), ('FG', 'گاز سوخت', ['6', '4', '3', '2'], ['TP-06']),
        ('IA', 'هوای ابزار', ['2', '1', '3/4'], ['TP-07']), ('FW', 'آب آتش‌نشانی', ['8', '6', '4'], ['TP-08']), ('BD', 'بلودان', ['8', '6', '4'], ['TP-09'])]
AREAS = {'TP-01': 'سرخط ورودی', 'TP-02': 'واحد کمپرسور A', 'TP-03': 'واحد کمپرسور B', 'TP-04': 'واحد کمپرسور C', 'TP-05': 'کولرها', 'TP-06': 'تأسیسات جانبی', 'TP-07': 'تأسیسات جانبی',
         'TP-08': 'تأسیسات جانبی', 'TP-09': 'واحد کمپرسور A', 'TP-10': 'خروجی ایستگاه'}
def size(s): return float(eval(s)) if '/' in s else float(s)

def sql():
    out = ["-- station registers: PSSR systems, test packs, lines, spools, welds, equipment, inspections"]
    out += ins('pssr_systems', [dict(id=U('pssr/' + c), master_project_id=P, code=c, name=n, kind=k, target_gas_in=D(2028, 2, 15), note='', startup_type='new', team_lead='مهندس علی لک') for c, n, k in SYSTEMS])
    out += ins('cs_test_packs', [dict(id=U('tp/' + no), project_id=P, pack_no=no, system=s, medium=m, test_press_bar=p, punch_a=0, punch_b=0, pssr_system_id=U('pssr/' + sy)) for no, s, m, p, sy in PACKS])
    lines, spools, welds = [], [], []
    welders = [f'WD-{i:02d}' for i in range(1, 13)]
    bad = {'WD-07': 0.16}
    n = 0
    for code, srv, sizes, tps in SERV:
        for k in range({'PG': 26, 'FG': 6, 'IA': 4, 'FW': 4, 'BD': 4}[code]):
            n += 1
            s = R.choice(sizes); tp = R.choice(tps); lid = U(f'csl/{n}'); no = f'{s}"-{code}-{2000 + n * 3}'
            ndt = 100 if code in ('PG', 'FG', 'BD') else R.choice([10, 20])
            lines.append(dict(id=lid, project_id=P, line_no=no, service=srv, size_in=size(s), spec_class='CS600' if code in ('PG', 'BD') else ('CS300' if code == 'FG' else 'CS150'),
                              material='API 5L X65' if size(s) >= 24 else ('API 5L Gr.B' if size(s) >= 8 else 'ASTM A106 B'), area=AREAS[tp], iso_no=f'HMD-ISO-{2000 + n * 3}', design_press_bar=100 if code in ('PG', 'BD') else (60 if code == 'FG' else 10),
                              ndt_pct=ndt, test_pack_id=U('tp/' + tp)))
            prog = R.random() * (1.0 if tp in ('TP-01', 'TP-02', 'TP-05', 'TP-06') else 0.55)  # shop works on the first systems
            for j in range(R.randint(2, 5)):
                sid = U(f'css/{n}/{j}')
                st_i = min(5, int(prog * 6.5 + R.random()))
                stages = ['planned', 'cut', 'fitup', 'welded', 'ndt', 'painted']
                sd = {st: day(5 + i * 12 + R.randint(0, 6)).isoformat() for i, st in enumerate(stages[1:st_i + 1])}
                spools.append(dict(id=sid, project_id=P, line_id=lid, spool_no=f'SP-{2000 + n * 3}-{j + 1:02d}', size_in=size(s), weight_kg=R.randint(120, 3800), area=AREAS[tp], iso_no=f'HMD-ISO-{2000 + n * 3}',
                                   stage=stages[st_i], stage_dates=Raw(js(sd))))
                for w in range(R.randint(2, 5)):
                    fit = st_i >= 2; welded = st_i >= 3; wd = R.choice(welders)
                    res = 'pending'; rep = 0
                    if st_i >= 4 or (welded and R.random() < .5):
                        res = 'reject' if R.random() < bad.get(wd, 0.03) else 'accept'
                        if res == 'accept' and R.random() < bad.get(wd, 0.03) * 1.5: rep = 1
                    fd = day(10 + R.randint(0, 120)); wdd = add(fd, R.randint(1, 6)); nd = add(wdd, R.randint(2, 8))
                    welds.append(dict(id=U(f'csw/{n}/{j}/{w}'), project_id=P, line_id=lid, spool_id=sid, weld_no=f'S{j + 1}-W{w + 1}', location='shop', joint_type='BW', size_in=size(s), thk_mm=R.choice([19.1, 15.9, 12.7, 9.5]) if size(s) >= 8 else 5.5,
                                      material='', wps=f'WPS-HMD-0{R.randint(1, 3)}', welder=wd if welded else '', fitup_date=fd if fit else None, weld_date=min(wdd, add(TODAY, -2)) if welded else None,
                                      ndt_method=('RT' if size(s) >= 2 else 'PT') if res != 'pending' else '', ndt_result=res, ndt_date=min(nd, add(TODAY, -1)) if res != 'pending' else None, repair_count=rep))
            for f in range(R.randint(1, 4)):  # field joints: registered, none fitted yet (field welding starts March 2027)
                welds.append(dict(id=U(f'csf/{n}/{f}'), project_id=P, line_id=lid, spool_id=None, weld_no=f'FW-{f + 1}', location='field', joint_type='BW', size_in=size(s), thk_mm=12.7 if size(s) >= 8 else 5.5,
                                  material='', wps='WPS-HMD-05', welder='', fitup_date=None, weld_date=None, ndt_method='', ndt_result='pending', ndt_date=None, repair_count=0))
    out += ins('cs_lines', lines) + ins('cs_spools', spools) + ins('cs_welds', welds)
    out.append(f"update cs_welds w set ndt_selected = true, ndt_reason = 'random' from cs_lines l where l.id = w.line_id and l.project_id = {q(P)} and l.ndt_pct < 100 and (w.ndt_result <> 'pending' or w.repair_count > 0);")
    eq = [('K-101A', 'کمپرسور سانتریفیوژ واحد A', 'compressor', 58, 'SYS-02', 2), ('GT-101A', 'توربین گازی ۲۵ مگاوات واحد A', 'driver', 92, 'SYS-02', 1), ('K-101B', 'کمپرسور سانتریفیوژ واحد B', 'compressor', 58, 'SYS-03', 1),
          ('GT-101B', 'توربین گازی ۲۵ مگاوات واحد B', 'driver', 92, 'SYS-03', 1), ('K-101C', 'کمپرسور سانتریفیوژ واحد C', 'compressor', 58, 'SYS-04', 0), ('GT-101C', 'توربین گازی ۲۵ مگاوات واحد C', 'driver', 92, 'SYS-04', 0)]
    eq += [(f'E-201{c}', f'کولر هوایی گاز — Bay {c}', 'cooler', 36, 'SYS-05', 1 if c in 'ABC' else 0) for c in 'ABCDEF']
    eq += [(f'F-301{c}', 'فیلترسپراتور ورودی', 'filter', 21, 'SYS-01', 1) for c in 'ABCD'] + [('L-401', 'لانچر توپک ۴۸ اینچ', 'vessel', 16, 'SYS-01', 1), ('L-402', 'ریسیور توپک ۴۸ اینچ', 'vessel', 16, 'SYS-01', 1),
           ('V-501', 'مخزن درین بسته', 'vessel', 9, 'SYS-06', 0), ('X-601', 'اسکید آماده‌سازی گاز سوخت', 'skid', 18, 'SYS-06', 0), ('X-701', 'پکیج هوای ابزار', 'skid', 8, 'SYS-06', 0),
           ('TR-01', 'ترانسفورماتور ۲۵۰۰ کیلوولت‌آمپر', 'transformer', 7, 'SYS-07', 1), ('TR-02', 'ترانسفورماتور ۲۵۰۰ کیلوولت‌آمپر', 'transformer', 7, 'SYS-07', 1), ('G-01', 'دیزل ژنراتور اضطراری', 'generator', 14, 'SYS-07', 0),
           ('FQ-900', 'اسکید میترینگ اولتراسونیک', 'skid', 22, 'SYS-09', 0), ('P-801A', 'پمپ آب آتش‌نشانی برقی', 'pump', 4, 'SYS-08', 0), ('P-801B', 'پمپ آب آتش‌نشانی دیزلی', 'pump', 5, 'SYS-08', 0), ('CR-01', 'جرثقیل سقفی ۴۰ تن', 'crane', 28, 'SYS-02', 0)]
    rows = []
    for i, (tag, title, kind, w, sy, st) in enumerate(eq):
        steps = {'foundation': day(60 + i * 3).isoformat()} if st >= 1 else {}
        rows.append(dict(id=U('cse/' + tag), project_id=P, tag=tag, title=title, kind=kind, area=AREAS.get({'SYS-02': 'TP-02', 'SYS-03': 'TP-03', 'SYS-04': 'TP-04', 'SYS-05': 'TP-05', 'SYS-01': 'TP-01'}.get(sy, 'TP-06'), 'تأسیسات جانبی'),
                         weight_t=w, steps=Raw(js(steps)), pssr_system_id=U('pssr/' + sy)))
    out += ins('cs_equipment', rows)
    out.append(f"insert into cs_qc_settings (project_id, rules) values ({q(P)}, '{{\"locationClass\":\"station\",\"testFactor\":1.5,\"welderRejectLimit\":0.05}}');")
    insp = [('civil', 'civ_pour', 'area', 'فونداسیون توربوکمپرسور واحد A', {'slump': 90, 'temp': 24, 'cubes': 9, 'rebarOk': True}, 'accept'),
            ('civil', 'civ_pour', 'area', 'فونداسیون توربوکمپرسور واحد B', {'slump': 95, 'temp': 21, 'cubes': 9, 'rebarOk': True}, 'accept'),
            ('civil', 'civ_strength', 'area', 'فونداسیون واحد A', {'age': 28, 'results': '37.2 36.4 38.0'}, 'accept'),
            ('civil', 'civ_strength', 'area', 'فونداسیون واحد B', {'age': 28, 'results': '31.9 33.0 30.8'}, 'reject'),
            ('civil', 'civ_pour', 'area', 'فونداسیون کولرهای A تا C', {'slump': 110, 'temp': 18, 'cubes': 6, 'rebarOk': True}, 'accept'),
            ('civil', 'civ_compaction', 'area', 'محوطهٔ کولرها', {'results': '96 95.5 97 94'}, 'accept'),
            ('civil', 'civ_pour', 'area', 'دیوار حائل پست برق', {'slump': 150, 'temp': 9, 'cubes': 3, 'rebarOk': True}, 'reject'),
            ('painting', 'pnt_surface', 'other', 'اسپول‌های سرخط ورودی', {'grade': 'Sa 2.5', 'profile': '60 65 72', 'rh': 64, 'dewOk': True}, 'accept'),
            ('painting', 'pnt_dft', 'other', 'اسپول‌های سرخط ورودی — پرایمر', {'coat': 'پرایمر', 'readings': '78 92 85 88'}, 'accept'),
            ('electrical', 'ele_earth', 'area', 'شبکهٔ زمین محوطهٔ کمپرسورها', {'result': 0.7}, 'accept'),
            ('mechanical', 'mec_level', 'equipment', 'K-101A (صفحات زیرسازی)', {'results': '0.03 0.02 0.05'}, 'pending')]
    out += ins('cs_inspections', [dict(id=U(f'csi/{i}'), project_id=P, discipline=dd, itp_key=k, subject_type=st, subject_label=lbl, insp_date=day(90 + i * 11), hold_point='W', values=Raw(js(v)),
                                       result=r, report_no=f'QC-{dd[:3].upper()}-{i + 1:03d}', inspector='بازرس QC مشاور') for i, (dd, k, st, lbl, v, r) in enumerate(insp)])
    return out, dict(lines=len(lines), spools=len(spools), welds=len(welds), equipment=len(rows))
