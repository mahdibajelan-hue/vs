-- Undo 009 (re-run the sv_self_punch of 007 afterwards).
select cron.unschedule('sv-fill-absent');
drop function if exists sv_fill_absent(date);
alter policy sv_attendance_write on sv_attendance
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day) and sv_entry_ok(master_project_id, day, status, late_reason));
drop function if exists sv_is_head(uuid);
delete from sv_attendance where source = 'auto';
update sv_attendance set status = 'rest' where status = 'leave';
alter table sv_attendance drop constraint sv_attendance_status_check, add constraint sv_attendance_status_check check (status in ('present', 'mission', 'rest', 'sick', 'absent')), drop constraint sv_attendance_source_check, add constraint sv_attendance_source_check check (source in ('manual', 'clock', 'gps'));
alter table sv_self_punches drop column if exists quality;
alter table sv_settings drop column if exists network_max_m;
alter table sv_people drop column if exists is_head;
