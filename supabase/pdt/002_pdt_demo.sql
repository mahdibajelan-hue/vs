-- دادهٔ نمایشی دوقلوی دیجیتال برای پروژهٔ فرضی MAT-DEMO-48 (پس از ساخت مسیر نمونه در خود ماژول).
-- پیشرفت فیزیکی ≈ ۴٫۹٪ تا با پیشرفت ساخت ماژول اجرا (۴٫۹٪) هم‌سان باشد؛ ایستگاه ST-01 در کیلومتر ۸۰ همان سیستم PSSR است.
do $$
declare pid uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63'; base timestamptz := now() - interval '180 days'; a uuid;
begin
  if exists (select 1 from pdt_joints where master_project_id = pid) then return; end if;
  -- جوش: سرجوش i در روز (i × ۱۷۰ / ۲۳۰۰) پس از شروع؛ بقیهٔ فعالیت‌ها چند روز بعد، هیچ تاریخی آینده نیست
  insert into pdt_joints (master_project_id, joint_no, welding, welding_at, ndt, ndt_at, coating, coating_at, lowering, lowering_at, backfill, backfill_at, welders, notes, updated_by)
  select pid, i,
    case when i <= 1000 then 'accepted' else 'welded' end,
    least(now() - interval '1 day', base + (i * 170.0 / 2300) * interval '1 day'),
    case when i <= 1800 and i > 1400 and i % 60 = 0 then 'failed' when i <= 1800 then 'passed' else 'pending' end,
    case when i <= 1800 then least(now() - interval '1 day', base + (i * 170.0 / 2300 + 3) * interval '1 day') end,
    case when i <= 1400 then 'completed' else 'pending' end,
    case when i <= 1400 then least(now() - interval '1 day', base + (i * 170.0 / 2300 + 6) * interval '1 day') end,
    case when i <= 1400 then 'completed' else 'pending' end,
    case when i <= 1400 then least(now() - interval '1 day', base + (i * 170.0 / 2300 + 10) * interval '1 day') end,
    case when i <= 1000 then 'completed' else 'pending' end,
    case when i <= 1000 then least(now() - interval '1 day', base + (i * 170.0 / 2300 + 14) * interval '1 day') end,
    array['W-' || (10 + i % 7)::text, 'W-' || (20 + i % 5)::text],
    case when i <= 1800 and i > 1400 and i % 60 = 0 then 'رادیوگرافی مردود — تعمیر و تست مجدد' else '' end,
    'demo-seed'
  from generate_series(1, 2300) i;
  insert into pdt_joint_events (master_project_id, joint_from, joint_to, field, to_value, note, by_user, at) values
    (pid, 1, 1000, 'backfillStatus', 'completed', 'گزارش‌های روزانهٔ جبههٔ ۱', 'demo-seed', base + interval '90 days'),
    (pid, 1, 1400, 'loweringStatus', 'completed', 'گزارش‌های روزانهٔ جبههٔ ۱', 'demo-seed', base + interval '115 days'),
    (pid, 1, 1800, 'ndtStatus', 'passed', 'گزارش‌های رادیوگرافی', 'demo-seed', base + interval '140 days'),
    (pid, 1, 2300, 'weldingStatus', 'welded', 'گزارش‌های جوشکاری', 'demo-seed', base + interval '170 days');

  insert into pdt_assets (master_project_id, tag, kind, name, km, size, make, install_date, condition, op_state, criticality, inspect_every_days, next_inspection, note, created_by) values
    (pid, 'PL-01', 'launcher', 'تلهٔ پیگ ارسال ابتدای خط', 0.2, '48" #600', '', current_date - 120, 'good', 'na', 'high', 180, current_date + 60, '', 'demo-seed'),
    (pid, 'MLV-01', 'valve', 'شیر خط‌شکن کیلومتر ۲۵', 25, '48" #600 Ball', '', current_date - 90, 'good', 'open', 'high', 90, current_date - 12, 'بازرسی دوره‌ای عقب افتاده', 'demo-seed'),
    (pid, 'CP-010', 'cp_post', 'پست تست حفاظت کاتدی', 10, '', '', current_date - 100, 'good', 'na', 'low', 90, current_date + 20, '', 'demo-seed'),
    (pid, 'X-RD-07', 'crossing', 'تقاطع جادهٔ اصلی', 7.4, 'Casing 56"', '', current_date - 110, 'good', 'na', 'medium', 365, current_date + 200, '', 'demo-seed'),
    (pid, 'X-RV-02', 'crossing', 'عبور از رودخانه (HDD)', 18.9, 'HDD 820 m', '', current_date - 95, 'fair', 'na', 'high', 180, current_date + 15, 'فرسایش جزئی در ساحل غربی', 'demo-seed'),
    (pid, 'MLV-02', 'valve', 'شیر خط‌شکن کیلومتر ۵۵', 55, '48" #600 Ball', '', null, 'good', 'closed', 'high', 90, null, 'نصب شده، تا راه‌اندازی بسته', 'demo-seed'),
    (pid, 'ST-01', 'station', 'ایستگاه شیر و پیگ‌لانچر کیلومتر ۸۰', 80, '', '', null, 'good', 'na', 'high', 180, null, 'همان سیستم ST-01 ماژول PSSR', 'demo-seed'),
    (pid, 'IJ-01', 'insulating_joint', 'اتصال عایقی ورودی ایستگاه', 79.9, '48"', '', null, 'poor', 'na', 'high', 180, current_date - 3, 'مقاومت عایقی پایین در آخرین تست', 'demo-seed'),
    (pid, 'MLV-03', 'valve', 'شیر خط‌شکن کیلومتر ۱۱۰', 110, '48" #600 Ball', '', null, 'good', 'closed', 'high', 90, null, 'تحویل‌نشده', 'demo-seed');
  select id into a from pdt_assets where master_project_id = pid and tag = 'MLV-01';
  insert into pdt_asset_events (asset_id, kind, at, result, condition, op_state, note, by_user) values
    (a, 'inspection', current_date - 102, 'نشتی ندارد؛ گریس‌کاری انجام شد', 'good', null, '', 'demo-seed'),
    (a, 'operation', current_date - 40, 'باز شد برای تست هیدرواستاتیک', null, 'open', '', 'demo-seed');
  select id into a from pdt_assets where master_project_id = pid and tag = 'IJ-01';
  insert into pdt_asset_events (asset_id, kind, at, result, condition, op_state, note, by_user) values
    (a, 'inspection', current_date - 20, 'مقاومت عایقی ۰٫۴ مگااهم (کمتر از حد)', 'poor', null, 'نیاز به تعویض پیش از تزریق گاز', 'demo-seed');
end $$;
