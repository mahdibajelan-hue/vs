drop table if exists ht_forms;
alter table ht_readings drop column if exists location, drop column if exists km, drop column if exists elev, drop column if exists volume_m3;
alter table ht_sections drop column if exists wall_mix, drop column if exists weld_from, drop column if exists weld_to, drop column if exists elev_start, drop column if exists elev_end, drop column if exists head_elev;
alter table ht_settings drop column if exists method, drop column if exists igs, drop column if exists equipment, drop column if exists parties;
