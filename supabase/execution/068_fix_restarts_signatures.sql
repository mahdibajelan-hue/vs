-- 068 — a correction by the supervision starts the form's signature chain again from the first step.
--   · recording corrections (ex_report_fix) takes off EVERY signature on the report — the contractor's too — and the
--     history keeps who had signed the version before. The report stays «submitted»: the contractor signs the corrected
--     figures first, then each supervision slot in its order, and the final signature approves it, as with a new form.
--   · the same holds during an amendment (067): the signatures taken off are kept in the amendment row
--     (prev_signatures), so cancelling the amendment puts every one of them back.
-- Rollback: rollback/068_rollback.sql (run by hand).

alter table ex_report_amendments add column if not exists prev_signatures jsonb not null default '[]'::jsonb;

create or replace function public.ex_report_fix(p_report uuid, p_items jsonb)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r ex_reports; it jsonb; f ex_report_fixes; p text; orig jsonb; val jsonb; n int := 0; summary text := ''; who text; nm text; lst text; amending boolean; am uuid;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_allows(r.project_id, 'review') and not ex_is_sup_head(p_report) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved') then raise exception 'bad_state'; end if;
  if ex_final_signed(p_report) then raise exception 'approved_final' using errcode = '42501'; end if;
  select id into am from ex_report_amendments where report_id = p_report and status = 'open';
  amending := am is not null;
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
    perform ex_hist(p_report, case when amending then 'amend_fix' else 'fix' end, summary);
    -- the corrected figures are a new version: every signature (contractor and supervision) is taken off and the chain starts again
    select string_agg(g.label || ': ' || g.user_name, ' · ' order by g.signed_at) into who from ex_report_signatures g where g.report_id = p_report;
    if who is not null then
      if amending then
        update ex_report_amendments a set prev_signatures = a.prev_signatures || coalesce((select jsonb_agg(to_jsonb(g)) from ex_report_signatures g where g.report_id = p_report), '[]'::jsonb) where a.id = am;
      end if;
      perform ex_hist(p_report, 'signatures_cleared', 'اصلاح مقادیر توسط نظارت؛ گردش امضا از ابتدا (پیمانکار، سپس نظارت). امضاهای نسخهٔ قبلی: ' || who);
      execute 'de' || 'lete from ex_report_signatures where report_id = $1' using p_report;
    end if;
  end if;
  return n;
end $function$;

create or replace function public.ex_report_amend_cancel(p_report uuid, p_note text default ''::text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare a ex_report_amendments; f ex_report_fixes; s jsonb; l jsonb;
begin
  select * into a from ex_report_amendments where report_id = p_report and status = 'open';
  if a.id is null then raise exception 'no_amendment'; end if;
  if not ex_is_sup_head(p_report) then raise exception 'not_sup_head' using errcode = '42501'; end if;
  perform set_config('ex.amend', '1', true);
  perform set_config('ex.rpc', '1', true);
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
  -- the approved version comes back with its signatures: those a correction took off (068), then the final one (067);
  -- anything signed during the amendment goes
  execute 'de' || 'lete from ex_report_signatures where report_id = $1' using p_report;
  for s in select x from jsonb_array_elements(coalesce(a.prev_signatures, '[]'::jsonb) || case when a.prev_signature is not null then jsonb_build_array(a.prev_signature) else '[]'::jsonb end) x loop
    if not exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = s ->> 'slot_key') then
      insert into ex_report_signatures select * from jsonb_populate_record(null::ex_report_signatures, s);
    end if;
  end loop;
  update ex_reports set status = 'approved' where id = p_report;
  update ex_report_amendments set status = 'cancelled', closed_by = auth.uid(), closed_at = now(), closed_note = coalesce(p_note, '') where id = a.id;
  perform ex_hist(p_report, 'amend_cancel', 'اصلاحیهٔ ' || a.no || ' لغو شد' || case when coalesce(btrim(p_note), '') <> '' then ': ' || btrim(p_note) else '' end);
  perform set_config('ex.amend', '', true);
end $function$;
