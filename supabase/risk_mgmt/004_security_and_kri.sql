-- ============================================================================
-- ERM v2 — RLS for the new tables, KRI state machine, formal residual-risk acceptance, effective policy lookup.
-- ============================================================================
alter table rm_controls enable row level security;
alter table rm_contingency_plans enable row level security;
alter table rm_risk_evidence enable row level security;
alter table rm_risk_links enable row level security;
alter table rm_acceptances enable row level security;
alter table rm_corporate_risks enable row level security;
alter table rm_kris enable row level security;
alter table rm_kri_readings enable row level security;
alter table rm_kri_events enable row level security;
alter table rm_policy enable row level security;
alter table rm_config_audit enable row level security;
alter table rm_suggestions enable row level security;

create policy rm_controls_sel on rm_controls for select using (rm_can_view(rm_risk_project(risk_id)));
create policy rm_controls_wr on rm_controls for all using (rm_can_write_risk(risk_id)) with check (rm_can_write_risk(risk_id));
create policy rm_cont_sel on rm_contingency_plans for select using (rm_can_view(rm_risk_project(risk_id)));
create policy rm_cont_wr on rm_contingency_plans for all using (rm_can_write_risk(risk_id)) with check (rm_can_write_risk(risk_id));
create policy rm_evid_sel on rm_risk_evidence for select using (rm_can_view(rm_risk_project(risk_id)));
create policy rm_evid_wr on rm_risk_evidence for all using (rm_can_write_risk(risk_id)) with check (rm_can_write_risk(risk_id));
create policy rm_links_sel on rm_risk_links for select using (rm_can_view(rm_risk_project(risk_id)));
create policy rm_links_wr on rm_risk_links for all using (rm_can_write_risk(risk_id)) with check (rm_can_write_risk(risk_id));
create policy rm_accept_sel on rm_acceptances for select using (rm_can_view(rm_risk_project(risk_id)));

create policy rm_corp_sel on rm_corporate_risks for select using (is_admin_user() or created_by = auth.uid() or exists (select 1 from rm_risks r where r.corporate_risk_id = rm_corporate_risks.id and rm_can_view(r.project_id)));
create policy rm_corp_ins on rm_corporate_risks for insert with check (rm_is_any_manager());
create policy rm_corp_upd on rm_corporate_risks for update using (rm_is_any_manager()) with check (rm_is_any_manager());
create policy rm_corp_del on rm_corporate_risks for delete using (is_admin_user());

create policy rm_kris_sel on rm_kris for select using (rm_can_view(project_id));
create policy rm_kris_wr on rm_kris for all using (rm_can_edit(project_id) or is_admin_user() or owner_id = auth.uid()) with check (rm_can_edit(project_id) or is_admin_user() or owner_id = auth.uid());
create policy rm_kread_sel on rm_kri_readings for select using (exists (select 1 from rm_kris k where k.id = kri_id and rm_can_view(k.project_id)));
create policy rm_kread_ins on rm_kri_readings for insert with check (exists (select 1 from rm_kris k where k.id = kri_id and (rm_can_edit(k.project_id) or is_admin_user() or k.owner_id = auth.uid())));
create policy rm_kread_del on rm_kri_readings for delete using (is_admin_user());
create policy rm_kev_sel on rm_kri_events for select using (exists (select 1 from rm_kris k where k.id = kri_id and rm_can_view(k.project_id)));

create policy rm_policy_sel on rm_policy for select using (auth.uid() is not null);
create policy rm_policy_wr on rm_policy for all using (is_admin_user() or (project_id is not null and rm_can_manage(project_id))) with check (is_admin_user() or (project_id is not null and rm_can_manage(project_id)));
create policy rm_cfgaudit_sel on rm_config_audit for select using (rm_is_any_manager());
create policy rm_sugg_sel on rm_suggestions for select using (rm_can_view(project_id));
create policy rm_sugg_upd on rm_suggestions for update using (rm_can_edit(project_id) or is_admin_user()) with check (rm_can_edit(project_id) or is_admin_user());

-- replace the free-for-all project creation: projects come from the central master data (rm_sync_master_projects)
-- (DROP POLICY hangs through the SQL gateway used for live migrations, so the policies are altered in place)
alter policy "rm_projects_insert_any_authenticated" on rm_projects with check (is_admin_user());
alter policy "rm_history_insert_member" on rm_risk_history with check (rm_can_view(rm_risk_project(risk_id)));

create or replace function rm_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger trg_rm_controls_touch before update on rm_controls for each row execute function rm_touch();
create trigger trg_rm_cont_touch before update on rm_contingency_plans for each row execute function rm_touch();
create trigger trg_rm_audit_policy after insert or update or delete on rm_policy for each row execute function rm_config_audit_trg();
create trigger trg_rm_audit_cat after insert or update or delete on rm_categories for each row execute function rm_config_audit_trg();
create trigger trg_rm_audit_kri after insert or update or delete on rm_kris for each row execute function rm_config_audit_trg();

-- ---------------------------------------------------------------- KRI
create or replace function rm_kri_state(p_val numeric, p_dir text, p_warn numeric, p_crit numeric) returns text language sql immutable as $$
  select case when p_val is null then 'no_data'
    when p_dir = 'higher_worse' then case when p_val >= p_crit then 'critical' when p_val >= p_warn then 'warn' else 'normal' end
    else case when p_val <= p_crit then 'critical' when p_val <= p_warn then 'warn' else 'normal' end end;
$$;
create or replace function rm_kri_guard() returns trigger language plpgsql as $$
begin
  if (new.direction = 'higher_worse' and new.warn_threshold > new.critical_threshold) or (new.direction = 'lower_worse' and new.warn_threshold < new.critical_threshold) then raise exception 'invalid_kri_thresholds'; end if;
  if tg_op = 'UPDATE' and new.current_value is not null and (new.warn_threshold is distinct from old.warn_threshold or new.critical_threshold is distinct from old.critical_threshold or new.direction is distinct from old.direction) then
    new.state := rm_kri_state(new.current_value, new.direction, new.warn_threshold, new.critical_threshold);
  end if;
  return new;
end $$;
create trigger trg_rm_kri_guard before insert or update on rm_kris for each row execute function rm_kri_guard();

create or replace function rm_kri_on_reading() returns trigger language plpgsql security definer set search_path = public as $$
declare k rm_kris; v_state text; v_old text;
begin
  select * into k from rm_kris where id = new.kri_id for update;
  if k.last_reading_at is not null and new.read_at < k.last_reading_at then return null; end if;
  v_old := k.state;
  v_state := rm_kri_state(new.value, k.direction, k.warn_threshold, k.critical_threshold);
  update rm_kris set current_value = new.value, last_reading_at = new.read_at, state = v_state where id = k.id;
  if v_state is distinct from v_old then
    insert into rm_kri_events (kri_id, from_state, to_state, value, at) values (k.id, v_old, v_state, new.value, new.read_at);
    if v_state in ('warn', 'critical') and k.risk_id is not null then
      update rm_risks set review_requested_at = now(),
             review_request_reason = 'شاخص «' || k.name || '» وارد محدودهٔ ' || case v_state when 'critical' then 'بحرانی' else 'هشدار' end || ' شد (' || new.value || ' ' || k.unit || ')'
       where id = k.risk_id and status <> 'closed';
      insert into rm_risk_history (risk_id, user_id, activity, new_value, comment)
      values (k.risk_id, auth.uid(), 'kri_breach', jsonb_build_object('kri', k.name, 'state', v_state, 'value', new.value), k.name || ': ' || new.value || ' ' || k.unit);
    end if;
  end if;
  return null;
end $$;
create trigger trg_rm_kri_reading after insert on rm_kri_readings for each row execute function rm_kri_on_reading();

-- ---------------------------------------------------------------- policy + acceptance
create or replace function rm_policy_for(p_project uuid) returns rm_policy language sql stable security definer set search_path = public as $$
  select * from rm_policy where project_id = p_project or project_id is null order by project_id nulls last limit 1;
$$;

create or replace function rm_request_acceptance(p_risk uuid, p_rationale text, p_valid_until date default null) returns uuid language plpgsql security definer set search_path = public as $$
declare r rm_risks; v_score smallint; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not rm_can_write_risk(p_risk) then raise exception 'not_authorized'; end if;
  select * into r from rm_risks where id = p_risk;
  if length(trim(coalesce(p_rationale, ''))) < 10 then raise exception 'rationale_required'; end if;
  if exists (select 1 from rm_acceptances where risk_id = p_risk and status = 'requested') then raise exception 'acceptance_already_requested'; end if;
  select residual_score into v_score from rm_risk_assessments where risk_id = p_risk order by review_date desc, created_at desc limit 1;
  if v_score is null then v_score := r.initial_score; end if;
  insert into rm_acceptances (risk_id, requested_by, residual_score, rationale, valid_until) values (p_risk, auth.uid(), v_score, p_rationale, p_valid_until) returning id into v_id;
  insert into rm_risk_history (risk_id, user_id, activity, new_value, comment) values (p_risk, auth.uid(), 'acceptance_requested', jsonb_build_object('residual_score', v_score), left(p_rationale, 200));
  return v_id;
end $$;

create or replace function rm_decide_acceptance(p_id uuid, p_approve boolean, p_note text default '') returns rm_acceptances language plpgsql security definer set search_path = public as $$
declare a rm_acceptances; r rm_risks; pol rm_policy; v_role text; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into a from rm_acceptances where id = p_id and status = 'requested' for update;
  if not found then raise exception 'acceptance_not_pending'; end if;
  select * into r from rm_risks where id = a.risk_id;
  pol := rm_policy_for(r.project_id);
  v_role := rm_project_role(r.project_id);
  if a.residual_score >= pol.escalation_min then v_ok := is_admin_user() or v_role = 'management';
  else v_ok := is_admin_user() or r.approver_id = auth.uid() or v_role = 'project_manager'; end if;
  if not v_ok then raise exception 'authority_required'; end if;
  if a.requested_by = auth.uid() and not is_admin_user() then raise exception 'cannot_decide_own_request'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'note_required_for_rejection'; end if;
  update rm_acceptances set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id returning * into a;
  if p_approve then update rm_risks set response_strategy = 'accept', status = case when status = 'open' then 'monitoring' else status end where id = a.risk_id; end if;
  insert into rm_risk_history (risk_id, user_id, activity, new_value, comment) values (a.risk_id, auth.uid(), case when p_approve then 'acceptance_approved' else 'acceptance_rejected' end, jsonb_build_object('residual_score', a.residual_score), coalesce(p_note, ''));
  return a;
end $$;

grant execute on function rm_request_acceptance(uuid, text, date) to authenticated;
grant execute on function rm_decide_acceptance(uuid, boolean, text) to authenticated;
grant execute on function rm_policy_for(uuid) to authenticated;
revoke execute on function rm_request_acceptance(uuid, text, date) from public, anon;
revoke execute on function rm_decide_acceptance(uuid, boolean, text) from public, anon;
