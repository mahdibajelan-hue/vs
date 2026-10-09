-- Change Management v2 — server functions (rule engine, workflow RPCs, rule-set management, integration, notifications).
-- Dumped from the live database after the tests in docs/change-management; every function is SECURITY DEFINER with an explicit search_path.
-- Convention in cm_resolve_core: lower bound EXCLUSIVE, upper bound INCLUSIVE.

CREATE OR REPLACE FUNCTION public.cm_activate_next(p_req uuid, p_attempt integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_g int;
begin
  if exists (select 1 from cm_request_steps where request_id = p_req and attempt = p_attempt and status = 'active') then return true; end if;
  select min(group_no) into v_g from cm_request_steps where request_id = p_req and attempt = p_attempt and status = 'waiting';
  if v_g is null then return false; end if;
  update cm_request_steps set status = 'active', entered_at = now(), due_at = now() + make_interval(days => sla_days) where request_id = p_req and attempt = p_attempt and status = 'waiting' and group_no = v_g;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_activate_rule_set(p_set uuid, p_effective_from date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; s cm_rule_sets;
begin
  if not cm_can_manage_rules() then raise exception 'not_authorized'; end if;
  select * into s from cm_rule_sets where id = p_set for update;
  if s.id is null then raise exception 'ruleset_not_found'; end if;
  if s.status <> 'draft' then raise exception 'invalid_status'; end if;
  v := cm_validate_rule_set(p_set);
  if exists (select 1 from jsonb_array_elements(v) e where e ->> 'level' = 'error') then raise exception 'validation_failed'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update cm_rule_sets set status = 'archived', effective_to = coalesce(p_effective_from, current_date) - 1 where status = 'active';
  update cm_rule_sets set status = 'active', effective_from = coalesce(p_effective_from, current_date), effective_to = null, activated_by = auth.uid(), activated_at = now() where id = p_set;
  return jsonb_build_object('ok', true, 'warnings', v);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_basis(r chg_change_requests)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_base numeric; v_dur int; v_src text := 'none'; v_dsrc text := 'none'; c fin_contracts; mp master_projects; v_cum_a numeric; v_cum_d int; v_pend numeric; v_cost numeric := coalesce(r.proposed_change_amount, 0); v_days int := coalesce(r.proposed_schedule_impact_days, 0);
  v_cp numeric; v_cmp numeric; v_dp numeric; v_cdp numeric;
begin
  select * into mp from master_projects where id = r.master_project_id;
  if r.contract_id is not null then select * into c from fin_contracts where id = r.contract_id; end if;
  if c.id is not null and coalesce(c.contract_value, 0) > 0 then v_base := c.contract_value; v_src := 'contract';
  elsif coalesce(mp.contract_value, 0) > 0 then v_base := mp.contract_value; v_src := 'project';
  elsif coalesce(r.original_contract_amount, 0) > 0 then v_base := r.original_contract_amount; v_src := 'manual'; end if;
  if c.id is not null and c.start_date is not null and c.planned_completion_date is not null then v_dur := c.planned_completion_date - c.start_date; v_dsrc := 'contract';
  elsif mp.contract_start_date is not null and mp.contractual_completion_date is not null then v_dur := mp.contractual_completion_date - mp.contract_start_date; v_dsrc := 'project';
  elsif coalesce(r.original_duration_days, 0) > 0 then v_dur := r.original_duration_days; v_dsrc := 'manual'; end if;
  select coalesce(sum(abs(coalesce(x.approved_change_amount, 0))), 0), coalesce(sum(abs(coalesce(x.approved_schedule_impact_days, 0))), 0)::int into v_cum_a, v_cum_d
    from chg_change_requests x where x.id <> r.id and x.status in ('approved','implementing','implemented','closed')
     and ((r.contract_id is not null and x.contract_id = r.contract_id) or (r.contract_id is null and x.contract_id is null and x.master_project_id = r.master_project_id));
  select coalesce(sum(abs(coalesce(x.proposed_change_amount, 0))), 0) into v_pend
    from chg_change_requests x where x.id <> r.id and x.status in ('awaiting_approval')
     and ((r.contract_id is not null and x.contract_id = r.contract_id) or (r.contract_id is null and x.contract_id is null and x.master_project_id = r.master_project_id));
  if v_base > 0 then v_cp := round(abs(v_cost) / v_base * 100, 4); v_cmp := round((v_cum_a + abs(v_cost)) / v_base * 100, 4); end if;
  if v_dur > 0 then v_dp := round(abs(v_days)::numeric / v_dur * 100, 4); v_cdp := round((v_cum_d + abs(v_days))::numeric / v_dur * 100, 4); end if;
  return jsonb_build_object('base_amount', v_base, 'base_source', v_src, 'duration_days', v_dur, 'duration_source', v_dsrc, 'current_cost', v_cost, 'current_pct', v_cp, 'cum_prev_amount', v_cum_a, 'cum_amount', v_cum_a + abs(v_cost),
    'cum_pct', v_cmp, 'pending_other_amount', v_pend, 'pending_pct', case when v_base > 0 then round((v_cum_a + abs(v_cost) + v_pend) / v_base * 100, 4) end,
    'current_days', v_days, 'current_days_pct', v_dp, 'cum_prev_days', v_cum_d, 'cum_days', v_cum_d + abs(v_days), 'cum_days_pct', v_cdp,
    'change_type', r.change_type, 'contract_id', r.contract_id, 'contract_type', mp.contract_type);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_build_steps(p_request uuid, p_attempt integer, res jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e jsonb; i int := 0; v_first jsonb := '{}'::jsonb; v_key text; v_grp int;
begin
  delete from cm_request_steps where request_id = p_request and attempt = p_attempt;
  for e in select x from jsonb_array_elements(res #> '{route,steps}') x loop
    i := i + 1; v_grp := i;
    if (e ->> 'pg') is not null then
      v_key := (e ->> 'route') || ':' || (e ->> 'pg');
      if jsonb_exists(v_first, v_key) then v_grp := (v_first ->> v_key)::int; else v_first := v_first || jsonb_build_object(v_key, i); end if;
    end if;
    insert into cm_request_steps (request_id, attempt, seq, group_no, kind, role_name, label, route_code, rule_codes, requires_reference, sla_days)
    values (p_request, p_attempt, i, v_grp, e ->> 'kind', e ->> 'role', coalesce(e ->> 'label', ''), coalesce(e ->> 'route', ''), array(select jsonb_array_elements_text(res -> 'applied_rules')), coalesce((e ->> 'requires_reference')::boolean, false), coalesce((e ->> 'sla_days')::int, 5));
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_cancel(p_request uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not (auth.uid() = r.created_by or cm_can_evaluate(r.master_project_id)) then raise exception 'not_authorized'; end if;
  if r.status not in ('draft', 'submitted', 'evaluating', 'awaiting_approval', 'returned', 'approved') then raise exception 'invalid_status'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update cm_request_steps set status = 'skipped' where request_id = p_request and status in ('active', 'waiting');
  update chg_change_requests set status = 'cancelled', cancel_reason = p_reason where id = p_request;
  perform cm_log(p_request, 'cancelled', p_reason);
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_clone_rule_set(p_set uuid, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s cm_rule_sets; v_new uuid; rt record; v_rt uuid; v_map jsonb := '{}'::jsonb; x record;
begin
  if not cm_can_manage_rules() then raise exception 'not_authorized'; end if;
  select * into s from cm_rule_sets where id = p_set;
  if s.id is null then raise exception 'ruleset_not_found'; end if;
  perform set_config('app.cm_rpc', '1', true);
  insert into cm_rule_sets (name, status, note, is_sample) values (coalesce(nullif(p_name, ''), s.name || ' — نسخهٔ جدید'), 'draft', s.note, false) returning id into v_new;
  for rt in select * from cm_routes where rule_set_id = p_set loop
    insert into cm_routes (rule_set_id, code, title, mode, level) values (v_new, rt.code, rt.title, rt.mode, rt.level) returning id into v_rt;
    v_map := v_map || jsonb_build_object(rt.id::text, v_rt);
    insert into cm_route_steps (route_id, seq, kind, role_name, label, parallel_group, sla_days, requires_reference) select v_rt, seq, kind, role_name, label, parallel_group, sla_days, requires_reference from cm_route_steps where route_id = rt.id;
  end loop;
  for x in select * from cm_rules where rule_set_id = p_set loop
    insert into cm_rules (rule_set_id, code, title, dimension, change_types, cost_basis, pct_min, pct_max, amount_min, amount_max, days_basis, days_min, days_max, days_pct_min, days_pct_max, contract_types, project_ids, org_units, requires_opinions, route_id, priority, active, valid_from, valid_to, escalate_after_days, escalation_role, notes)
    values (v_new, x.code, x.title, x.dimension, x.change_types, x.cost_basis, x.pct_min, x.pct_max, x.amount_min, x.amount_max, x.days_basis, x.days_min, x.days_max, x.days_pct_min, x.days_pct_max, x.contract_types, x.project_ids, x.org_units, x.requires_opinions, (v_map ->> x.route_id::text)::uuid, x.priority, x.active, x.valid_from, x.valid_to, x.escalate_after_days, x.escalation_role, x.notes);
  end loop;
  return v_new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_close(p_request uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_evaluate(r.master_project_id) then raise exception 'not_authorized'; end if;
  if r.status <> 'implemented' then raise exception 'invalid_status'; end if;
  if r.approved_at is null then raise exception 'approval_pending'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status = 'closed', closed_at = now() where id = p_request;
  perform cm_log(p_request, 'closed', coalesce(p_note, ''));
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_comment(p_request uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p uuid;
begin
  select master_project_id into v_p from chg_change_requests where id = p_request;
  if v_p is null or not cm_can_view(v_p) then raise exception 'not_authorized'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 then raise exception 'text_required'; end if;
  perform cm_log(p_request, 'comment', p_text);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_complete_evaluation(p_request uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; res jsonb; v_set uuid;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_evaluate(r.master_project_id) then raise exception 'not_authorized'; end if;
  if r.status <> 'evaluating' then raise exception 'invalid_status'; end if;
  perform set_config('app.cm_rpc', '1', true);
  res := cm_resolve_core(r);
  v_set := nullif(res #>> '{rule_set,id}', '')::uuid;
  update chg_change_requests set evaluation_note = coalesce(nullif(p_note, ''), evaluation_note), base_amount = nullif(res #>> '{basis,base_amount}', '')::numeric, cum_prev_amount = nullif(res #>> '{basis,cum_prev_amount}', '')::numeric,
         cum_prev_days = nullif(res #>> '{basis,cum_prev_days}', '')::int, rule_set_id = v_set, route_snapshot = res where id = p_request;
  if res ->> 'status' = 'blocked' then
    update chg_change_requests set route_status = 'blocked', route_blockers = res -> 'blockers' where id = p_request;
    perform cm_log(p_request, 'route_blocked', (select string_agg(b ->> 'message', ' | ') from jsonb_array_elements(res -> 'blockers') b));
    return res;
  end if;
  perform cm_build_steps(p_request, r.attempt, res);
  perform cm_activate_next(p_request, r.attempt);
  update chg_change_requests set status = 'awaiting_approval', route_status = 'resolved', route_blockers = '[]'::jsonb, evaluation_completed_at = now() where id = p_request;
  perform cm_log(p_request, 'route_resolved', coalesce(res #>> '{route,reason}', ''));
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_create_from_source(p_type text, p_target uuid, p_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_master uuid; v_title text; v_desc text; v_id uuid; v_existing uuid; v_src_module text;
begin
  if p_type not in ('risk', 'issue') then raise exception 'invalid_target'; end if;
  select l.request_id into v_existing from cm_links l join chg_change_requests c on c.id = l.request_id where l.target_type = p_type and l.target_id = p_target and l.relation = 'caused_by' and c.status <> 'cancelled' order by l.created_at limit 1;
  if v_existing is not null then return jsonb_build_object('id', v_existing, 'created', false); end if;
  if p_type = 'risk' then
    select m.master_project_id, k.title, coalesce(k.description, '') into v_master, v_title, v_desc from rm_risks k join rasta_project_mappings m on m.source_module = 'risk' and m.source_project_id = k.project_id and m.status = 'confirmed' where k.id = p_target limit 1;
  else
    select m.master_project_id, k.title, coalesce(k.description, '') into v_master, v_title, v_desc from im_issues k join rasta_project_mappings m on m.source_module = 'issues' and m.source_project_id = k.project_id and m.status = 'confirmed' where k.id = p_target limit 1;
  end if;
  if v_master is null then raise exception 'target_not_found'; end if;
  if not cm_can_submit(v_master) then raise exception 'not_authorized'; end if;
  insert into chg_change_requests (master_project_id, title, description, reason_for_change, created_by) values (v_master, coalesce(nullif(p_title, ''), 'تغییر پیشنهادی: ' || v_title), v_desc, 'پیشنهاد شده از ' || case when p_type = 'risk' then 'ریسک' else 'مسئله' end || ': ' || v_title, auth.uid()) returning id into v_id;
  perform cm_link(v_id, p_type, p_target, 'caused_by', 'manual');
  return jsonb_build_object('id', v_id, 'created', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_create_issue(p_request uuid, p_title text, p_description text DEFAULT ''::text, p_severity text DEFAULT 'medium'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v jsonb;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_submit(r.master_project_id) then raise exception 'not_authorized'; end if;
  if length(trim(coalesce(p_title, ''))) < 4 then raise exception 'title_required'; end if;
  v := im_ingest_issue('api', 'change_mgmt', p_request::text || ':issue:' || md5(lower(trim(p_title))), r.master_project_id,
        jsonb_build_object('title', p_title, 'description', coalesce(p_description, '') || ' — منبع: درخواست تغییر ' || r.cr_number, 'severity', coalesce(p_severity, 'medium'), 'priority', coalesce(p_severity, 'medium'),
          'snapshot', jsonb_build_object('change_id', p_request, 'cr_number', r.cr_number)));
  perform cm_link(p_request, 'issue', (v ->> 'id')::uuid, 'raises', 'manual');
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_create_risk(p_request uuid, p_title text, p_event text DEFAULT ''::text, p_probability integer DEFAULT 3, p_impact integer DEFAULT 3, p_category text DEFAULT 'other'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v jsonb;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_submit(r.master_project_id) then raise exception 'not_authorized'; end if;
  if length(trim(coalesce(p_title, ''))) < 4 then raise exception 'title_required'; end if;
  v := rm_ingest_risk('api', 'change_mgmt', p_request::text || ':risk:' || md5(lower(trim(p_title))), r.master_project_id,
        jsonb_build_object('title', p_title, 'description', 'ناشی از درخواست تغییر ' || r.cr_number || ' — ' || r.title, 'risk_event', coalesce(p_event, ''), 'category', coalesce(p_category, 'other'),
          'probability', p_probability, 'impact', p_impact, 'snapshot', jsonb_build_object('change_id', p_request, 'cr_number', r.cr_number)));
  perform cm_link(p_request, 'risk', (v ->> 'id')::uuid, 'raises', 'manual');
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_decide_exception(p_id uuid, p_authorise boolean, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare x cm_exceptions; r chg_change_requests;
begin
  select * into x from cm_exceptions where id = p_id for update;
  if x.id is null then raise exception 'exception_not_found'; end if;
  select * into r from chg_change_requests where id = x.request_id;
  if x.status <> 'requested' then raise exception 'invalid_status'; end if;
  if not (is_admin_user() or cm_has_role(r.master_project_id, array['مدیرعامل', 'مدیر ارشد پروژه'])) then raise exception 'not_authorized'; end if;
  if auth.uid() = x.requested_by then raise exception 'self_approval_forbidden'; end if;
  if not p_authorise and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'reason_required'; end if;
  update cm_exceptions set status = case when p_authorise then 'authorised' else 'refused' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id;
  perform cm_log(x.request_id, case when p_authorise then 'exception_authorised' else 'exception_refused' end, coalesce(p_note, ''));
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_decide_step(p_step uuid, p_decision text, p_opinion text DEFAULT ''::text, p_ref_no text DEFAULT ''::text, p_ref_date date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric, p_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s cm_request_steps; r chg_change_requests; v_admin boolean := is_admin_user(); v_role boolean; lim cm_authority_limits; b jsonb; v_final boolean := false; v_name text;
begin
  select * into s from cm_request_steps where id = p_step for update;
  if s.id is null then raise exception 'step_not_found'; end if;
  select * into r from chg_change_requests where id = s.request_id for update;
  if s.status <> 'active' then raise exception 'step_not_active'; end if;
  if s.attempt <> r.attempt then raise exception 'step_outdated'; end if;
  if not (r.status = 'awaiting_approval' or (r.status = 'implementing' and r.executed_under_exception and r.approved_at is null)) then raise exception 'invalid_status'; end if;
  v_role := cm_has_role(r.master_project_id, array[s.role_name]);
  if not (v_role or v_admin) then raise exception 'not_authorized_for_step'; end if;
  if auth.uid() = r.created_by or auth.uid() = r.submitted_by then raise exception 'self_approval_forbidden'; end if;
  if p_decision not in ('approve', 'reject', 'return') then raise exception 'invalid_decision'; end if;
  if p_decision in ('reject', 'return') and length(trim(coalesce(p_opinion, ''))) < 3 then raise exception 'reason_required'; end if;
  if p_decision = 'reject' and s.kind = 'opinion' then raise exception 'opinion_cannot_reject'; end if;
  if p_decision = 'approve' and s.requires_reference and length(trim(coalesce(p_ref_no, ''))) = 0 then raise exception 'reference_required'; end if;
  b := coalesce(r.route_snapshot -> 'basis', '{}'::jsonb);
  if p_decision = 'approve' and s.kind in ('approval', 'body') and v_role then
    select * into lim from cm_authority_limits where role_name = s.role_name and active and (valid_from is null or valid_from <= current_date) and (valid_to is null or valid_to >= current_date) order by coalesce(max_cost_pct, 1000000) limit 1;
    if lim.id is not null and ((lim.max_cost_pct is not null and coalesce((b ->> 'cum_pct')::numeric, 0) > lim.max_cost_pct)
        or (lim.max_cost_amount is not null and coalesce((b ->> 'cum_amount')::numeric, 0) > lim.max_cost_amount)
        or (lim.max_days is not null and coalesce((b ->> 'cum_days')::numeric, 0) > lim.max_days)) then
      raise exception 'beyond_authority_limit';
    end if;
  end if;
  if p_amount is not null and abs(p_amount) > abs(coalesce(r.proposed_change_amount, 0)) then raise exception 'approved_exceeds_requested'; end if;
  if p_days is not null and abs(p_days) > abs(coalesce(r.proposed_schedule_impact_days, 0)) then raise exception 'approved_exceeds_requested'; end if;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  perform set_config('app.cm_rpc', '1', true);
  update cm_request_steps set status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end, opinion = coalesce(p_opinion, ''), reference_no = coalesce(p_ref_no, ''), reference_date = p_ref_date,
         decided_by = auth.uid(), decided_by_name = v_name, decided_as_admin = (v_admin and not v_role), decided_at = now() where id = p_step;
  if p_decision = 'approve' then
    if not exists (select 1 from cm_request_steps where request_id = r.id and attempt = r.attempt and group_no = s.group_no and status in ('active', 'waiting') and id <> p_step) then
      if not cm_activate_next(r.id, r.attempt) then v_final := true; end if;
    end if;
    if v_final then
      update chg_change_requests set status = case when r.status = 'implementing' then 'implementing' else 'approved' end, approved_at = now(), decision_note = coalesce(p_opinion, ''),
             approved_change_amount = coalesce(p_amount, r.proposed_change_amount, 0), approved_schedule_impact_days = coalesce(p_days, r.proposed_schedule_impact_days, 0) where id = r.id;
    end if;
    perform cm_log(r.id, case when v_final then 'approved' else 'step_approved' end, s.label || ': ' || coalesce(p_opinion, ''));
  else
    update cm_request_steps set status = 'skipped' where request_id = r.id and attempt = r.attempt and status in ('active', 'waiting');
    update chg_change_requests set status = case p_decision when 'reject' then 'rejected' else 'returned' end, decision_note = p_opinion where id = r.id;
    perform cm_log(r.id, case p_decision when 'reject' then 'rejected' else 'returned' end, s.label || ': ' || p_opinion);
  end if;
  return jsonb_build_object('ok', true, 'final', v_final);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_link(p_request uuid, p_type text, p_target uuid, p_relation text DEFAULT 'related'::text, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v_label text; v_id uuid;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_submit(r.master_project_id) then raise exception 'not_authorized'; end if;
  if p_type not in ('risk', 'issue') then raise exception 'invalid_target'; end if;
  if p_type = 'risk' then
    select coalesce(code, '') || ' ' || title into v_label from rm_risks where id = p_target;
    if v_label is null then raise exception 'target_not_found'; end if;
    insert into rm_risk_links (risk_id, target_type, target_id, target_label, relation, created_by) values (p_target, 'change', p_request::text, r.cr_number || ' ' || r.title, 'related', auth.uid()) on conflict do nothing;
  else
    select coalesce(code, '') || ' ' || title into v_label from im_issues where id = p_target;
    if v_label is null then raise exception 'target_not_found'; end if;
    insert into im_issue_links (issue_id, target_type, target_id, target_label, relation, link_status, created_by) values (p_target, 'change', p_request::text, r.cr_number || ' ' || r.title, 'relates', 'confirmed', auth.uid()) on conflict do nothing;
  end if;
  insert into cm_links (request_id, target_type, target_id, target_label, relation, source) values (p_request, p_type, p_target, v_label, coalesce(p_relation, 'related'), coalesce(p_source, 'manual'))
    on conflict (request_id, target_type, target_id) do update set relation = excluded.relation returning id into v_id;
  perform cm_log(p_request, 'linked_' || p_type, v_label);
  return jsonb_build_object('id', v_id, 'label', v_label);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_log(p_req uuid, p_action text, p_comment text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p uuid;
begin
  select master_project_id into v_p from chg_change_requests where id = p_req;
  insert into chg_history (change_request_id, user_id, role_label, action, comment) values (p_req, auth.uid(), coalesce(nullif(array_to_string(cm_roles_in(v_p), '، '), ''), case when is_admin_user() then 'مدیر سامانه' else '' end), p_action, coalesce(p_comment, ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_my_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null then return v; end if;
  -- 1) steps waiting for a role I hold in that project (overdue -> warn)
  for r in
    select s.id, s.label, s.role_name, s.due_at, s.entered_at, c.id as req_id, c.cr_number, c.title
      from cm_request_steps s join chg_change_requests c on c.id = s.request_id and c.attempt = s.attempt
     where s.status = 'active' and c.status in ('awaiting_approval', 'implementing') and auth.uid() is distinct from c.created_by and auth.uid() is distinct from c.submitted_by
       and (is_admin_user() or s.role_name = any (cm_roles_in(c.master_project_id)))
     order by s.due_at nulls last limit 30
  loop
    v := v || jsonb_build_object('id', 'cm-' || r.id, 'source', 'change', 'module', 'change', 'severity', case when r.due_at < now() then 'warn' else 'action' end, 'title', r.cr_number || ' · ' || r.title,
      'body', case when r.due_at < now() then 'مهلت تصمیم‌گیری گذشته است: ' || coalesce(nullif(r.label, ''), r.role_name) else 'درخواست تغییر منتظر تصمیم شماست: ' || coalesce(nullif(r.label, ''), r.role_name) end, 'recordId', r.req_id, 'at', coalesce(r.entered_at, now()));
  end loop;
  -- 2) escalation: the step has been waiting longer than the rule's escalate_after_days and I hold the escalation role
  for r in
    select s.id, s.role_name, c.id as req_id, c.cr_number, c.title, s.entered_at, c.route_snapshot ->> 'escalation_role' as esc_role
      from cm_request_steps s join chg_change_requests c on c.id = s.request_id and c.attempt = s.attempt
     where s.status = 'active' and c.status = 'awaiting_approval' and (c.route_snapshot ->> 'escalate_after_days') is not null
       and s.entered_at < now() - make_interval(days => (c.route_snapshot ->> 'escalate_after_days')::int)
       and (c.route_snapshot ->> 'escalation_role') = any (cm_roles_in(c.master_project_id)) limit 20
  loop
    v := v || jsonb_build_object('id', 'cme-' || r.id, 'source', 'change', 'module', 'change', 'severity', 'warn', 'title', r.cr_number || ' · ' || r.title, 'body', 'تشدید: تصمیم مرجع «' || r.role_name || '» از حد مجاز معطل مانده است', 'recordId', r.req_id, 'at', r.entered_at);
  end loop;
  -- 3) my own requests that moved
  for r in
    select c.id, c.cr_number, c.title, c.status, c.updated_at from chg_change_requests c
     where (c.created_by = auth.uid() or c.submitted_by = auth.uid()) and c.status in ('returned', 'approved', 'rejected') and c.updated_at > now() - interval '14 days' order by c.updated_at desc limit 15
  loop
    v := v || jsonb_build_object('id', 'cmr-' || r.id, 'source', 'change', 'module', 'change', 'severity', case when r.status = 'approved' then 'info' else 'action' end, 'title', r.cr_number || ' · ' || r.title,
      'body', case r.status when 'returned' then 'درخواست تغییر عودت داده شد؛ اصلاح و ارسال دوباره' when 'approved' then 'درخواست تغییر تصویب شد' else 'درخواست تغییر رد شد' end, 'recordId', r.id, 'at', r.updated_at);
  end loop;
  -- 4) blocked routes need a rule manager
  if cm_can_manage_rules() then
    for r in select c.id, c.cr_number, c.title, c.stage_entered_at from chg_change_requests c where c.status = 'evaluating' and c.route_status = 'blocked' order by c.stage_entered_at limit 10 loop
      v := v || jsonb_build_object('id', 'cmb-' || r.id, 'source', 'change', 'module', 'change', 'severity', 'warn', 'title', r.cr_number || ' · ' || r.title, 'body', 'مسیر تصویب تعیین نشد؛ قواعد را اصلاح کنید', 'recordId', r.id, 'at', r.stage_entered_at);
    end loop;
  end if;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_record_result(p_request uuid, p_actual_cost numeric, p_actual_days integer, p_as_approved boolean, p_note text DEFAULT ''::text, p_docs_updated boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v_over_c boolean; v_over_d boolean; v_as boolean;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not (cm_can_evaluate(r.master_project_id) or auth.uid() = r.implementation_owner_id) then raise exception 'not_authorized'; end if;
  if r.status <> 'implementing' then raise exception 'invalid_status'; end if;
  v_over_c := abs(coalesce(p_actual_cost, 0)) > abs(coalesce(r.approved_change_amount, r.proposed_change_amount, 0));
  v_over_d := abs(coalesce(p_actual_days, 0)) > abs(coalesce(r.approved_schedule_impact_days, r.proposed_schedule_impact_days, 0));
  v_as := coalesce(p_as_approved, true) and not v_over_c and not v_over_d;
  if not v_as and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'deviation_note_required'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status = 'implemented', actual_cost_amount = p_actual_cost, actual_delay_days = p_actual_days, implemented_as_approved = v_as, result_note = coalesce(p_note, ''), documents_updated = coalesce(p_docs_updated, false), result_recorded_at = now() where id = p_request;
  perform cm_log(p_request, case when v_as then 'implemented' else 'implemented_with_deviation' end, coalesce(p_note, ''));
  return jsonb_build_object('ok', true, 'as_approved', v_as, 'over_cost', v_over_c, 'over_days', v_over_d);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_remove_link(p_link uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (delete from cm_links where id = p_link and cm_can_submit((select c.master_project_id from chg_change_requests c where c.id = request_id)) returning *),
  r as (delete from rm_risk_links x using d where d.target_type = 'risk' and x.risk_id = d.target_id and x.target_type = 'change' and x.target_id = d.request_id::text returning 1),
  i as (delete from im_issue_links x using d where d.target_type = 'issue' and x.issue_id = d.target_id and x.target_type = 'change' and x.target_id = d.request_id::text returning 1)
  select cm_log(d.request_id, 'unlinked_' || d.target_type, d.target_label) from d;
$function$
;

CREATE OR REPLACE FUNCTION public.cm_request_exception(p_request uuid, p_justification text, p_evidence text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v_id uuid;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_evaluate(r.master_project_id) then raise exception 'not_authorized'; end if;
  if r.status not in ('evaluating', 'awaiting_approval') then raise exception 'invalid_status'; end if;
  if length(trim(coalesce(p_justification, ''))) < 10 then raise exception 'justification_required'; end if;
  if length(trim(coalesce(p_evidence, ''))) < 3 then raise exception 'evidence_required'; end if;
  if exists (select 1 from cm_exceptions where request_id = p_request and status = 'requested') then raise exception 'exception_pending'; end if;
  insert into cm_exceptions (request_id, justification, evidence_ref) values (p_request, p_justification, p_evidence) returning id into v_id;
  perform cm_log(p_request, 'exception_requested', p_justification);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_resolve(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_view(r.master_project_id) then raise exception 'not_authorized'; end if;
  return cm_resolve_core(r);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_resolve_core(r chg_change_requests, p_set uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set cm_rule_sets; b jsonb; v_today date := current_date; d text; v_dims jsonb := '[]'; v_block jsonb := '[]'; v_matches jsonb; v_top int; v_top_routes uuid[]; v_chosen uuid[] := '{}'::uuid[];
  v_cost numeric := coalesce(r.proposed_change_amount, 0); v_days int := coalesce(r.proposed_schedule_impact_days, 0); v_applicable boolean; m jsonb; v_cover uuid; v_cand uuid; v_ok boolean; o uuid;
  v_codes text[] := '{}'; v_opinions text[] := '{}'; v_esc int; v_esc_role text; v_steps jsonb; v_route jsonb; v_reason text; v_combined boolean := false; v_ctype text;
  v_base numeric; v_dur numeric; v_cum_pct numeric; v_cur_pct numeric; v_cum_a numeric; v_cum_dp numeric; v_cur_dp numeric; v_cum_d numeric;
begin
  b := cm_basis(r);
  v_ctype := r.change_type;
  if p_set is null then select * into v_set from cm_rule_sets where status = 'active' and (effective_from is null or effective_from <= v_today) and (effective_to is null or effective_to >= v_today) limit 1;
  else select * into v_set from cm_rule_sets where id = p_set; end if;
  if v_set.id is null then
    return jsonb_build_object('status', 'blocked', 'basis', b, 'dimensions', '[]'::jsonb, 'blockers', jsonb_build_array(jsonb_build_object('code', 'no_active_rule_set', 'message', 'هیچ مجموعه قاعدهٔ فعالی تعریف نشده است؛ مدیر سامانه باید قواعد تصویب را فعال کند.')));
  end if;
  if v_ctype is null then v_block := v_block || jsonb_build_object('code', 'no_type', 'message', 'نوع تغییر مشخص نشده است.'); end if;
  v_base := (b ->> 'base_amount')::numeric; v_dur := (b ->> 'duration_days')::numeric;
  v_cum_pct := (b ->> 'cum_pct')::numeric; v_cur_pct := (b ->> 'current_pct')::numeric; v_cum_a := (b ->> 'cum_amount')::numeric;
  v_cum_dp := (b ->> 'cum_days_pct')::numeric; v_cur_dp := (b ->> 'current_days_pct')::numeric; v_cum_d := (b ->> 'cum_days')::numeric;
  if v_cost <> 0 and coalesce(v_base, 0) <= 0 then v_block := v_block || jsonb_build_object('code', 'no_base_amount', 'dimension', 'cost', 'message', 'مبلغ پایهٔ قرارداد مشخص نیست؛ درصد تغییر قابل محاسبه نیست. قرارداد یا مبلغ اولیهٔ پروژه را در داده‌های پایه ثبت کنید.'); end if;

  foreach d in array array['cost', 'time', 'type'] loop
    v_applicable := case d when 'cost' then v_cost <> 0 when 'time' then v_days <> 0 else true end;
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'title', x.title, 'priority', x.priority, 'route_id', x.route_id, 'route', rt.code, 'opinions', to_jsonb(x.requires_opinions), 'esc_days', x.escalate_after_days, 'esc_role', x.escalation_role) order by x.priority desc, x.code), '[]'::jsonb)
      into v_matches
      from cm_rules x join cm_routes rt on rt.id = x.route_id
     where x.rule_set_id = v_set.id and x.active and x.dimension = d and (x.valid_from is null or x.valid_from <= v_today) and (x.valid_to is null or x.valid_to >= v_today)
       and (cardinality(x.change_types) = 0 or v_ctype = any (x.change_types)) and (cardinality(x.project_ids) = 0 or r.master_project_id = any (x.project_ids))
       and (cardinality(x.org_units) = 0 or r.org_unit = any (x.org_units)) and (cardinality(x.contract_types) = 0 or (b ->> 'contract_type') = any (x.contract_types))
       and v_applicable
       and (d = 'type'
         or (d = 'cost' and (x.pct_min is null and x.pct_max is null or v_cur_pct is not null)
             and (x.pct_min is null or (case x.cost_basis when 'current' then v_cur_pct else v_cum_pct end) > x.pct_min) and (x.pct_max is null or (case x.cost_basis when 'current' then v_cur_pct else v_cum_pct end) <= x.pct_max)
             and (x.amount_min is null or (case x.cost_basis when 'current' then abs(v_cost) else v_cum_a end) > x.amount_min) and (x.amount_max is null or (case x.cost_basis when 'current' then abs(v_cost) else v_cum_a end) <= x.amount_max))
         or (d = 'time' and (x.days_pct_min is null and x.days_pct_max is null or v_cur_dp is not null)
             and (x.days_min is null or (case x.days_basis when 'current' then abs(v_days) else v_cum_d end) > x.days_min) and (x.days_max is null or (case x.days_basis when 'current' then abs(v_days) else v_cum_d end) <= x.days_max)
             and (x.days_pct_min is null or (case x.days_basis when 'current' then v_cur_dp else v_cum_dp end) > x.days_pct_min) and (x.days_pct_max is null or (case x.days_basis when 'current' then v_cur_dp else v_cum_dp end) <= x.days_pct_max)));
    if jsonb_array_length(v_matches) = 0 then
      v_dims := v_dims || jsonb_build_object('dimension', d, 'applicable', v_applicable, 'matched', '[]'::jsonb, 'chosen', null);
      if v_applicable and d <> 'type' and not (d = 'cost' and coalesce(v_base, 0) <= 0) then
        v_block := v_block || jsonb_build_object('code', 'no_rule', 'dimension', d, 'message', case d when 'cost' then format('هیچ قاعدهٔ تصویب برای تغییر هزینه‌ای با %s٪ تجمعی (%s٪ جاری) تعریف نشده است؛ مسیر تصویب حدسی انتخاب نمی‌شود.', coalesce(v_cum_pct::text, '؟'), coalesce(v_cur_pct::text, '؟'))
                                                                                 else format('هیچ قاعدهٔ تصویب برای تغییر زمانی با %s روز تجمعی تعریف نشده است؛ مسیر تصویب حدسی انتخاب نمی‌شود.', v_cum_d::int) end);
      end if;
      continue;
    end if;
    v_top := (v_matches -> 0 ->> 'priority')::int;
    select array_agg(distinct (e ->> 'route_id')::uuid) into v_top_routes from jsonb_array_elements(v_matches) e where (e ->> 'priority')::int = v_top;
    v_cover := null;
    if cardinality(v_top_routes) = 1 then v_cover := v_top_routes[1];
    else
      foreach v_cand in array v_top_routes loop
        v_ok := true;
        foreach o in array v_top_routes loop if not (cm_route_roles(o) <@ cm_route_roles(v_cand)) then v_ok := false; end if; end loop;
        if v_ok then v_cover := v_cand; exit; end if;
      end loop;
    end if;
    if v_cover is null then
      v_block := v_block || jsonb_build_object('code', 'conflict', 'dimension', d, 'message', format('تعارض قواعد: چند قاعدهٔ هم‌اولویت (%s) با مسیرهای ناهمخوان برای بُعد «%s» اعمال می‌شوند؛ مدیر سامانه باید اولویت یا بازه‌ها را اصلاح کند.',
        (select string_agg(e ->> 'code', '، ') from jsonb_array_elements(v_matches) e where (e ->> 'priority')::int = v_top), case d when 'cost' then 'هزینه' when 'time' then 'زمان' else 'نوع تغییر' end));
      v_dims := v_dims || jsonb_build_object('dimension', d, 'applicable', true, 'matched', v_matches, 'chosen', null);
    else
      v_chosen := v_chosen || v_cover;
      for m in select e from jsonb_array_elements(v_matches) e where (e ->> 'priority')::int = v_top loop
        v_codes := v_codes || (m ->> 'code');
        v_opinions := v_opinions || coalesce(array(select jsonb_array_elements_text(m -> 'opinions')), '{}');
        if (m ->> 'esc_days') is not null then v_esc := least(coalesce(v_esc, 1000000), (m ->> 'esc_days')::int); v_esc_role := coalesce(v_esc_role, m ->> 'esc_role'); end if;
      end loop;
      v_dims := v_dims || jsonb_build_object('dimension', d, 'applicable', true, 'matched', v_matches, 'chosen', jsonb_build_object('route_id', v_cover, 'route', (select code from cm_routes where id = v_cover)));
    end if;
  end loop;

  if cardinality(v_chosen) = 0 and jsonb_array_length(v_block) = 0 then
    v_block := v_block || jsonb_build_object('code', 'no_rule', 'dimension', 'any', 'message', 'برای این تغییر هیچ قاعدهٔ تصویبی اعمال نمی‌شود (مبلغ و زمان صفر و بدون قاعدهٔ نوع)؛ مسیر حدسی انتخاب نمی‌شود.');
  end if;
  if jsonb_array_length(v_block) > 0 then
    return jsonb_build_object('status', 'blocked', 'rule_set', jsonb_build_object('id', v_set.id, 'version', v_set.version, 'name', v_set.name), 'basis', b, 'dimensions', v_dims, 'blockers', v_block);
  end if;

  select array_agg(distinct x) into v_chosen from unnest(v_chosen) x;
  v_cover := null;
  foreach v_cand in array v_chosen loop
    v_ok := true;
    foreach o in array v_chosen loop if not (cm_route_roles(o) <@ cm_route_roles(v_cand)) then v_ok := false; end if; end loop;
    if v_ok and (v_cover is null or (select level from cm_routes where id = v_cand) > (select level from cm_routes where id = v_cover)) then v_cover := v_cand; end if;
  end loop;
  if v_cover is not null then
    select jsonb_agg(jsonb_build_object('kind', s.kind, 'role', s.role_name, 'label', s.label, 'sla_days', s.sla_days, 'requires_reference', s.requires_reference, 'route', rt.code, 'pg', s.parallel_group) order by s.seq)
      into v_steps
      from cm_route_steps s join cm_routes rt on rt.id = s.route_id where rt.id = v_cover;
    select jsonb_build_object('code', rt.code, 'title', rt.title, 'mode', rt.mode, 'level', rt.level) into v_route from cm_routes rt where rt.id = v_cover;
    v_reason := case when cardinality(v_chosen) > 1 then format('مسیر «%s» همهٔ الزامات مسیرهای هزینه/زمان/نوع را پوشش می‌دهد و انتخاب شد.', v_route ->> 'title') else format('مسیر «%s» طبق قواعد %s انتخاب شد.', v_route ->> 'title', array_to_string(v_codes, '، ')) end;
  else
    v_combined := true;
    with raw as (
      select s.kind, s.role_name, s.label, s.sla_days, s.requires_reference, rt.code route, rt.level, s.seq, s.parallel_group,
             case s.kind when 'opinion' then 1 when 'approval' then 2 else 3 end kr
        from cm_route_steps s join cm_routes rt on rt.id = s.route_id where rt.id = any (v_chosen)),
    ranked as (select *, row_number() over (partition by role_name order by kr desc, level desc, seq) rn from raw)
    select jsonb_agg(jsonb_build_object('kind', kind, 'role', role_name, 'label', label, 'sla_days', sla_days, 'requires_reference', requires_reference, 'route', route, 'pg', null) order by kr, level, seq)
      into v_steps from ranked where rn = 1;
    v_route := jsonb_build_object('code', (select string_agg(code, '+' order by level, code) from cm_routes where id = any (v_chosen)), 'title', 'مسیر ترکیبی: ' || (select string_agg(title, ' + ' order by level, code) from cm_routes where id = any (v_chosen)),
      'mode', 'sequential', 'level', (select max(level) from cm_routes where id = any (v_chosen)));
    v_reason := format('هیچ‌یک از مسیرهای انتخاب‌شده (%s) به‌تنهایی همهٔ مراجع لازم را پوشش نمی‌دهد؛ مراحل ادغام شد (قواعد: %s).', (select string_agg(code, '، ' order by level, code) from cm_routes where id = any (v_chosen)), array_to_string(v_codes, '، '));
  end if;
  for m in select distinct jsonb_build_object('role', x) from unnest(v_opinions) x where x not in (select e ->> 'role' from jsonb_array_elements(v_steps) e) loop
    v_steps := jsonb_build_array(jsonb_build_object('kind', 'opinion', 'role', m ->> 'role', 'label', 'نظر تخصصی الزامی (طبق قاعده)', 'sla_days', 5, 'requires_reference', false, 'route', 'rule', 'pg', null)) || v_steps;
  end loop;
  if v_steps is null or jsonb_array_length(v_steps) = 0 then
    return jsonb_build_object('status', 'blocked', 'rule_set', jsonb_build_object('id', v_set.id, 'version', v_set.version, 'name', v_set.name), 'basis', b, 'dimensions', v_dims,
      'blockers', jsonb_build_array(jsonb_build_object('code', 'empty_route', 'message', 'مسیر انتخاب‌شده هیچ مرحله‌ای ندارد؛ تعریف مسیر ناقص است.')));
  end if;
  return jsonb_build_object('status', 'resolved', 'rule_set', jsonb_build_object('id', v_set.id, 'version', v_set.version, 'name', v_set.name), 'basis', b, 'dimensions', v_dims, 'blockers', '[]'::jsonb,
    'route', v_route || jsonb_build_object('combined', v_combined, 'steps', v_steps, 'reason', v_reason), 'applied_rules', to_jsonb(v_codes), 'escalate_after_days', v_esc, 'escalation_role', v_esc_role, 'resolved_at', now());
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_route_roles(p_route uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct role_name), '{}'::text[]) from cm_route_steps where route_id = p_route $function$
;

CREATE OR REPLACE FUNCTION public.cm_start_evaluation(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_evaluate(r.master_project_id) then raise exception 'not_authorized'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_status'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status = 'evaluating' where id = p_request;
  perform cm_log(p_request, 'evaluation_started', '');
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_start_implementation(p_request uuid, p_owner uuid, p_due date, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests; v_exc boolean := false;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_evaluate(r.master_project_id) then raise exception 'not_authorized'; end if;
  if p_owner is null or p_due is null then raise exception 'owner_and_due_required'; end if;
  if r.status = 'approved' and r.approved_at is not null then v_exc := false;
  elsif r.status = 'awaiting_approval' and exists (select 1 from cm_exceptions where request_id = p_request and status = 'authorised') then v_exc := true;
  else raise exception 'approval_required'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status = 'implementing', implementation_owner_id = p_owner, implementation_due = p_due, implementation_started_at = now(), executed_under_exception = v_exc where id = p_request;
  perform cm_log(p_request, case when v_exc then 'implementation_started_under_exception' else 'implementation_started' end, coalesce(p_note, ''));
  return jsonb_build_object('ok', true, 'exception', v_exc);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_submit(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_submit(r.master_project_id) then raise exception 'not_authorized'; end if;
  if r.status not in ('draft','returned') then raise exception 'invalid_status'; end if;
  if auth.uid() is distinct from r.created_by and not cm_can_evaluate(r.master_project_id) then raise exception 'not_owner'; end if;
  if length(trim(coalesce(r.title, ''))) < 3 then raise exception 'title_required'; end if;
  if length(trim(coalesce(r.description, ''))) < 3 then raise exception 'description_required'; end if;
  if length(trim(coalesce(r.reason_for_change, ''))) < 3 then raise exception 'reason_required'; end if;
  if r.change_type is null then raise exception 'type_required'; end if;
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status = 'submitted', submitted_by = auth.uid(), submitted_at = now(), route_status = 'none', route_snapshot = null, route_blockers = '[]'::jsonb, rule_set_id = null,
         evaluation_completed_at = null, attempt = case when r.status = 'returned' then r.attempt + 1 else r.attempt end where id = p_request;
  perform cm_log(p_request, case when r.status = 'returned' then 'resubmitted' else 'submitted' end, '');
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cm_validate_rule_set(p_set uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb := '[]'; a record; b record; v_lo numeric; v_hi numeric; v_mx numeric;
begin
  if not exists (select 1 from cm_rules where rule_set_id = p_set and active) then out := out || jsonb_build_object('level', 'error', 'code', 'no_rules', 'message', 'مجموعه هیچ قاعدهٔ فعالی ندارد.'); end if;
  for a in select rt.code, rt.title from cm_routes rt where rt.rule_set_id = p_set and not exists (select 1 from cm_route_steps s where s.route_id = rt.id) loop
    out := out || jsonb_build_object('level', 'error', 'code', 'empty_route', 'message', format('مسیر «%s» هیچ مرحله‌ای ندارد.', a.title));
  end loop;
  for a in select distinct s.role_name from cm_route_steps s join cm_routes rt on rt.id = s.route_id where rt.rule_set_id = p_set and s.kind <> 'body' and not exists (select 1 from rasta_project_roles pr where pr.name = s.role_name) loop
    out := out || jsonb_build_object('level', 'warn', 'code', 'unknown_role', 'message', format('نقش «%s» در مدیریت کاربران تعریف نشده است؛ هیچ‌کس نمی‌تواند این مرحله را تصمیم بگیرد.', a.role_name));
  end loop;
  for a in select x.id, x.code, x.dimension, x.priority, x.route_id, x.change_types, x.cost_basis, x.days_basis, x.pct_min, x.pct_max, x.days_min, x.days_max, x.days_pct_min, x.days_pct_max from cm_rules x where x.rule_set_id = p_set and x.active and x.dimension in ('cost', 'time') loop
    for b in select y.id, y.code, y.route_id, y.change_types, y.cost_basis, y.days_basis, y.pct_min, y.pct_max, y.days_min, y.days_max, y.days_pct_min, y.days_pct_max from cm_rules y
              where y.rule_set_id = p_set and y.active and y.dimension = a.dimension and y.priority = a.priority and y.id > a.id loop
      if (cardinality(a.change_types) = 0 or cardinality(b.change_types) = 0 or a.change_types && b.change_types) then
        if a.dimension = 'cost' and a.cost_basis = b.cost_basis then
          v_lo := greatest(coalesce(a.pct_min, -1e18), coalesce(b.pct_min, -1e18)); v_hi := least(coalesce(a.pct_max, 1e18), coalesce(b.pct_max, 1e18));
        elsif a.dimension = 'time' and a.days_basis = b.days_basis then
          v_lo := greatest(coalesce(a.days_min, -1e18), coalesce(b.days_min, -1e18)); v_hi := least(coalesce(a.days_max, 1e18), coalesce(b.days_max, 1e18));
        else v_lo := 1; v_hi := 0; end if;
        if v_lo < v_hi and not (cm_route_roles(a.route_id) <@ cm_route_roles(b.route_id) or cm_route_roles(b.route_id) <@ cm_route_roles(a.route_id)) then
          out := out || jsonb_build_object('level', 'error', 'code', 'overlap', 'message', format('قواعد %s و %s هم‌اولویت‌اند، بازه‌هایشان هم‌پوشانی دارد و مسیرهایشان ناهمخوان است.', a.code, b.code));
        end if;
      end if;
    end loop;
  end loop;
  for a in select dimension, cost_basis, days_basis from cm_rules where rule_set_id = p_set and active and dimension in ('cost', 'time') group by 1, 2, 3 loop
    if a.dimension = 'cost' then
      select max(pct_max) into v_mx from cm_rules where rule_set_id = p_set and active and dimension = 'cost' and cost_basis = a.cost_basis having bool_and(pct_max is not null);
      if v_mx is not null then out := out || jsonb_build_object('level', 'warn', 'code', 'open_above', 'message', format('بالاتر از %s٪ (مبنای %s) هیچ قاعدهٔ هزینه‌ای نیست؛ چنین درخواست‌هایی متوقف می‌شوند تا مدیر تعیین تکلیف کند.', v_mx, case a.cost_basis when 'cumulative' then 'تجمعی' else 'جاری' end)); end if;
    end if;
  end loop;
  return out;
end $function$
;
