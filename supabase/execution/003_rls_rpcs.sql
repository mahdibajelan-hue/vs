-- Execution management — part 3: row-level security and workflow RPCs (submit, review per line, reopen, baselines, activity approval, gap sync).

do $$ declare t text; begin
  foreach t in array array['ex_project_roles','ex_settings','ex_price_books','ex_price_items','ex_activities','ex_baselines','ex_baseline_lines','ex_reports','ex_report_lines','ex_report_resources','ex_report_stoppages','ex_report_history','ex_form_activity_map','ex_gap_items','ex_audit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_sel', t);
  end loop;
  -- configuration: project managers / administrators
  foreach t in array array['ex_project_roles','ex_settings'] loop
    execute format('create policy %I on %I for all to authenticated using (ex_can_configure(project_id)) with check (ex_can_configure(project_id))', t || '_cfg', t);
  end loop;
  execute 'create policy ex_price_books_w on ex_price_books for all to authenticated using (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id)) with check (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id))';
  execute 'create policy ex_price_items_w on ex_price_items for all to authenticated using (exists (select 1 from ex_price_books b where b.id = book_id and (ex_allows(b.project_id, ''edit_activities'') or ex_can_configure(b.project_id)))) with check (exists (select 1 from ex_price_books b where b.id = book_id and (ex_allows(b.project_id, ''edit_activities'') or ex_can_configure(b.project_id))))';
  execute 'create policy ex_activities_w on ex_activities for all to authenticated using (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id)) with check (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id))';
  execute 'create policy ex_baselines_w on ex_baselines for all to authenticated using (ex_allows(project_id, ''edit_baseline'') and status = ''draft'') with check (ex_allows(project_id, ''edit_baseline'') and status = ''draft'')';
  execute 'create policy ex_baseline_lines_w on ex_baseline_lines for all to authenticated using (exists (select 1 from ex_baselines b where b.id = baseline_id and b.status = ''draft'' and ex_allows(b.project_id, ''edit_baseline''))) with check (exists (select 1 from ex_baselines b where b.id = baseline_id and b.status = ''draft'' and ex_allows(b.project_id, ''edit_baseline'')))';
  execute 'create policy ex_reports_w on ex_reports for all to authenticated using (ex_allows(project_id, ''record'')) with check (ex_allows(project_id, ''record''))';
  foreach t in array array['ex_report_lines','ex_report_resources','ex_report_stoppages'] loop
    execute format('create policy %I on %I for all to authenticated using (exists (select 1 from ex_reports r where r.id = report_id and ex_allows(r.project_id, ''record''))) with check (exists (select 1 from ex_reports r where r.id = report_id and ex_allows(r.project_id, ''record'')))', t || '_w', t);
  end loop;
  execute 'create policy ex_form_activity_map_w on ex_form_activity_map for all to authenticated using (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id)) with check (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id))';
  execute 'create policy ex_gap_items_w on ex_gap_items for all to authenticated using (ex_allows(project_id, ''manage_gaps'') or ex_allows(project_id, ''record'')) with check (ex_allows(project_id, ''manage_gaps'') or ex_allows(project_id, ''record''))';
end $$;

create or replace function ex_hist(p_report uuid, p_action text, p_note text default '') returns void language sql security definer set search_path to 'public' as $f$
  insert into ex_report_history (report_id, action, note) values (p_report, p_action, coalesce(p_note, ''));
$f$;

create or replace function ex_report_submit(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; x record; tol numeric; blockb boolean; total numeric; base numeric;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('draft','returned','incomplete') then raise exception 'bad_state'; end if;
  if not exists (select 1 from ex_report_lines where report_id = p_id) and r.data = '{}'::jsonb then raise exception 'empty_report'; end if;
  select coalesce((values_json ->> 'overBasePct')::numeric, 0), coalesce((values_json ->> 'blockOverBase')::boolean, true) into tol, blockb from ex_settings where project_id = r.project_id;
  tol := coalesce(tol, 0); blockb := coalesce(blockb, true);
  if r.form_key = 'work' and blockb then
    for x in select l.activity_id, sum(l.qty) q from ex_report_lines l where l.report_id = p_id and l.activity_id is not null group by l.activity_id loop
      select coalesce((select bl.base_qty from ex_baseline_lines bl join ex_baselines b on b.id = bl.baseline_id where b.project_id = r.project_id and b.status = 'approved' and bl.activity_id = x.activity_id order by b.version desc limit 1), (select base_qty from ex_activities where id = x.activity_id)) into base;
      select coalesce(sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) else l.qty end), 0) into total from ex_report_lines l join ex_reports rr on rr.id = l.report_id
        where l.activity_id = x.activity_id and rr.form_key = 'work' and rr.id <> p_id and rr.status in ('submitted','partially_approved','approved') and l.status in ('pending','approved');
      if base > 0 and total + x.q > base * (1 + tol / 100) + 1e-9 then
        raise exception 'exceeds_base:%', (select item_no || ' ' || title from ex_activities where id = x.activity_id);
      end if;
    end loop;
  end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = 'pending', review_note = case when status = 'returned' then review_note else '' end where report_id = p_id and status in ('returned','pending');
  update ex_reports set status = 'submitted', submitted_by = auth.uid(), submitted_at = now(), missing = '[]'::jsonb where id = p_id;
  perform ex_hist(p_id, 'submit', '');
end $f$;

-- decisions: [{"line_id": "...", "decision": "approved|rejected|returned", "qty": 12.5, "note": "..."}]; lines not mentioned keep their state
create or replace function ex_report_review(p_id uuid, p_decisions jsonb, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; d jsonb; l ex_report_lines; n_pend int; n_ret int; n_app int; n_rej int; v_status text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  perform set_config('ex.rpc', '1', true);
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    select * into l from ex_report_lines where id = (d ->> 'line_id')::uuid and report_id = p_id;
    if l.id is null then continue; end if;
    if (d ->> 'decision') not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
    if (d ->> 'decision') in ('rejected','returned') and coalesce(btrim(d ->> 'note'), '') = '' then raise exception 'note_required'; end if;
    update ex_report_lines set status = d ->> 'decision',
      approved_qty = case when d ->> 'decision' = 'approved' then least(coalesce((d ->> 'qty')::numeric, l.qty), l.qty) else 0 end,
      review_note = coalesce(d ->> 'note', ''), reviewed_by = auth.uid(), reviewed_at = now() where id = l.id;
  end loop;
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'returned'), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected') into n_pend, n_ret, n_app, n_rej from ex_report_lines where report_id = p_id;
  v_status := case when n_ret > 0 then 'returned'
                   when n_pend > 0 and (n_app + n_rej) > 0 then 'partially_approved'
                   when n_pend > 0 then 'submitted'
                   when n_rej > 0 and n_app = 0 then 'rejected'
                   when n_rej > 0 then 'partially_approved'
                   else 'approved' end;
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $f$;

-- technical forms without lines (records) are approved as a whole
create or replace function ex_report_decide_whole(p_id uuid, p_decision text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if p_decision not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
  if p_decision <> 'approved' and coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = p_decision, approved_qty = case when p_decision = 'approved' then qty else 0 end, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status = 'pending';
  update ex_reports set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || p_decision, p_note);
end $f$;

create or replace function ex_report_reopen(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'reopen') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('approved','partially_approved','rejected') then raise exception 'bad_state'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = 'returned', review_note = 'بازگشایی: ' || p_reason, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status in ('approved','rejected');
  update ex_reports set status = 'returned', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_reason where id = p_id;
  perform ex_hist(p_id, 'reopen', p_reason);
end $f$;

create or replace function ex_baseline_create(p_project uuid, p_reason text, p_effective date default current_date) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare v int; b uuid;
begin
  if not ex_allows(p_project, 'edit_baseline') and not ex_can_configure(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from ex_baselines where project_id = p_project and status = 'draft') then raise exception 'draft_exists'; end if;
  select coalesce(max(version), 0) + 1 into v from ex_baselines where project_id = p_project;
  insert into ex_baselines (project_id, version, reason, effective_date) values (p_project, v, coalesce(p_reason, ''), coalesce(p_effective, current_date)) returning id into b;
  insert into ex_baseline_lines (baseline_id, activity_id, item_no, title, unit, base_qty, weight, unit_price, weight_group, active)
    select b, a.id, a.item_no, a.title, a.unit, a.base_qty, a.weight, a.unit_price, a.weight_group, a.active from ex_activities a where a.project_id = p_project and a.approval = 'approved';
  return b;
end $f$;

create or replace function ex_baseline_approve(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare b ex_baselines; g record;
begin
  select * into b from ex_baselines where id = p_id;
  if b.id is null then raise exception 'not_found'; end if;
  if not ex_allows(b.project_id, 'approve_baseline') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if b.status <> 'draft' then raise exception 'bad_state'; end if;
  for g in select weight_group, sum(weight) w from ex_baseline_lines where baseline_id = p_id and active group by weight_group loop
    if abs(g.w - 100) > 0.01 then raise exception 'weights_not_100:%', coalesce(nullif(g.weight_group, ''), 'کل پروژه'); end if;
  end loop;
  update ex_baselines set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
end $f$;

create or replace function ex_activity_decide(p_id uuid, p_approve boolean, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare a ex_activities;
begin
  select * into a from ex_activities where id = p_id;
  if a.id is null then raise exception 'not_found'; end if;
  if not ex_allows(a.project_id, 'approve_activity') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_activities set approval = case when p_approve then 'approved' else 'rejected' end, approval_note = coalesce(p_note, ''), approved_by = auth.uid(), approved_at = now(), active = (active and p_approve) where id = p_id;
end $f$;

-- gaps: items = [{fingerprint, kind, form_key, period_key, front, subject, existing, missing, due_date}]; auto-found gaps that disappeared are closed
create or replace function ex_gap_sync(p_project uuid, p_items jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare it jsonb;
begin
  if not (ex_allows(p_project, 'manage_gaps') or ex_allows(p_project, 'record') or ex_allows(p_project, 'review')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into ex_gap_items (project_id, fingerprint, kind, form_key, period_key, front, subject, existing, missing, due_date)
    values (p_project, it ->> 'fingerprint', it ->> 'kind', coalesce(it ->> 'form_key', ''), coalesce(it ->> 'period_key', ''), coalesce(it ->> 'front', ''), coalesce(it ->> 'subject', ''), coalesce(it -> 'existing', '{}'::jsonb), coalesce(it -> 'missing', '[]'::jsonb), nullif(it ->> 'due_date', '')::date)
    on conflict (project_id, fingerprint) do update set existing = excluded.existing, missing = excluded.missing, subject = excluded.subject, updated_at = now(),
      status = case when ex_gap_items.status = 'closed' then 'open' else ex_gap_items.status end;
  end loop;
  update ex_gap_items g set status = 'closed', note = case when note = '' then 'برطرف شد (خودکار)' else note end, updated_at = now()
   where g.project_id = p_project and g.status in ('open','in_progress') and not exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where x ->> 'fingerprint' = g.fingerprint);
end $f$;

insert into rasta_modules (key, label_fa) values ('execution', 'مدیریت اجرا') on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select 'execution', a.action from (values ('view'),('create'),('edit'),('delete'),('submit'),('review'),('approve'),('reject'),('export'),('configure')) as a(action)
on conflict (module_key, action) do nothing;
