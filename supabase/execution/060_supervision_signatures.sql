-- 060 — the supervision's signatures on the site minutes (صورتجلسات کارگاهی), in order:
--   1 contractor's technical office (prepares) · 2 site manager (approves)        → before the report is sent (as before)
--   3 specialist supervisor of the form's discipline (weld inspector, film interpreter, civil inspector …)
--   4 head of the supervision team — this signature IS the final approval
-- Rules (only for forms that have supervision-side slots; others work as before):
--   · a supervision-side slot (party ≠ contractor) is signed only after the report was sent (submitted / partially approved)
--   · approving rows (review page, row by row or whole report) needs every earlier required supervision signature
--     (the specialist's) first
--   · signing the last required supervision slot (the head's) approves every row still pending and closes the report;
--     rows the supervision already rejected or returned stay as decided
-- Rollback: rollback/060_rollback.sql (restores 058's ex_report_sign and the previous review functions).

-- the final (head-of-supervision) slot of a form: the required, active, non-contractor slot with the highest order
create or replace function ex_final_slot(p_project uuid, p_form text) returns text language sql stable set search_path to 'public' as $f$
  select slot_key from ex_sign_slots where project_id = p_project and form_key = p_form and active and required and party <> 'contractor' order by sort desc limit 1
$f$;

-- before rows are approved: every required supervision slot ordered before the final one is signed
create or replace function ex_specialists_signed(p_report uuid) returns boolean language sql stable set search_path to 'public' as $f$
  select not exists (
    select 1 from ex_reports r join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key
    where r.id = p_report and s.active and s.required and s.party <> 'contractor' and s.slot_key is distinct from ex_final_slot(r.project_id, r.form_key)
      and not exists (select 1 from ex_report_signatures g where g.report_id = r.id and g.slot_key = s.slot_key))
$f$;

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

create or replace function public.ex_report_review(p_id uuid, p_decisions jsonb, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports; d jsonb; l ex_report_lines; v_status text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) x where x ->> 'decision' = 'approved') and not ex_specialists_signed(p_id) then
    raise exception 'specialist_signature_required';
  end if;
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
  if p_decision = 'approved' and not ex_specialists_signed(p_id) then raise exception 'specialist_signature_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = p_decision, approved_qty = case when p_decision = 'approved' then qty else 0 end, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status = 'pending';
  v_status := ex_report_status_of(p_id);
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $function$;
