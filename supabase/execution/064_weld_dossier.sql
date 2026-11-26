-- 064 — one record per weld number: the joint, its two pipes and every stage, read from what the site minutes already hold.
-- The chain: pipe entry (ex_pipes, 057) → stringing (string rows, pipeNo + km) → bending (bend rows) → fit-up joins two
-- strung pipes into a joint (pipeNo2 = pipe before, pipeNo = pipe after) and gives the weld number → welding, RT, repair,
-- coating name the weld number (each row is linked to its weld in ex_line_welds by ex_weld_sync).
-- Nothing is copied: a view over the rows, read with the reader's own access (security_invoker), so the record always
-- matches the minutes. Rejected reports are left out.
-- Rollback: rollback/064_rollback.sql (run by hand).

-- every pipe of a project with its stringing and bending (latest non-rejected row of each)
create or replace view ex_pipe_trace with (security_invoker = true) as
select p.project_id, p.id as pipe_id, p.pipe_key, p.pipe_raw, p.entry_date, p.heat_no, p.od_in, p.wt_in, p.length_m, p.status, p.way_bill,
       e.report_no as entry_report_no, el.status as entry_line_status,
       s.report_id as string_report_id, s.report_no as string_report_no, s.report_date as string_date, s.km as string_km, s.origin as string_origin, s.line_status as string_line_status,
       b.report_no as bend_report_no, b.report_date as bend_date, b.km as bend_km
from ex_pipes p
left join ex_report_lines el on el.id = p.entry_line_id
left join ex_reports e on e.id = el.report_id
left join lateral (
  select r.id as report_id, r.report_no, r.report_date, l.detail->>'km' as km, l.detail->>'origin' as origin, l.status as line_status
  from ex_report_lines l join ex_reports r on r.id = l.report_id
  where r.project_id = p.project_id and r.form_key = 'string' and r.status <> 'rejected' and l.status <> 'rejected' and ex_weld_n1(coalesce(l.detail->>'pipeNo', '')) = p.pipe_key
  order by r.report_date desc, r.created_at desc limit 1) s on true
left join lateral (
  select r.report_no, r.report_date, l.detail->>'km' as km
  from ex_report_lines l join ex_reports r on r.id = l.report_id
  where r.project_id = p.project_id and r.form_key = 'bend' and r.status <> 'rejected' and l.status <> 'rejected' and ex_weld_n1(coalesce(l.detail->>'pipeNo', '')) = p.pipe_key
  order by r.report_date desc, r.created_at desc limit 1) b on true;

-- every weld with its two pipes (from the fit-up row) and all its stages
create or replace view ex_weld_dossier with (security_invoker = true) as
select w.project_id, w.id as weld_id, w.section_raw, w.weld_raw, w.status,
       coalesce(f.pipe_after, w.c_pipe) as pipe_after, f.pipe_before,
       f.report_no as fitup_report_no, f.report_date as fitup_date,
       (select to_jsonb(t) from ex_pipe_trace t where t.project_id = w.project_id and t.pipe_key = ex_weld_n1(coalesce(f.pipe_before, ''))) as pipe_before_trace,
       (select to_jsonb(t) from ex_pipe_trace t where t.project_id = w.project_id and t.pipe_key = ex_weld_n1(coalesce(f.pipe_after, w.c_pipe, ''))) as pipe_after_trace,
       coalesce((select jsonb_agg(jsonb_build_object('form', r.form_key, 'reportId', r.id, 'reportNo', r.report_no, 'date', r.report_date, 'reportStatus', r.status, 'lineStatus', l.status, 'detail', l.detail) order by r.report_date, r.created_at)
                 from ex_line_welds lw join ex_report_lines l on l.id = lw.line_id join ex_reports r on r.id = l.report_id
                 where lw.weld_id = w.id and r.status <> 'rejected'), '[]'::jsonb) as stages
from ex_welds w
left join lateral (
  select nullif(btrim(l.detail->>'pipeNo'), '') as pipe_after, nullif(btrim(l.detail->>'pipeNo2'), '') as pipe_before, r.report_no, r.report_date
  from ex_line_welds lw join ex_report_lines l on l.id = lw.line_id join ex_reports r on r.id = l.report_id
  where lw.weld_id = w.id and r.form_key in ('fitup', 'tie_in') and r.status <> 'rejected' and l.status <> 'rejected'
  order by r.report_date desc, r.created_at desc limit 1) f on true
where w.status <> 'merged';

grant select on ex_pipe_trace, ex_weld_dossier to authenticated;
