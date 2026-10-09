-- Change Management v2 — rule engine (authoritative). Convention: lower bound EXCLUSIVE, upper bound INCLUSIVE ("up to 10%" = pct <= 10; "over 10 up to 25" = pct > 10 and <= 25).
create or replace function cm_route_roles(p_route uuid) returns text[] language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct role_name), '{}'::text[]) from cm_route_steps where route_id = p_route $$;

create or replace function cm_basis(r chg_change_requests) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_base numeric; v_dur int; v_src text := 'none'; v_dsrc text := 'none'; c fin_contracts; mp master_projects; v_cum_a numeric; v_cum_d int; v_pend numeric; v_cost numeric := coalesce(r.proposed_change_amount, 0); v_days int := coalesce(r.proposed_schedule_impact_days, 0);
  v_cp numeric; v_cmp numeric; v_dp numeric; v_cdp numeric;
begin
  select * into mp from master_projects where id = r.master_project_id;
  if r.contract_id is not null then select * into c from fin_contracts where id = r.contract_id; end if;
  -- the base comes from system data (contract, then project); a typed-in amount is only the last resort and is flagged
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
end $$;

create or replace function cm_resolve_core(r chg_change_requests, p_set uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_set cm_rule_sets; b jsonb; v_today date := current_date; d text; v_dims jsonb := '[]'; v_block jsonb := '[]'; v_matches jsonb; v_top int; v_top_routes uuid[]; v_chosen uuid[] := '{}'::uuid[];
  v_cost numeric := coalesce(r.proposed_change_amount, 0); v_days int := coalesce(r.proposed_schedule_impact_days, 0); v_applicable boolean; m jsonb; v_cover uuid; v_cand uuid; v_ok boolean; o uuid;
  v_codes text[] := '{}'; v_opinions text[] := '{}'; v_esc int; v_esc_role text; v_chosen_json jsonb; v_steps jsonb; v_route jsonb; v_reason text; v_combined boolean := false; v_ctype text;
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
        foreach o in array v_top_routes loop if cm_route_roles(o) <@ cm_route_roles(v_cand) then null; else v_ok := false; end if; end loop;
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

  -- combine the chosen routes: a route whose roles cover all the others wins; otherwise the steps are merged
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
  -- opinions demanded by matched rules that the route does not already contain
  for m in select distinct jsonb_build_object('role', x) from unnest(v_opinions) x where x not in (select e ->> 'role' from jsonb_array_elements(v_steps) e) loop
    v_steps := jsonb_build_array(jsonb_build_object('kind', 'opinion', 'role', m ->> 'role', 'label', 'نظر تخصصی الزامی (طبق قاعده)', 'sla_days', 5, 'requires_reference', false, 'route', 'rule', 'pg', null)) || v_steps;
  end loop;
  if v_steps is null or jsonb_array_length(v_steps) = 0 then
    return jsonb_build_object('status', 'blocked', 'rule_set', jsonb_build_object('id', v_set.id, 'version', v_set.version, 'name', v_set.name), 'basis', b, 'dimensions', v_dims,
      'blockers', jsonb_build_array(jsonb_build_object('code', 'empty_route', 'message', 'مسیر انتخاب‌شده هیچ مرحله‌ای ندارد؛ تعریف مسیر ناقص است.')));
  end if;
  return jsonb_build_object('status', 'resolved', 'rule_set', jsonb_build_object('id', v_set.id, 'version', v_set.version, 'name', v_set.name), 'basis', b, 'dimensions', v_dims, 'blockers', '[]'::jsonb,
    'route', v_route || jsonb_build_object('combined', v_combined, 'steps', v_steps, 'reason', v_reason), 'applied_rules', to_jsonb(v_codes), 'escalate_after_days', v_esc, 'escalation_role', v_esc_role, 'resolved_at', now());
end $$;

create or replace function cm_resolve(p_request uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r chg_change_requests;
begin
  select * into r from chg_change_requests where id = p_request;
  if r.id is null then raise exception 'request_not_found'; end if;
  if not cm_can_view(r.master_project_id) then raise exception 'not_authorized'; end if;
  return cm_resolve_core(r);
end $$;
grant execute on function cm_resolve(uuid) to authenticated;
revoke execute on function cm_resolve(uuid) from public, anon;
