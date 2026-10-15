-- Engineering document workflow by role + the launchpad notification feeds of the engineering and execution modules.
-- Court of the ball: required/in_preparation → contractor · issued → consultant/supervision · pending_approval/restricted → employer · approved → done.

create or replace function ex_has_role(p_project uuid, p_roles text[]) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or exists (select 1 from ex_project_roles r where r.project_id = p_project and r.user_id = auth.uid() and r.active and (r.role = 'manager' or r.role = any (p_roles))));
$f$;

create or replace function ex_doc_transition(p_doc uuid, p_to text, p_note text default '') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; ok boolean := false;
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  if p_to not in ('in_preparation','issued','pending_approval','approved','restricted') then raise exception 'invalid_status'; end if;
  if d.status in ('required','in_preparation') and p_to in ('in_preparation','issued') then ok := ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id);
  elsif d.status = 'issued' and p_to in ('pending_approval','in_preparation') then ok := ex_has_role(d.project_id, array['supervision','consultant']) or ex_can_configure(d.project_id);
  elsif d.status in ('pending_approval','restricted') and p_to in ('approved','restricted','in_preparation') then ok := ex_has_role(d.project_id, array['employer']) or ex_can_configure(d.project_id);
  end if;
  if not ok then raise exception 'not_allowed' using errcode = '42501'; end if;
  update ex_eng_docs set status = p_to,
    note = case when p_note <> '' then p_note else note end,
    restriction_note = case when p_to = 'restricted' then coalesce(nullif(p_note, ''), restriction_note) else restriction_note end
  where id = p_doc;
  return jsonb_build_object('ok', true, 'status', p_to);
end $f$;
revoke all on function ex_doc_transition(uuid, text, text) from public;
grant execute on function ex_doc_transition(uuid, text, text) to authenticated;
revoke all on function ex_has_role(uuid, text[]) from public;
grant execute on function ex_has_role(uuid, text[]) to authenticated;

create or replace function my_engineering_notifications() returns jsonb language plpgsql stable set search_path to 'public' as $f$
declare v jsonb := '[]'::jsonb; r record; u uuid := auth.uid();
begin
  if u is null then return v; end if;
  -- documents the contractor has to prepare (overdue or due within a week)
  for r in select d.id, d.doc_no, d.title, d.planned_prepared, d.critical from ex_eng_docs d
    where d.status in ('required','in_preparation') and d.weight > 0 and d.planned_prepared is not null and d.planned_prepared <= current_date + 7
      and (ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id)) order by d.planned_prepared limit 25 loop
    v := v || jsonb_build_object('id', 'en-pr-' || r.id, 'source', 'engineering', 'module', 'engineering',
      'severity', case when r.planned_prepared < current_date then 'warn' else 'action' end,
      'title', r.doc_no || ' — ' || r.title,
      'body', case when r.planned_prepared < current_date then (current_date - r.planned_prepared) || ' روز از موعد تهیه گذشته' else 'موعد تهیه تا ' || (r.planned_prepared - current_date) || ' روز دیگر' end || case when r.critical then ' (بحرانی)' else '' end,
      'at', now());
  end loop;
  -- documents waiting for the consultant's review
  for r in select d.id, d.doc_no, d.title, d.planned_approved, d.updated_at from ex_eng_docs d
    where d.status = 'issued' and ex_has_role(d.project_id, array['supervision','consultant']) order by d.updated_at limit 25 loop
    v := v || jsonb_build_object('id', 'en-rv-' || r.id, 'source', 'engineering', 'module', 'engineering',
      'severity', case when r.updated_at < now() - interval '5 days' or (r.planned_approved is not null and r.planned_approved < current_date) then 'warn' else 'action' end,
      'title', r.doc_no || ' — ' || r.title, 'body', 'منتظر بررسی مشاور است', 'at', r.updated_at);
  end loop;
  -- documents waiting for the employer's approval or for lifting a restriction
  for r in select d.id, d.doc_no, d.title, d.status, d.planned_approved, d.updated_at from ex_eng_docs d
    where d.status in ('pending_approval','restricted') and ex_has_role(d.project_id, array['employer']) order by d.planned_approved nulls last limit 25 loop
    v := v || jsonb_build_object('id', 'en-ap-' || r.id, 'source', 'engineering', 'module', 'engineering',
      'severity', case when r.planned_approved is not null and r.planned_approved < current_date then 'warn' else 'action' end,
      'title', r.doc_no || ' — ' || r.title, 'body', case when r.status = 'restricted' then 'تأیید با محدودیت؛ رفع محدودیت با کارفرماست' else 'منتظر تأیید کارفرماست' end, 'at', r.updated_at);
  end loop;
  return v;
end $f$;
grant execute on function my_engineering_notifications() to authenticated;

create or replace function my_execution_notifications() returns jsonb language plpgsql stable set search_path to 'public' as $f$
declare v jsonb := '[]'::jsonb; r record; u uuid := auth.uid();
begin
  if u is null then return v; end if;
  -- work reports waiting for my review
  for r in select x.id, x.report_no, x.report_date, x.front, x.submitted_at from ex_reports x
    where x.status in ('submitted','partially_approved') and ex_allows(x.project_id, 'review') and x.submitted_by is distinct from u order by x.submitted_at nulls last limit 30 loop
    v := v || jsonb_build_object('id', 'ex-rv-' || r.id, 'source', 'execution', 'module', 'execution',
      'severity', case when r.submitted_at is not null and r.submitted_at < now() - interval '2 days' then 'warn' else 'action' end,
      'title', 'گزارش ' || coalesce(nullif(r.report_no, ''), 'روزانه') || case when r.front <> '' then ' — ' || r.front else '' end, 'body', 'منتظر بررسی و تأیید شماست', 'at', coalesce(r.submitted_at, now()));
  end loop;
  -- my reports that were returned or are still drafts from a previous day
  for r in select x.id, x.report_no, x.status, x.review_note, x.report_date from ex_reports x
    where x.created_by = u and (x.status in ('returned','incomplete') or (x.status = 'draft' and x.report_date < current_date)) order by x.report_date desc limit 20 loop
    v := v || jsonb_build_object('id', 'ex-my-' || r.id, 'source', 'execution', 'module', 'execution',
      'severity', case when r.status = 'draft' then 'info' else 'warn' end,
      'title', 'گزارش ' || coalesce(nullif(r.report_no, ''), 'روزانه'),
      'body', case when r.status = 'draft' then 'پیش‌نویس ارسال‌نشده' else 'برگشت خورده: ' || coalesce(nullif(r.review_note, ''), 'اصلاح و ارسال مجدد') end, 'at', now());
  end loop;
  -- overdue gaps in the reports
  for r in select g.id, g.subject, g.due_date from ex_gap_items g where g.status = 'open' and g.due_date is not null and g.due_date < current_date and ex_allows(g.project_id, 'manage_gaps') order by g.due_date limit 20 loop
    v := v || jsonb_build_object('id', 'ex-gp-' || r.id, 'source', 'execution', 'module', 'execution', 'severity', 'warn',
      'title', 'کسری گزارش — ' || coalesce(nullif(r.subject, ''), 'بدون عنوان'), 'body', (current_date - r.due_date) || ' روز از مهلت رفع گذشته', 'at', now());
  end loop;
  return v;
end $f$;
grant execute on function my_execution_notifications() to authenticated;
