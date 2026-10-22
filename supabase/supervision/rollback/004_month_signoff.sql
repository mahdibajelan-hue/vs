-- Undo 004: unlock the write policies, then drop the sign-off functions and tables.
-- (sv_apply_clock keeps the lock filter; it is harmless once sv_day_locked is replaced below by a function returning false.)
alter policy sv_attendance_write on sv_attendance using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter policy sv_vehicle_days_write on sv_vehicle_days using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter policy sv_guest_meals_write on sv_guest_meals using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
drop function if exists sv_sign(uuid, text, date, date, text, text, text, text, jsonb);
drop function if exists sv_reopen(uuid, text, text);
create or replace function sv_day_locked(p_project uuid, p_day date) returns boolean language sql stable as $$ select false $$;
drop table if exists sv_month_signatures;
drop table if exists sv_month_signoffs;
