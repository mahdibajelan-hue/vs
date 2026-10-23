-- Undo 008: back to the single BEFORE trigger of 006.
drop trigger if exists sv_attendance_log on sv_attendance;
drop trigger if exists sv_vehicle_days_log on sv_vehicle_days;
drop trigger if exists sv_guest_meals_log on sv_guest_meals;
create or replace trigger sv_attendance_stamp before insert or update or delete on sv_attendance for each row execute function sv_stamp_log();
create or replace trigger sv_vehicle_days_stamp before insert or update or delete on sv_vehicle_days for each row execute function sv_stamp_log();
create or replace trigger sv_guest_meals_stamp before insert or update or delete on sv_guest_meals for each row execute function sv_stamp_log();
drop function if exists sv_log();
drop function if exists sv_stamp();
