-- Undo 006: back to the 004 write policies, drop the triggers, the log and the window check.
alter policy sv_attendance_write on sv_attendance using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day)) with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));
alter policy sv_vehicle_days_write on sv_vehicle_days using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day)) with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));
alter policy sv_guest_meals_write on sv_guest_meals using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day)) with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));
drop trigger if exists sv_attendance_stamp on sv_attendance;
drop trigger if exists sv_vehicle_days_stamp on sv_vehicle_days;
drop trigger if exists sv_guest_meals_stamp on sv_guest_meals;
drop function if exists sv_stamp_log();
drop function if exists sv_entry_ok(uuid, date, text, text);
drop table if exists sv_entry_log;
alter table sv_settings drop column if exists entry_grace_days;
alter table sv_guest_meals drop column if exists late_reason;
alter table sv_vehicle_days drop column if exists late_reason, drop column if exists created_at, drop column if exists created_by;
alter table sv_attendance drop column if exists late_reason, drop column if exists created_at, drop column if exists created_by;
