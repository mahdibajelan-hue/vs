-- 065 — the supervision's corrections of a sent report.
--   · the supervision does not retype the report: where it disagrees with a figure the contractor entered (weather,
--     manpower, machinery, a row's quantity or a cell of a site minute) it writes its own value. That value becomes the
--     report's value (every statistic reads it), and the contractor's original is kept beside it in ex_report_fixes —
--     the paper shows it struck through with the supervision's figure in red.
--   · corrections are made between sending and the final signature; making one clears the supervision signatures
--     already given (written into the history), so the signers sign the corrected version.
--   · returning or rejecting the report puts the contractor's own figures back (the corrections go into the history):
--     the contractor corrects its report itself. Reopening an approved report keeps the corrected figures.
-- Only ex_report_fix writes the table; everyone who can view the project reads it.
-- Rollback: rollback/065_rollback.sql (run by hand).

create table if not exists ex_report_fixes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  project_id uuid not null,
  path text not null,
  label text not null default '',
  was jsonb,
  value jsonb,
  note text not null default '',
  fixed_by uuid,
  fixed_by_name text not null default '',
  fixed_at timestamptz not null default now(),
  unique (report_id, path)
);
create index if not exists ex_report_fixes_project on ex_report_fixes (project_id);
alter table ex_report_fixes enable row level security;
drop policy if exists ex_report_fixes_sel on ex_report_fixes;
create policy ex_report_fixes_sel on ex_report_fixes for select using (ex_can_view(project_id));
revoke all on ex_report_fixes from anon;
grant select on ex_report_fixes to authenticated;

-- columns of manpower / machinery rows the supervision may correct
create or replace function ex_fix_res_col(p text) returns boolean language sql immutable as $f$
  select p in ('total_qty','active_qty','idle_qty','leave_qty','stopped_qty','native_qty','nonnative_qty','repair_qty','hours')
$f$;

-- the current value at a path: data:<key> · res:<id>:<column> · line:<id>:qty · line:<id>:d:<key> · stop:<id>:hours
create or replace function ex_fix_get(p_report uuid, p_path text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare a text[] := string_to_array(p_path, ':'); v jsonb;
begin
  if a[1] = 'data' and coalesce(a[2], '') <> '' then
    select data -> a[2] into v from ex_reports where id = p_report;
  elsif a[1] = 'res' and ex_fix_res_col(a[3]) then
    if not exists (select 1 from ex_report_resources where id = a[2]::uuid and report_id = p_report) then raise exception 'bad_path'; end if;
    execute format('select to_jsonb(%I) from ex_report_resources where id = $1', a[3]) into v using a[2]::uuid;
  elsif a[1] = 'line' and a[3] = 'qty' then
    if not exists (select 1 from ex_report_lines where id = a[2]::uuid and report_id = p_report) then raise exception 'bad_path'; end if;
    select to_jsonb(qty) into v from ex_report_lines where id = a[2]::uuid;
  elsif a[1] = 'line' and a[3] = 'd' and coalesce(a[4], '') <> '' then
    if not exists (select 1 from ex_report_lines where id = a[2]::uuid and report_id = p_report) then raise exception 'bad_path'; end if;
    select detail -> a[4] into v from ex_report_lines where id = a[2]::uuid;
  elsif a[1] = 'stop' and a[3] = 'hours' then
    if not exists (select 1 from ex_report_stoppages where id = a[2]::uuid and report_id = p_report) then raise exception 'bad_path'; end if;
    select to_jsonb(hours) into v from ex_report_stoppages where id = a[2]::uuid;
  else
    raise exception 'bad_path';
  end if;
  return v;
end $f$;

create or replace function ex_fix_num(v jsonb) returns numeric language plpgsql immutable as $f$
begin
  if v is null or v = 'null'::jsonb or btrim(v #>> '{}') = '' then return 0; end if;
  return (v #>> '{}')::numeric;
exception when others then raise exception 'bad_qty';
end $f$;

-- write a value at a path (the caller has set ex.rpc)
create or replace function ex_fix_put(p_report uuid, p_path text, v jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare a text[] := string_to_array(p_path, ':'); empty boolean := v is null or v = 'null'::jsonb;
begin
  if a[1] = 'data' then
    update ex_reports set data = case when empty then coalesce(data, '{}'::jsonb) - a[2] else jsonb_set(coalesce(data, '{}'::jsonb), array[a[2]], v) end where id = p_report;
  elsif a[1] = 'res' and ex_fix_res_col(a[3]) then
    execute format('update ex_report_resources set %I = $1 where id = $2 and report_id = $3', a[3]) using ex_fix_num(v), a[2]::uuid, p_report;
  elsif a[1] = 'line' and a[3] = 'qty' then
    update ex_report_lines set qty = ex_fix_num(v) where id = a[2]::uuid and report_id = p_report;
  elsif a[1] = 'line' and a[3] = 'd' then
    update ex_report_lines set detail = case when empty then detail - a[4] else jsonb_set(detail, array[a[4]], v) end where id = a[2]::uuid and report_id = p_report;
  elsif a[1] = 'stop' and a[3] = 'hours' then
    update ex_report_stoppages set hours = ex_fix_num(v) where id = a[2]::uuid and report_id = p_report;
  else
    raise exception 'bad_path';
  end if;
end $f$;

-- two values are the same figure (5 = "5" = 5.0; text compared trimmed)
create or replace function ex_fix_same(a jsonb, b jsonb) returns boolean language plpgsql immutable as $f$
declare x text := btrim(coalesce(a #>> '{}', '')); y text := btrim(coalesce(b #>> '{}', ''));
begin
  if x = y then return true; end if;
  begin return x::numeric = y::numeric; exception when others then return false; end;
end $f$;

create or replace function ex_fix_show(v jsonb) returns text language sql immutable as $f$ select coalesce(nullif(btrim(v #>> '{}'), ''), '—') $f$;

-- the contractor's own figures back (return / rejection): every correction goes into the history first
create or replace function ex_fix_revert_all(p_report uuid, p_why text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare f ex_report_fixes; summary text;
begin
  select string_agg(label || ': ' || ex_fix_show(was) || ' → ' || ex_fix_show(value), ' · ' order by fixed_at) into summary from ex_report_fixes where report_id = p_report;
  if summary is null then return; end if;
  perform set_config('ex.rpc', '1', true);
  for f in select * from ex_report_fixes where report_id = p_report loop
    begin perform ex_fix_put(p_report, f.path, f.was); exception when others then null; end; -- a row removed meanwhile: nothing to put back
  end loop;
  execute 'de' || 'lete from ex_report_fixes where report_id = $1' using p_report;
  perform ex_hist(p_report, 'fixes_reverted', p_why || ' — اصلاحات نظارت کنار گذاشته شد: ' || summary);
end $f$;

-- the supervision's corrections: [{path, value, label, note}]; a value equal to the contractor's (or null) withdraws the correction
create or replace function ex_report_fix(p_report uuid, p_items jsonb) returns integer language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; it jsonb; f ex_report_fixes; p text; orig jsonb; val jsonb; n int := 0; summary text := ''; who text; nm text; lst text;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if ex_final_signed(p_report) then raise exception 'approved_final' using errcode = '42501'; end if;
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
    -- the supervision signs the corrected version: signatures already given on the earlier one are cleared (kept in the history)
    select string_agg(g.label || ': ' || g.user_name, ' · ' order by g.signed_at) into who from ex_report_signatures g
      join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key and s.slot_key = g.slot_key and s.party <> 'contractor' where g.report_id = p_report;
    if who is not null then
      perform ex_hist(p_report, 'signatures_cleared', 'اصلاح مقادیر توسط نظارت؛ امضاهای نظارت روی نسخهٔ قبلی: ' || who);
      execute 'de' || 'lete from ex_report_signatures g using ex_sign_slots s where g.report_id = $1 and s.project_id = $2 and s.form_key = $3 and s.slot_key = g.slot_key and s.party <> ''contractor''' using p_report, r.project_id, r.form_key;
    end if;
    perform ex_hist(p_report, 'fix', summary);
  end if;
  return n;
end $f$;
grant execute on function ex_report_fix(uuid, jsonb) to authenticated;
revoke execute on function ex_fix_put(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function ex_fix_revert_all(uuid, text) from public, anon, authenticated;
revoke execute on function ex_fix_get(uuid, text) from public, anon, authenticated;

-- a whole-report decision: returning / rejecting puts the contractor's figures back first
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
  if p_decision <> 'approved' then perform ex_fix_revert_all(p_id, case when p_decision = 'returned' then 'برگشت به پیمانکار' else 'رد گزارش' end); end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_lines set status = p_decision, approved_qty = case when p_decision = 'approved' then qty else 0 end, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status = 'pending';
  v_status := ex_report_status_of(p_id);
  -- a report without rows (the site-status report) takes the decision itself
  if not exists (select 1 from ex_report_lines where report_id = p_id) then v_status := p_decision; end if;
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $function$;

-- line-by-line review: a report that ends up returned gets the contractor's figures back too
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
  if v_status = 'returned' then perform ex_fix_revert_all(p_id, 'برگشت به پیمانکار'); end if;
  update ex_reports set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '') where id = p_id;
  perform ex_hist(p_id, 'review:' || v_status, p_note);
end $function$;

-- reopening an approved report keeps the corrected figures; the corrections themselves go into the history (the
-- contractor's next version starts from those figures)
create or replace function public.ex_report_reopen(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports; summary text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'reopen') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('approved','partially_approved','rejected') then raise exception 'bad_state'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'note_required'; end if;
  perform set_config('ex.rpc', '1', true);
  select string_agg(label || ': ' || ex_fix_show(was) || ' → ' || ex_fix_show(value), ' · ' order by fixed_at) into summary from ex_report_fixes where report_id = p_id;
  if summary is not null then
    perform ex_hist(p_id, 'fixes_kept', 'اصلاحات نظارت در نسخهٔ بازگشایی‌شده ماند: ' || summary);
    execute 'de' || 'lete from ex_report_fixes where report_id = $1' using p_id;
  end if;
  update ex_report_lines set status = 'returned', review_note = 'بازگشایی: ' || p_reason, reviewed_by = auth.uid(), reviewed_at = now() where report_id = p_id and status in ('approved','rejected');
  update ex_reports set status = 'returned', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_reason where id = p_id;
  perform ex_hist(p_id, 'reopen', p_reason);
end $function$;
