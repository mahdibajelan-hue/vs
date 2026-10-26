-- دادهٔ نمایشی PSSR برای پروژهٔ فرضی خط ۴۸ اینچ کوهدشت–سرخس (MAT-DEMO-48). پس از 001 اجرا شود؛ تکرار آن بی‌اثر است.
do $$
declare pid uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63'; s1 uuid; s2 uuid; s3 uuid; m1 uuid;
begin
  if exists (select 1 from pssr_systems where master_project_id = pid) then return; end if;
  insert into pssr_signers (master_project_id, seq, role_label, signer_email) values
    (pid, 1, 'نمایندهٔ پیمانکار', ''), (pid, 2, 'مهندس ناظر', ''), (pid, 3, 'نمایندهٔ بهره‌بردار', ''), (pid, 4, 'مسئول HSE', ''), (pid, 5, 'مجری طرح', '');
  insert into pssr_systems (master_project_id, code, name, kind, km_from, km_to, target_gas_in, created_by) values (pid, 'SYS-01', 'قطعهٔ ۱ خط — کیلومتر ۰ تا ۸۰', 'pipeline', 0, 80, '2027-02-20', 'demo-seed') returning id into s1;
  insert into pssr_systems (master_project_id, code, name, kind, km_from, km_to, target_gas_in, created_by) values (pid, 'SYS-02', 'قطعهٔ ۲ خط — کیلومتر ۸۰ تا ۱۶۰', 'pipeline', 80, 160, '2027-05-10', 'demo-seed') returning id into s2;
  insert into pssr_systems (master_project_id, code, name, kind, target_gas_in, created_by) values (pid, 'ST-01', 'ایستگاه شیر و پیگ‌لانچر کیلومتر ۸۰', 'station', '2027-03-15', 'demo-seed') returning id into s3;
  insert into pssr_checks (system_id, template_item_id, category, seq, title, mandatory)
    select s.id, t.id, t.category, t.seq, t.title, t.mandatory from (values (s1, 'pipeline'), (s2, 'pipeline'), (s3, 'station')) s(id, kind)
    join pssr_template_items t on t.is_active and (t.kind = 'all' or t.kind = s.kind);
  -- SYS-01: بازبینی پیش رفته؛ دو بند ناقص و یک پانچ A باز
  update pssr_checks set status = 'ok', evidence = 'صورت‌جلسهٔ نمایشی', checked_by = 'demo-seed', checked_at = now() where system_id = s1 and seq not in (13, 23);
  update pssr_checks set status = 'fail', evidence = 'کالیبراسیون ۳ ترانسمیتر فشار باقی مانده', checked_by = 'demo-seed', checked_at = now() where system_id = s1 and seq = 13;
  insert into pssr_meetings (system_id, held_on, attendees, notes, created_by) values (s1, '2026-10-12', 'پیمانکار EPC، مهندس ناظر، نمایندهٔ بهره‌بردار، HSE', 'بازدید مسیر و ایستگاه‌های شیر؛ ۴ یافته ثبت شد.', 'demo-seed') returning id into m1;
  insert into pssr_punches (system_id, meeting_id, category, title, discipline, owner, due_date, status, raised_by, closed_by, closed_at, verified_by, verified_at) values
    (s1, m1, 'A', 'پلاک شناسایی و قفل شیرهای خط‌شکن کیلومتر ۴۲ نصب نشده', 'مکانیک', 'پیمانکار EPC', '2026-11-05', 'open', 'demo-seed', null, null, null, null),
    (s1, m1, 'A', 'گزارش تست عملکرد ESD شیر ورودی امضا نشده', 'ابزار دقیق', 'پیمانکار EPC', '2026-10-30', 'verified', 'demo-seed', 'demo-contractor', now(), 'demo-supervisor', now()),
    (s1, m1, 'B', 'رنگ‌آمیزی تکمیلی سازه‌های نگهدارندهٔ لوله‌های روزمینی', 'سیویل', 'پیمانکار EPC', '2027-01-15', 'open', 'demo-seed', null, null, null, null),
    (s1, m1, 'C', 'افزودن تابلوی راهنمای مسیر دسترسی امدادی', 'HSE', 'بهره‌بردار', null, 'open', 'demo-seed', null, null, null, null);
  -- ST-01: همه‌چیز آماده؛ دو امضای اول انجام شده
  update pssr_checks set status = case when mandatory then 'ok' else 'na' end, evidence = 'صورت‌جلسهٔ نمایشی', checked_by = 'demo-seed', checked_at = now() where system_id = s3;
  insert into pssr_meetings (system_id, held_on, attendees, notes, created_by) values (s3, '2026-10-20', 'پیمانکار، ناظر، بهره‌بردار، HSE', 'بدون یافتهٔ A.', 'demo-seed');
  insert into pssr_signoffs (system_id, seq, role_label, decision, comment, signed_by) values (s3, 1, 'نمایندهٔ پیمانکار', 'sign', '', 'demo-contractor'), (s3, 2, 'مهندس ناظر', 'sign', '', 'demo-supervisor');
end $$;
