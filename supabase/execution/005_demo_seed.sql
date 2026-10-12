-- Demo data for the execution module on the hypothetical Kuhdasht–Sarakhs 48" gas pipeline project (same project the material and finance demos use).
-- Idempotent: does nothing when the project already has execution activities.
do $$
declare
  p uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  org_c uuid := '758db988-6b9d-426d-b9ac-56f18ac79d60';
  u_admin uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444'; u_con uuid := '7c9de13b-d7f4-47c1-b8e2-19b429d109a4'; u_sup uuid := 'e2a61809-54f2-487d-8edc-346875d285db'; u_cons uuid := '6f754038-59dc-4d0a-a635-124c6c36e63c';
  book uuid; bl uuid; r uuid; d date; k int := 0; fr text; st text; wd int; aid uuid; qty numeric; i int; q numeric; n int;
  acts uuid[] := '{}'; ids uuid[];
  codes text[] := array['020101','020205','020301','020302','020401','020501','010301','020601','010501'];
  titles text[] := array['حمل و ریسهٔ لولهٔ ۴۸ اینچ','خمکاری سرد لوله','فیت‌آپ لولهٔ ۴۸ اینچ','جوشکاری خط (SMAW/FCAW)','رادیوگرافی سرجوش','پوشش سرجوش (شیرینک اسلیو)','کانال‌کنی در زمین نوع ۲','لوله‌گذاری (Lowering)','بکفیل و گرده‌ماهی'];
  units text[] := array['متر','عدد','اتصال','سرجوش','سرجوش','سرجوش','متر','متر','متر'];
  bases numeric[] := array[20000,260,1650,1650,1650,1650,20000,20000,20000];
  weights numeric[] := array[10,5,10,25,10,10,15,8,7];
  metrics text[] := array['pipe_m','','','weld_joint','rt_joint','coat_joint','','',''];
  s0 int[] := array[-60,-55,-50,-48,-44,-42,-60,-30,-20];
  e0 int[] := array[120,130,140,150,155,160,110,150,170];
  daily numeric[] := array[260,3,22,20,14,13,240,170,150];
begin
  if exists (select 1 from ex_activities where project_id = p) then raise notice 'execution demo already present'; return; end if;
  perform set_config('ex.rpc', '1', true);
  insert into ex_project_roles (project_id, user_id, role, organization_id) values (p, u_admin, 'manager', null), (p, u_con, 'contractor', org_c), (p, u_sup, 'supervision', '258183da-8472-4560-a384-5a17ada72e71'), (p, u_cons, 'consultant', '258183da-8472-4560-a384-5a17ada72e71') on conflict do nothing;
  insert into ex_settings (project_id, values_json) values (p, jsonb_build_object('weekStart', 0, 'workDays', jsonb_build_array(0,1,2,3,4,5), 'overBasePct', 0, 'blockOverBase', true, 'reviewDays', 2, 'gapDueDays', 2, 'expectedFronts', jsonb_build_array('جبههٔ شمال','جبههٔ مرکز'), 'projectStart', (current_date - 20)::text, 'enabledForms', '[]'::jsonb)) on conflict (project_id) do nothing;
  insert into ex_price_books (project_id, discipline, year, season, title, version, note) values (p, 'خطوط لوله', 1404, 'فصل ۳', 'فهرست بهای واحد پایهٔ خطوط لولهٔ انتقال گاز ۱۴۰۴', 1, 'ابلاغیه نمایشی — فقط برای آزمایش') returning id into book;
  for i in 1..9 loop
    insert into ex_price_items (book_id, chapter, item_no, description, unit, unit_price, starred) values (book, 'خط لوله', codes[i], titles[i], units[i], (i * 1.5e6)::numeric, false);
  end loop;
  insert into ex_price_items (book_id, chapter, item_no, description, unit, unit_price, starred) values (book, 'خط لوله', '020707*', 'عبور از رودخانه با روش حفاری افقی (ستاره‌دار)', 'متر', 9.5e7, true), (book, 'خط لوله', '010401', 'کانال‌کنی در زمین سنگی', 'متر', 4.2e6, false), (book, 'خط لوله', '020801', 'آزمون هیدرواستاتیک', 'کیلومتر', 2.3e8, false);
  for i in 1..9 loop
    insert into ex_activities (project_id, price_item_id, item_no, title, unit, chapter, kind, base_qty, unit_price, weight, weight_group, metric, planned_start, planned_end, sort)
    values (p, (select id from ex_price_items where book_id = book and item_no = codes[i]), codes[i], titles[i], units[i], 'خط لوله', 'standard', bases[i], (i * 1.5e6)::numeric, weights[i], 'خط لوله', metrics[i], current_date + s0[i], current_date + e0[i], i) returning id into aid;
    acts := acts || aid;
  end loop;
  insert into ex_activities (project_id, item_no, title, unit, chapter, kind, base_qty, unit_price, weight, weight_group, planned_start, planned_end, sort, approval, note)
  values (p, 'خاص-۱', 'عبور از جادهٔ خاکی با کیسینگ فولادی (ردیف خاص — بدون ردیف متناظر)', 'متر', 'خط لوله', 'special', 60, 6e7, 0, 'خط لوله', current_date + 10, current_date + 40, 10, 'pending', 'منتظر تأیید کارفرما');
  insert into ex_baselines (project_id, version, status, reason, effective_date, approved_by, approved_at) values (p, 1, 'approved', 'نسخهٔ اولیهٔ پیمان', current_date - 70, u_admin, now()) returning id into bl;
  insert into ex_baseline_lines (baseline_id, activity_id, item_no, title, unit, base_qty, weight, unit_price, weight_group) select bl, a.id, a.item_no, a.title, a.unit, a.base_qty, a.weight, a.unit_price, a.weight_group from ex_activities a where a.project_id = p and a.kind = 'standard';
  insert into ex_form_activity_map (project_id, form_key, metric_key, group_value, activity_id) values (p, 'welding', 'welds', '', acts[4]), (p, 'rt_report', 'films', '', acts[5]), (p, 'string', 'length', '', acts[1]);

  -- daily work reports: 14 working days on two fronts; the oldest approved, the last ones waiting, one returned, one day missing
  for i in reverse 16..1 loop
    d := current_date - i; wd := (extract(dow from d)::int + 1) % 7;
    if wd = 6 then continue; end if;
    k := k + 1;
    foreach fr in array array['جبههٔ شمال','جبههٔ مرکز'] loop
      if k = 5 and fr = 'جبههٔ مرکز' then continue; end if; -- a missing report
      st := case when i <= 2 then 'submitted' when i = 3 then 'partially_approved' when i = 4 and fr = 'جبههٔ شمال' then 'returned' else 'approved' end;
      insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, station, status, data, created_by, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
      values (p, 'work', d, org_c, fr, '', st, jsonb_build_object('weather', case when k % 7 = 0 then 'rainy' else 'sunny' end, 'usefulHours', 8, 'hse', case when k = 6 then 'برخورد جزئی ماشین‌آلات — بدون مصدوم' else '' end), u_con, u_con, d + time '17:00', case when st = 'submitted' then null else u_sup end, case when st = 'submitted' then null else d + time '20:00' end, case when st = 'returned' then 'مقدار فیت‌آپ با فرم فنی مطابقت ندارد' else '' end) returning id into r;
      for n in 1..9 loop
        if n in (2, 8, 9) and k % 3 <> 0 then continue; end if;
        qty := round(daily[n] * (0.75 + ((k * 7 + n * 3) % 10) / 20.0) * case when fr = 'جبههٔ مرکز' then 0.8 else 1 end);
        insert into ex_report_lines (report_id, line_no, activity_id, qty, status, approved_qty, review_note, reviewed_by, reviewed_at)
        values (r, n, acts[n], qty,
          case when st = 'submitted' then 'pending' when st = 'returned' and n = 3 then 'returned' when st = 'partially_approved' and n >= 6 then 'pending' else 'approved' end,
          case when st in ('approved') or (st = 'partially_approved' and n < 6) or (st = 'returned' and n <> 3) then qty else null end,
          case when st = 'returned' and n = 3 then 'مقدار با فرم فنی مطابقت ندارد' else '' end,
          case when st in ('approved','partially_approved','returned') then u_sup else null end, case when st in ('approved','partially_approved','returned') then d + time '20:00' else null end);
      end loop;
      insert into ex_report_resources (report_id, kind, name, active_qty, idle_qty, hours) values (r, 'man', 'جوشکار', 10, 0, 8), (r, 'man', 'فیتر', 5, 0, 8), (r, 'man', 'کارگر ساده', 24, case when k = 6 then 3 else 0 end, 8), (r, 'equip', 'سایدبوم', 4, 0, 8), (r, 'equip', 'موتور جوش دیزل', 8, 0, 8), (r, 'equip', 'بیل مکانیکی', 2, case when k = 6 then 1 else 0 end, 8);
      if k = 6 and fr = 'جبههٔ شمال' then insert into ex_report_stoppages (report_id, category, hours, description) values (r, 'material', 3.5, 'کمبود الکترود E7018 — توقف جوشکاری'); end if;
      if k = 9 and fr = 'جبههٔ مرکز' then insert into ex_report_stoppages (report_id, category, hours, description) values (r, 'weather', 5, 'بارش و یخ‌بندان'); end if;
      insert into ex_report_history (report_id, at, actor, action, note) values (r, d + time '17:00', u_con, 'submit', '');
      if st <> 'submitted' then insert into ex_report_history (report_id, at, actor, action, note) values (r, d + time '20:00', u_sup, 'review:' || st, case when st = 'returned' then 'مقدار فیت‌آپ با فرم فنی مطابقت ندارد' else '' end); end if;
    end loop;
  end loop;

  -- technical forms
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by, submitted_by, submitted_at, reviewed_by, reviewed_at) values (p, 'string', current_date - 6, org_c, 'جبههٔ شمال', 'approved', '{"weather":"sunny"}', u_con, u_con, now() - interval '6 days', u_sup, now() - interval '6 days') returning id into r;
  for i in 1..8 loop insert into ex_report_lines (report_id, line_no, detail, status, approved_qty) values (r, i, jsonb_build_object('pipeNo', 'P-' || (1000 + i), 'lengthM', 12.1 + i * 0.05, 'thkIn', case when i <= 5 then 0.562 else 0.688 end, 'origin', 'factory'), 'approved', 0); end loop;
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by, submitted_by, submitted_at) values (p, 'welding', current_date - 1, org_c, 'جبههٔ شمال', 'submitted', '{"weather":"sunny","wpsNo":"WPS-01","pipeSpec":"48\" API 5L X70 API 1104"}', u_con, u_con, now() - interval '1 day') returning id into r;
  for i in 1..6 loop insert into ex_report_lines (report_id, line_no, detail) values (r, i, jsonb_build_object('sec', '14', 'weldNo', 'W-' || (400 + i), 'pipeNo', 'P-' || (1100 + i), 'sizeIn', 48, 'thkIn', 0.688, 'stampRoot', 'A1', 'stampHot', 'A1', 'stampFill', 'B4', 'stampCap', 'B4', 'vt', case when i = 4 then 'rej' else 'acc' end)); end loop;
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by) values (p, 'rt_report', current_date, org_c, 'جبههٔ شمال', 'draft', '{"weather":"sunny","source":"gamma","technique":"DWSI"}', u_con) returning id into r;
  for i in 1..4 loop insert into ex_report_lines (report_id, line_no, detail) values (r, i, jsonb_build_object('rtReqNo', 'RT-021', 'sec', '14', 'weldNo', 'W-' || (390 + i), 'odIn', 48, 'thkIn', 0.688, 'result', case when i = 2 then 'rep' else 'acc' end)); end loop;
  raise notice 'execution demo seeded';
end $$;
