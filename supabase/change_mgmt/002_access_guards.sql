-- Change Management v2 — access helpers, workflow guard, RLS, rule-set edit guard, audit
create or replace function cm_roles_in(p_project uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct r.name), '{}'::text[]) from rasta_project_role_assignments a join rasta_project_roles r on r.id = a.project_role_id
   where a.project_id = p_project and a.user_id = auth.uid() $$;
create or replace function cm_has_role(p_project uuid, p_names text[]) returns boolean language sql stable security definer set search_path = public as $$
  select cm_roles_in(p_project) && p_names $$;
create or replace function cm_can_view(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (is_admin_user() or rasta_user_can_access_master_project(p_project) or cardinality(cm_roles_in(p_project)) > 0) $$;
create or replace function cm_can_submit(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_user() or cm_has_role(p_project, array['پیمانکار','مشاور','مجری','مدیر پروژه','مدیر مهندسی','مدیر برنامه‌ریزی و کنترل پروژه','مدیر کنترل پروژه','مدیر امور پیمان','مدیر ارشد پروژه']) $$;
create or replace function cm_can_evaluate(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_user() or cm_has_role(p_project, array['مدیر مهندسی','مدیر برنامه‌ریزی و کنترل پروژه','مدیر کنترل پروژه','مدیر امور پیمان','مدیر پروژه','مدیر ارشد پروژه']) $$;
create or replace function cm_can_manage_rules() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_user() or exists (select 1 from rasta_project_role_assignments a join rasta_project_roles r on r.id = a.project_role_id where a.user_id = auth.uid() and r.name = 'نماینده PMO') $$;
grant execute on function cm_roles_in(uuid), cm_has_role(uuid, text[]), cm_can_view(uuid), cm_can_submit(uuid), cm_can_evaluate(uuid), cm_can_manage_rules() to authenticated;

-- workflow guard: status / route / approved amounts only move through the cm_* RPCs (they set app.cm_rpc)
create or replace function cm_request_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.cm_rpc', true) = '1' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then new.stage_entered_at := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.route_status := 'none'; new.route_snapshot := null; new.rule_set_id := null; new.approved_change_amount := null; new.approved_schedule_impact_days := null;
    new.stage_entered_at := now();
    return new;
  end if;
  if new.master_project_id <> old.master_project_id then raise exception 'project_immutable'; end if;
  if new.status is distinct from old.status or new.rule_set_id is distinct from old.rule_set_id or new.route_status is distinct from old.route_status
     or new.route_snapshot is distinct from old.route_snapshot or new.route_blockers is distinct from old.route_blockers or new.approved_change_amount is distinct from old.approved_change_amount
     or new.approved_schedule_impact_days is distinct from old.approved_schedule_impact_days or new.approved_at is distinct from old.approved_at or new.executed_under_exception is distinct from old.executed_under_exception
     or new.base_amount is distinct from old.base_amount or new.cum_prev_amount is distinct from old.cum_prev_amount or new.cum_prev_days is distinct from old.cum_prev_days or new.attempt is distinct from old.attempt
     or new.closed_at is distinct from old.closed_at or new.result_recorded_at is distinct from old.result_recorded_at or new.implementation_started_at is distinct from old.implementation_started_at
     or new.evaluation_completed_at is distinct from old.evaluation_completed_at or new.cancel_reason is distinct from old.cancel_reason or new.decision_note is distinct from old.decision_note
     or new.cr_number is distinct from old.cr_number then
    raise exception 'workflow_fields_via_rpc';
  end if;
  if old.status not in ('draft','returned') and (new.title is distinct from old.title or new.description is distinct from old.description or new.reason_for_change is distinct from old.reason_for_change
     or new.change_type is distinct from old.change_type or new.proposed_change_amount is distinct from old.proposed_change_amount or new.proposed_schedule_impact_days is distinct from old.proposed_schedule_impact_days
     or new.contract_id is distinct from old.contract_id or new.original_contract_amount is distinct from old.original_contract_amount or new.original_duration_days is distinct from old.original_duration_days) then
    raise exception 'locked_after_submit';
  end if;
  if old.status not in ('draft','returned') and (new.evaluation_note is distinct from old.evaluation_note or new.impact_quality is distinct from old.impact_quality or new.impact_safety is distinct from old.impact_safety
     or new.identified_risks is distinct from old.identified_risks or new.implementation_actions is distinct from old.implementation_actions) and not cm_can_evaluate(old.master_project_id) then
    raise exception 'evaluation_not_permitted';
  end if;
  return new;
end $$;
drop trigger if exists trg_cm_request_guard on chg_change_requests;
create trigger trg_cm_request_guard before insert or update on chg_change_requests for each row execute function cm_request_guard();

-- rule-set edit guard: only draft rule sets can be edited; activation/archiving through RPCs
create or replace function cm_rule_edit_guard() returns trigger language plpgsql as $$
declare v_set uuid; v_status text; r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_table_name = 'cm_rule_sets' then
    if tg_op = 'DELETE' then if old.status <> 'draft' then raise exception 'ruleset_locked'; end if; return old; end if;
    if tg_op = 'UPDATE' and old.status <> 'draft' and current_setting('app.cm_rpc', true) <> '1' then raise exception 'ruleset_locked'; end if;
    return new;
  end if;
  if tg_table_name = 'cm_route_steps' then select rule_set_id into v_set from cm_routes where id = r.route_id; else v_set := r.rule_set_id; end if;
  select status into v_status from cm_rule_sets where id = v_set;
  if v_status is distinct from 'draft' and current_setting('app.cm_rpc', true) <> '1' then raise exception 'ruleset_locked'; end if;
  return r;
end $$;
create or replace function cm_rule_audit_fn() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into cm_rule_audit (table_name, row_id, action, old_data, new_data) values (tg_table_name, coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid), tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end, case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['cm_rule_sets','cm_routes','cm_route_steps','cm_rules'] loop
    execute format('drop trigger if exists trg_%1$s_guard on %1$s', t);
    execute format('create trigger trg_%1$s_guard before insert or update or delete on %1$s for each row execute function cm_rule_edit_guard()', t);
  end loop;
  foreach t in array array['cm_rule_sets','cm_routes','cm_route_steps','cm_rules','cm_authority_limits'] loop
    execute format('drop trigger if exists trg_%1$s_audit on %1$s', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on %1$s for each row execute function cm_rule_audit_fn()', t);
  end loop;
end $$;

-- RLS
do $$ declare t text; begin
  foreach t in array array['cm_rule_sets','cm_routes','cm_route_steps','cm_rules','cm_authority_limits','cm_rule_audit','cm_request_steps','cm_exceptions','cm_links'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['cm_rule_sets','cm_routes','cm_route_steps','cm_rules','cm_authority_limits'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t); execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on %1$s', t); execute format('create policy %1$s_write on %1$s for all to authenticated using (cm_can_manage_rules()) with check (cm_can_manage_rules())', t);
  end loop;
end $$;
drop policy if exists cm_rule_audit_read on cm_rule_audit; create policy cm_rule_audit_read on cm_rule_audit for select to authenticated using (cm_can_manage_rules());
do $$ declare t text; begin
  foreach t in array array['cm_request_steps','cm_exceptions','cm_links'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (cm_can_view((select master_project_id from chg_change_requests c where c.id = request_id)))', t);
  end loop;
end $$;
alter policy chg_change_requests_select_authenticated on chg_change_requests using (cm_can_view(master_project_id));
alter policy chg_documents_select_authenticated on chg_documents using (cm_can_view((select master_project_id from chg_change_requests c where c.id = change_request_id)));
alter policy chg_history_select_authenticated on chg_history using (cm_can_view((select master_project_id from chg_change_requests c where c.id = change_request_id)));
alter policy chg_stage_reviews_select_authenticated on chg_stage_reviews using (cm_can_view((select master_project_id from chg_change_requests c where c.id = change_request_id)));
alter policy chg_history_write on chg_history using (false) with check (false);          -- history is written by the cm_* RPCs only
alter policy chg_stage_reviews_write on chg_stage_reviews using (is_admin_user()) with check (is_admin_user());   -- legacy fixed-stage reviews are read-only history
