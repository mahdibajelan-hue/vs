-- 070 — signatures and corrections, as agreed with the user:
--   · during the review (report sent, not yet approved for good) a correction by the specialist supervisor or the head
--     of supervision takes NO signature off: the contractor's signatures stand for the figures it sent, the supervision
--     records its own figures beside them (struck-through original + correction).
--   · only an amendment — the head of supervision had signed the final approval and reopens the report — takes every
--     signature off and the form goes round its signature chain again (068 behaviour, now limited to amendments).
-- Rollback: rollback/070_rollback.sql (= 068's ex_report_fix).
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
    -- 070: corrections during the review leave every signature in place — the supervision states its own view beside the
    -- contractor's figures. Only an amendment (a report the head of supervision had approved for good) is a new version:
    -- every signature is taken off (kept in the amendment, put back by cancelling it) and the chain starts again.
    if amending then
      select string_agg(g.label || ': ' || g.user_name, ' · ' order by g.signed_at) into who from ex_report_signatures g where g.report_id = p_report;
      if who is not null then
        update ex_report_amendments a set prev_signatures = a.prev_signatures || coalesce((select jsonb_agg(to_jsonb(g)) from ex_report_signatures g where g.report_id = p_report), '[]'::jsonb) where a.id = am;
        perform ex_hist(p_report, 'signatures_cleared', 'اصلاحیه توسط سرپرست نظارت؛ گردش امضا از ابتدا (پیمانکار، سپس نظارت). امضاهای نسخهٔ قبلی: ' || who);
        execute 'de' || 'lete from ex_report_signatures where report_id = $1' using p_report;
      end if;
    end if;
  end if;
  return n;
end $function$;
