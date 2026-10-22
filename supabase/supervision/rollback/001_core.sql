drop function if exists sv_apply_clock(uuid, date, date);
drop function if exists sv_touch();   -- unused helper left by the first attempt
drop table if exists sv_clock_events, sv_vehicle_days, sv_attendance, sv_vehicles, sv_people, sv_settings;
drop function if exists sv_can_write(uuid);
drop function if exists sv_can_read(uuid);
delete from rasta_permissions where module_key = 'supervision';
delete from rasta_modules where key = 'supervision';
