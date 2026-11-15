-- Run by hand only. Removes what 007_films_wps_passport.sql added.
begin;
drop function if exists wq_set_wps(uuid, uuid);
drop function if exists wq_repair_zone(uuid, int, numeric, numeric, uuid);
drop function if exists wq_passport_sign(uuid, text, text);
drop table if exists wq_wps;
alter table wq_films drop column if exists seq, drop column if exists start_mm, drop column if exists len_mm, drop column if exists shot_at;
alter table wq_joints drop column if exists film_count, drop column if exists wps_id, drop column if exists signs;
alter table wq_repairs drop column if exists clock_from, drop column if exists clock_to, drop column if exists repair_wps_id;
commit;
