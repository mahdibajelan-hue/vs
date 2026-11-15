-- execution 045 — the status a report takes after a review, in one place.
-- Fixes found by the end-to-end simulation:
--  · a report whose rows were all decided (some approved, some rejected) stayed «partially_approved» for ever: it never
--    left the supervision's review queue and its week / month never closed. With nothing left pending it is now
--    «approved» (the rejected rows simply do not count);
--  · «decide whole» stamped the report with the decision even when some of its rows had been approved one by one
--    before — a whole «reject» then hid those approved quantities from the progress and the statement. The report's
--    status now follows its rows, exactly as in the row-by-row review.
create or replace function ex_report_status_of(p_id uuid) returns text language sql stable security definer set search_path to 'public' as $f$
  select case when n_ret > 0 then 'returned'
              when n_pend > 0 and (n_app + n_rej) > 0 then 'partially_approved'
              when n_pend > 0 then 'submitted'
              when n_app = 0 and n_rej > 0 then 'rejected'
              else 'approved' end
  from (select count(*) filter (where status = 'pending') n_pend, count(*) filter (where status = 'returned') n_ret,
               count(*) filter (where status = 'approved') n_app, count(*) filter (where status = 'rejected') n_rej
        from ex_report_lines where report_id = p_id) c;
$f$;
revoke all on function ex_report_status_of(uuid) from public, anon;

create or replace function ex_report_review(p_id uuid, p_decisions jsonb, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
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
end $f$;

create or replace function ex_report_decide_whole(p_id uuid, p_decision text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; v_status text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if p_decision not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
  if p_decision <> 'approved' and coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  -- the decision applies to the rows still waiting; rows decided before keep their decision
  update ex_report_lines set status = p_decision, approved_qty = case when p_decision = 'approved' then qty else 0 end, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status = 'pending';
  v_status := ex_report_status_of(p_id);
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $f$;
