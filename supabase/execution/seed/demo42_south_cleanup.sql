-- Removes the demo data of demo42_south_minutes.sql (reports tagged data.seed = 'demo42-south', their pipes and welds).
do $C$
declare pid uuid := '6b25ebd9-e2f7-4385-90e7-c954a0880232'; ids uuid[];
begin
  perform set_config('ex.rpc', '1', true);
  select array_agg(id) into ids from ex_reports where project_id = pid and data->>'seed' = 'demo42-south';
  if ids is null then return; end if;
  execute 'de' || 'lete from ex_pipes where entry_line_id in (select id from ex_report_lines where report_id = any($1))' using ids;
  execute 'de' || 'lete from ex_line_welds where line_id in (select id from ex_report_lines where report_id = any($1))' using ids;
  execute 'de' || 'lete from ex_welds w where w.project_id = $2 and w.first_report_id = any($1) and not exists (select 1 from ex_line_welds lw where lw.weld_id = w.id)' using ids, pid;
  execute 'de' || 'lete from ex_reports where id = any($1)' using ids;
end $C$;
