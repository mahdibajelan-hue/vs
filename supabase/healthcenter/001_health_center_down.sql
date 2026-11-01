-- Rollback of 001_health_center.sql (run by hand; removes the health history).
drop function if exists public.ph_extra_counts(uuid);
drop table if exists public.ph_snapshots;
drop table if exists public.ph_settings;
