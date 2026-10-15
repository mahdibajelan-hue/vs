-- adds open QC findings to the execution launchpad notifications
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
  -- open QC findings: high severity, or open for more than a week
  for r in select q.id, q.kind, q.weld_ref, q.note, q.severity, q.created_at from ex_qc_findings q
    where q.status = 'open' and (q.severity = 'high' or q.created_at < now() - interval '7 days') and (ex_allows(q.project_id, 'raise') or ex_allows(q.project_id, 'record')) order by q.created_at limit 20 loop
    v := v || jsonb_build_object('id', 'ex-qc-' || r.id, 'source', 'execution', 'module', 'execution', 'severity', case when r.severity = 'high' then 'warn' else 'info' end,
      'title', 'مغایرت کنترل کیفیت' || case when r.weld_ref <> '' then ' — ' || r.weld_ref else '' end, 'body', coalesce(nullif(r.note, ''), 'مغایرت باز'), 'at', r.created_at);
  end loop;
  return v;
end $f$;
grant execute on function my_execution_notifications() to authenticated;
