-- Rollback of 054_activity_unit_count.sql — run by hand only.
alter table public.ex_activities drop constraint if exists ex_activities_unit_count_chk;
alter table public.ex_activities drop column if exists unit_count;
