-- Rollback of 060_supervision_signatures.sql — run by hand only. Restores 058's signing (admin may sign, no supervision order),
-- the review functions without the specialist check, and drops the two helpers. Signatures and decisions already made stay.
create or replace function public.ex_report_sign(p_report uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports%rowtype; sl ex_sign_slots%rowtype; img text; nm text;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into sl from ex_sign_slots where project_id = r.project_id and form_key = r.form_key and slot_key = p_slot and active;
  if sl.id is null then raise exception 'no_slot'; end if;
  if auth.uid() is null or (sl.user_id is distinct from auth.uid() and not is_admin_user()) then raise exception 'not_assignee' using errcode = '42501'; end if;
  if r.status = 'rejected' then raise exception 'bad_state'; end if;
  if exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = p_slot) then raise exception 'already_signed'; end if;
  if exists (select 1 from ex_sign_slots s where s.project_id = r.project_id and s.form_key = r.form_key and s.active and s.required and s.sort < sl.sort
             and not exists (select 1 from ex_report_signatures g where g.report_id = p_report and g.slot_key = s.slot_key)) then raise exception 'previous_missing'; end if;
  select image into img from user_signatures where user_id = auth.uid();
  if img is null then raise exception 'signature_required'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  insert into ex_report_signatures (report_id, project_id, slot_key, label, user_id, user_name, image) values (p_report, r.project_id, p_slot, sl.label, auth.uid(), coalesce(nm, ''), img);
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.ex_report_review(p_id uuid, p_decisions jsonb, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports; d jsonb; l ex_report_lines; v_status text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  perform set_config('ex.rpc', '1', true);
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    select * into l from ex_report_lines where id = (d ->> 'line_id')::uuid and report_id = p_id;
    if l.id is null then continue; end if;
    if (d ->> 'decision') not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
    if (d ->> 'decision') in ('rejected','returned') and coalesce(btrim(d ->> 'note'), '') = '' then raise exception 'note_required'; end if;
    if (d ->> 'decision') = 'approved' and coalesce((d ->> 'qty')::numeric, l.qty) < l.qty and coalesce(btrim(d ->> 'note'), '') = '' then raise exception 'note_required'; end if;
    if (d ->> 'decision') = 'approved' and coalesce((d ->> 'qty')::numeric, l.qty) < 0 then raise exception 'bad_qty'; end if;
    update ex_report_lines set status = d ->> 'decision',
      approved_qty = case when d ->> 'decision' = 'approved' then least(coalesce((d ->> 'qty')::numeric, l.qty), l.qty) else 0 end,
      review_note = coalesce(d ->> 'note', ''), reviewed_by = auth.uid(), reviewed_at = now() where id = l.id;
  end loop;
  v_status := ex_report_status_of(p_id);
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $function$;

create or replace function public.ex_report_decide_whole(p_id uuid, p_decision text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $function$
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

drop function if exists ex_specialists_signed(uuid);
drop function if exists ex_final_slot(uuid, text);
