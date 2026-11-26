-- Rollback of 063_sign_sends.sql — run by hand only: signing no longer sends (060's version), sending keeps its own body.
create or replace function public.ex_report_sign(p_report uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports%rowtype; sl ex_sign_slots%rowtype; img text; nm text; v_status text;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into sl from ex_sign_slots where project_id = r.project_id and form_key = r.form_key and slot_key = p_slot and active;
  if sl.id is null then raise exception 'no_slot'; end if;
  if auth.uid() is null or (sl.user_id is distinct from auth.uid() and not is_admin_user()) then raise exception 'not_assignee' using errcode = '42501'; end if;
  if r.status = 'rejected' then raise exception 'bad_state'; end if;
  -- the supervision signs a sent report only
  if sl.party <> 'contractor' and r.status not in ('submitted', 'partially_approved') then raise exception 'not_sent_yet'; end if;
  if exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = p_slot) then raise exception 'already_signed'; end if;
  if exists (select 1 from ex_sign_slots s where s.project_id = r.project_id and s.form_key = r.form_key and s.active and s.required and s.sort < sl.sort
             and not exists (select 1 from ex_report_signatures g where g.report_id = p_report and g.slot_key = s.slot_key)) then raise exception 'previous_missing'; end if;
  select image into img from user_signatures where user_id = auth.uid();
  if img is null then raise exception 'signature_required'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  insert into ex_report_signatures (report_id, project_id, slot_key, label, user_id, user_name, image) values (p_report, r.project_id, p_slot, sl.label, auth.uid(), coalesce(nm, ''), img);
  -- the head of the supervision's signature is the final approval: the rows still pending are approved as reported
  if sl.party <> 'contractor' and p_slot = ex_final_slot(r.project_id, r.form_key) then
    perform set_config('ex.rpc', '1', true);
    update ex_report_lines set status = 'approved', approved_qty = qty, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_report and status = 'pending';
    v_status := ex_report_status_of(p_report);
    update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report;
    perform ex_hist(p_report, 'review:' || v_status, 'تأیید نهایی با امضای ' || sl.label);
  end if;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.ex_report_submit(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform ex_report_submit_core(p_id);  -- the core stays (it is the old body); drop it only together with re-creating the full body
end $function$;
