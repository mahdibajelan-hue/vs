-- Delay & claim work for the signed-in person (execution module): stoppages waiting for an assessment (people with the assess_delay permission)
-- and stoppages still without the contractor's written notice (people with the notice permission). Merged into the inbox by the client.
create or replace function inbox_my_delays()
returns table (key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path = public
as $fn$
declare u uuid := auth.uid(); adm boolean := coalesce(is_admin_user(), false);
begin
  if u is null then return; end if;
  return query
  select 'ex:delay:' || s.id, 'execution', 'delay_assess', r.project_id, coalesce(mp.short_name, mp.official_name, ''),
    'ارزیابی تأخیر — ' || r.report_no || ' · ' || s.hours::text || ' ساعت',
    s.category || coalesce(' — ' || nullif(s.description, ''), '') || ' · ' || r.report_date::text, null::date, coalesce(r.submitted_at, r.created_at), false, s.id,
    jsonb_build_object('hours', s.hours, 'category', s.category, 'reportId', r.id)
  from ex_report_stoppages s join ex_reports r on r.id = s.report_id left join master_projects mp on mp.id = r.project_id
  where r.form_key = 'work' and r.status in ('submitted', 'partially_approved', 'approved') and s.hours > 0 and s.responsibility = ''
    and ex_allows(r.project_id, 'assess_delay')
    and (not adm or exists (select 1 from ex_project_roles x where x.project_id = r.project_id and x.user_id = u and x.active));

  return query
  select 'ex:notice:' || s.id, 'execution', 'delay_notice', r.project_id, coalesce(mp.short_name, mp.official_name, ''),
    'اخطار کتبی تأخیر — ' || r.report_no || ' · ' || s.hours::text || ' ساعت',
    s.category || coalesce(' — ' || nullif(s.description, ''), '') || ' · ' || r.report_date::text, r.report_date + coalesce((select (e.values_json ->> 'delayNoticeDays')::int from ex_settings e where e.project_id = r.project_id), 14),
    coalesce(r.submitted_at, r.created_at), r.report_date + coalesce((select (e.values_json ->> 'delayNoticeDays')::int from ex_settings e where e.project_id = r.project_id), 14) < current_date, s.id,
    jsonb_build_object('hours', s.hours, 'category', s.category, 'reportId', r.id)
  from ex_report_stoppages s join ex_reports r on r.id = s.report_id left join master_projects mp on mp.id = r.project_id
  where r.form_key = 'work' and r.status in ('submitted', 'partially_approved', 'approved') and s.hours > 0 and s.notice_date is null
    and s.responsibility in ('', 'employer', 'third_party', 'force_majeure') and s.category <> 'other'
    and ex_allows(r.project_id, 'notice')
    and (not adm or exists (select 1 from ex_project_roles x where x.project_id = r.project_id and x.user_id = u and x.active));
end $fn$;
revoke all on function inbox_my_delays() from public, anon;
grant execute on function inbox_my_delays() to authenticated;
