-- TEST scenario (S6) — part 2: six days of forms for the TEST project only (idempotent: skipped when TEST reports already exist).
do $$
declare p uuid := '7e570000-0000-4000-8000-000000000001'; admin uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  d0 date := date '2026-10-05'; fr text := 'TEST-جبههٔ A';
  day int; st text; rid uuid; g int; g0 int; cnt int; n int; k int; rep_cnt int;
  per int[] := array[40,20,20,20,20,20]; reps int[] := array[0,1,1,2,3,3];
  rt_rep uuid; i int; wn text; sc text; pn text; bad boolean;
begin
  if exists (select 1 from ex_reports where project_id = p) then raise notice 'TEST reports already present'; return; end if;
  perform set_config('ex.rpc', '1', true);
  g0 := 0;
  for day in 1..6 loop
    st := case when day <= 4 then 'approved' when day = 5 then 'submitted' else 'draft' end;
    n := per[day];
    -- work report (daily progress of the day)
    rid := md5('TEST-r-work-' || day)::uuid;
    insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by) values (rid, p, 'work', d0 + day - 1, fr, st, jsonb_build_object('weather','sunny'), 'TEST', admin);
    insert into ex_report_lines (report_id, line_no, activity_id, qty, location, detail, status, approved_qty)
    select rid, a, md5('TEST-act-' || a)::uuid, case a when 1 then 600 when 2 then 2 when 3 then n when 4 then n when 5 then case when day = 1 then 0 else per[day - 1] end when 6 then case when day >= 3 then 10 else 0 end when 7 then 0 else 0 end, 'TEST km ' || (day * 3), '{}'::jsonb, case when st = 'approved' then 'approved' else 'pending' end, case when st = 'approved' then 0 else null end
    from generate_series(1, 6) a;
    -- fit-up and welding of the day's welds
    for rid in select md5('TEST-r-fitup-' || day)::uuid union all select md5('TEST-r-welding-' || day)::uuid loop
      insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by)
      values (rid, p, case when rid = md5('TEST-r-fitup-' || day)::uuid then 'fitup' else 'welding' end, d0 + day - 1, fr, st, jsonb_build_object('weather','sunny','pipeSpec','Pipe 48" API 5L X70 API 1104','wpsNo','TEST-WPS-1','thkSet','0.5,0.6,0.7,0.8'), 'TEST', admin);
      insert into ex_report_lines (report_id, line_no, qty, location, detail, status)
      select rid, s, 0, '', case when rid = md5('TEST-r-fitup-' || day)::uuid
        then jsonb_build_object('sec', ((g0 + s - 1) / 50 + 1)::text, 'jointNo', 'J' || (g0 + s), 'pipeNo', 'P-' || (1000 + g0 + s), 'lengthM', '11.8', 'thkIn', '0.5', 'sizeIn', '48', 'result', 'acc')
        else jsonb_build_object('sec', ((g0 + s - 1) / 50 + 1)::text, 'weldNo', 'W-' || lpad((g0 + s)::text, 3, '0'), 'pipeNo', 'P-' || (1000 + g0 + s), 'lengthM', '11.8', 'thkIn', '0.5', 'sizeIn', '48', 'vt', 'acc') end,
        case when st = 'approved' then 'approved' else 'pending' end
      from generate_series(1, n) s;
    end loop;
    -- radiography of the PREVIOUS day's welds (request + report) and repairs
    if day >= 2 then
      cnt := per[day - 1]; rep_cnt := reps[day];
      g := g0 - cnt; -- first weld of the previous batch is g+1
      rid := md5('TEST-r-rtreq-' || day)::uuid;
      insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by) values (rid, p, 'rt_request', d0 + day - 1, fr, st, jsonb_build_object('reqNo','TEST-RQ-' || day,'pipeSpec','Pipe 48"'), 'TEST', admin);
      insert into ex_report_lines (report_id, line_no, qty, location, detail, status)
      select rid, s, 0, '', jsonb_build_object('sec', ((g + s - 1) / 50 + 1)::text, 'weldNo', 'W-' || lpad((g + s)::text, 3, '0'), 'thkIn', '0.5', 'odIn', '48'), case when st = 'approved' then 'approved' else 'pending' end from generate_series(1, cnt) s;
      rt_rep := md5('TEST-r-rt-' || day)::uuid;
      insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by) values (rt_rep, p, 'rt_report', d0 + day - 1, fr, st, jsonb_build_object('rtContractor','TEST-RT','code','API 1104'), 'TEST', admin);
      insert into ex_report_lines (report_id, line_no, qty, location, detail, status)
      select rt_rep, s, 0, '', jsonb_build_object('rtReqNo','TEST-RQ-' || day, 'sec', ((g + s - 1) / 50 + 1)::text, 'weldNo', 'W-' || lpad((g + s)::text, 3, '0'), 'odIn', '48', 'thkIn', '0.5',
        'result', case when s between 17 and 16 + rep_cnt then 'rep' else 'acc' end, 'repairKind', case when s between 17 and 16 + rep_cnt then 'RS' else '' end, 'defect', case when s between 17 and 16 + rep_cnt then 'PO' else '' end),
        case when st = 'approved' then 'approved' else 'pending' end from generate_series(1, cnt) s;
      if rep_cnt > 0 then
        rid := md5('TEST-r-repair-' || day)::uuid;
        insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by) values (rid, p, 'weld_repair', d0 + day - 1, fr, st, '{}'::jsonb, 'TEST', admin);
        insert into ex_report_lines (report_id, line_no, qty, location, detail, status)
        select rid, s - 16, 0, '', jsonb_build_object('sec', ((g + s - 1) / 50 + 1)::text, 'weldNo', 'W-' || lpad((g + s)::text, 3, '0'), 'defectType', 'RP', 'defectLoc', 'Cm 10-15', 'repairDone', case when day <= 4 then 'done' else 'notdone' end, 'rtReqNo', 'TEST-RQ-' || day), case when st = 'approved' then 'approved' else 'pending' end
        from generate_series(17, 16 + rep_cnt) s;
        if day = 2 then -- the single defect of the scenario becomes a finding (the system's only quality record today)
          insert into ex_qc_findings (project_id, tech_report_id, kind, severity, status, weld_ref, note, created_by) values (p, rt_rep, 'defect', 'medium', 'open', 'W-017', 'TEST رادیوگرافی: نیاز به تعمیر (عیب منفرد)', admin);
        end if;
      end if;
    end if;
    -- field-joint coating tests: the same defect on four consecutive welds on days 4 and 5
    if day >= 3 then
      rid := md5('TEST-r-bond-' || day)::uuid;
      insert into ex_reports (id, project_id, form_key, report_date, front, status, data, notes, created_by) values (rid, p, 'bond_test', d0 + day - 1, fr, st, jsonb_build_object('formNo','TEST-BT-' || day), 'TEST', admin);
      insert into ex_report_lines (report_id, line_no, qty, location, detail, status)
      select rid, s, 0, '', jsonb_build_object('sec', '2', 'weldNo', 'W-' || lpad((50 + s + (day - 3) * 10)::text, 3, '0'),
        'adhPipeOk', case when (day = 4 and (50 + s + 10) in (69, 70)) or (day = 5 and (50 + s + 20) in (71, 72)) then 'rej' else 'acc' end,
        'defects', case when (day = 4 and (50 + s + 10) in (69, 70)) or (day = 5 and (50 + s + 20) in (71, 72)) then 'حفرهٔ پوشش' else '' end,
        'appearance', case when (day = 4 and (50 + s + 10) in (69, 70)) or (day = 5 and (50 + s + 20) in (71, 72)) then 'rej' else 'acc' end),
        case when st = 'approved' then 'approved' else 'pending' end from generate_series(1, 10) s;
    end if;
    g0 := g0 + n;
  end loop;
end $$;
