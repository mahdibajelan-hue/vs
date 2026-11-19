-- Rollback of 046_statement_server_quantities.sql: restores the previous statement functions (live versions, identical to these) and removes the new helpers.
-- Run by hand in the SQL editor if 046 must be undone.
CREATE OR REPLACE FUNCTION public.ex_statement_create(p_project uuid, p_from date, p_to date, p_rows jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sid uuid; n int; ps uuid;
begin
  if not (ex_has_role(p_project, array['contractor','consultant','supervision','planner']) or ex_can_configure(p_project)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_to < p_from then raise exception 'invalid_period'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and period_from = p_from) then raise exception 'exists'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and status = 'draft') then raise exception 'draft_exists'; end if;
  select coalesce(max(no), 0) + 1 into n from ex_statements where project_id = p_project;
  insert into ex_statements (project_id, no, period_from, period_to) values (p_project, n, p_from, p_to) returning id into sid;
  ps := ex_statement_prev(sid);
  insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
  select sid, p_project, (e->>'activity_id')::uuid, coalesce((e->>'unit_price')::numeric, 0), coalesce((e->>'base_qty')::numeric, 0), coalesce((e->>'sys')::numeric, 0), coalesce((e->>'sys')::numeric, 0),
         coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
    from jsonb_array_elements(p_rows) e left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = (e->>'activity_id')::uuid;
  return sid;
end $function$
;

CREATE OR REPLACE FUNCTION public.ex_statement_refresh(p_stmt uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s ex_statements%rowtype; ps uuid; e jsonb;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not (ex_has_role(s.project_id, array['contractor','consultant','supervision','planner']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  ps := ex_statement_prev(p_stmt);
  for e in select * from jsonb_array_elements(p_rows) loop
    insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
    select p_stmt, s.project_id, (e->>'activity_id')::uuid, coalesce((e->>'unit_price')::numeric, 0), coalesce((e->>'base_qty')::numeric, 0), coalesce((e->>'sys')::numeric, 0), coalesce((e->>'sys')::numeric, 0),
           coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
      from (select 1) x left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = (e->>'activity_id')::uuid
    on conflict (statement_id, activity_id) do update set unit_price = excluded.unit_price, base_qty = excluded.base_qty, sys_cum = excluded.sys_cum,
      req_cum = case when ex_statement_rows.req_edited then ex_statement_rows.req_cum else excluded.sys_cum end, updated_by = auth.uid(), updated_at = now();
  end loop;
end $function$
;

drop function if exists public.ex_payable_basis(uuid, date);
drop function if exists public.ex_mult(jsonb, text);
