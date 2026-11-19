-- 046: the contract statement takes its quantities and rates from the database, not from the browser (audit finding C1, C2).
--
-- Before: ex_statement_create / ex_statement_refresh stored the «system» cumulative quantity, the rate and the contract quantity
-- exactly as the page sent them. A contractor could store any quantity or rate (end-to-end check S10: ×3 quantity, ×2 rate
-- accepted), and with the binding employer step the page sent supervision-approved quantities instead of the employer-confirmed
-- ones (S11: 1451 instead of 374).
--
-- After: ex_payable_basis(project, until) is the one place the statement basis is computed:
--   * lines of work reports that are submitted / partially approved / approved, line approved, report date ≤ until
--   * quantity = approved quantity; with employerStep = 'binding' only what the employer confirmed
--   * lines entered by ACTION are converted to their contract row by the project's rules (ex_action_map): the rule whose
--     condition matches beats the default rule; quantity × factor × the rule's multiplier fields (all must be > 0);
--     informational actions (billable = false) and lines without a rule are not counted — as resolveLines() does in the app
--   * rate and contract quantity in force on that date: the latest approved baseline version effective by then, else the row itself
-- The two statement functions keep their signature (the page keeps working unchanged); p_rows now only says WHICH rows the
-- statement has — its quantities and rates are ignored. Nothing else changes: contractor request / consultant opinion columns,
-- previous-statement carry-over and the finalize / reopen flow are as before.
--
-- Rollback: rollback/046_rollback.sql. Tested on the isolated test database (supabase/tests/execution_e2e, checks S10, S11).

-- product of the action's multiplier fields of one line; null when a listed field is missing or not > 0
create or replace function public.ex_mult(p_detail jsonb, p_fields text)
returns numeric language plpgsql immutable set search_path to 'public' as $f$
declare f text; v text; k numeric := 1;
begin
  foreach f in array string_to_array(coalesce(p_fields, ''), ',') loop
    f := btrim(f);
    if f = '' then continue; end if;
    v := btrim(coalesce(p_detail ->> f, ''));
    if v !~ '^[0-9]+(\.[0-9]+)?$' or v::numeric <= 0 then return null; end if;
    k := k * v::numeric;
  end loop;
  return k;
end $f$;

create or replace function public.ex_payable_basis(p_project uuid, p_until date)
returns table (activity_id uuid, sys_qty numeric, unit_price numeric, base_qty numeric, line_count int)
language plpgsql stable security definer set search_path to 'public' as $f$
declare binding boolean;
begin
  if not ex_can_view(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(values_json ->> 'employerStep', 'off') = 'binding' into binding from ex_settings where project_id = p_project;
  binding := coalesce(binding, false);
  return query
  with val as (
    select l.id, l.activity_id act, l.detail,
           case when binding then case when l.employer_status = 'approved' then coalesce(l.employer_qty, 0) else 0 end
                else coalesce(l.approved_qty, l.qty) end v
      from ex_report_lines l join ex_reports r on r.id = l.report_id
     where r.project_id = p_project and r.form_key = 'work' and r.status in ('submitted','partially_approved','approved')
       and l.status = 'approved' and r.report_date <= p_until
  ), parts as (
    select val.act, val.v from val where val.act is not null
    union all
    select m.activity_id, val.v * m.factor * k.k
      from val
      cross join lateral (select x.activity_id, x.factor, x.mult_fields from ex_action_map x
                           where x.project_id = p_project and x.action_key = val.detail ->> 'actionKey'
                             and (x.when_field = '' or btrim(coalesce(val.detail ->> x.when_field, '')) = x.when_value)
                           order by (x.when_field <> '') desc, x.created_at, x.id limit 1) m
      cross join lateral (select ex_mult(val.detail, m.mult_fields) k) k
     where val.act is null and coalesce(val.detail ->> 'actionKey', '') <> '' and k.k is not null
       and not exists (select 1 from ex_work_actions w where w.project_id = p_project and w.key = val.detail ->> 'actionKey' and w.billable = false)
  ), basis as (
    select parts.act, sum(parts.v) q, count(*)::int n from parts group by parts.act
  )
  select a.id, coalesce(b.q, 0), coalesce(bl.unit_price, a.unit_price), coalesce(bl.base_qty, a.base_qty), coalesce(b.n, 0)
    from ex_activities a
    left join basis b on b.act = a.id
    left join lateral (select x.unit_price, x.base_qty from ex_baseline_lines x join ex_baselines y on y.id = x.baseline_id
                        where y.project_id = p_project and y.status = 'approved' and y.effective_date <= p_until and x.activity_id = a.id
                        order by y.version desc limit 1) bl on true
   where a.project_id = p_project;
end $f$;

revoke all on function public.ex_payable_basis(uuid, date) from public, anon;
grant execute on function public.ex_payable_basis(uuid, date) to authenticated;

create or replace function public.ex_statement_create(p_project uuid, p_from date, p_to date, p_rows jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare sid uuid; n int; ps uuid;
begin
  if not (ex_has_role(p_project, array['contractor','consultant','supervision','planner']) or ex_can_configure(p_project)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_to < p_from then raise exception 'invalid_period'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and period_from = p_from) then raise exception 'exists'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and status = 'draft') then raise exception 'draft_exists'; end if;
  select coalesce(max(no), 0) + 1 into n from ex_statements where project_id = p_project;
  insert into ex_statements (project_id, no, period_from, period_to) values (p_project, n, p_from, p_to) returning id into sid;
  ps := ex_statement_prev(sid);
  -- p_rows only chooses the rows; quantity, rate and contract quantity come from ex_payable_basis
  insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
  select sid, p_project, b.activity_id, b.unit_price, b.base_qty, b.sys_qty, b.sys_qty, coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
    from ex_payable_basis(p_project, p_to) b
    join (select distinct (e ->> 'activity_id')::uuid aid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e) w on w.aid = b.activity_id
    left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = b.activity_id;
  return sid;
end $f$;

create or replace function public.ex_statement_refresh(p_stmt uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare s ex_statements%rowtype; ps uuid;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not (ex_has_role(s.project_id, array['contractor','consultant','supervision','planner']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  ps := ex_statement_prev(p_stmt);
  insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
  select p_stmt, s.project_id, b.activity_id, b.unit_price, b.base_qty, b.sys_qty, b.sys_qty, coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
    from ex_payable_basis(s.project_id, s.period_to) b
    join (select distinct (e ->> 'activity_id')::uuid aid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e) w on w.aid = b.activity_id
    left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = b.activity_id
  on conflict (statement_id, activity_id) do update set unit_price = excluded.unit_price, base_qty = excluded.base_qty, sys_cum = excluded.sys_cum,
    req_cum = case when ex_statement_rows.req_edited then ex_statement_rows.req_cum else excluded.sys_cum end, updated_by = auth.uid(), updated_at = now();
end $f$;
