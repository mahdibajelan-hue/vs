-- 066 — a correction of the supervision on a sent pipe-delivery record (length, thickness, size …) reaches the pipe
-- register too: the register row of that pipe is refreshed from the corrected form row. Drafts are not registered yet
-- (057 registers at sending), so only sent / reviewed records are refreshed.
-- Rollback: rollback/066_rollback.sql (run by hand).
create or replace function ex_pipe_entry_refresh_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if exists (select 1 from ex_reports r where r.id = new.report_id and r.form_key = 'pipe_entry' and r.status in ('submitted','partially_approved','approved')) then
    perform ex_register_entry_pipes(new.report_id);
  end if;
  return new;
end $f$;
drop trigger if exists trg_ex_pipe_entry_refresh on ex_report_lines;
create trigger trg_ex_pipe_entry_refresh after update of detail on ex_report_lines for each row
  when (new.detail is distinct from old.detail) execute function ex_pipe_entry_refresh_trg();
