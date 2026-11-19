-- Rollback of 047. Run by hand in the SQL editor if 047 must be undone.
CREATE OR REPLACE FUNCTION public.pst_set_status(p_stmt uuid, p_status text, p_reason text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s pst_statements%rowtype;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if p_status = 'submitted' and s.status = 'draft' then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_stmt;
  elsif p_status = 'approved' and s.status = 'submitted' then
    if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    perform pst_certify_in_finance(p_stmt);
  elsif p_status = 'rejected' and s.status = 'submitted' then
    if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    update pst_statements set status = 'rejected', reject_reason = p_reason where id = p_stmt;
  elsif p_status = 'draft' and s.status in ('submitted','rejected') then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'draft', submitted_by = null, submitted_at = null where id = p_stmt;
  else raise exception 'bad_transition';
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.ex_payable_basis(p_project uuid, p_until date)
 RETURNS TABLE(activity_id uuid, sys_qty numeric, unit_price numeric, base_qty numeric, line_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
drop trigger if exists trg_pst_lines_verify on public.pst_lines;
drop function if exists public.pst_lines_verify_trg();
drop function if exists public.ex_line_amend(uuid, numeric, text);
drop function if exists public.ex_payable_basis_core(uuid, date);
alter table public.pst_lines drop column if exists srv_ok, drop column if exists srv_price, drop column if exists srv_qty;
