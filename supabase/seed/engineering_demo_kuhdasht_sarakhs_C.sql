-- Part C: risk controls and KRIs for the demo project, tied to the engineering / change / procurement risks. Run after A and B. Idempotent: skipped when KRIs exist.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  rp uuid;
begin
  select source_project_id into rp from rasta_project_mappings where master_project_id = p and source_module = 'risk' and status = 'confirmed' limit 1;
  if exists (select 1 from rm_kris where project_id = rp) then return; end if;
  insert into rm_controls (risk_id, name, description, control_type, is_critical, status, effectiveness, last_tested_at, test_interval_days, evidence_note, created_by)
  select r.id, x.n, x.d, x.t, x.c, x.s, x.e, now() - make_interval(days => x.ago), x.iv, x.ev, u
  from (values
    ('R-004', 'اولویت‌بندی تأیید KS-PL-003 در کمیتهٔ هفتگی مهندسی', 'تأیید نهایی ضخامت جداره با مهلت ۷ روزه از کارفرما', 'preventive', true, 'active', 'partial', 6, 7, 'صورت‌جلسهٔ کمیتهٔ مهندسی'),
    ('R-004', 'تغییر ترتیب جوش به مناطق کلاس ۱–۲', 'ادامهٔ جوش در مناطق مجاز تا تأیید سند', 'contingency', false, 'active', 'effective', 3, 14, 'برنامهٔ هفتگی (Look-ahead)'),
    ('R-005', 'پیگیری مجوز آب منطقه‌ای با نامهٔ رسمی کارفرما', 'استعلام و مجوز عبور از رودخانه‌ها', 'preventive', true, 'planned', 'not_tested', 0, 30, ''),
    ('R-005', 'تعیین مسیر جایگزین (گذر بالادست)', 'بررسی امکان‌سنجی جابه‌جایی گذر برای دور شدن از حریم رودخانه', 'contingency', false, 'planned', 'not_tested', 0, 60, ''),
    ('R-001', 'پیگیری هفتگی کارخانهٔ سازنده شیر', 'بازرسی کارخانه و تأیید برنامهٔ ساخت', 'detective', true, 'active', 'effective', 9, 14, 'گزارش بازرسی TPI'),
    ('R-002', 'پوشش ارزی بخشی از تعهد یورویی', 'خرید ارز آتی برای ۵۰٪ تعهد', 'preventive', false, 'inactive', 'ineffective', 40, 90, 'در انتظار مصوبهٔ مالی'),
    ('R-003', 'بازبینی ماهانهٔ تعهدات در برابر بودجه', 'مطابقت الحاقیه‌ها با ردیف‌های بودجه', 'detective', false, 'active', 'partial', 12, 30, 'گزارش مرکز مالی')
  ) x(code, n, d, t, c, s, e, ago, iv, ev)
  join rm_risks r on r.project_id = rp and r.code = x.code;

  insert into rm_kris (project_id, risk_id, name, definition, unit, direction, baseline, warn_threshold, critical_threshold, frequency_days, data_source, active, created_by)
  select rp, r.id, y.n, y.d, y.un, y.dir, y.b, y.w, y.c, 7, 'manual', true, u
  from (values
    ('R-004', 'تعداد مدارک بحرانی معوق', 'مدارک با علامت بحرانی که از موعد تأیید گذشته‌اند', 'عدد', 'higher_worse', 0, 2, 4),
    ('R-005', 'روزهای باقی‌مانده تا شروع گذرهای HDD', 'فاصلهٔ امروز تا نیاز شروع منهای روزهای لازم برای تأیید طرح و مجوز', 'روز', 'lower_worse', 60, 30, 14),
    ('R-003', 'نسبت تعهدات به بودجهٔ ردیف KS-CON2', 'مجموع قرارداد و الحاقیه‌ها تقسیم بر ردیف بودجه', 'درصد', 'higher_worse', 90, 100, 110)
  ) y(code, n, d, un, dir, b, w, c)
  join rm_risks r on r.project_id = rp and r.code = y.code;
  insert into rm_kri_readings (kri_id, value, read_at, source, note, created_by)
  select g.id, v.val, now() - make_interval(days => v.ago), 'manual', '', u
  from rm_kris g join (values
    ('تعداد مدارک بحرانی معوق', 1, 28), ('تعداد مدارک بحرانی معوق', 2, 21), ('تعداد مدارک بحرانی معوق', 3, 14), ('تعداد مدارک بحرانی معوق', 5, 7), ('تعداد مدارک بحرانی معوق', 5, 0),
    ('روزهای باقی‌مانده تا شروع گذرهای HDD', 52, 28), ('روزهای باقی‌مانده تا شروع گذرهای HDD', 41, 14), ('روزهای باقی‌مانده تا شروع گذرهای HDD', 25, 0),
    ('نسبت تعهدات به بودجهٔ ردیف KS-CON2', 96, 28), ('نسبت تعهدات به بودجهٔ ردیف KS-CON2', 102, 14), ('نسبت تعهدات به بودجهٔ ردیف KS-CON2', 108, 0)
  ) v(n, val, ago) on v.n = g.name where g.project_id = rp;
end
$seed$;
