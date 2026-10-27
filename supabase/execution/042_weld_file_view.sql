-- «پروندهٔ سرجوش»: one row per weld with the latest fact of every stage, read from the form rows linked to the weld in the
-- central weld table — fit-up, welding (stamps, VT), RT request, RT (result, defect, count), repairs, field-joint coating and
-- its test. Other modules (digital twin, tests, PSSR, reports) read welds from here instead of parsing the forms again.
-- The application builds the same file in src/modules/execution/lib/weldFile.ts (plus the derived quality state).
create or replace view ex_weld_file with (security_invoker = true) as
with rows as (
  select lw.weld_id, r.form_key, r.report_date, r.report_no, r.status, l.detail
  from ex_line_welds lw join ex_report_lines l on l.id = lw.line_id join ex_reports r on r.id = l.report_id
  where r.status <> 'rejected'
),
last_of as (
  select distinct on (weld_id, stage) weld_id, stage, report_date, report_no, status, detail
  from (select *, case form_key when 'fitup' then 'fitup' when 'welding' then 'weld' when 'tie_in' then 'weld' when 'rt_request' then 'rtreq' when 'rt_request_rp' then 'rtreq'
                    when 'rt_report' then 'rt' when 'weld_repair' then 'repair' when 'fj_coating' then 'coat' when 'bond_test' then 'coattest' end as stage from rows) x
  where stage is not null
  order by weld_id, stage, report_date desc
)
select w.id as weld_id, w.project_id, w.section_raw as section, w.weld_raw as weld,
  coalesce(nullif(w.c_pipe, ''), w.pipe_no) as pipe, w.c_size as size_in, w.c_thk as thk_in, w.c_length as length_m, w.c_bend as bend,
  fu.report_date as fitup_date, fu.detail ->> 'result' as fitup_result,
  wd.report_date as weld_date, wd.report_no as weld_report,
  concat_ws(' / ', nullif(wd.detail ->> 'stampRoot', ''), nullif(wd.detail ->> 'stampRootC', '')) as welder_root,
  concat_ws(' / ', nullif(wd.detail ->> 'stampCap', ''), nullif(wd.detail ->> 'stampCapC', '')) as welder_cap,
  wd.detail ->> 'vt' as vt,
  rq.report_date as rt_request_date, coalesce(nullif(rq.detail ->> 'reqNo', ''), rq.detail ->> 'rtReqNo') as rt_request_no,
  rt.report_date as rt_date, rt.report_no as rt_report, rt.detail ->> 'result' as rt_result, rt.detail ->> 'defect' as rt_defect,
  (select count(*) from rows x where x.weld_id = w.id and x.form_key = 'rt_report') as rt_count,
  (select count(*) from rows x where x.weld_id = w.id and x.form_key = 'weld_repair' and x.detail ->> 'repairDone' = 'done') as repairs_done,
  co.report_date as coating_date, co.detail ->> 'result' as coating_result,
  ct.report_date as coat_test_date,
  case when ct.weld_id is null then null
       when 'rej' in (ct.detail ->> 'adhPipeOk', ct.detail ->> 'adhMainOk', ct.detail ->> 'appearance', ct.detail ->> 'holVolt') or ct.detail ->> 'holAction' in ('repair', 'defect') then 'rej'
       else 'ok' end as coat_test_verdict,
  (select count(*) from rows x where x.weld_id = w.id and x.status <> 'approved') as pending_rows,
  (select max(report_date) from rows x where x.weld_id = w.id) as last_date
from ex_welds w
left join last_of fu on fu.weld_id = w.id and fu.stage = 'fitup'
left join last_of wd on wd.weld_id = w.id and wd.stage = 'weld'
left join last_of rq on rq.weld_id = w.id and rq.stage = 'rtreq'
left join last_of rt on rt.weld_id = w.id and rt.stage = 'rt'
left join last_of co on co.weld_id = w.id and co.stage = 'coat'
left join last_of ct on ct.weld_id = w.id and ct.stage = 'coattest'
where w.status <> 'merged';
grant select on ex_weld_file to authenticated;
