-- Rollback of 065_review_fixes.sql — run by hand only. Corrections already applied stay in the report figures
-- (the contractor's originals are in ex_report_fixes.was — read them out first if they are needed).
create or replace function public.ex_report_decide_whole(p_id uuid, p_decision text, p_note text default ''::text) returns void language plpgsql security definer set search_path to 'public' as $function$
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

create or replace function public.ex_report_review(p_id uuid, p_decisions jsonb, p_note text default ''::text) returns void language plpgsql security definer set search_path to 'public' as $function$
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

create or replace function public.ex_report_reopen(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'reopen') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('approved','partially_approved','rejected') then raise exception 'bad_state'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = 'returned', review_note = 'بازگشایی: ' || p_reason, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status in ('approved','rejected');
  update ex_reports set status = 'returned', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_reason where id = p_id;
  perform ex_hist(p_id, 'reopen', p_reason);
end $function$;

drop function if exists ex_report_fix(uuid, jsonb);
drop function if exists ex_fix_revert_all(uuid, text);
drop function if exists ex_fix_put(uuid, text, jsonb);
drop function if exists ex_fix_get(uuid, text);
drop function if exists ex_fix_same(jsonb, jsonb);
drop function if exists ex_fix_show(jsonb);
drop function if exists ex_fix_num(jsonb);
drop function if exists ex_fix_res_col(text);
drop table if exists ex_report_fixes;
