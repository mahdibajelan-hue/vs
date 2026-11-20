-- Rollback of 056_entry_timing.sql — run by hand only. Drops the measured entry sessions.
drop table if exists public.ex_entry_timings;
