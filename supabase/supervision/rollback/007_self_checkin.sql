-- Undo 007 (gps rows stay in sv_attendance but are relabelled manual so the old constraint holds).
drop function if exists sv_self_punch(uuid, text, double precision, double precision, double precision, text);
drop function if exists sv_my_links();
drop function if exists sv_my_month(uuid, date, date);
drop table if exists sv_self_punches;
drop table if exists sv_sites;
drop index if exists idx_sv_people_user;
alter table sv_people drop column if exists user_id;
update sv_attendance set source = 'manual' where source = 'gps';
alter table sv_attendance drop constraint sv_attendance_source_check, add constraint sv_attendance_source_check check (source in ('manual', 'clock'));
