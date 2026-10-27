-- Demo data for MAT-DEMO-48 so the planner / productivity pages have something real to read: one crew log per approved
-- line of the three main activities (output = the approved quantity), and the three-week look-ahead closed with what the
-- approved daily reports actually delivered. Re-runnable: rows are only added where missing.
do $$
declare pid uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
begin
  -- seeded on approved reports: the same bypass the review functions use for their own writes
  perform set_config('ex.rpc', '1', true);
  -- crew logs: stringing, welding, trench excavation
  insert into ex_crew_logs (report_id, activity_id, crew_name, composition, useful_hours, idle_hours, output_qty, conditions, note)
  select l.report_id, l.activity_id,
         case a.item_no when '510101026' then 'اکیپ ریسه ' when '510226007' then 'اکیپ جوش ' else 'اکیپ حفاری ' end || (1 + abs(hashtext(l.id::text)) % 2)::text,
         case a.item_no when '510101026' then '{"sideboom":2,"truck":2,"operator":4,"helper":6}'::jsonb
                        when '510226007' then '{"sideboom":3,"weld_machine":6,"welder":10,"fitter":2,"grinder":4,"helper":6}'::jsonb
                        else '{"excavator":3,"loader":1,"truck":3,"operator":7,"worker":4}'::jsonb end,
         8 + (abs(hashtext(l.id::text)) % 3), (abs(hashtext(l.id::text || 'i')) % 3) * 0.5,
         coalesce(l.approved_qty, l.qty),
         jsonb_build_object('limit', case a.item_no when '510226007' then 'inspection' when '510101026' then 'material' else '' end),
         'دادهٔ نمایشی از ردیف تأییدشده'
  from ex_report_lines l join ex_reports r on r.id = l.report_id join ex_activities a on a.id = l.activity_id
  where r.project_id = pid and r.form_key = 'work' and l.status = 'approved' and a.item_no in ('510101026', '510226007', '511301001')
    and not exists (select 1 from ex_crew_logs c where c.report_id = l.report_id and c.activity_id = l.activity_id);

  -- look-ahead: what each commitment really achieved = approved quantity of that activity in that week
  update ex_lookahead k set achieved_qty = coalesce((
      select sum(coalesce(l.approved_qty, l.qty)) from ex_report_lines l join ex_reports r on r.id = l.report_id
      where r.project_id = pid and r.form_key = 'work' and l.status = 'approved' and l.activity_id = k.activity_id
        and r.report_date between k.week_start and k.week_start + 6), 0),
    deviation_cause = case when k.deviation_cause <> '' then k.deviation_cause else '' end
  where k.project_id = pid and k.week_start in ('2026-10-10', '2026-10-17');
  update ex_lookahead set committed = true where project_id = pid and week_start = '2026-10-17';
  update ex_lookahead set deviation_cause = 'گزارش‌های روزانهٔ نیمهٔ دوم هفته ارسال و تأیید نشده‌اند', recovery_plan = 'ارسال گزارش‌های معوق تا پایان هفتهٔ جاری؛ پیگیری در «کامل‌بودن و کسری»'
    where project_id = pid and week_start in ('2026-10-10', '2026-10-17') and coalesce(achieved_qty, 0) < planned_qty and deviation_cause = '';
  -- this week: stringing committed on the north front
  insert into ex_lookahead (project_id, week_start, activity_id, front, responsible, planned_qty, resources, committed, note)
  select pid, '2026-10-24', a.id, 'جبههٔ شمال', 'سرپرست خط لوله', 3000, '{"sideboom":2,"truck":2}'::jsonb, true, 'دادهٔ نمایشی'
  from ex_activities a where a.project_id = pid and a.item_no = '510101026'
    and not exists (select 1 from ex_lookahead k where k.project_id = pid and k.week_start = '2026-10-24' and k.activity_id = a.id);
end $$;
