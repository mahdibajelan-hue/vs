-- 063 — the contractor's last signature sends the report: the site manager's signature = sign + send to the supervision.
-- ex_report_submit keeps its permission check and calls ex_report_submit_core (the same checks and status change).
-- ex_report_sign, after the signature that completes the contractor's required slots on a draft / returned / incomplete
-- report, runs the core in the same transaction: if anything blocks sending (empty report, over the base quantity …)
-- the signature is not kept either, so a draft is never left locked-and-unsent.
-- Then: specialist supervisor reviews and signs → head of supervision signs = final approval and lock (060/062).
-- Rollback: rollback/063_rollback.sql (run by hand).

create or replace function public.ex_report_submit_core(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports; x record; tol numeric; blockb boolean; total numeric; base numeric;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
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
revoke all on function ex_report_submit_core(uuid) from public, anon, authenticated;

create or replace function public.ex_report_submit(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform ex_report_submit_core(p_id);
end $function$;

create or replace function public.ex_report_sign(p_report uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports%rowtype; sl ex_sign_slots%rowtype; img text; nm text; v_status text; sent boolean := false;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into sl from ex_sign_slots where project_id = r.project_id and form_key = r.form_key and slot_key = p_slot and active;
  if sl.id is null then raise exception 'no_slot'; end if;
  if auth.uid() is null or (sl.user_id is distinct from auth.uid() and not is_admin_user()) then raise exception 'not_assignee' using errcode = '42501'; end if;
  if r.status = 'rejected' then raise exception 'bad_state'; end if;
  if sl.party <> 'contractor' and r.status not in ('submitted', 'partially_approved') then raise exception 'not_sent_yet'; end if;
  if exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = p_slot) then raise exception 'already_signed'; end if;
  if exists (select 1 from ex_sign_slots s where s.project_id = r.project_id and s.form_key = r.form_key and s.active and s.required and s.sort < sl.sort
             and not exists (select 1 from ex_report_signatures g where g.report_id = p_report and g.slot_key = s.slot_key)) then raise exception 'previous_missing'; end if;
  select image into img from user_signatures where user_id = auth.uid();
  if img is null then raise exception 'signature_required'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  insert into ex_report_signatures (report_id, project_id, slot_key, label, user_id, user_name, image) values (p_report, r.project_id, p_slot, sl.label, auth.uid(), coalesce(nm, ''), img);
  -- the contractor's last signature sends the report to the supervision (same transaction: no send, no signature)
  if sl.party = 'contractor' and r.status in ('draft','returned','incomplete') and ex_contractor_signed(p_report) then
    perform ex_report_submit_core(p_report); sent := true;
  end if;
  -- the head of the supervision's signature is the final approval: the rows still pending are approved as reported
  if sl.party <> 'contractor' and p_slot = ex_final_slot(r.project_id, r.form_key) then
    perform set_config('ex.rpc', '1', true);
    update ex_report_lines set status = 'approved', approved_qty = qty, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_report and status = 'pending';
    v_status := ex_report_status_of(p_report);
    update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report;
    perform ex_hist(p_report, 'review:' || v_status, 'تأیید نهایی با امضای ' || sl.label);
  end if;
  return jsonb_build_object('ok', true, 'sent', sent);
end $function$;
