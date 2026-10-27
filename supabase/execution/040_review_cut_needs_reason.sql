-- Approving less than the contractor reported is a decision on its quantity: like a return or a rejection it must carry a
-- written reason (the delay / claims analyst and the statement both rely on it). Same function as before plus that check.
create or replace function ex_report_review(p_id uuid, p_decisions jsonb, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; d jsonb; l ex_report_lines; n_pend int; n_ret int; n_app int; n_rej int; v_status text;
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
    update ex_report_lines set status = d ->> 'decision',
      approved_qty = case when d ->> 'decision' = 'approved' then least(coalesce((d ->> 'qty')::numeric, l.qty), l.qty) else 0 end,
      review_note = coalesce(d ->> 'note', ''), reviewed_by = auth.uid(), reviewed_at = now() where id = l.id;
  end loop;
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'returned'), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected') into n_pend, n_ret, n_app, n_rej from ex_report_lines where report_id = p_id;
  v_status := case when n_ret > 0 then 'returned'
                   when n_pend > 0 and (n_app + n_rej) > 0 then 'partially_approved'
                   when n_pend > 0 then 'submitted'
                   when n_rej > 0 and n_app = 0 then 'rejected'
                   when n_rej > 0 then 'partially_approved'
                   else 'approved' end;
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $f$;
