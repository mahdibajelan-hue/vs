"""Supporting modules: PSSR signers, missions (site and vendor visits), and the supervision site register
(site geofence, supervision staff, two months of attendance, rented vehicles and their days)."""
from common import *

R = random.Random(31)

def sql():
    out = ["-- supporting modules: PSSR signers, missions, supervision staff / attendance / vehicles"]
    out += ins('pssr_signers', [dict(id=U(f'pssrs/{i}'), master_project_id=P, seq=i + 1, role_label=r, signer_email='', person_label=n, step_rule='all', is_manual=True) for i, (r, n) in enumerate([
        ('سرپرست تیم PSSR (مشاور)', 'مهندس علی لک'), ('نمایندهٔ بهره‌بردار (منطقهٔ ۵ عملیات انتقال گاز)', 'مهندس کامران رحیمی'), ('رئیس HSE پروژه', 'مهندس پریسا کرمی'), ('مدیر پروژهٔ پیمانکار', PEOPLE[CTR_PM]), ('مدیر پروژهٔ کارفرما', PEOPLE[EMP_PM])])])
    ms = [('HMD-MS-01', EMP_PM, 'همدان — سایت ایستگاه', 'progress_review', -110, 2, 'claimed', 'بازدید فصلی پیشرفت و جلسه با استانداری'),
          ('HMD-MS-02', EMP_REP[0], 'میلان (ایتالیا) — کارخانهٔ سازندهٔ توربوکمپرسور', 'procurement_expediting', -38, 6, 'report_review', 'حضور در FAT واحدهای A و B و پیگیری قطعات Hot Section واحد C'),
          ('HMD-MS-03', CONS_PM, 'همدان — سایت ایستگاه', 'quality_audit', -20, 2, 'debrief', 'ممیزی کیفیت بتن فونداسیون واحد B و شاپ اسپول'),
          ('HMD-MS-04', EMP_PM, 'بندرعباس — گمرک شهید رجایی', 'procurement_expediting', 6, 3, 'pending_approval', 'پیگیری ترخیص پکیج توربوکمپرسور واحد A')]
    out += ins('ms_missions', [dict(id=U('ms/' + c), code=c, requester_id=r, requester_position='', master_project_id=P, destination=dst, location_detail='', start_date=add(TODAY, s), end_date=add(TODAY, s + n - 1), visit_type=vt,
                                    visitees=Raw("'[]'::jsonb"), topics_of_interest=topic, expected_output='گزارش بازدید و فهرست اقدامات', approver_id=ME, status=st, manager_comment='', origin_city='تهران', ticket_note='', ticket=Raw("'{}'::jsonb"))
                               for c, r, dst, vt, s, n, st, topic in ms])
    site = U('sv/site')
    out += ins('sv_sites', [dict(id=site, master_project_id=P, name='سایت ایستگاه تقویت فشار همدان', lat=34.6912, lng=48.6523, radius_m=600, active=True)])
    people = [('مهندس علی لک', 'سرپرست دستگاه نظارت مقیم', True), ('مهندس مریم نوری', 'ناظر کنترل کیفیت و جوش', False), ('مهندس امیر تهرانی', 'ناظر سیویل', False), ('مهندس سارا احمدی', 'ناظر مکانیکال و پایپینگ', False),
              ('مهندس نیما صادقی', 'ناظر برق و ابزاردقیق', False), ('مهندس پریسا کرمی', 'ناظر HSE', False), ('مهندس حمید شریفی', 'ناظر نقشه‌برداری', False), ('مرتضی کاظمی', 'کارشناس دفتر فنی نظارت', False)]
    pp = [dict(id=U(f'svp/{i}'), master_project_id=P, full_name=n, side='supervision', role_title=t, card_no=str(4100 + i), overtime_cap=60, meal_lunch=True, start_date=D(2025, 9, 15), active=True, note='', is_head=h, shift_start='07:00', shift_end='17:00')
          for i, (n, t, h) in enumerate(people)]
    out += ins('sv_people', pp)
    att, vd = [], []
    g = add(TODAY, -60)
    while g < TODAY:
        if g.weekday() != 4:
            for i in range(len(people)):
                r = R.random(); st = 'present' if r < .86 else ('leave' if r < .92 else ('mission' if r < .96 else 'rest'))
                cin = f'0{R.randint(6, 7)}:{R.randint(0, 5)}{R.randint(0, 9)}' if st == 'present' else None
                att.append(dict(id=U(f'sva/{i}/{g}'), master_project_id=P, person_id=U(f'svp/{i}'), day=g, status=st, check_in=cin, check_out=f'1{R.randint(6, 8)}:{R.randint(0, 5)}{R.randint(0, 9)}' if cin else None,
                                hours=10 if st == 'present' else 0, overtime=R.choice([0, 0, 1, 2]) if st == 'present' else 0, breakfast=False, lunch=st == 'present', dinner=False, source='manual', note='', late_reason=''))
        g = add(g, 1)
    out += ins('sv_attendance', att)
    veh = [('وانت دوکابین نظارت', '۲۴ ج ۵۸۱ ایران ۱۸', 'pickup'), ('خودروی سواری سرپرست نظارت', '۶۳ ص ۲۱۷ ایران ۱۸', 'sedan'), ('ون ایاب‌وذهاب کارکنان', '۱۸ ع ۷۳۴ ایران ۱۸', 'van')]
    out += ins('sv_vehicles', [dict(id=U(f'svv/{i}'), master_project_id=P, title=t, plate=pl, kind=k, lessor='شرکت خدمات خودرویی نمونه', driver='راننده', card_no=str(5200 + i), start_date=D(2025, 9, 15), active=True, note='', ownership='rented', model_year=1400 + i)
                               for i, (t, pl, k) in enumerate(veh)])
    g = add(TODAY, -60)
    while g < TODAY:
        if g.weekday() != 4:
            for i in range(len(veh)):
                st = 'present' if R.random() < .93 else 'repair'
                vd.append(dict(id=U(f'svd/{i}/{g}'), master_project_id=P, vehicle_id=U(f'svv/{i}'), day=g, status=st, hours=10 if st == 'present' else 0, km=R.randint(40, 180) if st == 'present' else 0, source='manual', note='', late_reason=''))
        g = add(g, 1)
    out += ins('sv_vehicle_days', vd)
    return out, dict(missions=len(ms), staff=len(people), attendance=len(att), vehicle_days=len(vd))
