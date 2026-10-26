-- Demo hydrotest / coating progress for MAT-DEMO-48 (run once, after the line sectioning was saved from the UI).
-- HT-01 accepted, HT-02 in leak test, HT-03 failed in strength test, HT-04 filling; station packs; coating tests.
do $$
declare
  pid uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; p1 uuid; p2 uuid; r1 uuid; r2 uuid;
  t0 timestamptz;
  by_ text := 'demo@seed';
  i int;
begin
  if pid is null or exists (select 1 from ht_events where master_project_id = pid) then return; end if;
  select id into s1 from ht_sections where master_project_id = pid and code = 'HT-01';
  select id into s2 from ht_sections where master_project_id = pid and code = 'HT-02';
  select id into s3 from ht_sections where master_project_id = pid and code = 'HT-03';
  select id into s4 from ht_sections where master_project_id = pid and code = 'HT-04';
  if s4 is null then return; end if;

  update ht_sections set stage = 'accepted', planned_date = '2026-08-20' where id = s1;
  update ht_sections set stage = 'leak', planned_date = '2026-09-25' where id = s2;
  update ht_sections set stage = 'strength', failed = true, failed_note = 'افت فشار ۲٫۴ bar در ساعت سوم آزمون مقاومت؛ نشتی در سرجوش J-1478 (km 17.7) پیدا شد', planned_date = '2026-10-05' where id = s3;
  update ht_sections set stage = 'filling', planned_date = '2026-10-20' where id = s4;
  update ht_sections set planned_date = date '2026-11-01' + (seq - 5) * 9 where master_project_id = pid and seq >= 5;

  -- stage history
  insert into ht_events (master_project_id, target_kind, target_id, stage, failed, note, by_user, at)
  select pid, 'section', x.id, x.stage, x.failed, x.note, by_, x.at from (values
    (s1, 'cleaning', false, 'پیگ تمیزکاری و گیجینگ بدون فرورفتگی', timestamptz '2026-08-14 08:00+03:30'),
    (s1, 'filling', false, '', timestamptz '2026-08-16 07:00+03:30'),
    (s1, 'stabilization', false, '', timestamptz '2026-08-17 18:00+03:30'),
    (s1, 'strength', false, '', timestamptz '2026-08-18 08:00+03:30'),
    (s1, 'leak', false, '', timestamptz '2026-08-18 12:30+03:30'),
    (s1, 'dewatering', false, '', timestamptz '2026-08-19 13:00+03:30'),
    (s1, 'accepted', false, 'صورت‌جلسهٔ آزمون با امضای پیمانکار، مشاور و کارفرما', timestamptz '2026-08-21 10:00+03:30'),
    (s2, 'cleaning', false, '', timestamptz '2026-09-18 08:00+03:30'),
    (s2, 'filling', false, '', timestamptz '2026-09-20 07:00+03:30'),
    (s2, 'stabilization', false, '', timestamptz '2026-09-22 18:00+03:30'),
    (s2, 'strength', false, '', timestamptz '2026-09-24 08:00+03:30'),
    (s2, 'leak', false, '', timestamptz '2026-09-24 12:30+03:30'),
    (s3, 'cleaning', false, '', timestamptz '2026-10-01 08:00+03:30'),
    (s3, 'filling', false, '', timestamptz '2026-10-02 07:00+03:30'),
    (s3, 'stabilization', false, '', timestamptz '2026-10-03 18:00+03:30'),
    (s3, 'strength', false, '', timestamptz '2026-10-05 08:00+03:30'),
    (s3, 'strength', true, 'افت فشار ۲٫۴ bar در ساعت سوم آزمون مقاومت؛ نشتی در سرجوش J-1478 (km 17.7) پیدا شد', timestamptz '2026-10-05 11:10+03:30'),
    (s4, 'cleaning', false, '', timestamptz '2026-10-15 08:00+03:30'),
    (s4, 'filling', false, 'آبگیری از چاه کیلومتر ۳۳', timestamptz '2026-10-22 07:00+03:30')
  ) as x(id, stage, failed, note, at);

  -- readings at the test head: strength 4 h + leak 24 h (HT-01), strength + leak in progress (HT-02), failed strength (HT-03)
  t0 := '2026-08-18 08:00+03:30';
  for i in 0..4 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'section', s1, 'strength', t0 + i * interval '1 hour', 143.6 - i * 0.05, 18.4 + i * 0.1, by_);
  end loop;
  for i in 0..8 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'section', s1, 'leak', t0 + interval '4.5 hour' + i * interval '3 hour', 121.0 - i * 0.03, 18.0 - (i % 4) * 0.3, by_);
  end loop;
  t0 := '2026-09-24 08:00+03:30';
  for i in 0..4 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'section', s2, 'strength', t0 + i * interval '1 hour', 143.6 - i * 0.04, 17.1 + i * 0.1, by_);
  end loop;
  for i in 0..4 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'section', s2, 'leak', t0 + interval '4.5 hour' + i * interval '3 hour', 121.0 - i * 0.04, 16.8 - (i % 3) * 0.2, by_);
  end loop;
  t0 := '2026-10-05 08:00+03:30';
  for i in 0..3 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'section', s3, 'strength', t0 + i * interval '1 hour', 139.5 - case when i < 2 then i * 0.1 else 0.2 + (i - 1) * 1.1 end, 15.9, by_);
  end loop;

  -- station test packages (ST-01 compressor station at km 80)
  insert into ht_packs (master_project_id, code, station, title, design_pressure_bar, test_pressure_bar, medium, stage, planned_date, created_by)
  values (pid, 'TP-ST01-01', 'ST-01', 'هدر ورودی و فیلتر جداکننده‌ها', 100, 150, 'water', 'accepted', '2026-09-10', by_) returning id into p1;
  insert into ht_packs (master_project_id, code, station, title, design_pressure_bar, test_pressure_bar, medium, stage, planned_date, created_by)
  values (pid, 'TP-ST01-02', 'ST-01', 'خطوط مکش و رانش کمپرسورها', 100, 150, 'water', 'strength', '2026-10-24', by_) returning id into p2;
  insert into ht_packs (master_project_id, code, station, title, design_pressure_bar, test_pressure_bar, medium, stage, planned_date, created_by)
  values (pid, 'TP-ST01-03', 'ST-01', 'لوله‌کشی گاز سوخت و ابزار دقیق', 16, 24, 'nitrogen', 'planned', '2026-11-15', by_);
  insert into ht_events (master_project_id, target_kind, target_id, stage, failed, note, by_user, at) values
    (pid, 'pack', p1, 'strength', false, '', by_, '2026-09-08 09:00+03:30'),
    (pid, 'pack', p1, 'accepted', false, 'تأیید بازرس کارفرما', by_, '2026-09-10 12:00+03:30'),
    (pid, 'pack', p2, 'strength', false, '', by_, '2026-10-24 09:00+03:30');
  for i in 0..2 loop
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'pack', p1, 'strength', timestamptz '2026-09-08 09:00+03:30' + i * interval '2 hour', 150.2 - i * 0.05, 22, by_);
    insert into ht_readings (master_project_id, target_kind, target_id, phase, at, pressure_bar, temp_c, by_user)
    values (pid, 'pack', p2, 'strength', timestamptz '2026-10-24 09:00+03:30' + i * interval '1 hour', 150.1 - i * 0.04, 21, by_);
  end loop;

  -- coating: holiday over the coated field joints, DCVG over the first backfilled stretch, adhesion spot checks
  insert into ct_records (master_project_id, kind, km_from, km_to, at, voltage_kv, result, defects, report_no, contractor, by_user)
  values (pid, 'holiday', 0, 8.4, '2026-07-12', 15, 'pass', 3, 'HD-001', 'پیمانکار خط', by_) returning id into r1;
  insert into ct_records (master_project_id, kind, km_from, km_to, at, voltage_kv, result, defects, report_no, contractor, by_user)
  values (pid, 'holiday', 8.4, 16.8, '2026-08-05', 15, 'fail', 2, 'HD-002', 'پیمانکار خط', by_) returning id into r2;
  insert into ct_records (master_project_id, kind, km_from, km_to, at, voltage_kv, result, defects, report_no, contractor, by_user)
  values (pid, 'dcvg', 0, 6, '2026-09-02', null, 'pass', 0, 'DCVG-001', 'شرکت بازرسی', by_),
         (pid, 'adhesion', 2, 2.1, '2026-07-14', null, 'pass', 0, 'AD-001', 'شرکت بازرسی', by_);
  insert into ct_defects (master_project_id, record_id, km, kind, severity, status, note, repaired_at, by_user) values
    (pid, r1, 1.27, 'holiday', 'minor', 'verified', 'سوراخ سوزنی روی سرجوش', '2026-07-13', by_),
    (pid, r1, 4.65, 'holiday', 'minor', 'verified', '', '2026-07-13', by_),
    (pid, r1, 7.92, 'holiday', 'moderate', 'repaired', 'آسیب حین حمل', '2026-07-15', by_),
    (pid, r2, 11.36, 'holiday', 'severe', 'open', 'جداشدگی پوشش نوار حرارتی', null, by_),
    (pid, r2, 14.08, 'holiday', 'moderate', 'open', '', null, by_);
end $$;
