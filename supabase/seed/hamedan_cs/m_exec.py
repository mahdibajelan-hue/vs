"""Construction (execution module): price book, station activities (scope 'station'), approved baseline, daily work
reports with lines / manpower / equipment / stoppages, project roles and settings.
Target: planned − actual = 26.6 points exactly as plannedOverall / physicalProgress compute them (one weighting basis).
Planned windows never straddle the winter stop (21 Nov 2026 → 28 Feb 2027): they end by the data date or start in March."""
from common import *

GROUP = 'ایستگاه تقویت فشار ۱۴۰۴'
# item, title, unit, base qty, unit price (rial), planned start, planned end, chapter, done share (approved) at the data date
A = [
    # civil / earthworks
    ('01-01', 'تسطیح، خاکبرداری و پی‌کنی محوطهٔ ایستگاه', 'm3', 86000, 2_900_000, '2025-09-20', '2025-11-30', 'عملیات خاکی', 1.0),
    ('01-02', 'خاکریزی و کوبیدگی با مصالح منتخب (۹۵٪ پروکتور)', 'm3', 54000, 4_100_000, '2025-10-10', '2026-04-30', 'عملیات خاکی', 0.92),
    ('02-01', 'بتن مگر زیر فونداسیون‌ها', 'm3', 1900, 46_000_000, '2026-03-01', '2026-06-30', 'بتن', 0.81),
    ('02-02', 'بتن فونداسیون‌های توربوکمپرسور (بلوک بتنی سنگین C35)', 'm3', 3600, 98_000_000, '2026-04-01', '2026-09-30', 'بتن', 0.36),
    ('02-03', 'بتن فونداسیون کولرهای هوایی و تجهیزات ثابت', 'm3', 2400, 79_000_000, '2026-04-15', '2026-09-15', 'بتن', 0.52),
    ('02-04', 'بتن سازه‌ای ساختمان‌ها (کنترل، پست برق، کارگاه، آتش‌نشانی)', 'm3', 3100, 84_000_000, '2026-05-01', '2026-10-31', 'بتن', 0.44),
    ('03-01', 'تهیه، بریدن، خم‌کردن و بستن میلگرد A3', 'kg', 1_450_000, 610_000, '2026-03-15', '2026-10-31', 'آرماتوربندی', 0.47),
    ('03-02', 'قالب‌بندی فلزی فونداسیون‌ها و دیوارها', 'm2', 21000, 7_400_000, '2026-03-15', '2026-10-31', 'قالب‌بندی', 0.5),
    ('04-01', 'نصب سازهٔ فلزی پایپ‌رک‌ها', 'kg', 380_000, 2_300_000, '2026-07-01', '2026-11-15', 'سازهٔ فلزی', 0.21),
    ('04-02', 'نصب اسکلت فلزی سولهٔ کمپرسورخانه و جرثقیل‌رو', 'kg', 270_000, 2_450_000, '2026-08-01', '2026-11-20', 'سازهٔ فلزی', 0.0),
    ('05-01', 'دیوار پیرامونی و حصار امنیتی ایستگاه', 'm', 1650, 41_000_000, '2025-11-01', '2026-06-30', 'محوطه‌سازی', 0.78),
    ('05-02', 'زهکشی و کانال جمع‌آوری آب‌های سطحی', 'm', 2100, 16_500_000, '2026-05-01', '2026-10-31', 'محوطه‌سازی', 0.3),
    ('05-03', 'کانال کابل و داکت‌بانک زیرزمینی', 'm', 2800, 13_800_000, '2026-06-01', '2026-11-15', 'محوطه‌سازی', 0.15),
    ('05-04', 'راه‌های داخلی، زیراساس و آسفالت', 'm2', 24000, 6_200_000, '2027-04-01', '2027-08-31', 'محوطه‌سازی', 0.0),
    ('06-01', 'ساختمان کنترل — اسکلت و سفت‌کاری', 'm2', 1450, 64_000_000, '2026-06-01', '2026-11-20', 'ساختمان‌ها', 0.1),
    ('06-04', 'ساختمان کنترل — نازک‌کاری و تأسیسات', 'm2', 1450, 56_000_000, '2027-03-15', '2027-07-31', 'ساختمان‌ها', 0.0),
    ('06-02', 'ساختمان پست برق — سفت‌کاری و نازک‌کاری', 'm2', 980, 104_000_000, '2026-06-01', '2026-11-20', 'ساختمان‌ها', 0.12),
    ('06-03', 'کارگاه تعمیرات و انبار', 'm2', 1200, 72_000_000, '2027-03-15', '2027-08-31', 'ساختمان‌ها', 0.0),
    # mechanical / piping
    ('07-01', 'پیش‌ساخت اسپول‌های لوله در شاپ (اینچ‌قطر)', 'inch-dia', 26500, 11_800_000, '2026-06-01', '2026-11-20', 'پایپینگ', 0.31),
    ('07-02', 'جوشکاری میدانی لوله‌های ایستگاه (اینچ‌قطر)', 'inch-dia', 31000, 14_600_000, '2027-03-01', '2027-10-31', 'پایپینگ', 0.0),
    ('07-03', 'نصب لوله‌های روزمینی و اسپول‌ها', 'm', 6200, 21_000_000, '2027-03-01', '2027-10-31', 'پایپینگ', 0.0),
    ('07-04', 'لوله‌گذاری زیرزمینی سرخط ورودی و خروجی', 'm', 1400, 38_000_000, '2026-06-15', '2026-11-15', 'پایپینگ', 0.18),
    ('07-05', 'نصب شیرآلات خط اصلی و ESD', 'no', 68, 410_000_000, '2027-03-15', '2027-09-30', 'پایپینگ', 0.0),
    ('07-06', 'آزمون هیدرواستاتیک و خشک‌کردن (تست‌پک)', 'pack', 24, 1_650_000_000, '2027-07-01', '2027-12-31', 'پایپینگ', 0.0),
    ('07-07', 'رنگ و پوشش لوله‌ها و سازه', 'm2', 18500, 5_900_000, '2027-04-01', '2027-11-30', 'پایپینگ', 0.0),
    ('08-01', 'نصب، تراز و گروت‌ریزی پکیج‌های توربوکمپرسور', 'set', 3, 31_000_000_000, '2026-10-01', '2026-11-20', 'نصب تجهیزات', 0.0),
    ('08-02', 'نصب کولرهای هوایی گاز', 'bay', 6, 4_100_000_000, '2027-03-15', '2027-06-30', 'نصب تجهیزات', 0.0),
    ('08-03', 'نصب فیلترسپراتورها، لانچر/ریسیور و مخازن', 'no', 7, 2_300_000_000, '2027-03-15', '2027-06-30', 'نصب تجهیزات', 0.0),
    ('08-04', 'نصب اسکیدهای گاز سوخت، هوای ابزار و میترینگ', 'no', 3, 3_400_000_000, '2027-04-01', '2027-07-31', 'نصب تجهیزات', 0.0),
    # electrical / instrument
    ('09-01', 'سیستم ارت و حفاظت در برابر صاعقه', 'm', 9500, 3_100_000, '2026-05-01', '2026-11-15', 'برق', 0.38),
    ('09-02', 'کابل‌کشی قدرت و کنترل', 'm', 42000, 2_600_000, '2027-04-01', '2027-11-30', 'برق', 0.0),
    ('09-03', 'نصب ترانس‌ها، تابلوها و دیزل ژنراتور', 'no', 9, 2_900_000_000, '2027-04-01', '2027-08-31', 'برق', 0.0),
    ('09-04', 'روشنایی محوطه و ساختمان‌ها', 'no', 420, 64_000_000, '2027-05-01', '2027-11-30', 'برق', 0.0),
    ('10-01', 'نصب ابزاردقیق و هوک‌آپ', 'no', 480, 72_000_000, '2027-05-01', '2027-12-31', 'ابزاردقیق', 0.0),
    ('10-02', 'کابل‌کشی و ترمیناسیون ابزاردقیق', 'm', 22000, 2_200_000, '2027-05-01', '2027-12-31', 'ابزاردقیق', 0.0),
    ('10-03', 'نصب و راه‌اندازی سیستم DCS / ESD / F&G', 'set', 1, 9_500_000_000, '2027-07-01', '2028-01-31', 'ابزاردقیق', 0.0),
    ('11-01', 'پیش‌راه‌اندازی، Loop Check و آماده‌سازی تحویل مکانیکی', 'system', 12, 1_250_000_000, '2027-10-01', '2028-02-28', 'پیش‌راه‌اندازی', 0.0),
]
FRONTS = {'عملیات خاکی': 'جبههٔ سیویل', 'بتن': 'جبههٔ سیویل', 'آرماتوربندی': 'جبههٔ سیویل', 'قالب‌بندی': 'جبههٔ سیویل', 'محوطه‌سازی': 'جبههٔ سیویل', 'ساختمان‌ها': 'جبههٔ سیویل',
          'سازهٔ فلزی': 'جبههٔ مکانیکال و پایپینگ', 'پایپینگ': 'جبههٔ مکانیکال و پایپینگ', 'نصب تجهیزات': 'جبههٔ مکانیکال و پایپینگ', 'برق': 'جبههٔ برق و ابزاردقیق',
          'ابزاردقیق': 'جبههٔ برق و ابزاردقیق', 'پیش‌راه‌اندازی': 'جبههٔ برق و ابزاردقیق'}
AREA_OF = {'02-02': 'واحد کمپرسور', '08-01': 'واحد کمپرسور', '04-02': 'واحد کمپرسور', '02-03': 'کولرها', '07-04': 'سرخط ورودی', '06-02': 'پست برق', '06-01': 'ساختمان کنترل'}

# each activity's share of the construction value (percent) — civil ≈ 38, steel 7, piping 30, equipment setting 12, E&I 15, pre-commissioning 3
SHARE = {'01-01': 3.2, '01-02': 3.0, '02-01': 1.2, '02-02': 4.6, '02-03': 2.6, '02-04': 3.4, '03-01': 4.4, '03-02': 2.2, '04-01': 3.6, '04-02': 3.4,
         '05-01': 1.6, '05-02': 0.9, '05-03': 1.1, '05-04': 2.0, '06-01': 2.4, '06-04': 2.2, '06-02': 2.1, '06-03': 1.5,
         '07-01': 5.6, '07-02': 9.0, '07-03': 4.8, '07-04': 2.0, '07-05': 2.8, '07-06': 2.2, '07-07': 3.0,
         '08-01': 5.8, '08-02': 2.4, '08-03': 1.6, '08-04': 1.7, '09-01': 1.1, '09-02': 4.0, '09-03': 2.2, '09-04': 1.0, '10-01': 3.0, '10-02': 2.0, '10-03': 2.2, '11-01': 3.0}
C_TOTAL = 48_000_000_000_000   # rial

def acts():
    out = []
    tot_share = sum(SHARE.values())
    for (no, title, unit, qty, _price, ps, pe, ch, done) in A:
        price = round(SHARE[no] / tot_share * C_TOTAL / qty)
        ps, pe = d(ps), d(pe)
        assert not (ps < FREEZE_FROM <= pe), f'{no} straddles the winter window'
        out.append(dict(no=no, title=title, unit=unit, qty=qty, price=price, ps=ps, pe=pe, ch=ch, done=done, w=SHARE[no] / tot_share * 100, id=U('act/' + no)))
    return out

def planned(xs):
    p = 0
    for x in xs:
        f = 0 if TODAY <= x['ps'] else 1 if TODAY >= x['pe'] else (TODAY - x['ps']).days / (x['pe'] - x['ps']).days
        p += x['w'] * f
    return p / sum(x['w'] for x in xs) * 100
def actual(xs): return sum(x['w'] * x['done'] for x in xs) / sum(x['w'] for x in xs) * 100

def calibrate(xs, gap=26.6):
    """scales the in-progress activities' done share (keeping finished ones whole) until planned − actual = gap"""
    pl = planned(xs)
    live = [x for x in xs if 0 < x['done'] < 1]
    base = {x['no']: x['done'] for x in live}
    lo, hi = 0.2, 3.0
    for _ in range(80):
        k = (lo + hi) / 2
        for x in live: x['done'] = min(0.98, base[x['no']] * k)
        if pl - actual(xs) > gap: lo = k
        else: hi = k
    return pl, actual(xs)

def sql():
    xs = acts()
    pl, ac = calibrate(xs)
    out = ["-- construction: price book, activities, approved baseline, settings, roles"]
    book = U('book/1404')
    out += ins('ex_price_books', [dict(id=book, project_id=P, discipline='ایستگاه تراکم گاز', year=1404, season='کل', title='فهرست‌بهای ایستگاه تراکم و تأسیسات صنعتی ۱۴۰۴ (آزمایشی)', version=1, status='active', created_by=ME)])
    rows = []
    for k, x in enumerate(xs):
        rows.append(dict(id=x['id'], project_id=P, item_no=x['no'], row_no=x['no'], title=x['title'], unit=x['unit'], chapter=x['ch'], chapter_no=x['no'][:2], kind='standard', base_qty=x['qty'],
                         unit_price=x['price'], weight=round(x['w'], 5), weight_group=GROUP, metric='qty', area=AREA_OF.get(x['no'], 'کل ایستگاه'), front=FRONTS[x['ch']], station='ایستگاه همدان',
                         planned_start=x['ps'], planned_end=x['pe'], active=True, approval='approved', approved_by=EMP_PM, approved_at=ts(D(2025, 9, 1)), sort=k * 10, book_id=book, scope='station',
                         unit_count=3 if x['no'] in ('02-02', '08-01') else (6 if x['no'] == '08-02' else None), created_by=ME))
    out += ins('ex_activities', rows)
    bl = U('baseline/v1')
    out += ins('ex_baselines', [dict(id=bl, project_id=P, version=1, status='approved', reason='خط مبنای مصوب اجرا (پس از تأیید برنامهٔ زمان‌بندی سطح ۳)', effective_date=D(2025, 9, 1), created_by=ME, approved_by=EMP_PM, approved_at=ts(D(2025, 9, 3)))])
    out += ins('ex_baseline_lines', [dict(id=U('bll/' + x['no']), baseline_id=bl, activity_id=x['id'], item_no=x['no'], title=x['title'], unit=x['unit'], base_qty=x['qty'], weight=round(x['w'], 5), unit_price=x['price'], weight_group=GROUP, active=True) for x in xs])
    # roles: the project's people in the execution module
    roles = [(CTR_REP, 'contractor', ORG_CTR), (CTR_PM, 'site_head', ORG_CTR), (CONS_PM, 'supervision', ORG_SUP), (EMP_PM, 'manager', ORG_EMP), (EMP_REP[0], 'employer', ORG_EMP), (EMP_REP[1], 'planner', ORG_EMP), (EMP_REP[2], 'payment', ORG_EMP)]
    out += ins('ex_project_roles', [dict(id=U(f'exrole/{u}/{r}'), project_id=P, user_id=u, role=r, organization_id=o, active=True, created_by=ME) for u, r, o in roles])
    settings = {'flags': {'today': True, 'actionEntry': False, 'centralWeld': False}, 'climate': 'west_cold_mountain', 'workDays': [0, 1, 2, 3, 4, 5], 'weekStart': 0, 'reviewDays': 2, 'gapDueDays': 2,
                'projectStart': '2025-09-20', 'expectedFronts': ['جبههٔ سیویل', 'جبههٔ مکانیکال و پایپینگ', 'جبههٔ برق و ابزاردقیق'], 'groupWeights': {GROUP: 1}, 'delayNoticeDays': 14,
                'engCommentDays': 3, 'engConsultantDays': 10, 'identity': {'contractNo': 'HMD-EPC-01', 'stationName': 'ایستگاه تقویت فشار همدان'}}
    out.append(f"insert into ex_settings (project_id, values_json, updated_by) values ({q(P)}, {js(settings)}, {q(ME)});")
    rep_sql, rep_stats = reports(xs)
    out += rep_sql
    return out, dict(activities=len(xs), planned=round(pl, 2), actual=round(ac, 2), gap=round(pl - ac, 2), value=sum(x['qty'] * x['price'] for x in xs), **rep_stats)

CREW = {'جبههٔ سیویل': [('man', 'سرپرست کارگاه', 1), ('man', 'تکنسین نقشه‌برداری', 2), ('man', 'استادکار بتن', 4), ('man', 'آرماتوربند', 10), ('man', 'قالب‌بند', 8), ('man', 'کارگر ساده', 22),
                        ('equip', 'بیل مکانیکی ۲۱۰', 2), ('equip', 'لودر', 1), ('equip', 'غلتک ویبره', 1), ('equip', 'تراک‌میکسر', 3), ('equip', 'پمپ دکل بتن', 1), ('equip', 'جرثقیل ۲۵ تن', 1)],
        'جبههٔ مکانیکال و پایپینگ': [('man', 'سرپرست مکانیک', 1), ('man', 'جوشکار درجه‌یک', 8), ('man', 'فیتر', 6), ('man', 'کمک‌جوشکار', 8), ('man', 'نصاب سازه', 6), ('man', 'کارگر فنی', 10),
                                     ('equip', 'دستگاه جوش دیزلی', 8), ('equip', 'جرثقیل ۵۰ تن', 1), ('equip', 'کمپرسور هوا', 1), ('equip', 'دستگاه برش و بول', 2)],
        'جبههٔ برق و ابزاردقیق': [('man', 'سرپرست برق', 1), ('man', 'برقکار صنعتی', 6), ('man', 'کارگر ساده', 6), ('equip', 'ترانشر', 1), ('equip', 'وانت', 2)]}

def reports(xs):
    """daily work reports: one per front on working days with work, from mobilisation to the data date; the approved
    quantities add up to each activity's done share (actual); the last few days are still with the supervision"""
    out, lines, res, stops = [], [], [], []
    by_front = {}
    for x in xs:
        if x['done'] > 0: by_front.setdefault(FRONTS[x['ch']], []).append(x)
    reps = 0; nlines = 0
    for front, acts_ in by_front.items():
        # working days: every second working day in the season (winter 1404: 20 Dec → 5 Mar no work)
        days = []
        start = min(x['ps'] for x in acts_); g = start
        while g <= add(TODAY, -1):
            off = D(2025, 12, 20) <= g <= D(2026, 3, 5) or g.weekday() == 4  # Friday
            if not off and (g - start).days % 2 == 0: days.append(g)
            g = add(g, 1)
        # the approved quantity of each activity (its done share) spread over the approved days inside its window;
        # the last six days are still with the supervision and carry a little more, pending
        share = {}
        cut = add(TODAY, -6)
        for x in acts_:
            win = [g for g in days if x['ps'] <= g <= max(add(x['pe'], 40), add(x['ps'], 30)) and g < cut] or [g for g in days if g < cut][-5:]
            total = x['qty'] * x['done']
            weights = [0.6 + rnd.random() for _ in win]; ws = sum(weights)
            for g, w in zip(win, weights): share.setdefault(g, []).append((x, total * w / ws))
            if x['done'] < 1:
                for g in [g for g in days if g >= cut]: share.setdefault(g, []).append((x, x['qty'] * 0.004 * (0.5 + rnd.random())))
        for g in sorted(share):
            items = share[g]
            rid = U(f'rep/{front}/{g}')
            recent = g >= add(TODAY, -6)
            status = 'submitted' if recent else 'approved'
            # a few reports with a returned line (supervision cut the quantity)
            reps += 1
            out.append(dict(id=rid, project_id=P, form_key='work', report_no=f"WRK-{front[-4:].strip()}-{reps:04d}".replace(' ', ''), report_date=g, contractor_org_id=ORG_CTR, front=front, station='ایستگاه همدان',
                            shift='day', status=status, data=Raw(js({'weather': 'آفتابی' if g.month in (5, 6, 7, 8, 9) else rnd.choice(['آفتابی', 'ابری', 'سرد و ابری'])})), notes='',
                            created_by=CTR_REP, submitted_by=CTR_REP, submitted_at=ts(g, 18), reviewed_by=None if recent else CONS_PM, reviewed_at=None if recent else ts(add(g, 1), 11),
                            review_note='', scope='station'))
            for k, (x, qv) in enumerate(items):
                if x['unit'] in ('set', 'bay', 'no', 'pack', 'system'): qv = round(qv, 2)
                nlines += 1
                lines.append(dict(id=U(f'rl/{rid}/{k}'), report_id=rid, line_no=k + 1, activity_id=x['id'], qty=round(qv, 3), location=AREA_OF.get(x['no'], 'محوطهٔ ایستگاه'), note='',
                                  detail=Raw("'{}'::jsonb"), status='pending' if recent else 'approved', approved_qty=None if recent else round(qv, 3), review_note='',
                                  reviewed_by=None if recent else CONS_PM, reviewed_at=None if recent else ts(add(g, 1), 11), evidence=Raw("'[]'::jsonb"), employer_note=''))
            for kind, name, n in CREW[front]:
                act = max(0, n + rnd.randint(-2, 1)) if kind == 'man' else n
                res.append(dict(id=U(f'rr/{rid}/{name}'), report_id=rid, kind=kind, name=name, active_qty=act, idle_qty=0 if kind == 'man' else rnd.choice([0, 0, 0, 1 if n > 1 else 0]),
                                hours=10 if kind == 'man' else 8, note='', section='', total_qty=n, leave_qty=max(0, n - act) if kind == 'man' else 0, stopped_qty=0, native_qty=round(n * .7) if kind == 'man' else 0,
                                nonnative_qty=n - round(n * .7) if kind == 'man' else 0, repair_qty=0))
            if rnd.random() < 0.12:
                cat, txt, resp, crit = rnd.choice([('weather', 'بارش باران و یخبندان صبحگاهی؛ توقف بتن‌ریزی تا ساعت ۱۱', 'force_majeure', False),
                                                   ('drawing', 'نقشه‌های IFC فونداسیون واحد C هنوز ابلاغ نشده است', 'employer', True),
                                                   ('material', 'تأخیر در تحویل میلگرد سایز ۲۵ از تأمین‌کننده', 'contractor', False),
                                                   ('equipment', 'خرابی پمپ دکل بتن و انتظار برای جایگزین', 'contractor', False),
                                                   ('permit', 'تأخیر در صدور مجوز کار گرم در مجاورت خط موجود', 'employer', False)])
                stops.append(dict(id=U(f'st/{rid}'), report_id=rid, category=cat, hours=rnd.choice([2, 3, 4, 6]), description=txt, responsibility=resp, critical=crit, notice_ref='', assess_note=''))
    sql = ["-- daily work reports (status set directly; the guards are bypassed with ex.rpc as the app's RPCs do)"]
    sql += ins('ex_reports', out) + ins('ex_report_lines', lines) + ins('ex_report_resources', res) + ins('ex_report_stoppages', stops)
    return sql, dict(reports=len(out), lines=len(lines))
