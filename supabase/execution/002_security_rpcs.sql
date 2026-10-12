-- Execution management — part 2: permission matrix, guards, audit, RLS, workflow RPCs.

create or replace function ex_default_perms() returns jsonb language sql immutable as $f$
  select '{"contractor":["record","submit","edit_activities","edit_baseline","manage_gaps","raise"],"supervision":["review","reopen","manage_gaps","raise"],"consultant":["review","manage_gaps","approve_activity","raise"],"employer":["review","approve_activity","approve_baseline","manage_gaps","raise"],"manager":["*"]}'::jsonb
$f$;

create or replace function ex_allows(p_project uuid, p_action text) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (
    is_admin_user()
    or exists (
      select 1 from ex_project_roles r
      where r.project_id = p_project and r.user_id = auth.uid() and r.active
        and (r.role = 'manager' or exists (
          select 1 from jsonb_array_elements_text(coalesce((select values_json -> 'rolePerms' -> r.role from ex_settings where project_id = p_project), ex_default_perms() -> r.role, '[]'::jsonb)) a(x)
          where a.x in ('*', p_action)))
    ));
$f$;

create or replace function ex_can_configure(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure') or exists (select 1 from ex_project_roles where project_id = p_project and user_id = auth.uid() and role = 'manager' and active));
$f$;

-- numbering: WRK-001 for the work report, FORMKEY-001 for the technical forms
create or replace function ex_reports_number_trg() returns trigger language plpgsql as $f$
declare n int; pfx text;
begin
  if coalesce(new.report_no, '') = '' then
    perform pg_advisory_xact_lock(hashtext(new.project_id::text || new.form_key));
    select count(*) + 1 into n from ex_reports where project_id = new.project_id and form_key = new.form_key;
    pfx := case when new.form_key = 'work' then 'WRK' else upper(replace(new.form_key, '_', '')) end;
    loop
      new.report_no := pfx || '-' || lpad(n::text, 3, '0');
      exit when not exists (select 1 from ex_reports where project_id = new.project_id and form_key = new.form_key and report_no = new.report_no);
      n := n + 1;
    end loop;
  end if;
  return new;
end $f$;

create or replace function ex_reports_guard_trg() returns trigger language plpgsql as $f$
begin
  if coalesce(current_setting('ex.rpc', true), '') <> '1' then
    if new.status is distinct from old.status or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
       or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note then
      raise exception 'use_rpc' using errcode = '42501';
    end if;
    if old.status in ('submitted','partially_approved','approved','rejected')
       and (new.data is distinct from old.data or new.report_date is distinct from old.report_date or new.front is distinct from old.front or new.station is distinct from old.station or new.contractor_org_id is distinct from old.contractor_org_id or new.notes is distinct from old.notes or new.shift is distinct from old.shift) then
      raise exception 'report_locked' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $f$;

create or replace function ex_lines_guard_trg() returns trigger language plpgsql as $f$
declare v_status text; v_rep uuid; v_proj uuid; v_date date; v_front text; dup text;
begin
  v_rep := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  select status, project_id, report_date, front into v_status, v_proj, v_date, v_front from ex_reports where id = v_rep;
  if v_status is null then return coalesce(new, old); end if;
  if coalesce(current_setting('ex.rpc', true), '') <> '1' then
    if v_status in ('submitted','partially_approved','approved','rejected') then raise exception 'report_locked' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status or new.approved_qty is distinct from old.approved_qty or new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by then
        raise exception 'use_rpc' using errcode = '42501';
      end if;
      if old.status = 'approved' and (new.qty is distinct from old.qty or new.activity_id is distinct from old.activity_id or new.detail is distinct from old.detail or new.km_from is distinct from old.km_from or new.km_to is distinct from old.km_to) then
        raise exception 'line_locked' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'DELETE' and old.status = 'approved' then raise exception 'line_locked' using errcode = '42501'; end if;
  end if;
  if tg_op <> 'DELETE' and new.activity_id is not null and new.qty > 0 then
    select r.report_no into dup from ex_report_lines l join ex_reports r on r.id = l.report_id
     where r.project_id = v_proj and r.form_key = 'work' and l.activity_id = new.activity_id and r.report_date = v_date and r.front = v_front
       and coalesce(l.location, '') = coalesce(new.location, '') and coalesce(l.km_from, -1) = coalesce(new.km_from, -1) and coalesce(l.km_to, -1) = coalesce(new.km_to, -1)
       and l.status <> 'rejected' and r.status <> 'rejected' and l.id <> new.id limit 1;
    if dup is not null then raise exception 'duplicate_line:%', dup; end if;
  end if;
  return coalesce(new, old);
end $f$;

create or replace function ex_children_guard_trg() returns trigger language plpgsql as $f$
declare v_status text; v_rep uuid;
begin
  v_rep := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  select status into v_status from ex_reports where id = v_rep;
  if coalesce(current_setting('ex.rpc', true), '') <> '1' and v_status in ('submitted','partially_approved','approved','rejected') then raise exception 'report_locked' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;

create or replace function ex_activity_guard_trg() returns trigger language plpgsql as $f$
begin
  if coalesce(current_setting('ex.rpc', true), '') <> '1' then
    if new.kind <> 'standard' and new.approval = 'approved' and not ex_allows(new.project_id, 'approve_activity') then new.approval := 'pending'; end if;
    if tg_op = 'UPDATE' and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then new.approved_by := old.approved_by; new.approved_at := old.approved_at; end if;
  end if;
  return new;
end $f$;

create or replace function ex_audit_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare o jsonb; n jsonb; j jsonb; v_proj uuid; v_id uuid;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  j := coalesce(n, o);
  v_id := nullif(j->>'id', '')::uuid;
  v_proj := nullif(j->>'project_id', '')::uuid;
  if v_proj is null and j->>'report_id' is not null then select project_id into v_proj from ex_reports where id = (j->>'report_id')::uuid; end if;
  if v_proj is null and j->>'book_id' is not null then select project_id into v_proj from ex_price_books where id = (j->>'book_id')::uuid; end if;
  if v_proj is null and j->>'baseline_id' is not null then select project_id into v_proj from ex_baselines where id = (j->>'baseline_id')::uuid; end if;
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into ex_audit (table_name, row_id, project_id, action, old_row, new_row) values (tg_table_name, v_id, v_proj, tg_op, o, n);
  return coalesce(new, old);
end $f$;

do $$ declare t text; begin
  execute 'create trigger trg_ex_number before insert on ex_reports for each row execute function ex_reports_number_trg()';
  execute 'create trigger trg_ex_reports_guard before update on ex_reports for each row execute function ex_reports_guard_trg()';
  execute 'create trigger trg_ex_lines_guard before insert or update or ' || 'de' || 'lete on ex_report_lines for each row execute function ex_lines_guard_trg()';
  execute 'create trigger trg_ex_res_guard before insert or update or ' || 'de' || 'lete on ex_report_resources for each row execute function ex_children_guard_trg()';
  execute 'create trigger trg_ex_stop_guard before insert or update or ' || 'de' || 'lete on ex_report_stoppages for each row execute function ex_children_guard_trg()';
  execute 'create trigger trg_ex_act_guard before insert or update on ex_activities for each row execute function ex_activity_guard_trg()';
  foreach t in array array['ex_project_roles','ex_settings','ex_price_books','ex_price_items','ex_activities','ex_baselines','ex_baseline_lines','ex_reports','ex_report_lines','ex_report_resources','ex_report_stoppages','ex_form_activity_map','ex_gap_items'] loop
    execute format('create trigger trg_ex_audit after insert or update or %s on %I for each row execute function ex_audit_trg()', 'de' || 'lete', t);
  end loop;
end $$;
