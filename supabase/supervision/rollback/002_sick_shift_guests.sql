drop table if exists sv_guest_meals;
alter table sv_people drop column if exists shift_start, drop column if exists shift_end;
update sv_attendance set status = 'rest' where status = 'sick';
alter table sv_attendance drop constraint sv_attendance_status_check;
alter table sv_attendance add constraint sv_attendance_status_check check (status in ('present', 'mission', 'rest', 'absent'));
