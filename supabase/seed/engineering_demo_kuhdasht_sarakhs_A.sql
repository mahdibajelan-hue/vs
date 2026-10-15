-- Engineering & execution-readiness demo — 48" gas pipeline Kuhdasht–Sarakhs (master project MAT-DEMO-48).
-- Part A: engineering document register, document↔activity links, prerequisites, activity dependencies and the weekly look-ahead.
-- Written to be *cross-module testable*: docs are tied to change requests (KS-001..KS-004), land parcels (KS-P05 dispute), material packages (PK-01/04),
-- finance contracts (KS-EPC-01/02) and to the activities that already have approved daily reports, so readiness, delay impact and the S-curve all have data.
-- Idempotent: does nothing when the project already has engineering documents. Clean up: delete from ex_eng_docs where project_id = p (links/prereqs cascade for docs; prereqs/deps/lookahead by activity).
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  a_str uuid; a_weld uuid; a_rt uuid; a_coat uuid; a_trench uuid; a_back uuid; a_cross uuid;
  a_civ1 uuid; a_civ2 uuid; a_st1 uuid; a_st2 uuid; a_st3 uuid;
  par5 uuid; pk1 uuid; pk4 uuid; ws date;
begin
  if exists (select 1 from ex_eng_docs where project_id = p) then raise notice 'engineering demo already present'; return; end if;
  perform set_config('ex.rpc', '1', true);

  select id into a_str from ex_activities where project_id = p and item_no = '510101026' order by sort limit 1;
  select id into a_weld from ex_activities where project_id = p and item_no = '510226007' order by sort limit 1;
  select id into a_rt from ex_activities where project_id = p and item_no = '510301026' order by sort limit 1;
  select id into a_coat from ex_activities where project_id = p and item_no = '510411026' order by sort limit 1;
  select id into a_trench from ex_activities where project_id = p and item_no = '511301001' order by sort limit 1;
  select id into a_back from ex_activities where project_id = p and item_no = '511309002' order by sort limit 1;
  select id into a_cross from ex_activities where project_id = p and chapter_no = '6' and weight_group = 'خطوط لوله ۱۴۰۲' and kind = 'standard' order by sort limit 1;
  select id into a_civ1 from ex_activities where project_id = p and weight_group = 'ابنیه ۱۴۰۳' and kind = 'standard' order by sort limit 1;
  select id into a_civ2 from ex_activities where project_id = p and weight_group = 'ابنیه ۱۴۰۳' and kind = 'standard' order by sort offset 3 limit 1;
  select id into a_st1 from ex_activities where project_id = p and weight_group = 'ایستگاه تراکم و برق ۱۴۰۲' and kind = 'standard' order by sort limit 1;
  select id into a_st2 from ex_activities where project_id = p and weight_group = 'ایستگاه تراکم و برق ۱۴۰۲' and kind = 'standard' order by sort offset 4 limit 1;
  select id into a_st3 from ex_activities where project_id = p and weight_group = 'ایستگاه تراکم و برق ۱۴۰۲' and kind = 'standard' order by sort offset 9 limit 1;
  select id into par5 from la_parcels where master_project_id = p and code = 'KS-P05';
  select id into pk1 from mtl_packages where master_project_id = p and code = 'PK-01';
  select id into pk4 from mtl_packages where master_project_id = p and code = 'PK-04';

  -- ---------- 1) Document register (28 documents: every status, overdue ones, critical ones, a restricted release and a superseded revision) ----------
  insert into ex_eng_docs (project_id, doc_no, title, discipline, rev, status, restriction_note, contract, preparer, approver, weight, planned_prepared, planned_approved, actual_prepared, actual_approved, critical, due_date, issued_date, note, created_by) values
   (p,'KS-PL-001','نقشه‌های نواری مسیر (Strip Map) — قطعهٔ ۱','pipeline','0','approved','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',5,current_date-150,current_date-120,current_date-152,current_date-118,false,current_date-120,current_date-118,'',u),
   (p,'KS-PL-002','نقشه‌های نواری مسیر (Strip Map) — قطعهٔ ۲','pipeline','0','approved','','KS-EPC-02','مهندسین مشاور پایا','مشاور ناظر',5,current_date-140,current_date-110,current_date-139,current_date-105,false,current_date-110,current_date-105,'',u),
   (p,'KS-PL-003','محاسبات ضخامت جداره — مناطق کلاس ۳ مکانی (بازنگری B)','pipeline','B','pending_approval','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',8,current_date-40,current_date-5,current_date-18,null,true,current_date-5,current_date-18,'ناشی از درخواست تغییر KS-003؛ تأیید نهایی در انتظار تصمیم کارفرما',u),
   (p,'KS-PL-004','طرح تفصیلی سه گذر HDD رودخانه‌های فصلی (km 180–210)','pipeline','A','in_preparation','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',9,current_date-45,current_date-12,null,null,true,current_date-12,null,'ناشی از درخواست تغییر KS-001؛ دیرکرد تحویل نقشهٔ ژئوتکنیک رودخانه‌ها',u),
   (p,'KS-PL-005','جزئیات تیپ گذر جاده و راه‌آهن','pipeline','1','approved','','KS-EPC-02','مهندسین مشاور پایا','مشاور ناظر',4,current_date-100,current_date-70,current_date-98,current_date-66,false,current_date-70,current_date-66,'',u),
   (p,'KS-PL-006','اصلاح مسیر km 112 تا 114.4 (حریم معدنی)','pipeline','A','restricted','فقط برای حفاری کانال مجاز است؛ لوله‌گذاری پس از تأیید نهایی مجوز صمت','KS-EPC-02','مهندسین مشاور پایا','مشاور ناظر',6,current_date-35,current_date-8,current_date-20,current_date-6,true,current_date-8,current_date-20,'ناشی از درخواست تغییر KS-002 (در حال اجرا)',u),
   (p,'KS-PL-007','جزئیات تیپ کانال، بستر و خاکریز','pipeline','2','approved','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',4,current_date-130,current_date-100,current_date-129,current_date-99,false,current_date-100,current_date-99,'',u),
   (p,'KS-PL-008','دستورالعمل تست هیدرواستاتیک و پیگ‌رانی','pipeline','0','required','','KS-EPC-01','پیمانکار EPC','مشاور ناظر',3,current_date+30,current_date+60,null,null,false,current_date+60,null,'',u),
   (p,'KS-WE-001','WPS/PQR جوشکاری لولهٔ ۵۶ اینچ X70','welding','1','approved','','KS-EPC-01','پیمانکار EPC','بازرسی شخص ثالث',6,current_date-120,current_date-95,current_date-118,current_date-92,false,current_date-95,current_date-92,'',u),
   (p,'KS-WE-002','دستورالعمل پرتونگاری و ارزیابی فیلم (RT)','welding','0','approved','','KS-EPC-01','پیمانکار EPC','بازرسی شخص ثالث',3,current_date-110,current_date-90,current_date-108,current_date-88,false,current_date-90,current_date-88,'',u),
   (p,'KS-WE-003','دستورالعمل پوشش‌دهی درز جوش (Field Joint Coating)','welding','B','pending_approval','','KS-EPC-02','پیمانکار EPC','مشاور ناظر',5,current_date-30,current_date-4,current_date-10,null,true,current_date-4,current_date-10,'بازنگری به‌علت درخواست تغییر KS-004 (FBE دوبل)',u),
   (p,'KS-WE-004','مشخصات فنی پوشش خط لوله — 3LPE','coating','A','superseded','','KS-EPC-02','تأمین‌کنندهٔ لوله','مشاور ناظر',4,current_date-160,current_date-130,current_date-158,current_date-128,false,current_date-130,current_date-128,'ابطال‌شده با KS-004',u),
   (p,'KS-WE-004','مشخصات فنی پوشش خط لوله — FBE دوبل','coating','B','in_preparation','','KS-EPC-02','تأمین‌کنندهٔ لوله','مشاور ناظر',6,current_date-12,current_date+8,null,null,true,current_date+8,null,'منتظر نتیجهٔ ارزیابی KS-004',u),
   (p,'KS-CP-001','طرح حفاظت کاتدی (CP) خط لوله','cathodic','0','required','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',5,current_date+10,current_date+45,null,null,false,current_date+45,null,'',u),
   (p,'KS-CP-002','نقشه‌های پست‌های TR و بستر آند','cathodic','0','required','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',3,current_date+25,current_date+70,null,null,false,current_date+70,null,'',u),
   (p,'KS-CV-001','نقشه‌های فونداسیون ایستگاه تراکم','civil','0','issued','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',7,current_date-60,current_date-25,current_date-24,null,false,current_date-25,current_date-24,'ارسال‌شده برای تأیید',u),
   (p,'KS-CV-002','نقشه‌های ساختمان‌های ایستگاه (کنترل، برق، اپراتوری)','civil','1','approved','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',6,current_date-90,current_date-50,current_date-88,current_date-47,false,current_date-50,current_date-47,'',u),
   (p,'KS-CV-003','نقشه‌های راه دسترسی و محوطه‌سازی ایستگاه','civil','0','in_preparation','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',3,current_date-5,current_date+20,null,null,false,current_date+20,null,'',u),
   (p,'KS-ME-001','P&ID ایستگاه تراکم','mechanical','2','approved','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',8,current_date-120,current_date-80,current_date-118,current_date-76,false,current_date-80,current_date-76,'',u),
   (p,'KS-ME-002','چیدمان ایستگاه شیرهای میان‌مسیری (MLV)','mechanical','0','issued','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',4,current_date-40,current_date-12,current_date-11,null,false,current_date-12,current_date-11,'',u),
   (p,'KS-ME-003','جزئیات شیرهای ایزولاسیون و اتصالات ایستگاه','mechanical','0','pending_approval','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',4,current_date-25,current_date-3,current_date-14,null,false,current_date-3,current_date-14,'',u),
   (p,'KS-EL-001','دیاگرام تک‌خطی (SLD) ایستگاه تراکم','electrical','0','in_preparation','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',5,current_date-20,current_date+12,null,null,false,current_date+12,null,'',u),
   (p,'KS-IN-001','معماری SCADA و ابزار دقیق','instrument','0','required','','KS-EPC-02','دفتر فنی ایستگاه','مشاور ناظر',5,current_date+20,current_date+60,null,null,false,current_date+60,null,'',u),
   (p,'KS-IN-002','طرح مخابرات و فیبر نوری موازی خط','instrument','0','required','','KS-EPC-01','مهندسین مشاور پایا','مشاور ناظر',3,current_date+40,current_date+85,null,null,false,current_date+85,null,'',u),
   (p,'KS-GT-001','گزارش ژئوتکنیک — قطعهٔ ۱','geotech','0','approved','','KS-EPC-01','آزمایشگاه مکانیک خاک','مشاور ناظر',4,current_date-170,current_date-140,current_date-168,current_date-138,false,current_date-140,current_date-138,'',u),
   (p,'KS-GT-002','گزارش ژئوتکنیک — قطعهٔ ۲','geotech','0','approved','','KS-EPC-02','آزمایشگاه مکانیک خاک','مشاور ناظر',4,current_date-165,current_date-135,current_date-163,current_date-131,false,current_date-135,current_date-131,'',u),
   (p,'KS-GT-003','گزارش ژئوتکنیک رودخانه‌ها (محل گذرهای HDD)','geotech','0','in_preparation','','KS-EPC-01','آزمایشگاه مکانیک خاک','مشاور ناظر',5,current_date-50,current_date-14,null,null,true,current_date-14,null,'پیش‌نیاز KS-PL-004؛ ۱۴ روز دیرکرد',u),
   (p,'KS-HS-001','برنامهٔ HSE اجرایی پروژه','hse','1','approved','','KS-EPC-01','پیمانکار EPC','مشاور ناظر',2,current_date-170,current_date-150,current_date-169,current_date-147,false,current_date-150,current_date-147,'',u);

  -- ---------- 2) Document ↔ activity links (what must be ready, from when, and what is allowed) ----------
  insert into ex_doc_links (project_id, doc_id, activity_id, front, contract, need_kind, need_date, min_status, allow_restricted, alt_activity_id, note, created_by)
  select p, d.id, x.act, x.fr, d.contract, x.nk, current_date + x.nd, x.ms, x.ar, x.alt, x.nt, u
  from (values
    ('KS-PL-001', a_str,   'جبههٔ شمال','start',   -20, 'approved', false, null::uuid, ''),
    ('KS-PL-002', a_str,   'جبههٔ مرکز','start',   -15, 'approved', false, null::uuid, ''),
    ('KS-PL-007', a_trench,'جبههٔ شمال','start',   -30, 'approved', false, null::uuid, ''),
    ('KS-PL-007', a_back,  'جبههٔ شمال','start',    10, 'approved', false, null::uuid, ''),
    ('KS-GT-001', a_trench,'جبههٔ شمال','start',   -30, 'approved', false, null::uuid, ''),
    ('KS-GT-002', a_trench,'جبههٔ مرکز','start',   -30, 'approved', false, null::uuid, ''),
    ('KS-WE-001', a_weld,  'جبههٔ شمال','start',   -25, 'approved', false, null::uuid, ''),
    ('KS-WE-002', a_rt,    'جبههٔ شمال','start',   -20, 'approved', false, null::uuid, ''),
    ('KS-PL-003', a_weld,  'جبههٔ شمال','continue',  6, 'approved', false, a_str,      'جوش لوله با ضخامت جدید در مناطق کلاس ۳؛ تا تأیید، فقط مناطق کلاس ۱–۲ ادامه می‌یابد'),
    ('KS-PL-006', a_trench,'جبههٔ مرکز','continue',  3, 'issued',   true,  null::uuid, 'حفاری کانال با محدودیت مجاز است'),
    ('KS-PL-006', a_str,   'جبههٔ مرکز','continue',  9, 'approved', false, a_trench,   'لوله‌گذاری در مسیر اصلاحی پس از رفع محدودیت'),
    ('KS-PL-004', a_cross, 'جبههٔ شمال','start',    25, 'approved', false, a_str,      'گذر HDD — بدون نقشهٔ تأییدشده شروع نمی‌شود'),
    ('KS-GT-003', a_cross, 'جبههٔ شمال','start',    18, 'approved', false, null::uuid, ''),
    ('KS-PL-005', a_cross, 'جبههٔ شمال','start',   -10, 'approved', false, null::uuid, ''),
    ('KS-WE-003', a_coat,  'جبههٔ مرکز','start',    10, 'approved', false, a_rt,       'درز جوش بدون روش تأییدشده پوشش داده نمی‌شود'),
    ('KS-WE-004', a_coat,  'جبههٔ مرکز','start',    18, 'approved', false, null::uuid, 'مشخصات پوشش FBE دوبل پس از تصویب KS-004'),
    ('KS-CV-001', a_civ1,  'ایستگاه','start',        5, 'issued',   false, null::uuid, ''),
    ('KS-CV-002', a_civ1,  'ایستگاه','start',      -10, 'approved', false, null::uuid, ''),
    ('KS-CV-003', a_civ2,  'ایستگاه','start',       30, 'approved', false, null::uuid, ''),
    ('KS-ME-001', a_st1,   'ایستگاه','start',      -20, 'approved', false, null::uuid, ''),
    ('KS-ME-003', a_st1,   'ایستگاه','continue',    14, 'approved', false, null::uuid, ''),
    ('KS-EL-001', a_st2,   'ایستگاه','start',       40, 'approved', false, null::uuid, ''),
    ('KS-IN-001', a_st3,   'ایستگاه','start',       90, 'approved', false, null::uuid, ''),
    ('KS-CP-001', a_back,  'جبههٔ شمال','continue', 55, 'approved', false, null::uuid, 'طرح حفاظت کاتدی قبل از خاکریز نهایی')
  ) x(dn, act, fr, nk, nd, ms, ar, alt, nt)
  join ex_eng_docs d on d.project_id = p and d.doc_no = x.dn and d.status <> 'superseded'
  where x.act is not null;

  -- ---------- 3) Non-document prerequisites (materials from the package register, land from the parcels, permits, equipment, inspections) ----------
  insert into ex_prereqs (project_id, activity_id, kind, title, ref_type, ref_id, status, needed_date, ready_date, note, created_by) values
   (p, a_str,   'material', 'لولهٔ ۵۶ اینچ X70 — بستهٔ PK-01', 'package', pk1, 'ready', current_date-20, current_date-35, '', u),
   (p, a_str,   'equipment','سایدبوم ۴ دستگاه برای جبههٔ شمال', '', null, 'ready', current_date-20, current_date-26, '', u),
   (p, a_weld,  'material', 'مصرفی جوشکاری — بستهٔ PK-04', 'package', pk4, 'pending', current_date+7, null, 'محموله در گمرک؛ موجودی دو هفته‌ای', u),
   (p, a_weld,  'manpower', 'جوشکاران واجد گواهی (۱۶ نفر از ۲۴ نفر)', '', null, 'pending', current_date+5, null, 'آزمون صلاحیت ۸ نفر در هفتهٔ آینده', u),
   (p, a_rt,    'equipment','دستگاه پرتونگاری و اتاق تاریک (پیمانکار TPI)', '', null, 'ready', current_date-10, current_date-12, '', u),
   (p, a_trench,'land',     'رفع تصرف محدودهٔ km 112–114.4', '', null, 'ready', current_date-15, current_date-18, '', u),
   (p, a_trench,'permit',   'مجوز حریم معدنی (وزارت صمت)', '', null, 'ready', current_date-20, current_date-22, 'مجوز با شرط ایمنی', u),
   (p, a_cross, 'permit',   'مجوز عبور از رودخانه‌ها (آب منطقه‌ای)', '', null, 'blocked', current_date+20, null, 'استعلام بالادست هنوز پاسخ داده نشده', u),
   (p, a_cross, 'land',     'تحصیل اراضی قطعهٔ KS-P05 (محدودهٔ اختلافی)', 'land', par5, 'blocked', current_date+22, null, 'رأی دادگاه در انتظار؛ مسیر دعوی', u),
   (p, a_cross, 'equipment','دستگاه HDD ۳۰۰ تنی', '', null, 'pending', current_date+24, null, 'قرارداد اجاره در حال نهایی‌سازی', u),
   (p, a_coat,  'material', 'مواد پوشش درز جوش (FBE دوبل) — PK-04', 'package', pk4, 'pending', current_date+12, null, 'منتظر تصمیم KS-004', u),
   (p, a_coat,  'inspection','تأیید کارخانهٔ پوشش توسط TPI', '', null, 'pending', current_date+10, null, '', u),
   (p, a_back,  'inspection','تأیید گزارش پرتونگاری قطعهٔ پایین‌آورده‌شده', '', null, 'pending', current_date+8, null, '', u),
   (p, a_st1,   'equipment','جرثقیل ۱۰۰ تنی برای نصب تجهیزات ایستگاه', '', null, 'pending', current_date+14, null, '', u),
   (p, a_civ1,  'material', 'میلگرد و سیمان فونداسیون ایستگاه', '', null, 'ready', current_date+3, current_date-2, '', u);

  -- ---------- 4) Activity dependencies (the main line: trench → string → weld → RT → coat → backfill; station civil → mechanical) ----------
  insert into ex_activity_deps (project_id, pred_id, succ_id, dep_type, lag_days) values
   (p, a_trench, a_str,  'SS', 3),
   (p, a_str,    a_weld, 'SS', 2),
   (p, a_weld,   a_rt,   'SS', 1),
   (p, a_rt,     a_coat, 'FS', 0),
   (p, a_coat,   a_back, 'FS', 1),
   (p, a_trench, a_back, 'FS', 0),
   (p, a_civ1,   a_st1,  'FS', 5),
   (p, a_st1,    a_st2,  'FS', 3);

  -- ---------- 5) Weekly look-ahead: two past weeks (committed vs achieved with causes), the current week and the next two ----------
  ws := current_date - ((extract(dow from current_date)::int + 1) % 7);
  insert into ex_lookahead (project_id, week_start, activity_id, front, responsible, planned_qty, resources, committed, achieved_qty, deviation_cause, recovery_plan, note, created_by) values
   (p, ws-14, a_str,   'جبههٔ شمال', 'سرپرست خط لوله', 5400, '{"crew":3,"sideboom":4}'::jsonb, true, 5100, '', '', '', u),
   (p, ws-14, a_weld,  'جبههٔ شمال', 'سرپرست جوشکاری', 130, '{"crew":4,"welders":16}'::jsonb, true, 118, 'کمبود جوشکار واجد گواهی', 'استخدام ۴ جوشکار', '', u),
   (p, ws-14, a_trench,'جبههٔ مرکز', 'سرپرست عملیات خاکی', 21000, '{"excavator":5}'::jsonb, true, 21800, '', '', '', u),
   (p, ws-7,  a_str,   'جبههٔ شمال', 'سرپرست خط لوله', 5400, '{"crew":3,"sideboom":4}'::jsonb, true, 5500, '', '', '', u),
   (p, ws-7,  a_weld,  'جبههٔ شمال', 'سرپرست جوشکاری', 130, '{"crew":4,"welders":18}'::jsonb, true, 96, 'بارندگی و تعطیلی دو روزه', 'کار شب‌ها', '', u),
   (p, ws-7,  a_rt,    'جبههٔ شمال', 'مسئول QC', 120, '{"crew":1}'::jsonb, true, 120, '', '', '', u),
   (p, ws-7,  a_trench,'جبههٔ مرکز', 'سرپرست عملیات خاکی', 21000, '{"excavator":5}'::jsonb, false, 15200, 'تأخیر در تحویل زمین km 114', 'انتقال یک بیل به جبههٔ شمال', '', u),
   (p, ws,    a_str,   'جبههٔ شمال', 'سرپرست خط لوله', 5400, '{"crew":3,"sideboom":4}'::jsonb, true, null, '', '', '', u),
   (p, ws,    a_weld,  'جبههٔ شمال', 'سرپرست جوشکاری', 140, '{"crew":4,"welders":20}'::jsonb, true, null, '', '', 'مناطق کلاس ۱–۲ فقط', u),
   (p, ws,    a_rt,    'جبههٔ شمال', 'مسئول QC', 130, '{"crew":1}'::jsonb, true, null, '', '', '', u),
   (p, ws,    a_trench,'جبههٔ مرکز', 'سرپرست عملیات خاکی', 21000, '{"excavator":5}'::jsonb, true, null, '', '', 'با محدودیت KS-PL-006', u),
   (p, ws+7,  a_weld,  'جبههٔ شمال', 'سرپرست جوشکاری', 140, '{"crew":4,"welders":20}'::jsonb, false, null, '', '', 'در انتظار مصرفی PK-04', u),
   (p, ws+7,  a_coat,  'جبههٔ مرکز', 'سرپرست پوشش', 3800, '{"crew":2}'::jsonb, false, null, '', '', 'در انتظار تأیید روش KS-WE-003', u),
   (p, ws+14, a_cross, 'جبههٔ شمال', 'سرپرست گذرها', 1, '{"hdd":1}'::jsonb, false, null, '', '', 'وابسته به نقشهٔ KS-PL-004 و مجوز آب منطقه‌ای', u);
end
$seed$;
