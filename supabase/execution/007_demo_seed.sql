-- Demo state for the execution module after the five contract price books were imported into the demo project
-- (imported through the «ورود فهرست‌بها و مقادیر پیمان» wizard — books and activities are not in this file).
-- Creates roles, settings (group weights by contract value), baseline v1, form→activity map and demo reports
-- on real pipeline rows. Idempotent: skipped when the project already has a baseline or has no pipeline book.
do $$
declare
  p uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  org_c uuid := '758db988-6b9d-426d-b9ac-56f18ac79d60';
  u_admin uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444'; u_con uuid := '7c9de13b-d7f4-47c1-b8e2-19b429d109a4'; u_sup uuid := 'e2a61809-54f2-487d-8edc-346875d285db'; u_cons uuid := '6f754038-59dc-4d0a-a635-124c6c36e63c';
  bl uuid; r uuid; d date; k int := 0; fr text; st text; wd int; i int; n int; qty numeric; gw jsonb;
  codes text[] := array['510101026','510101027','510226007','510301026','510411026','511301001','511309002'];
  daily numeric[] := array[900,900,22,20,800,3200,2800];
  ids uuid[] := '{}'; aid uuid;
begin
  if exists (select 1 from ex_baselines where project_id = p) then raise notice 'execution demo already present'; return; end if;
  if not exists (select 1 from ex_activities where project_id = p and item_no = '510226007') then raise notice 'pipeline book not imported'; return; end if;
  perform set_config('ex.rpc', '1', true);
  insert into ex_project_roles (project_id, user_id, role, organization_id) values (p, u_admin, 'manager', null), (p, u_con, 'contractor', org_c), (p, u_sup, 'supervision', '258183da-8472-4560-a384-5a17ada72e71'), (p, u_cons, 'consultant', '258183da-8472-4560-a384-5a17ada72e71') on conflict do nothing;

  select jsonb_object_agg(weight_group, round(v * 100 / (select sum(base_qty * unit_price) from ex_activities where project_id = p), 2)) into gw
  from (select weight_group, sum(base_qty * unit_price) v from ex_activities where project_id = p group by 1) t;
  insert into ex_settings (project_id, values_json) values (p, jsonb_build_object('weekStart', 0, 'workDays', jsonb_build_array(0,1,2,3,4,5), 'overBasePct', 0, 'blockOverBase', true, 'reviewDays', 2, 'gapDueDays', 2, 'expectedFronts', jsonb_build_array('جبههٔ شمال','جبههٔ مرکز'), 'projectStart', (current_date - 20)::text, 'enabledForms', '[]'::jsonb, 'groupWeights', gw))
  on conflict (project_id) do update set values_json = ex_settings.values_json || excluded.values_json;

  -- planned dates by chapter, so planned progress and the S-curve have data
  update ex_activities set planned_start = current_date - 60 + coalesce(nullif(chapter_no, '')::int, 1) * 5, planned_end = current_date + 90 + coalesce(nullif(chapter_no, '')::int, 1) * 4 where project_id = p;
  update ex_activities set metric = 'weld_joint' where project_id = p and item_no = '510226007';
  update ex_activities set metric = 'rt_joint' where project_id = p and item_no = '510301026';
  update ex_activities set metric = 'pipe_m' where project_id = p and item_no = '510101026';

  -- starred rows are part of the contract estimate (added in the «جمع آیتم‌های ستاره‌دار» formula), so they are baselined too
  update ex_activities set approval = 'approved' where project_id = p and kind = 'starred';
  insert into ex_baselines (project_id, version, status, reason, effective_date, approved_by, approved_at) values (p, 1, 'approved', 'نسخهٔ اولیهٔ پیمان', current_date - 70, u_admin, now()) returning id into bl;
  insert into ex_baseline_lines (baseline_id, activity_id, item_no, title, unit, base_qty, weight, unit_price, weight_group)
  select bl, a.id, a.item_no, a.title, a.unit, a.base_qty, a.weight, a.unit_price, a.weight_group from ex_activities a where a.project_id = p and a.kind in ('standard','starred') and a.approval = 'approved';

  for i in 1..array_length(codes, 1) loop
    select id into aid from ex_activities where project_id = p and item_no = codes[i] order by sort limit 1;
    ids := ids || aid;
  end loop;
  insert into ex_form_activity_map (project_id, form_key, metric_key, group_value, activity_id) values (p, 'welding', 'welds', '', ids[3]), (p, 'rt_report', 'films', '', ids[4]), (p, 'string', 'length', '', ids[1]);

  for i in reverse 16..1 loop
    d := current_date - i; wd := (extract(dow from d)::int + 1) % 7;
    if wd = 6 then continue; end if;
    k := k + 1;
    foreach fr in array array['جبههٔ شمال','جبههٔ مرکز'] loop
      if k = 5 and fr = 'جبههٔ مرکز' then continue; end if;
      st := case when i <= 2 then 'submitted' when i = 3 then 'partially_approved' when i = 4 and fr = 'جبههٔ شمال' then 'returned' else 'approved' end;
      insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, station, status, data, created_by, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
      values (p, 'work', d, org_c, fr, '', st, jsonb_build_object('weather', case when k % 7 = 0 then 'rainy' else 'sunny' end, 'usefulHours', 8, 'hse', case when k = 6 then 'برخورد جزئی ماشین‌آلات — بدون مصدوم' else '' end), u_con, u_con, d + time '17:00', case when st = 'submitted' then null else u_sup end, case when st = 'submitted' then null else d + time '20:00' end, case when st = 'returned' then 'مقدار فیت‌آپ با فرم فنی مطابقت ندارد' else '' end) returning id into r;
      for n in 1..array_length(codes, 1) loop
        if n in (6, 7) and k % 3 <> 0 then continue; end if;
        qty := round(daily[n] * (0.75 + ((k * 7 + n * 3) % 10) / 20.0) * case when fr = 'جبههٔ مرکز' then 0.8 else 1 end);
        insert into ex_report_lines (report_id, line_no, activity_id, qty, status, approved_qty, review_note, reviewed_by, reviewed_at)
        values (r, n, ids[n], qty,
          case when st = 'submitted' then 'pending' when st = 'returned' and n = 3 then 'returned' when st = 'partially_approved' and n >= 5 then 'pending' else 'approved' end,
          case when st = 'approved' or (st = 'partially_approved' and n < 5) or (st = 'returned' and n <> 3) then qty else null end,
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

  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by, submitted_by, submitted_at, reviewed_by, reviewed_at) values (p, 'string', current_date - 6, org_c, 'جبههٔ شمال', 'approved', '{"weather":"sunny"}', u_con, u_con, now() - interval '6 days', u_sup, now() - interval '6 days') returning id into r;
  for i in 1..8 loop insert into ex_report_lines (report_id, line_no, detail, status, approved_qty) values (r, i, jsonb_build_object('pipeNo', 'P-' || (1000 + i), 'lengthM', 12.1 + i * 0.05, 'thkIn', case when i <= 5 then 0.562 else 0.688 end, 'origin', 'factory'), 'approved', 0); end loop;
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by, submitted_by, submitted_at) values (p, 'welding', current_date - 1, org_c, 'جبههٔ شمال', 'submitted', '{"weather":"sunny","wpsNo":"WPS-01","pipeSpec":"56\" API 5L X70 API 1104"}', u_con, u_con, now() - interval '1 day') returning id into r;
  for i in 1..6 loop insert into ex_report_lines (report_id, line_no, detail) values (r, i, jsonb_build_object('sec', '14', 'weldNo', 'W-' || (400 + i), 'pipeNo', 'P-' || (1100 + i), 'sizeIn', 56, 'thkIn', 0.625, 'stampRoot', 'A1', 'stampHot', 'A1', 'stampFill', 'B4', 'stampCap', 'B4', 'vt', case when i = 4 then 'rej' else 'acc' end)); end loop;
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by) values (p, 'rt_report', current_date, org_c, 'جبههٔ شمال', 'draft', '{"weather":"sunny","source":"gamma","technique":"DWSI"}', u_con) returning id into r;
  for i in 1..4 loop insert into ex_report_lines (report_id, line_no, detail) values (r, i, jsonb_build_object('rtReqNo', 'RT-021', 'sec', '14', 'weldNo', 'W-' || (390 + i), 'odIn', 56, 'thkIn', 0.625, 'result', case when i = 2 then 'rep' else 'acc' end)); end loop;
  raise notice 'execution demo seeded';
end $$;
