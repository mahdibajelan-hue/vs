-- 059 — one report per form, day and front (and scope on a hybrid project). The day page closes a form's tile once its
-- report is sent; this guard makes the same true for every other way a report is made (a second browser tab, an import, a
-- date or front changed later). A rejected report frees the slot; a completion report (gap follow-up) and the quality
-- records that are not daily forms (PQR, WQT, welder card) are exempt. Reports that already exist are left as they are:
-- the check runs only when a report is created or its form / date / front / scope changes.
-- Rollback: rollback/059_rollback.sql (run by hand).
create or replace function ex_one_per_day_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.completion_of is not null or new.status = 'rejected' or new.form_key in ('pqr', 'wqt', 'welder_card') then return new; end if;
  if tg_op = 'UPDATE' and new.form_key is not distinct from old.form_key and new.report_date is not distinct from old.report_date
     and coalesce(new.front, '') = coalesce(old.front, '') and coalesce(new.scope, '') = coalesce(old.scope, '') then return new; end if;
  if exists (select 1 from ex_reports r where r.project_id = new.project_id and r.form_key = new.form_key and r.report_date = new.report_date
             and coalesce(r.front, '') = coalesce(new.front, '') and coalesce(r.scope, '') = coalesce(new.scope, '')
             and r.status <> 'rejected' and r.completion_of is null and r.id <> new.id) then
    raise exception 'duplicate_daily' using errcode = '23505', hint = 'one report per form, day and front';
  end if;
  return new;
end $f$;
create or replace trigger trg_ex_one_per_day before insert or update of form_key, report_date, front, scope on ex_reports
  for each row execute function ex_one_per_day_trg();
