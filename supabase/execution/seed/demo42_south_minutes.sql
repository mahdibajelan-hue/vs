-- Pipe numbers P1, P2 … and joint (weld) numbers W1, W2 … — no dash, no zero padding.
-- Demo data for DEMO-42 (پروژهٔ فرضی ۴۲ اینچ سرخس–مشهد), front «جبههٔ جنوب»: the pipe → joint → weld chain over ~25 days.
--   · pipe delivery (pipe_entry): 20 days, 5–10 trucks a day, 10–13 joints a truck (≈ 20 km of 42" pipe) → pipe register
--   · stringing from the stock (≈ 60 joints a day, km from 40+000), bending of a few strung pipes
--   · fit-up between consecutive strung pipes, welding the next day, RT request, RT report, field-joint coating,
--     lowering, sand padding and backfill
--   · part of the stock stays unstrung and part of the strung pipes stays without fit-up, for entering minutes by hand
--   · every report approved except the last day of each form, left «submitted» for the supervision's review
-- Every report carries data.seed = 'demo42-south'; cleanup: demo42_south_cleanup.sql. Random but repeatable (setseed).
create or replace function pg_temp.seed_rep(p_form text, p_date date, p_data jsonb, p_lines jsonb, p_final text) returns uuid language plpgsql as $f$
declare pid uuid := '6b25ebd9-e2f7-4385-90e7-c954a0880232'; me uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444'; org uuid := '34f279f6-85d6-4c26-ae0c-614e82a11d47'; rid uuid;
begin
  insert into ex_reports (project_id, form_key, report_date, contractor_org_id, front, status, data, created_by, created_at)
  values (pid, p_form, p_date, org, 'جبههٔ جنوب', 'draft', coalesce(p_data, '{}'::jsonb) || '{"seed":"demo42-south"}'::jsonb, me, p_date + time '08:30') returning id into rid;
  insert into ex_report_lines (report_id, line_no, detail, status, qty)
  select rid, (o - 1)::int, x, 'pending', 0 from jsonb_array_elements(p_lines) with ordinality t(x, o);
  if p_final in ('submitted', 'approved') then
    update ex_reports set status = 'submitted', submitted_by = me, submitted_at = p_date + time '17:30' where id = rid;
    insert into ex_report_history (report_id, at, actor, action, note) values (rid, p_date + time '17:30', me, 'submit', '');
  end if;
  if p_final = 'approved' then
    update ex_report_lines set status = 'approved', approved_qty = qty, reviewed_by = me, reviewed_at = p_date + interval '1 day 10 hours' where report_id = rid;
    update ex_reports set status = 'approved', reviewed_by = me, reviewed_at = p_date + interval '1 day 10 hours' where id = rid;
    insert into ex_report_history (report_id, at, actor, action, note) values (rid, p_date + interval '1 day 10 hours', me, 'review:approved', 'داده‌های آزمایشی');
  end if;
  if p_form = 'pipe_entry' then perform ex_register_entry_pipes(rid); end if;
  if p_form in ('fitup', 'welding', 'rt_request', 'rt_report', 'fj_coating') then perform ex_weld_sync(rid); end if;
  return rid;
end $f$;

do $S$
declare
  day0 date := '2026-10-27'; d date; k int; t int; jj int; lines jsonb; pno int := 0; n_strung int := 0; joint int := 0; 
  kmv numeric := 40.0; thkv numeric; lnv numeric; truck text; bill text; wb text; reqn int := 0; st text; w text[] := array['1','2','3','4','5','6','7','8','A1','B4','C-11','C-12'];
  last_entry date := day0 + 19; last_string date := day0 + 21; last_fit date := day0 + 21; last_weld date := day0 + 22; last_req date := day0 + 23; last_rt date := day0 + 25; last_fj date := day0 + 26;
  r record; from_j int; to_j int; lw date;
begin
  perform setseed(0.4242);
  perform set_config('ex.rpc', '1', true);
  create temp table sp (no int primary key, pipe text, len numeric, thk numeric, entry date, strung date, km numeric) on commit drop;
  create temp table sj (no int primary key, before_no int, after_no int, sec text, fit date, weld date, req date, rt date, rt_ok boolean, fj date) on commit drop;

  -- 1) pipe delivery: 20 days × 5–10 trucks × 10–13 joints
  for k in 0..19 loop
    d := day0 + k; lines := '[]'::jsonb;
    for t in 1..(5 + floor(random() * 6))::int loop
      truck := (array['۱۲','۲۴','۳۷','۴۵','۵۱','۶۸','۷۲','۸۳','۹۴'])[1 + floor(random() * 9)::int] || ' ع ' || (100 + floor(random() * 899))::int || ' ایران ' || (array['۱۲','۳۶','۵۲','۷۴'])[1 + floor(random() * 4)::int];
      bill := (48000 + k * 20 + t)::text; wb := 'WB-' || (91000 + k * 20 + t)::text;
      for jj in 1..(10 + floor(random() * 4))::int loop
        pno := pno + 1;
        thkv := case when random() < 0.6 then 0.562 when random() < 0.75 then 0.688 else 0.750 end;
        lnv := round((11.6 + random() * 0.8)::numeric, 2);
        insert into sp (no, pipe, len, thk, entry) values (pno, 'P' || pno, lnv, thkv, d);
        lines := lines || jsonb_build_object('wayBill', wb, 'pipeNo', 'P' || pno, 'lengthM', lnv, 'thkIn', thkv, 'sizeIn', 42, 'billNo', bill, 'truckNo', truck,
          'loadDate', to_char(d - 2, 'YYYY-MM-DD'), 'unloadDate', to_char(d, 'YYYY-MM-DD'), 'status', case when random() < 0.04 then 'آسیب جزئی پوشش — تعمیر در دپو' else 'سالم' end);
      end loop;
    end loop;
    perform pg_temp.seed_rep('pipe_entry', d, '{"loadType":"truck","origin":"کارخانهٔ لوله‌سازی اهواز","thkSet":"0.562, 0.688, 0.750"}'::jsonb
      || jsonb_build_object('depot', case when k < 7 then 'دپوی کیلومتر ۴۰' when k < 14 then 'دپوی کیلومتر ۴۶' else 'انبار مرکزی سرخس' end), lines, case when d = last_entry then 'submitted' else 'approved' end);
  end loop;

  -- 2) stringing from the stock (pipes entered at least a day before), km running from 40+000; a few bends the next day
  for k in 4..21 loop
    d := day0 + k; lines := '[]'::jsonb;
    for r in select * from sp where strung is null and entry < d order by no limit (50 + floor(random() * 21))::int loop
      update sp set strung = d, km = round(kmv, 3) where no = r.no;
      lines := lines || jsonb_build_object('pipeNo', r.pipe, 'lengthM', r.len, 'thkIn', r.thk, 'origin', 'depot', 'km', round(kmv, 3));
      kmv := kmv + r.len / 1000; n_strung := n_strung + 1;
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('string', d, '{"thkSet":"0.562, 0.688, 0.750"}', lines, case when d = last_string then 'submitted' else 'approved' end); end if;
    if k between 5 and 20 then
      lines := '[]'::jsonb;
      for r in select * from sp where strung = d - 1 order by random() limit (3 + floor(random() * 4))::int loop
        lines := lines || jsonb_build_object('km', r.km, 'pipeNo', r.pipe, 'diaIn', 42, 'lengthM', r.len, 'wtMm', round(r.thk * 25.4, 2),
          'dirLR', (array['IPR 4°','IPL 6°','IPR 8°','IPL 3°'])[1 + floor(random() * 4)::int], 'dirSO', (array['SB 5°','OB 3°','SB 7°','OB 6°'])[1 + floor(random() * 4)::int],
          'ovalPct', round((0.6 + random() * 1.4)::numeric, 2), 'ovalMm', round((6 + random() * 12)::numeric, 1), 'result', 'acc');
      end loop;
      if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('bend', d, '{"machine":"CRC 42\""}', lines, case when k = 20 then 'submitted' else 'approved' end); end if;
    end if;
  end loop;

  -- 3) fit-up: joint n between strung pipes n (before) and n+1 (after), 30–45 a day
  for k in 7..21 loop
    d := day0 + k; lines := '[]'::jsonb;
    for t in 1..(30 + floor(random() * 16))::int loop
      exit when not exists (select 1 from sp where no = joint + 2 and strung < d);
      joint := joint + 1;
      select * into r from sp where no = joint + 1;
      -- the joint's section: the 1000 m chainage grid from km 38 (project setting sectionPlan), by where the pipe after it lies
      insert into sj (no, before_no, after_no, sec, fit) values (joint, joint, joint + 1, (floor((r.km - 38) * 1000 / 1000) + 1)::int::text, d);
      lines := lines || jsonb_build_object('sec', (select sec from sj where no = joint), 'jointNo', 'W' || joint, 'pipeNo2', (select pipe from sp where no = joint), 'pipeNo', r.pipe,
        'lengthM', r.len, 'thkIn', r.thk, 'sizeIn', 42, 'bendDeg', '0', 'result', 'acc');
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('fitup', d, '{"wpsNo":"WPS-42-01","pipeSpec":"API 5L X70 — 42\""}', lines, case when d = last_fit then 'submitted' else 'approved' end); end if;
  end loop;

  -- 4) welding the day after the fit-up; 5) RT request the next day; 6) RT report two days later (≈5 % repair); 7) field-joint coating
  for k in 8..22 loop
    d := day0 + k; lines := '[]'::jsonb;
    for r in select j.*, p.pipe, p.len, p.thk from sj j join sp p on p.no = j.after_no where j.fit = d - 1 order by j.no loop
      update sj set weld = d where no = r.no;
      lines := lines || jsonb_build_object('sec', r.sec, 'weldNo', 'W' || r.no, 'pipeNo', r.pipe, 'lengthM', r.len, 'thkIn', r.thk, 'sizeIn', 42, 'bendDeg', 0,
        'stampRoot', w[1 + floor(random() * 12)::int], 'stampHot', w[1 + floor(random() * 12)::int], 'stampFill', w[1 + floor(random() * 12)::int], 'stampCap', w[1 + floor(random() * 12)::int], 'vt', 'acc');
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('welding', d, '{"wpsNo":"WPS-42-01","pipeSpec":"API 5L X70 — 42\""}', lines, case when d = last_weld then 'submitted' else 'approved' end); end if;
  end loop;
  for k in 9..23 loop
    d := day0 + k; lines := '[]'::jsonb; reqn := reqn + 1;
    for r in select j.*, p.thk from sj j join sp p on p.no = j.after_no where j.weld = d - 1 order by j.no loop
      update sj set req = d where no = r.no;
      lines := lines || jsonb_build_object('sec', r.sec, 'weldNo', 'W' || r.no, 'thkIn', r.thk, 'odIn', 42);
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('rt_request', d, jsonb_build_object('pipeSpec', 'API 5L X70 — 42"', 'reqNo', 'RT-S-' || lpad(reqn::text, 3, '0')), lines, case when d = last_req then 'submitted' else 'approved' end); end if;
  end loop;
  for k in 11..25 loop
    d := day0 + k; lines := '[]'::jsonb;
    for r in select j.*, p.thk from sj j join sp p on p.no = j.after_no where j.req = d - 2 order by j.no loop
      update sj set rt = d, rt_ok = random() > 0.05 where no = r.no;
      select rt_ok into st from sj where no = r.no;
      lines := lines || (jsonb_build_object('rtReqNo', 'RT-S-' || lpad((k - 10)::text, 3, '0'), 'sec', r.sec, 'weldNo', 'W' || r.no, 'odIn', 42, 'thkIn', r.thk,
        'result', case when st::boolean then 'acc' else 'rep' end) || case when st::boolean then '{}'::jsonb else jsonb_build_object('repairKind', 'RS', 'defect', (array['P','SI','IP','LF'])[1 + floor(random() * 4)::int]) end);
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('rt_report', d, '{"rtContractor":"آزمون صنعت پارس","code":"API 1104","source":"Ir-192","technique":"DWSI","film":"AGFA D7"}', lines, case when d = last_rt then 'submitted' else 'approved' end); end if;
  end loop;
  for k in 12..26 loop
    d := day0 + k; lines := '[]'::jsonb;
    for r in select * from sj where rt = d - 1 and rt_ok order by no loop
      update sj set fj = d where no = r.no;
      lines := lines || jsonb_build_object('sec', r.sec, 'weldNo', 'W' || r.no, 'thk12', round((1.6 + random() * 0.6)::numeric, 2), 'thk3', round((1.6 + random() * 0.6)::numeric, 2),
        'thk6', round((1.6 + random() * 0.6)::numeric, 2), 'thk9', round((1.6 + random() * 0.6)::numeric, 2), 'result', 'acc');
    end loop;
    if jsonb_array_length(lines) > 0 then perform pg_temp.seed_rep('fj_coating', d, '{"sleeveType":"Heat shrink sleeve","maker":"Canusa","ambientC":"12","humidity":"45"}', lines, case when d = last_fj then 'submitted' else 'approved' end); end if;
  end loop;

  -- 8) lowering every third day over the coated span, sand padding and backfill the day after
  for k in 15..24 by 3 loop
    d := day0 + k;
    select min(j.no), max(j.no) into from_j, to_j from sj j where j.fj is not null and j.fj < d and j.no > coalesce((select max(no) from sj where fj is not null and fj < d - 3), 0);
    continue when from_j is null;
    perform pg_temp.seed_rep('lowering', d, '{"standard":"IPS-C-PI-270","weather":"صاف"}', jsonb_build_array(jsonb_build_object('kind', 'main', 'lineSec', (select sec from sj where no = from_j),
      'weldFrom', 'W' || from_j, 'weldTo', 'W' || to_j, 'kmFrom', (select km from sp where no = from_j), 'kmTo', (select km from sp where no = to_j + 1),
      'loweredM', round((select sum(len) from sp where no between from_j + 1 and to_j + 1), 2), 'loweredNo', to_j - from_j + 1, 'holiday', 'acc')), case when k = 24 then 'submitted' else 'approved' end);
    perform pg_temp.seed_rep('sand', d + 1, '{}', jsonb_build_array(jsonb_build_object('sec', (select sec from sj where no = from_j), 'jointFrom', 'W' || from_j, 'jointTo', 'W' || to_j,
      'kmFrom', (select km from sp where no = from_j), 'kmTo', (select km from sp where no = to_j + 1), 'lengthM', round((select sum(len) from sp where no between from_j + 1 and to_j + 1), 2), 'result', 'acc')), 'approved');
    perform pg_temp.seed_rep('backfill', d + 2, '{}', jsonb_build_array(jsonb_build_object('kind', 'backfill', 'sec', (select sec from sj where no = from_j), 'jointFrom', 'W' || from_j, 'jointTo', 'W' || to_j,
      'kmFrom', (select km from sp where no = from_j), 'kmTo', (select km from sp where no = to_j + 1), 'lengthM', round((select sum(len) from sp where no between from_j + 1 and to_j + 1), 2), 'result', 'acc')), 'approved');
  end loop;

  raise notice 'pipes % (% km) · strung % · joints % · welded % · in stock %', pno, round((select sum(len) from sp) / 1000, 2), n_strung, joint, (select count(*) from sj where weld is not null), (select count(*) from sp where strung is null);
end $S$;
