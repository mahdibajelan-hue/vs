-- 047: one payment chain — the statements module (pst_*, posted to finance) is checked against the same server basis as the
-- contract statement (046), and supervision can correct ONE approved line without reopening the whole report (audit M2, M4).
--
-- 1. ex_payable_basis_core(project, until): the body of ex_payable_basis without the caller check, for internal use only
--    (not granted to any app role). ex_payable_basis keeps its check and calls it.
-- 2. pst_lines gets srv_qty / srv_price / srv_ok: for every construction line (source_kind = 'activity') the database
--    stores, next to what the page computed, what the server computes for the statement's period end — and whether they
--    agree. A statement whose construction lines disagree cannot be submitted or approved ('source_mismatch:…'); the fix is
--    to regenerate it (the page builds it again from the current reports). The amount the contractor asks (cum_amount) stays
--    editable as before — only the system basis is verified.
-- 3. ex_line_amend(line, qty, reason): supervision (permission 'reopen') changes the approved quantity of one approved line,
--    with a reason, a history entry and a full snapshot in ex_report_versions; the rest of the report stays approved. A
--    reduction below what is already measured (ex_measurements) is refused; an employer decision on that line is cleared
--    so the employer looks at it again.
-- Rollback: rollback/047_rollback.sql.

create or replace function public.ex_payable_basis_core(p_project uuid, p_until date)
returns table (activity_id uuid, sys_qty numeric, unit_price numeric, base_qty numeric, line_count int)
language plpgsql stable security definer set search_path to 'public' as $f$
declare binding boolean;
begin
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
revoke all on function public.ex_payable_basis_core(uuid, date) from public, anon, authenticated;

create or replace function public.ex_payable_basis(p_project uuid, p_until date)
returns table (activity_id uuid, sys_qty numeric, unit_price numeric, base_qty numeric, line_count int)
language plpgsql stable security definer set search_path to 'public' as $f$
begin
  if not ex_can_view(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query select * from ex_payable_basis_core(p_project, p_until);
end $f$;

-- 2. statements module: the server basis next to every construction line
alter table public.pst_lines add column if not exists srv_qty numeric;
alter table public.pst_lines add column if not exists srv_price numeric;
alter table public.pst_lines add column if not exists srv_ok boolean not null default true;

create or replace function public.pst_lines_verify_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype; b record;
begin
  if new.source_kind <> 'activity' then new.srv_ok := true; return new; end if;
  select * into s from pst_statements where id = new.statement_id;
  select x.sys_qty, x.unit_price into b from ex_payable_basis_core(s.master_project_id, s.period_to) x where x.activity_id = new.source_id;
  new.srv_qty := coalesce(b.sys_qty, 0);
  new.srv_price := b.unit_price;
  new.srv_ok := abs(coalesce(new.sys_cum_qty, 0) - new.srv_qty) <= greatest(1e-6, abs(new.srv_qty) * 1e-9)
                and (b.unit_price is null or abs(coalesce(new.unit_price, 0) - b.unit_price) <= 0.01);
  return new;
end $f$;
create or replace trigger trg_pst_lines_verify before insert or update of sys_cum_qty, unit_price, source_id, source_kind on public.pst_lines
  for each row execute function pst_lines_verify_trg();

create or replace function public.pst_set_status(p_stmt uuid, p_status text, p_reason text DEFAULT ''::text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype; bad text;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if p_status in ('submitted','approved') then
    select string_agg(l.code, '، ' order by l.code) into bad from (select code from pst_lines where statement_id = p_stmt and gen = s.gen and not srv_ok limit 5) l;
    if bad is not null then raise exception 'source_mismatch:%', bad; end if;
  end if;
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
end $f$;

-- 3. correcting one approved line
create or replace function public.ex_line_amend(p_line uuid, p_qty numeric, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare l ex_report_lines; r ex_reports; a ex_activities; old numeric; cum numeric; meas numeric; v int;
begin
  select * into l from ex_report_lines where id = p_line;
  if l.id is null then raise exception 'not_found'; end if;
  select * into r from ex_reports where id = l.report_id;
  if not ex_allows(r.project_id, 'reopen') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('approved','partially_approved') or l.status <> 'approved' then raise exception 'bad_state'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'note_required'; end if;
  if p_qty is null or p_qty < 0 or p_qty > l.qty then raise exception 'bad_qty'; end if;
  old := coalesce(l.approved_qty, l.qty);
  if p_qty = old then return; end if;
  if l.activity_id is not null and p_qty < old then
    select coalesce(sum(coalesce(x.approved_qty, x.qty)), 0) into cum from ex_report_lines x join ex_reports y on y.id = x.report_id
     where y.project_id = r.project_id and y.form_key = 'work' and x.activity_id = l.activity_id and x.status = 'approved';
    select coalesce(sum(measured_qty), 0) into meas from ex_measurements where project_id = r.project_id and activity_id = l.activity_id;
    if cum - old + p_qty < meas - 1e-9 then raise exception 'below_measured'; end if;
  end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set approved_qty = p_qty, review_note = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now(),
    employer_status = null, employer_qty = null, employer_note = '', employer_by = null, employer_at = null
   where id = p_line;
  select * into a from ex_activities where id = l.activity_id;
  perform ex_hist(r.id, 'amend_line', format('%s: %s → %s — %s', coalesce(nullif(a.item_no, ''), a.title, l.detail ->> 'actionTitle', 'ردیف ' || l.line_no), old, p_qty, btrim(p_reason)));
  select coalesce(max(version), 0) + 1 into v from ex_report_versions where report_id = r.id;
  insert into ex_report_versions (report_id, version, status, snapshot)
  values (r.id, v, r.status, jsonb_build_object('report', to_jsonb(r), 'amended_line', p_line,
    'lines', coalesce((select jsonb_agg(to_jsonb(x) order by x.line_no) from ex_report_lines x where x.report_id = r.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_resources x where x.report_id = r.id), '[]'::jsonb),
    'stoppages', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_stoppages x where x.report_id = r.id), '[]'::jsonb)));
end $f$;
revoke all on function public.ex_line_amend(uuid, numeric, text) from public, anon;
grant execute on function public.ex_line_amend(uuid, numeric, text) to authenticated;
