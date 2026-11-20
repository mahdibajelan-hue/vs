-- 057 — the pipe-delivery record (form «pipe_entry», صورتجلسه ورود لوله به کارگاه) registers the pipes.
-- Pipes are unloaded at the pipe depot, counted and inspected; the record is signed there and the pipes enter the
-- project's pipe register (ex_pipes) at the same moment: when the record is SENT. Each register row points at the form
-- row it came from (entry_line_id), so its state follows the supervision's decision on that row:
--   row pending  → pipe registered, «awaiting supervision approval» (derived in the app from the row's status)
--   row approved → pipe final
--   row rejected → pipe status 'rejected' (it drops out of the stringing pick list); un-rejected → 'in_stock' again
-- A pipe number already in the register from another record is not duplicated (the form warns on entry).
-- Additive only (functions + triggers). Rollback: rollback/057_rollback.sql (run by hand).

create or replace function ex_register_entry_pipes(p_report uuid) returns integer language plpgsql security definer set search_path to 'public' as $f$
declare r record; l record; k text; n int := 0; num text;
begin
  select id, project_id, report_date, form_key into r from ex_reports where id = p_report;
  if r.id is null or r.form_key <> 'pipe_entry' then return 0; end if;
  for l in select id, detail, status from ex_report_lines where report_id = p_report order by line_no loop
    k := ex_weld_n1(coalesce(l.detail->>'pipeNo', ''));
    if k = '' then continue; end if;
    -- numbers as typed (Persian digits, «٫») → numeric, or null
    insert into ex_pipes (project_id, pipe_key, pipe_raw, entry_date, od_in, wt_in, length_m, way_bill, entry_line_id, status, note)
    values (r.project_id, k, btrim(l.detail->>'pipeNo'), r.report_date,
            ex_num(l.detail->>'sizeIn'), ex_num(l.detail->>'thkIn'), ex_num(l.detail->>'lengthM'),
            coalesce(l.detail->>'wayBill', ''), l.id, case when l.status = 'rejected' then 'rejected' else 'in_stock' end,
            btrim(concat_ws(' · ', nullif(l.detail->>'billNo', ''), nullif(l.detail->>'truckNo', ''), nullif(l.detail->>'status', ''))))
    on conflict (project_id, pipe_key) do update
      set pipe_raw = excluded.pipe_raw, entry_date = excluded.entry_date, od_in = excluded.od_in, wt_in = excluded.wt_in, length_m = excluded.length_m,
          way_bill = excluded.way_bill, note = excluded.note, updated_at = now()
      where ex_pipes.entry_line_id = excluded.entry_line_id;   -- refresh only the pipe this row registered, never another record's
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function ex_register_entry_pipes(uuid) from public;

-- tolerant number reader for form values («12٫15», «۱۲.۱۵», «12,15»)
create or replace function ex_num(p text) returns numeric language sql immutable set search_path to 'public' as $f$
  select case when x ~ '^-?[0-9]+(\.[0-9]+)?$' then x::numeric end
  from (select replace(replace(replace(translate(btrim(coalesce(p, '')), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '٫', '.'), ',', '.'), ' ', '') as x) s
$f$;

create or replace function ex_pipe_entry_sent_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.form_key = 'pipe_entry' and new.status in ('submitted', 'partially_approved', 'approved') and old.status is distinct from new.status then
    perform ex_register_entry_pipes(new.id);
  end if;
  return null;
end $f$;
create or replace trigger trg_ex_pipe_entry_sent after update of status on ex_reports for each row execute function ex_pipe_entry_sent_trg();

create or replace function ex_pipe_entry_line_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.status is distinct from old.status then
    if new.status = 'rejected' then update ex_pipes set status = 'rejected', updated_at = now() where entry_line_id = new.id and status = 'in_stock';
    elsif old.status = 'rejected' then update ex_pipes set status = 'in_stock', updated_at = now() where entry_line_id = new.id and status = 'rejected';
    end if;
  end if;
  return null;
end $f$;
create or replace trigger trg_ex_pipe_entry_line after update of status on ex_report_lines for each row execute function ex_pipe_entry_line_trg();
