-- 067 — amendment (اصلاحیه) of a report approved for good.
--   · only the head of the supervision (the person of the form's final signature slot) or the system admin opens one,
--     with a written reason. The report gets a numbered amendment (A1, A2 …); its final signature is taken off (kept in
--     the amendment row and the history) and the report goes back to «submitted» in the head's hands — not to the
--     contractor: a return or rejection is refused while the amendment is open.
--   · the head corrects figures exactly like a review (ex_report_fix): the figure before stays beside the new one, struck
--     through. Correcting during an amendment does not clear the specialist's signature.
--   · the head's final signature closes the amendment and approves the report again (locked for good, as before).
--   · cancelling puts back the figures, the corrections, the row decisions and the final signature as they were.
-- Rollback: rollback/067_rollback.sql (run by hand).

create table if not exists ex_report_amendments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  project_id uuid not null,
  no integer not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  opened_by uuid, opened_by_name text not null default '', opened_at timestamptz not null default now(),
  closed_by uuid, closed_at timestamptz, closed_note text not null default '',
  prev_signature jsonb, prev_lines jsonb, prev_fixes jsonb,
  unique (report_id, no)
);
create unique index if not exists ex_report_amendments_one_open on ex_report_amendments (report_id) where status = 'open';
alter table ex_report_amendments enable row level security;
drop policy if exists ex_report_amendments_sel on ex_report_amendments;
create policy ex_report_amendments_sel on ex_report_amendments for select using (ex_can_view(project_id));
revoke all on ex_report_amendments from anon;
grant select on ex_report_amendments to authenticated;

-- the head of the supervision for this report: the person of the form's final slot (or the system admin)
create or replace function ex_is_sup_head(p_report uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select is_admin_user() or exists (select 1 from ex_reports r join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key and s.slot_key = ex_final_slot(r.project_id, r.form_key)
                                    where r.id = p_report and s.user_id = auth.uid())
$f$;

-- 062's locks give way only to the amendment RPCs below (ex.amend)
create or replace function ex_final_lock_report_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if coalesce(current_setting('ex.amend', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.status = 'approved' and ex_final_signed(old.id) then raise exception 'approved_final' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'approved' and ex_final_signed(old.id)
     and (new.status is distinct from old.status or new.data is distinct from old.data or new.report_date is distinct from old.report_date or new.front is distinct from old.front
          or new.station is distinct from old.station or new.notes is distinct from old.notes or new.shift is distinct from old.shift or new.contractor_org_id is distinct from old.contractor_org_id) then
    raise exception 'approved_final' using errcode = '42501';
  end if;
  return new;
end $f$;
create or replace function ex_final_lock_child_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_rep uuid := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
begin
  if coalesce(current_setting('ex.amend', true), '') = '1' then return coalesce(new, old); end if;
  if exists (select 1 from ex_reports where id = v_rep and status = 'approved') and ex_final_signed(v_rep) then raise exception 'approved_final' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;

-- while an amendment is open the report stays with the supervision: no return, no rejection
create or replace function ex_amend_state_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.status in ('returned','rejected','draft') and new.status is distinct from old.status and exists (select 1 from ex_report_amendments where report_id = new.id and status = 'open') then
    raise exception 'amend_open' using errcode = '42501';
  end if;
  return new;
end $f$;
drop trigger if exists trg_ex_amend_state on ex_reports;
create trigger trg_ex_amend_state before update of status on ex_reports for each row execute function ex_amend_state_trg();

create or replace function ex_report_amend_open(p_report uuid, p_reason text) returns integer language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; n int; nm text; fk text;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_is_sup_head(p_report) then raise exception 'not_sup_head' using errcode = '42501'; end if;
  if r.status <> 'approved' or not ex_final_signed(p_report) then raise exception 'not_final'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'note_required'; end if;
  if exists (select 1 from ex_report_amendments where report_id = p_report and status = 'open') then raise exception 'amend_open'; end if;
  select coalesce(max(no), 0) + 1 into n from ex_report_amendments where report_id = p_report;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  fk := ex_final_slot(r.project_id, r.form_key);
  insert into ex_report_amendments (report_id, project_id, no, reason, opened_by, opened_by_name, prev_signature, prev_lines, prev_fixes)
  values (p_report, r.project_id, n, btrim(p_reason), auth.uid(), coalesce(nm, ''),
          (select to_jsonb(g) from ex_report_signatures g where g.report_id = p_report and g.slot_key = fk),
          coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'status', l.status, 'approved_qty', l.approved_qty, 'review_note', l.review_note)) from ex_report_lines l where l.report_id = p_report), '[]'::jsonb),
          coalesce((select jsonb_agg(to_jsonb(f)) from ex_report_fixes f where f.report_id = p_report), '[]'::jsonb));
  perform set_config('ex.amend', '1', true);
  perform set_config('ex.rpc', '1', true);
  execute 'de' || 'lete from ex_report_signatures where report_id = $1 and slot_key = $2' using p_report, fk;
  update ex_report_lines set status = 'pending' where report_id = p_report and status = 'approved';
  update ex_reports set status = 'submitted' where id = p_report;
  perform ex_hist(p_report, 'amend_open', 'اصلاحیهٔ ' || n || ': ' || btrim(p_reason));
  perform set_config('ex.amend', '', true);
  return n;
end $f$;

create or replace function ex_report_amend_cancel(p_report uuid, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare a ex_report_amendments; f ex_report_fixes; s jsonb; l jsonb;
begin
  select * into a from ex_report_amendments where report_id = p_report and status = 'open';
  if a.id is null then raise exception 'no_amendment'; end if;
  if not ex_is_sup_head(p_report) then raise exception 'not_sup_head' using errcode = '42501'; end if;
  perform set_config('ex.amend', '1', true);
  perform set_config('ex.rpc', '1', true);
  -- figures and corrections back to the moment the amendment was opened
  for f in select * from ex_report_fixes where report_id = p_report and fixed_at >= a.opened_at loop
    s := (select x from jsonb_array_elements(coalesce(a.prev_fixes, '[]'::jsonb)) x where x ->> 'path' = f.path limit 1);
    begin perform ex_fix_put(p_report, f.path, case when s is not null then s -> 'value' else f.was end); exception when others then null; end;
    execute 'de' || 'lete from ex_report_fixes where id = $1' using f.id;
  end loop;
  for s in select x from jsonb_array_elements(coalesce(a.prev_fixes, '[]'::jsonb)) x loop
    if not exists (select 1 from ex_report_fixes where report_id = p_report and path = s ->> 'path') then
      begin perform ex_fix_put(p_report, s ->> 'path', s -> 'value'); exception when others then null; end;
      insert into ex_report_fixes select * from jsonb_populate_record(null::ex_report_fixes, s);
    end if;
  end loop;
  for l in select x from jsonb_array_elements(coalesce(a.prev_lines, '[]'::jsonb)) x loop
    update ex_report_lines set status = l ->> 'status', approved_qty = (l ->> 'approved_qty')::numeric, review_note = coalesce(l ->> 'review_note', '') where id = (l ->> 'id')::uuid;
  end loop;
  if a.prev_signature is not null and not exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = a.prev_signature ->> 'slot_key') then
    insert into ex_report_signatures select * from jsonb_populate_record(null::ex_report_signatures, a.prev_signature);
  end if;
  update ex_reports set status = 'approved' where id = p_report;
  update ex_report_amendments set status = 'cancelled', closed_by = auth.uid(), closed_at = now(), closed_note = coalesce(p_note, '') where id = a.id;
  perform ex_hist(p_report, 'amend_cancel', 'اصلاحیهٔ ' || a.no || ' لغو شد' || case when coalesce(btrim(p_note), '') <> '' then ': ' || btrim(p_note) else '' end);
  perform set_config('ex.amend', '', true);
end $f$;
grant execute on function ex_report_amend_open(uuid, text) to authenticated;
grant execute on function ex_report_amend_cancel(uuid, text) to authenticated;

-- corrections: during an amendment only the head makes them, and they do not clear the specialist's signature
create or replace function ex_report_fix(p_report uuid, p_items jsonb) returns integer language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; it jsonb; f ex_report_fixes; p text; orig jsonb; val jsonb; n int := 0; summary text := ''; who text; nm text; lst text; amending boolean;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') and not ex_is_sup_head(p_report) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if ex_final_signed(p_report) then raise exception 'approved_final' using errcode = '42501'; end if;
  amending := exists (select 1 from ex_report_amendments where report_id = p_report and status = 'open');
  if amending and not ex_is_sup_head(p_report) then raise exception 'not_sup_head' using errcode = '42501'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  perform set_config('ex.rpc', '1', true);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    p := it ->> 'path';
    if p is null then raise exception 'bad_path'; end if;
    if p like 'line:%' then
      select status into lst from ex_report_lines where id = split_part(p, ':', 2)::uuid and report_id = p_report;
      if lst is distinct from 'pending' then raise exception 'line_decided'; end if;
    end if;
    select * into f from ex_report_fixes where report_id = p_report and path = p;
    orig := case when f.id is not null then f.was else ex_fix_get(p_report, p) end;
    val := it -> 'value';
    if val is null or val = 'null'::jsonb or ex_fix_same(val, orig) then
      if f.id is not null then
        perform ex_fix_put(p_report, p, orig);
        execute 'de' || 'lete from ex_report_fixes where id = $1' using f.id;
        n := n + 1; summary := summary || case when summary = '' then '' else ' · ' end || coalesce(nullif(it ->> 'label', ''), f.label, p) || ': بازگشت به ' || ex_fix_show(orig);
      end if;
    else
      if p like 'res:%' or p like 'stop:%' or p like 'line:%:qty' then perform ex_fix_num(val); end if;
      perform ex_fix_put(p_report, p, val);
      insert into ex_report_fixes (report_id, project_id, path, label, was, value, note, fixed_by, fixed_by_name, fixed_at)
        values (p_report, r.project_id, p, coalesce(it ->> 'label', ''), orig, val, coalesce(it ->> 'note', ''), auth.uid(), coalesce(nm, ''), now())
        on conflict (report_id, path) do update set value = excluded.value, label = excluded.label, note = excluded.note, fixed_by = excluded.fixed_by, fixed_by_name = excluded.fixed_by_name, fixed_at = now();
      n := n + 1; summary := summary || case when summary = '' then '' else ' · ' end || coalesce(nullif(it ->> 'label', ''), p) || ': ' || ex_fix_show(orig) || ' → ' || ex_fix_show(val);
    end if;
  end loop;
  if n > 0 then
    if not amending then
      select string_agg(g.label || ': ' || g.user_name, ' · ' order by g.signed_at) into who from ex_report_signatures g
        join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key and s.slot_key = g.slot_key and s.party <> 'contractor' where g.report_id = p_report;
      if who is not null then
        perform ex_hist(p_report, 'signatures_cleared', 'اصلاح مقادیر توسط نظارت؛ امضاهای نظارت روی نسخهٔ قبلی: ' || who);
        execute 'de' || 'lete from ex_report_signatures g using ex_sign_slots s where g.report_id = $1 and s.project_id = $2 and s.form_key = $3 and s.slot_key = g.slot_key and s.party <> ''contractor''' using p_report, r.project_id, r.form_key;
      end if;
    end if;
    perform ex_hist(p_report, case when amending then 'amend_fix' else 'fix' end, summary);
  end if;
  return n;
end $f$;

-- the head's final signature closes an open amendment
create or replace function public.ex_report_sign(p_report uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports%rowtype; sl ex_sign_slots%rowtype; img text; nm text; v_status text; sent boolean := false; a ex_report_amendments;
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
  if sl.party = 'contractor' and r.status in ('draft','returned','incomplete') and ex_contractor_signed(p_report) then
    perform ex_report_submit_core(p_report); sent := true;
  end if;
  if sl.party <> 'contractor' and p_slot = ex_final_slot(r.project_id, r.form_key) then
    perform set_config('ex.rpc', '1', true);
    update ex_report_lines set status = 'approved', approved_qty = qty, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_report and status = 'pending';
    v_status := ex_report_status_of(p_report);
    if not exists (select 1 from ex_report_lines where report_id = p_report) then v_status := 'approved'; end if;
    update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report;
    select * into a from ex_report_amendments where report_id = p_report and status = 'open';
    if a.id is not null then
      update ex_report_amendments set status = 'done', closed_by = auth.uid(), closed_at = now() where id = a.id;
      perform ex_hist(p_report, 'amend_done', 'اصلاحیهٔ ' || a.no || ' با امضای ' || sl.label || ' ثبت و تأیید شد');
    else
      perform ex_hist(p_report, 'review:' || v_status, 'تأیید نهایی با امضای ' || sl.label);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'sent', sent);
end $function$;
