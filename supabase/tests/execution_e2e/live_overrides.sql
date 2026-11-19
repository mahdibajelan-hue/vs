-- live (production) definitions of the report-flow functions, copied with pg_get_functiondef, for the local test copy only
CREATE OR REPLACE FUNCTION public.ex_default_perms()
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
  select '{"contractor":["record","submit","edit_activities","edit_baseline","manage_gaps","raise","notice"],"site_head":["record","submit","manage_gaps","raise","notice"],"supervision":["review","reopen","manage_gaps","raise","assess_delay","measure"],"consultant":["review","manage_gaps","approve_activity","raise","assess_delay","measure"],"employer":["review","approve_activity","approve_baseline","manage_gaps","raise","assess_delay","measure"],"planner":["edit_activities","edit_baseline","manage_gaps","raise"],"claims":["assess_delay","notice","manage_gaps","raise"],"payment":["raise","measure"],"viewer":[],"approver":["review","approve_activity","approve_baseline"],"manager":["*"]}'::jsonb
$function$;

CREATE OR REPLACE FUNCTION public.ex_is_employer(p_project uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (is_admin_user() or exists (select 1 from ex_project_roles where project_id = p_project and user_id = auth.uid() and active and role in ('employer','manager')));
$function$;

CREATE OR REPLACE FUNCTION public.ex_lines_employer_guard_trg()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
begin
  if coalesce(current_setting('ex.rpc', true), '') <> '1' and (
       new.employer_qty is distinct from old.employer_qty or new.employer_note is distinct from old.employer_note or new.employer_status is distinct from old.employer_status
       or new.employer_by is distinct from old.employer_by or new.employer_at is distinct from old.employer_at) then
    raise exception 'use_rpc' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ex_measurements_guard_trg()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare cum_app numeric; s_meas numeric; s_bill numeric; s_paid numeric;
begin
  select coalesce(sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) else 0 end), 0) into cum_app
    from ex_report_lines l join ex_reports r on r.id = l.report_id where l.activity_id = new.activity_id and r.form_key = 'work';
  select coalesce(sum(measured_qty), 0), coalesce(sum(billed_qty), 0), coalesce(sum(paid_qty), 0) into s_meas, s_bill, s_paid
    from ex_measurements where activity_id = new.activity_id and id <> new.id;
  s_meas := s_meas + new.measured_qty; s_bill := s_bill + new.billed_qty; s_paid := s_paid + new.paid_qty;
  if s_meas > cum_app + 1e-9 then raise exception 'measured_exceeds_approved'; end if;
  if s_bill > s_meas + 1e-9 then raise exception 'billed_exceeds_measured'; end if;
  if s_paid > s_bill + 1e-9 then raise exception 'paid_exceeds_billed'; end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ex_report_decide_whole(p_id uuid, p_decision text, p_note text DEFAULT ''::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r ex_reports; v_status text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if p_decision not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
  if p_decision <> 'approved' and coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = p_decision, approved_qty = case when p_decision = 'approved' then qty else 0 end, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status = 'pending';
  v_status := ex_report_status_of(p_id);
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $function$;

CREATE OR REPLACE FUNCTION public.ex_report_employer_review(p_id uuid, p_decisions jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r ex_reports; d jsonb; l ex_report_lines; mode text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_is_employer(r.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(values_json ->> 'employerStep', 'off') into mode from ex_settings where project_id = r.project_id;
  if coalesce(mode, 'off') = 'off' then raise exception 'employer_step_off'; end if;
  perform set_config('ex.rpc', '1', true);
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    select * into l from ex_report_lines where id = (d ->> 'line_id')::uuid and report_id = p_id;
    if l.id is null then continue; end if;
    if l.status <> 'approved' then raise exception 'supervision_not_approved'; end if;
    if (d ->> 'decision') not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
    if (d ->> 'decision') <> 'approved' and coalesce(btrim(d ->> 'note'), '') = '' then raise exception 'note_required'; end if;
    update ex_report_lines set employer_status = d ->> 'decision',
      employer_qty = case when d ->> 'decision' = 'approved' then least(coalesce((d ->> 'qty')::numeric, coalesce(l.approved_qty, l.qty)), coalesce(l.approved_qty, l.qty)) else 0 end,
      employer_note = coalesce(d ->> 'note', ''), employer_by = auth.uid(), employer_at = now() where id = l.id;
  end loop;
  perform ex_hist(p_id, 'employer_review', '');
end $function$;

CREATE OR REPLACE FUNCTION public.ex_report_snapshot_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v int; snap jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  select coalesce(max(version), 0) + 1 into v from ex_report_versions where report_id = new.id;
  select jsonb_build_object('report', to_jsonb(new),
    'lines', coalesce((select jsonb_agg(to_jsonb(x) order by x.line_no) from ex_report_lines x where x.report_id = new.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_resources x where x.report_id = new.id), '[]'::jsonb),
    'stoppages', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_stoppages x where x.report_id = new.id), '[]'::jsonb)) into snap;
  insert into ex_report_versions (report_id, version, status, snapshot) values (new.id, v, new.status, snap);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ex_report_submit(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r ex_reports; x record; tol numeric; blockb boolean; total numeric; base numeric;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('draft','returned','incomplete') then raise exception 'bad_state'; end if;
  if not exists (select 1 from ex_report_lines where report_id = p_id) and r.data = '{}'::jsonb then raise exception 'empty_report'; end if;
  if exists (select 1 from ex_sign_slots s where s.project_id = r.project_id and s.form_key = r.form_key and s.active and s.required and s.party = 'contractor'
             and not exists (select 1 from ex_report_signatures g where g.report_id = p_id and g.slot_key = s.slot_key)) then raise exception 'signature_required'; end if;
  select coalesce((values_json ->> 'overBasePct')::numeric, 0), coalesce((values_json ->> 'blockOverBase')::boolean, true) into tol, blockb from ex_settings where project_id = r.project_id;
  tol := coalesce(tol, 0); blockb := coalesce(blockb, true);
  if r.form_key = 'work' and blockb then
    for x in select l.activity_id, sum(l.qty) q from ex_report_lines l where l.report_id = p_id and l.activity_id is not null group by l.activity_id loop
      select coalesce((select bl.base_qty from ex_baseline_lines bl join ex_baselines b on b.id = bl.baseline_id where b.project_id = r.project_id and b.status = 'approved' and bl.activity_id = x.activity_id order by b.version desc limit 1), (select base_qty from ex_activities where id = x.activity_id)) into base;
      select coalesce(sum(l.qty), 0) into total from ex_report_lines l join ex_reports rr on rr.id = l.report_id
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
end $function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin and account_status = 'active' from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.ex_sign_inval_reports_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return new; end if;
  if new.data is not distinct from old.data and new.notes is not distinct from old.notes and new.report_date is not distinct from old.report_date and new.front is not distinct from old.front and new.station is not distinct from old.station and new.shift is not distinct from old.shift then return new; end if;
  if exists (select 1 from ex_report_signatures where report_id = new.id) then execute 'de' || 'lete from ex_report_signatures where report_id = $1' using new.id; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ex_sign_inval_lines_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare rid uuid := coalesce(new.report_id, old.report_id);
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE'
     and new.activity_id is not distinct from old.activity_id and new.qty is not distinct from old.qty
     and new.km_from is not distinct from old.km_from and new.km_to is not distinct from old.km_to
     and new.location is not distinct from old.location and new.note is not distinct from old.note
     and new.detail is not distinct from old.detail and new.source_report_id is not distinct from old.source_report_id
     and new.line_no is not distinct from old.line_no then
    return new;
  end if;
  if exists (select 1 from ex_report_signatures where report_id = rid) then execute 'de' || 'lete from ex_report_signatures where report_id = $1' using rid; end if;
  return coalesce(new, old);
end $function$;

-- triggers exactly as on the live database
do $$ declare t record; begin
  for t in select tgname, tgrelid::regclass rel from pg_trigger where tgrelid in ('ex_reports'::regclass, 'ex_report_lines'::regclass) and not tgisinternal and tgfoid = 'ex_sign_invalidate_trg'::regproc loop
    execute format('drop trigger %I on %s', t.tgname, t.rel); end loop; end $$;
create or replace trigger trg_ex_sign_inval_reports after update on public.ex_reports for each row execute function ex_sign_inval_reports_trg();
create or replace trigger trg_ex_sign_inval_lines after insert or delete or update on public.ex_report_lines for each row execute function ex_sign_inval_lines_trg();
create or replace trigger trg_ex_lines_employer_guard before update on public.ex_report_lines for each row execute function ex_lines_employer_guard_trg();
create or replace trigger trg_ex_measurements_guard before insert or update on public.ex_measurements for each row execute function ex_measurements_guard_trg();
