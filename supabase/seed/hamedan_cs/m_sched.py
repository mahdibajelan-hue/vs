"""Scheduling: Level-3 schedule — Rev0 baseline (approved) and Rev3 update at 1405/08/24 (current, approved), FS
relations, the contract row, contract milestones with liquidated damages, delay events and risk events for the
Monte-Carlo simulation. The update reflects the same story as the modules: engineering 10, procurement 20,
construction 26.6 points behind; turbo-compressor unit C is the driving path to gas-in."""
from common import *
import m_exec

# code, name, wbs, baseline start, baseline finish, update: actual start, actual finish / forecast finish, pct
def tasks():
    T = [('W1', 'مدیریت پروژه و قرارداد', '1', None), ('W2', 'مهندسی', '2', None), ('W3', 'تأمین کالا', '3', None), ('W4', 'اجرا — سیویل و ساختمان', '4', None),
         ('W5', 'اجرا — مکانیکال و پایپینگ', '5', None), ('W6', 'اجرا — برق و ابزاردقیق', '6', None), ('W7', 'پیش‌راه‌اندازی، راه‌اندازی و تحویل', '7', None)]
    acts = [
        ('A1010', 'ابلاغ قرارداد و تجهیز دفتر پروژه', '1', '2025-03-22', '2025-04-20', 1.0), ('A1020', 'تهیهٔ برنامهٔ زمان‌بندی سطح ۳ و خط مبنا', '1', '2025-04-01', '2025-06-15', 1.0),
        ('A2010', 'مهندسی پایه تکمیلی و Design Basis', '2', '2025-04-01', '2025-07-15', 1.0), ('A2020', 'P&ID و HAZOP', '2', '2025-05-15', '2025-11-15', 1.0),
        ('A2030', 'مشخصات فنی و TBE تجهیزات بلندمدت', '2', '2025-05-01', '2025-09-30', 1.0), ('A2040', 'طراحی فونداسیون‌ها و سازه', '2', '2025-08-01', '2026-04-30', 0.93),
        ('A2050', 'نقشه‌های پایپینگ، تنش و ایزومتریک', '2', '2025-09-01', '2026-10-20', 0.78), ('A2060', 'مهندسی برق و ابزاردقیق', '2', '2025-09-15', '2026-09-30', 0.74),
        ('A2070', 'بررسی مدارک سازندگان (VDR)', '2', '2025-12-01', '2026-11-15', 0.66), ('A2080', 'روش‌های اجرایی پیش‌راه‌اندازی و راه‌اندازی', '2', '2027-03-10', '2027-06-30', 0.0),
        ('A3010', 'سفارش و ساخت پکیج‌های توربوکمپرسور (Long Lead)', '3', '2025-05-10', '2026-11-18', 0.62), ('A3015', 'حمل توربوکمپرسورها به کارگاه', '3', '2027-03-01', '2027-04-25', 0.12),
        ('A3020', 'تأمین کولرهای هوایی', '3', '2025-07-01', '2026-11-15', 0.83), ('A3030', 'تأمین شیرآلات', '3', '2025-06-15', '2026-09-20', 0.86),
        ('A3040', 'تأمین لوله، اتصالات و فلنج', '3', '2025-05-01', '2026-04-10', 0.97), ('A3050', 'تأمین تجهیزات ثابت و اسکیدها', '3', '2025-07-15', '2027-03-05', 0.55),
        ('A3060', 'تأمین تجهیزات برق', '3', '2025-08-01', '2027-04-01', 0.48), ('A3070', 'تأمین ابزاردقیق و DCS', '3', '2025-08-15', '2027-04-10', 0.32),
        ('A3080', 'تأمین سازهٔ فلزی و جرثقیل', '3', '2025-06-01', '2026-06-10', 0.9)]
    for x in m_exec.acts():
        wbs = {'جبههٔ سیویل': '4', 'جبههٔ مکانیکال و پایپینگ': '5', 'جبههٔ برق و ابزاردقیق': '6'}[m_exec.FRONTS[x['ch']]]
        if x['no'].startswith('11'): wbs = '7'
        acts.append(('C' + x['no'].replace('-', ''), x['title'], wbs, x['ps'].isoformat(), x['pe'].isoformat(), x['done']))
    acts += [('A7010', 'تحویل مکانیکی (Mechanical Completion)', '7', '2028-02-28', '2028-02-28', 0.0), ('A7020', 'گازدهی و راه‌اندازی واحدهای A و B', '7', '2028-03-01', '2028-03-15', 0.0),
             ('A7030', 'آزمون عملکرد و تحویل موقت', '7', '2028-03-15', '2028-03-19', 0.0)]
    return T, acts

def sql():
    out = ["-- scheduling: versions, calendars, activities, relations, contract, milestones, delay and risk events"]
    T, acts = tasks()
    v0, v3 = U('sch/v0'), U('sch/v3')
    out += ins('sch_versions', [
        dict(id=v0, project_id=P, label='Rev0 — خط مبنای مصوب', kind='baseline', source='p6_xer', file_name='HMD-CS-L3-Rev0.xer', data_date=D(2025, 6, 15), project_start=START, project_finish=FINISH, status='draft', is_baseline=False, is_current=False,
             approved_by=None, approved_at=None, summary=Raw(js({'errors': 0, 'warnings': 0, 'calendars': 1, 'relations': len(acts) - 1, 'activities': len(acts) + len(T)})), note='خط مبنای مصوب کارفرما', created_by=EMP_REP[1], review_status='none'),
        dict(id=v3, project_id=P, label='Rev3 — به‌روزرسانی ۲۴ آبان ۱۴۰۵', kind='update', source='p6_xer', file_name='HMD-CS-L3-Rev3.xer', data_date=D(2026, 11, 15), project_start=START, project_finish=D(2028, 11, 15), status='draft', is_baseline=False, is_current=True,
             parent_version_id=v0, approved_by=None, approved_at=None, summary=Raw(js({'errors': 0, 'warnings': 2, 'calendars': 1, 'relations': len(acts) - 1, 'activities': len(acts) + len(T)})),
             note='پیش‌بینی پایان: ۲۴ آبان ۱۴۰۷ (۸ ماه تأخیر) — مسیر بحرانی: ساخت و حمل توربوکمپرسور واحد C', created_by=EMP_REP[1], review_status='none')])
    for v in (v0, v3):
        out += ins('sch_calendars', [dict(id=U(f'cal/{v}'), project_id=P, version_id=v, code='CAL-6D', name='تقویم کارگاه — شنبه تا پنجشنبه، توقف زمستانی', work_days=Raw('array[0,1,2,3,4,5]::int[]'), hours_per_day=9,
                                          holidays=Raw("array['2026-03-20','2026-03-21','2026-03-22','2026-03-23','2026-04-01','2026-04-02','2027-03-21','2027-03-22']::date[]"), is_default=True, source_id='CAL-6D')])
        rows = []
        for k, (code, name, wbs, _) in enumerate(T):
            rows.append(dict(id=U(f'sa/{v}/{code}'), project_id=P, version_id=v, code=code, source_id=code, name=name, wbs_code=wbs, wbs_path=name, activity_type='summary', calendar_id=U(f'cal/{v}'), orig_duration=0,
                             planned_start=None, planned_finish=None, actual_start=None, actual_finish=None, pct_complete=None, budget_cost=0, owner='', sort=k + 1))
        for k, (code, name, wbs, ps, pf, done) in enumerate(acts):
            ps_, pf_ = d(ps), d(pf); dur = max(0, (pf_ - ps_).days * 6 // 7)
            r = dict(id=U(f'sa/{v}/{code}'), project_id=P, version_id=v, code=code, source_id=code, name=name, wbs_code=f'{wbs}.{k + 1}', wbs_path=dict((t[2], t[1]) for t in T)[wbs] + ' / ' + name,
                     activity_type='milestone' if ps == pf else 'task', calendar_id=U(f'cal/{v}'), orig_duration=dur, planned_start=ps_, planned_finish=pf_, actual_start=None, actual_finish=None, pct_complete=None,
                     budget_cost=0, owner={'1': 'مدیریت پروژه', '2': 'مهندسی', '3': 'تأمین کالا', '7': 'راه‌اندازی'}.get(wbs, 'اجرا'), sort=100 + k)
            if v == v3:
                # update: progress, actual dates and the forecast (late work slides; the turbo path drives the finish)
                if done > 0: r['actual_start'] = add(ps_, R.randint(0, 25))
                if done >= 0.999: r['actual_finish'] = add(pf_, R.randint(5, 40)); r['pct_complete'] = 100; r['rem_duration'] = 0
                else:
                    r['pct_complete'] = round(done * 100, 1)
                    slip = 240 if code in ('A3015', 'A7010', 'A7020', 'A7030') or wbs == '7' else (150 if wbs in ('5', '6') else 75)
                    if ps_ > TODAY or done < 1: r['planned_finish'] = max(add(pf_, slip), add(TODAY, 30)); r['planned_start'] = ps_ if done > 0 else max(add(ps_, slip // 2), add(TODAY, 100))
                    if code == 'A3015': r['planned_finish'] = D(2028, 7, 31)  # unit C: Hot Section parts held — arrival forecast end of Tir 1407
                    # started work: what is left until its forecast finish; work not started: its own duration (the logic places it)
                    r['rem_duration'] = max(1, (r['planned_finish'] - TODAY).days * 6 // 7) if done > 0 else dur
            rows.append(r)
        out += ins('sch_activities', rows)
        rel = []
        seq = [a[0] for a in acts]
        for a, b in zip(seq, seq[1:]):
            same = dict((x[0], x[2]) for x in acts)
            if same[a] == same[b]:  # neighbours in one discipline overlap: start-to-start
                rel.append(dict(id=U(f'sr/{v}/{a}/{b}'), project_id=P, version_id=v, pred_id=U(f'sa/{v}/{a}'), succ_id=U(f'sa/{v}/{b}'), rel_type='SS', lag_days=10 if a.startswith('C') else 0))
        for a, b in [('A2040', 'C0202'), ('A3010', 'A3015'), ('A3015', 'C0801'), ('C0801', 'A7010'), ('A2050', 'C0701'), ('A3040', 'C0701'), ('C0702', 'C0706'), ('C0706', 'A7010'), ('C1003', 'A7010'), ('A7010', 'A7020'), ('A7020', 'A7030'), ('A3060', 'C0903'), ('A3070', 'C1003')]:
            rel.append(dict(id=U(f'sr/{v}/{a}/{b}/x'), project_id=P, version_id=v, pred_id=U(f'sa/{v}/{a}'), succ_id=U(f'sa/{v}/{b}'), rel_type='FS', lag_days=0))
        seen = set(); rel = [x for x in rel if (x['pred_id'], x['succ_id'], x['rel_type']) not in seen and not seen.add((x['pred_id'], x['succ_id'], x['rel_type']))]
        out += ins('sch_relations', rel)
    # versions are filled as drafts (the guard locks approved ones), then approved
    out.append(f"update sch_versions set status='approved', is_baseline=true, approved_by={q(EMP_PM)}, approved_at={q(ts(D(2025, 6, 25)))}, review_status='endorsed' where id={q(v0)};")
    out.append(f"update sch_versions set status='approved', approved_by={q(EMP_PM)}, approved_at={q(ts(D(2026, 11, 18)))}, review_status='endorsed' where id={q(v3)};")
    out.append(f"insert into sch_contract (project_id, contract_start, contract_finish, contract_value, ld_per_day, ld_cap_pct, notice_days, doc_review_days, tolerance_days, note, updated_by) values ({q(P)}, {q(START)}, {q(FINISH)}, {CONTRACT_VALUE}, 19000000000, 10, 14, 14, 0, 'خسارت تأخیر روزانه ۰٫۰۱٪ مبلغ پیمان، سقف ۱۰٪', {q(EMP_REP[1])});")
    out += ins('sch_milestones', [dict(id=U('ms/' + k), project_id=P, title=t, activity_uid=None, contract_date=d(dt), ld_per_day=ld, sort=i + 1, created_by=EMP_REP[1]) for i, (k, t, dt, ld) in enumerate([
        ('ifc', 'تأیید نقشه‌های IFC پایپینگ و فونداسیون', '2026-10-20', 0), ('turbo', 'تحویل سه واحد توربوکمپرسور در کارگاه', '2027-04-25', 0), ('mc', 'تحویل مکانیکی (Mechanical Completion)', '2028-02-28', 9_500_000_000),
        ('gasin', 'گازدهی واحدهای A و B', '2028-03-15', 19_000_000_000), ('ptc', 'تحویل موقت ایستگاه', '2028-03-19', 19_000_000_000)])])
    de = [('تأخیر ساخت و ارسال قطعات Hot Section توربوکمپرسور واحد C (توقف در گمرک کشور ثالث)', 'supply', 'force_majeure', 'بند ۴۳ — قوهٔ قاهره', D(2026, 6, 10), None, D(2026, 6, 20), 150, True, 'assessed'),
          ('تأخیر کارفرما در تخصیص ارز و گشایش مرحلهٔ دوم اعتبار اسنادی پکیج توربوکمپرسور', 'payment', 'employer', 'بند ۳۲', D(2026, 8, 1), None, D(2026, 8, 10), 75, True, 'draft'),
          ('تأخیر تأیید نقشه‌های IFC فونداسیون واحد C توسط مشاور', 'drawing_approval', 'employer', 'بند ۱۸', D(2026, 4, 15), D(2026, 6, 30), D(2026, 4, 25), 45, False, 'assessed'),
          ('دیرکرد پیمانکار در تجهیز کارگاه بتن و کمبود نیروی آرماتوربند', 'resources', 'contractor', '—', D(2026, 4, 1), D(2026, 7, 15), None, 0, False, 'assessed'),
          ('برف و یخبندان زودهنگام آبان ۱۴۰۵', 'weather', 'force_majeure', 'بند ۴۳', D(2026, 11, 5), D(2026, 11, 12), D(2026, 11, 8), 6, False, 'draft')]
    out += ins('sch_delay_events', [dict(id=U(f'de/{i}'), project_id=P, title=t, cause=c, party=pa, clause=cl, event_start=s, event_end=e, notice_date=nd, activity_uids=Raw("'{}'::uuid[]"), claimed_days=cd, critical=cr, status=st,
                                         approved_days=cd if st == 'approved' else None, source_type='manual', source_ref='', note='', created_by=EMP_REP[1]) for i, (t, c, pa, cl, s, e, nd, cd, cr, st) in enumerate(de)])
    re = [('عدم تحویل به‌موقع توربوکمپرسور واحد C', 0.65, 60, 150, 240, 0, 800e9, 2500e9), ('مردودی مجدد FAT واحد B', 0.2, 20, 45, 90, 0, 150e9, 400e9),
          ('کمبود جوشکار واجد شرایط برای جوشکاری میدانی', 0.35, 10, 30, 60, 0, 60e9, 180e9), ('تأخیر تأمین DCS به‌علت محدودیت صادرات', 0.4, 30, 75, 120, 0, 200e9, 600e9)]
    out += ins('sch_risk_events', [dict(id=U(f're/{i}'), project_id=P, title=t, probability=p, days_min=a, days_likely=b, days_max=c, cost_min=x, cost_likely=y, cost_max=z, activity_uids=Raw("'{}'::uuid[]"), active=True, note='', created_by=EMP_REP[1])
                                   for i, (t, p, a, b, c, x, y, z) in enumerate(re)])
    return out, dict(activities=len(acts) + len(T), delay_events=len(de))

R = random.Random(9)
